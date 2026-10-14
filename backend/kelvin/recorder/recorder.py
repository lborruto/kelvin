"""Periodic samples and energy readings, plus history queries (spec §3.4)."""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Callable, Iterable, Iterator
from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from kelvin.house.model import House
from kelvin.recorder.db import Database, DatabaseClosed
from kelvin.recorder.energy import (
    SAMPLE_STEP_S,
    Bucket,
    RateIndex,
    Reading,
    Unit,
    apportion,
    clean_spans,
    local_edges,
)

log = logging.getLogger(__name__)

# Samples feed the history charts (30 days at most today) and leave room for year-on-year;
# the command log is for debugging. Energy readings are kept: they feed the bill.
SAMPLE_RETENTION_S = 400 * 86400
COMMAND_LOG_RETENTION_S = 90 * 86400
PRUNE_EVERY_S = 86400.0
PRUNE_CHUNK = 5000
PAGE_ROWS = 5000  # rows per query when streaming readings and samples
# Counter name in the API → column of the energy table.
COUNTERS = {"total": "total_wh", "t1": "t1_wh", "t2": "t2_wh"}


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
        self._last_written: dict[str, tuple[float | None, ...]] = {}

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

    def _last_counters(self, rid: str) -> tuple[float | None, ...] | None:
        if rid not in self._last_written:
            rows = self.db.query(
                "SELECT total_wh, t1_wh, t2_wh FROM energy WHERE radiator_id = ?"
                " ORDER BY ts DESC LIMIT 1",
                (rid,),
            )
            if not rows:
                return None
            self._last_written[rid] = (rows[0]["total_wh"], rows[0]["t1_wh"], rows[0]["t2_wh"])
        return self._last_written[rid]

    def snapshot_energy(self, radiator_ids: Iterable[str] | None = None) -> int:
        """Write a reading for each radiator whose counters changed since its last row.

        The row's time is when Kelvin learned the value: the runtime calls this on every house
        change (events, state reads) and the sampling loop calls it every 5 minutes. Overkiz
        reports a counter only when it moves, at irregular times, so an unchanged value is no
        reading and writes nothing (spec §2.1; rows are kept forever, they feed the bill).
        """
        t = int(self.wall())
        ids = list(radiator_ids) if radiator_ids is not None else list(self.house.radiators)
        rows = []
        for rid in ids:
            r = self.house.radiators.get(rid)
            e = r.energy_wh if r is not None else None
            if e is None:
                continue
            values = (e["total"], e["t1"], e["t2"])
            if values == self._last_counters(rid):
                continue
            rows.append((t, rid, *values))
            self._last_written[rid] = values
        self.db.executemany("INSERT OR REPLACE INTO energy VALUES (?,?,?,?,?)", rows)
        return len(rows)

    def prune(self, chunk: int = PRUNE_CHUNK) -> int:
        """Delete expired rows in chunks so the database lock is released between them.

        Stops quietly when the database closes under it (shutdown); the next run goes on.
        """
        if chunk <= 0:
            raise ValueError("chunk must be positive")  # the delete loop would never end
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

    def _head(self, rid: str, col: str, start: int) -> list[Reading]:
        """The readings before `start` that a span crossing it needs: the first row of the
        value the counter held at `start` (when Kelvin first saw that value) and the change
        before it. At most two rows."""
        q = self.db.query
        prev = q(
            f"SELECT ts, {col} AS v FROM energy WHERE radiator_id = ? AND ts < ?"
            f" AND {col} IS NOT NULL ORDER BY ts DESC LIMIT 1",
            (rid, start),
        )
        if not prev:
            return []
        v = prev[0]["v"]
        change = q(
            f"SELECT ts, {col} AS v FROM energy WHERE radiator_id = ? AND ts < ?"
            f" AND {col} IS NOT NULL AND {col} != ? ORDER BY ts DESC LIMIT 1",
            (rid, prev[0]["ts"], v),
        )
        first = q(
            f"SELECT ts, {col} AS v FROM energy WHERE radiator_id = ? AND ts > ? AND ts <= ?"
            f" AND {col} IS NOT NULL ORDER BY ts LIMIT 1",
            (rid, change[0]["ts"] if change else -1, prev[0]["ts"]),
        )
        return [Reading(r["ts"], r["v"]) for r in change + first]

    def _readings(
        self, rid: str, col: str, start: int, end: int, head: list[Reading]
    ) -> Iterator[Reading]:
        """`head`, then every row in [start, end] page by page (keyset pagination, PAGE_ROWS a
        query), then the first row after `end` with another value."""
        yield from head
        last = head[-1].value if head else None
        after = start - 1
        while True:
            page = self.db.query(
                f"SELECT ts, {col} AS v FROM energy WHERE radiator_id = ? AND ts > ?"
                f" AND ts <= ? ORDER BY ts LIMIT ?",
                (rid, after, end, PAGE_ROWS),
            )
            for r in page:
                yield Reading(r["ts"], r["v"])
                if r["v"] is not None:
                    last = r["v"]
            if len(page) < PAGE_ROWS:
                break
            after = page[-1]["ts"]
        if last is not None:
            tail = self.db.query(
                f"SELECT ts, {col} AS v FROM energy WHERE radiator_id = ? AND ts > ?"
                f" AND {col} IS NOT NULL AND {col} != ? ORDER BY ts LIMIT 1",
                (rid, end, last),
            )
            yield from (Reading(r["ts"], r["v"]) for r in tail)

    def _rates(self, rid: str, start: int, end: int) -> RateIndex:
        """Working-rate samples over [start, end), paged; bounded by the sample retention."""
        rows: list[tuple[int, float | None]] = []
        after = start - SAMPLE_STEP_S - 1
        while True:
            page = self.db.query(
                "SELECT ts, working_rate FROM samples WHERE radiator_id = ? AND ts > ?"
                " AND ts < ? ORDER BY ts LIMIT ?",
                (rid, after, end, PAGE_ROWS),
            )
            rows += [(r["ts"], r["working_rate"]) for r in page]
            if len(page) < PAGE_ROWS:
                return RateIndex(rows)
            after = page[-1]["ts"]

    def energy_radiator_ids(self) -> list[str]:
        """Every radiator Kelvin ever recorded, including ones no longer in the house (L8)."""
        rows = self.db.query("SELECT DISTINCT radiator_id FROM energy ORDER BY radiator_id")
        return [r["radiator_id"] for r in rows]

    def energy_extent(self) -> dict[str, tuple[int, int]]:
        """First and last reading time of each recorded radiator."""
        rows = self.db.query(
            "SELECT radiator_id, MIN(ts) AS a, MAX(ts) AS b FROM energy GROUP BY radiator_id"
        )
        return {r["radiator_id"]: (r["a"], r["b"]) for r in rows}

    def energy_buckets(
        self, edges: list[int], radiator_ids: list[str] | None = None, *, counter: str = "total"
    ) -> dict[str, list[Bucket]]:
        """Energy of each radiator per bucket [edges[i], edges[i+1]) (spec §2.1).

        Readings → `clean_spans` → `apportion`, weighted by the radiator's working-rate samples.
        `radiator_ids=None` means every radiator present in the energy table.
        """
        if len(edges) < 2:
            return {}
        col = COUNTERS[counter]
        ids = self.energy_radiator_ids() if radiator_ids is None else radiator_ids
        out: dict[str, list[Bucket]] = {}
        for rid in ids:
            r = self.house.radiators.get(rid)
            head = self._head(rid, col, edges[0])
            rates = self._rates(rid, head[0].ts if head else edges[0], edges[-1])
            readings = self._readings(rid, col, edges[0], edges[-1], head)
            spans = clean_spans(readings, power_w=r.power_w if r is not None else None)
            out[rid] = apportion(spans, edges, rates)
        return out

    def _key(self, t: int, unit: Unit) -> str:
        dt = datetime.fromtimestamp(t, self.tz)
        if unit == "hour":
            return dt.isoformat()
        if unit == "day":
            return dt.date().isoformat()
        return f"{dt.year:04d}-{dt.month:02d}"

    def radiator_energy(
        self, radiator_ids: list[str], start: float, end: float, unit: Unit
    ) -> list[dict[str, Any]]:
        """`GET /api/energy/radiators`: per radiator, the local hours, days or months that
        overlap [start, end), with the energy apportioned to each (unknown buckets omitted)."""
        if not radiator_ids or end <= start:
            return []
        first = datetime.fromtimestamp(start, self.tz).date()
        last = datetime.fromtimestamp(end, self.tz).date() + timedelta(days=1)
        edges = local_edges(first, last, unit, self.tz)
        keep = [i for i in range(len(edges) - 1) if edges[i] < end and edges[i + 1] > start]
        if not keep:
            return []
        edges = edges[keep[0] : keep[-1] + 2]
        per = {c: self.energy_buckets(edges, radiator_ids, counter=c) for c in COUNTERS}
        out = []
        for i in range(len(edges) - 1):
            for rid in sorted(radiator_ids):
                b = per["total"][rid][i]
                if b.wh is None:
                    continue
                t1, t2 = per["t1"][rid][i].wh, per["t2"][rid][i].wh
                out.append(
                    {
                        "bucket": self._key(edges[i], unit),
                        "radiator_id": rid,
                        "kwh": round(b.wh / 1000, 3),
                        "t1_kwh": None if t1 is None else round(t1 / 1000, 3),
                        "t2_kwh": None if t2 is None else round(t2 / 1000, 3),
                        "interpolated": b.interpolated,
                        "apportioned": b.apportioned,
                    }
                )
        return out

    def first_energy_ts(self, radiator_ids: list[str]) -> int | None:
        """When the first energy reading of these radiators was taken, or None."""
        if not radiator_ids:
            return None
        marks = ",".join("?" * len(radiator_ids))
        rows = self.db.query(
            f"SELECT MIN(ts) AS ts FROM energy WHERE radiator_id IN ({marks})", tuple(radiator_ids)
        )
        return rows[0]["ts"] if rows else None

    async def run(self, sample_every: float = 300.0) -> None:
        while True:
            try:
                self.sample()
                self.snapshot_energy()
                pruned = await asyncio.to_thread(self.prune_if_due)
                if pruned:
                    log.info("pruned %d old samples and command-log rows", pruned)
            except Exception:
                log.exception("recorder failed")
            await asyncio.sleep(sample_every)


def _r(v: float | None) -> float | None:
    return None if v is None else round(v, 2)
