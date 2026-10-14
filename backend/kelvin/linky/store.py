"""Linky readings in SQLite: daily Wh per local day, and the load curve per interval start."""

from __future__ import annotations

from datetime import date
from zoneinfo import ZoneInfo

from kelvin.linky.models import CurvePoint, DailyReading, curve_complete, day_bounds, local_day
from kelvin.recorder.db import Database


class LinkyStore:
    def __init__(self, db: Database, tz: str = "Europe/Paris") -> None:
        self.db = db
        self.tz = ZoneInfo(tz)

    def upsert_daily(self, rows: list[DailyReading]) -> None:
        if rows:
            self.db.executemany(
                "INSERT OR REPLACE INTO linky_daily (day, wh) VALUES (?, ?)",
                [(r.day.isoformat(), r.wh) for r in rows],
            )

    def upsert_curve(self, points: list[CurvePoint]) -> None:
        if points:
            self.db.executemany(
                "INSERT OR REPLACE INTO linky_curve (ts, minutes, wh) VALUES (?, ?, ?)",
                [(p.ts, p.minutes, p.wh) for p in points],
            )

    def daily(self, start: date | None = None, end: date | None = None) -> dict[date, int]:
        lo = start.isoformat() if start else "0000-00-00"
        hi = end.isoformat() if end else "9999-99-99"
        rows = self.db.query(
            "SELECT day, wh FROM linky_daily WHERE day >= ? AND day < ? ORDER BY day", (lo, hi)
        )
        return {date.fromisoformat(r["day"]): r["wh"] for r in rows}

    def last_day(self) -> date | None:
        row = self.db.query("SELECT MAX(day) AS d FROM linky_daily")[0]["d"]
        return date.fromisoformat(row) if row else None

    def clear(self) -> None:
        """Forget every reading (another PDL is being configured)."""
        self.db.execute("DELETE FROM linky_daily")
        self.db.execute("DELETE FROM linky_curve")

    def first_curve_day(self) -> date | None:
        ts = self.db.query("SELECT MIN(ts) AS ts FROM linky_curve")[0]["ts"]
        return local_day(ts, self.tz) if ts is not None else None

    def curve(
        self, start: date | None = None, end: date | None = None
    ) -> dict[date, list[CurvePoint]]:
        """Points keyed by the local day of their interval start, for days in [start, end)."""
        lo = day_bounds(start, self.tz)[0] if start else 0
        hi = day_bounds(end, self.tz)[0] if end else 2**62
        rows = self.db.query(
            "SELECT ts, minutes, wh FROM linky_curve WHERE ts >= ? AND ts < ? ORDER BY ts",
            (lo, hi),
        )
        out: dict[date, list[CurvePoint]] = {}
        for r in rows:
            out.setdefault(local_day(r["ts"], self.tz), []).append(
                CurvePoint(r["ts"], r["minutes"], r["wh"])
            )
        return out

    def complete_curve_days(self, start: date, end: date) -> set[date]:
        return {
            day
            for day, points in self.curve(start, end).items()
            if curve_complete(day, points, self.tz)
        }
