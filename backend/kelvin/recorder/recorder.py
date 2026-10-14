"""Periodic samples and energy readings, plus history queries (spec §3.4)."""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Callable
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from kelvin.house.model import House
from kelvin.recorder.db import Database, DatabaseClosed

log = logging.getLogger(__name__)

# Samples feed the history charts (30 days at most today) and leave room for year-on-year;
# the command log is for debugging. Energy readings are kept: they feed the bill.
SAMPLE_RETENTION_S = 400 * 86400
COMMAND_LOG_RETENTION_S = 90 * 86400
PRUNE_EVERY_S = 86400.0
PRUNE_CHUNK = 5000


class Recorder:
    def __init__(
        self,
        db: Database,
        house: House,
        *,
        wall: Callable[[], float] = time.time,
        is_fresh: Callable[[], bool] = lambda: True,
        tz: str = "Europe/Paris",
    ) -> None:
        self.db = db
        self.house = house
        self.wall = wall
        self.is_fresh = is_fresh
        self.tz = ZoneInfo(tz)

    def sample(self) -> int:
        if not self.is_fresh():
            return 0
        t = int(self.wall())
        rows = [
            (
                t,
                r.id,
                r.temperature,
                r.target,
                r.effective_setpoint,
                r.mode,
                r.heating_level,
                r.working_rate,
                None if r.window_open is None else int(r.window_open),
                None if r.occupied is None else int(r.occupied),
            )
            for r in self.house.radiators.values()
        ]
        self.db.executemany("INSERT OR REPLACE INTO samples VALUES (?,?,?,?,?,?,?,?,?,?)", rows)
        return len(rows)

    def snapshot_energy(self) -> int:
        t = int(self.wall())
        rows = [
            (t, r.id, e["total"], e["t1"], e["t2"])
            for r in self.house.radiators.values()
            if (e := r.energy_wh) is not None
        ]
        self.db.executemany("INSERT OR REPLACE INTO energy VALUES (?,?,?,?,?)", rows)
        return len(rows)

    def prune(self, chunk: int = PRUNE_CHUNK) -> int:
        """Delete expired rows in chunks so the database lock is released between them.

        Stops quietly when the database closes under it (shutdown); the next run goes on.
        """
        now = self.wall()
        total = 0
        try:
            for table, column, cutoff in (
                ("samples", "ts", int(now - SAMPLE_RETENTION_S)),
                ("command_log", "ts", now - COMMAND_LOG_RETENTION_S),
            ):
                while True:
                    n = self.db.execute(
                        f"DELETE FROM {table} WHERE rowid IN"
                        f" (SELECT rowid FROM {table} WHERE {column} < ? LIMIT ?)",
                        (cutoff, chunk),
                    )
                    total += n
                    if n < chunk:
                        break
        except DatabaseClosed:
            pass
        return total

    def prune_if_due(self) -> int:
        """Prune at most once a day, across restarts (the last run is stored in settings)."""
        now = self.wall()
        n = 0
        try:
            last = self.db.get_setting("last_prune", 0)
            if now - last < PRUNE_EVERY_S:
                return 0
            n = self.prune()
            self.db.set_setting("last_prune", int(now))
        except DatabaseClosed:  # shutdown: not recorded, so the next start prunes again
            pass
        return n

    def history(
        self, radiator_ids: list[str], start: float, end: float, step: int
    ) -> list[dict[str, Any]]:
        if not radiator_ids:
            return []
        marks = ",".join("?" * len(radiator_ids))
        rows = self.db.query(
            f"SELECT radiator_id, (ts / ?) * ? AS bucket, AVG(temperature) AS temperature,"
            f" AVG(effective_setpoint) AS setpoint, AVG(target) AS target FROM samples"
            f" WHERE radiator_id IN ({marks}) AND ts >= ? AND ts <= ?"
            f" GROUP BY radiator_id, bucket ORDER BY bucket, radiator_id",
            (step, step, *radiator_ids, int(start), int(end)),
        )
        return [
            {
                "radiator_id": r["radiator_id"],
                "ts": r["bucket"],
                "temperature": _r(r["temperature"]),
                "setpoint": _r(r["setpoint"]),
                "target": _r(r["target"]),
            }
            for r in rows
        ]

    def _bucket(self, t: float, group: str) -> str:
        dt = datetime.fromtimestamp(t, self.tz)
        if group == "hour":
            return dt.replace(minute=0, second=0, microsecond=0).isoformat()
        if group == "day":
            return dt.date().isoformat()
        if group == "month":
            return f"{dt.year:04d}-{dt.month:02d}"
        raise ValueError(f"unknown group {group}")

    def energy(
        self, radiator_ids: list[str], start: float, end: float, group: str
    ) -> list[dict[str, Any]]:
        """Consumption per bucket. A delta belongs to the bucket of the later reading;
        a negative delta means the meter reset, so the new value itself is the consumption."""
        if not radiator_ids:
            return []
        marks = ",".join("?" * len(radiator_ids))
        rows = self.db.query(
            f"SELECT ts, radiator_id, total_wh, t1_wh, t2_wh FROM energy"
            f" WHERE radiator_id IN ({marks}) AND ts <= ? AND ts >= ?"
            f" ORDER BY radiator_id, ts",
            (*radiator_ids, int(end), int(start) - 3 * 86400),
        )
        acc: dict[tuple[str, str], list[float]] = {}
        prev: dict[str, dict[str, Any]] = {}
        for row in rows:
            before = prev.get(row["radiator_id"])
            prev[row["radiator_id"]] = row
            if before is None or row["ts"] < start:
                continue
            deltas = []
            for k in ("total_wh", "t1_wh", "t2_wh"):
                d = (row[k] or 0) - (before[k] or 0)
                deltas.append((row[k] or 0) if d < 0 else d)
            key = (self._bucket(row["ts"], group), row["radiator_id"])
            cur = acc.setdefault(key, [0.0, 0.0, 0.0])
            for i in range(3):
                cur[i] += deltas[i]
        return [
            {
                "bucket": b,
                "radiator_id": rid,
                "kwh": round(v[0] / 1000, 3),
                "t1_kwh": round(v[1] / 1000, 3),
                "t2_kwh": round(v[2] / 1000, 3),
            }
            for (b, rid), v in sorted(acc.items())
        ]

    def first_energy_ts(self, radiator_ids: list[str]) -> int | None:
        """When the first energy reading of these radiators was taken, or None."""
        if not radiator_ids:
            return None
        marks = ",".join("?" * len(radiator_ids))
        rows = self.db.query(
            f"SELECT MIN(ts) AS ts FROM energy WHERE radiator_id IN ({marks})", tuple(radiator_ids)
        )
        return rows[0]["ts"] if rows else None

    async def run(self, sample_every: float = 300.0, energy_every: float = 3600.0) -> None:
        last_energy = 0.0
        while True:
            try:
                self.sample()
                if self.wall() - last_energy >= energy_every:
                    self.snapshot_energy()
                    last_energy = self.wall()
                pruned = await asyncio.to_thread(self.prune_if_due)
                if pruned:
                    log.info("pruned %d old samples and command-log rows", pruned)
            except Exception:
                log.exception("recorder failed")
            await asyncio.sleep(sample_every)


def _r(v: float | None) -> float | None:
    return None if v is None else round(v, 2)
