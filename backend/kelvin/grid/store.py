"""The grid caches (spec §2.3): one row per Tempo day and per EcoWatt day. Tempo colours are
kept for ever and never changed once published (they price the history); EcoWatt days are
pruned after 30 days by the grid service."""

from __future__ import annotations

import json
import logging
from datetime import date, timedelta
from typing import Literal

from kelvin.grid.models import EcowattDay
from kelvin.recorder.db import Database

log = logging.getLogger(__name__)


class GridStore:
    def __init__(self, db: Database) -> None:
        self.db = db

    def upsert_tempo(
        self, colours: dict[date, str], fetched_at: float, source: str = "med"
    ) -> None:
        """New days are added. A published colour never changes: it priced days already shown
        and cached (the radiator-day cache keeps them for ever), so a different colour for a
        stored day is logged and the stored one kept."""
        if not colours:
            return
        days = sorted(colours)
        have = self.tempo_colours(days[0], days[-1] + timedelta(days=1))
        new = []
        for d in days:
            old = have.get(d)
            if old is None:
                new.append((d.isoformat(), colours[d], source, fetched_at))
            elif old != colours[d]:
                log.warning(
                    "tempo: %s published %s, now %s from %s; the published colour is kept",
                    d.isoformat(),
                    old,
                    colours[d],
                    source,
                )
        if new:
            self.db.executemany(
                "INSERT OR IGNORE INTO tempo_days (day, colour, source, fetched_at)"
                " VALUES (?, ?, ?, ?)",
                new,
            )

    def tempo_colours(self, start: date, end: date) -> dict[date, str]:
        rows = self.db.query(
            "SELECT day, colour FROM tempo_days WHERE day >= ? AND day < ? ORDER BY day",
            (start.isoformat(), end.isoformat()),
        )
        return {date.fromisoformat(r["day"]): r["colour"] for r in rows}

    def tempo_missing(self, start: date, end: date) -> list[date]:
        have = self.tempo_colours(start, end)
        return [
            start + timedelta(days=i)
            for i in range((end - start).days)
            if start + timedelta(days=i) not in have
        ]

    def upsert_ecowatt(
        self, days: dict[date, EcowattDay], fetched_at: float, source: str = "med"
    ) -> None:
        if days:
            self.db.executemany(
                "INSERT OR REPLACE INTO ecowatt_days (day, level, hours, source, fetched_at)"
                " VALUES (?, ?, ?, ?, ?)",
                [
                    (
                        d.isoformat(),
                        e.level,
                        json.dumps(list(e.hours)) if e.hours else None,
                        source,
                        fetched_at,
                    )
                    for d, e in days.items()
                ],
            )

    def ecowatt(self, start: date, end: date) -> dict[date, EcowattDay]:
        rows = self.db.query(
            "SELECT day, level, hours FROM ecowatt_days WHERE day >= ? AND day < ? ORDER BY day",
            (start.isoformat(), end.isoformat()),
        )
        return {
            date.fromisoformat(r["day"]): EcowattDay(
                date.fromisoformat(r["day"]),
                r["level"],
                tuple(json.loads(r["hours"])) if r["hours"] else None,
            )
            for r in rows
        }

    def fetched_at(self, table: Literal["tempo_days", "ecowatt_days"], day: date) -> float | None:
        if table not in ("tempo_days", "ecowatt_days"):
            raise ValueError("unknown table")
        rows = self.db.query(f"SELECT fetched_at FROM {table} WHERE day = ?", (day.isoformat(),))
        return rows[0]["fetched_at"] if rows else None

    def prune_ecowatt(self, before: date) -> int:
        return self.db.execute("DELETE FROM ecowatt_days WHERE day < ?", (before.isoformat(),))
