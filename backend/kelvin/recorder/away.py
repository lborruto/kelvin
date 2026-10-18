"""Kelvin's absences (« Partir… »), kept 400 days for the weather model (spec 2026-10-18 §6.5): a
local day that overlaps any span is an absence day and is left out of the fit. Written by
OverrideManager only."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from kelvin.linky.models import day_bounds
from kelvin.recorder.db import Database

AWAY_KEEP_S = 400 * 86400


def record_start(db: Database, oid: str, start: float, planned_end: float) -> None:
    db.execute(
        "INSERT OR REPLACE INTO away_log (id, start, end, ended) VALUES (?, ?, ?, 0)",
        (oid, start, planned_end),
    )


def record_end(db: Database, oid: str, at: float) -> None:
    """The away ended (expired or cancelled) at `at`; only the first end counts."""
    db.execute(
        "UPDATE away_log SET end = MIN(end, ?), ended = 1 WHERE id = ? AND ended = 0", (at, oid)
    )


def away_days(db: Database, start: date, end: date, tz: ZoneInfo, now: float) -> set[date]:
    a, _ = day_bounds(start, tz)
    b, _ = day_bounds(end, tz)
    out: set[date] = set()
    for s, e, ended in db.rows(
        "SELECT start, end, ended FROM away_log WHERE start < ? AND end > ?", (b, a)
    ):
        stop = e if ended else min(e, now)
        d = max(start, _local(s, tz))
        while d < end:
            lo, hi = day_bounds(d, tz)
            if lo > stop:  # a span ending at midnight still marks that day: the return re-heats
                break
            if hi > s:
                out.add(d)
            d += timedelta(days=1)
    return out


def signature(db: Database) -> tuple:
    r = db.rows("SELECT COUNT(*), MAX(end), SUM(ended) FROM away_log")[0]
    return tuple(r)


def _local(ts: float, tz: ZoneInfo) -> date:
    return datetime.fromtimestamp(ts, tz).date()
