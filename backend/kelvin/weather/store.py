"""Outdoor weather in SQLite (spec §5.1, §5.2, §5.4).

Hourly rows are kept 400 days (the room samples' retention); daily rows 5 years. A stored hour is
replaced only by the forecast job and only while it is less than 72 h old, or while it is still a
forecast value (an hour stored when it was in the future); the backfill only fills what is missing
or still a forecast. A day's row is rebuilt from its hours for days before today, until it is final
(complete, ended more than 72 h ago, no forecast hour left): a final day never changes again."""

from __future__ import annotations

import dataclasses
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from kelvin.linky.models import day_bounds
from kelvin.recorder.db import Database
from kelvin.recorder.recorder import SAMPLE_RETENTION_S
from kelvin.weather.dju import FINAL_AFTER_S, aggregate, local_date
from kelvin.weather.models import DayWeather, Hour

HOURLY_KEEP_S = SAMPLE_RETENTION_S
DAILY_KEEP_DAYS = 5 * 366
BATCH = 5000
_UPSERT = (
    "INSERT INTO weather_hourly (ts, t, apparent, rh, model, forecast, fetched_at)"
    " VALUES (?, ?, ?, ?, ?, ?, ?)"
    " ON CONFLICT(ts) DO UPDATE SET t = excluded.t, apparent = excluded.apparent,"
    " rh = excluded.rh, model = excluded.model, forecast = excluded.forecast,"
    " fetched_at = excluded.fetched_at"
    " WHERE weather_hourly.forecast = 1 OR ?"
)


@dataclass(frozen=True)
class StoredHour:
    ts: int
    t: float
    apparent: float | None
    rh: float | None
    model: str
    forecast: bool
    fetched_at: float


class WeatherStore:
    def __init__(self, db: Database, tz: str | ZoneInfo) -> None:
        self.db = db
        self.tz = tz if isinstance(tz, ZoneInfo) else ZoneInfo(tz)

    def _today(self, now: float) -> date:
        return datetime.fromtimestamp(now, self.tz).date()

    def ingest(self, hours: list[Hour], now: float, *, replace: bool) -> set[date]:
        """Write `hours` (fetched at `now`) and rebuild the past days they touch."""
        if not hours:
            return set()
        keep_from = now - HOURLY_KEEP_S
        freeze_before = now - FINAL_AFTER_S
        rows = [
            (
                h.ts,
                h.t,
                h.apparent,
                h.rh,
                h.model,
                int(h.ts > now),
                now,
                int(replace and h.ts >= freeze_before),
            )
            for h in hours
            if h.ts >= keep_from
        ]
        if rows:
            self.db.executemany(_UPSERT, rows)
        days = {local_date(h.ts, self.tz) for h in hours}
        today = self._today(now)
        self._rebuild(sorted(d for d in days if d < today), hours, now)
        return days

    def _day(self, d: date, batch: dict[int, Hour], now: float) -> DayWeather | None:
        """A past day's figures from its stored hours (what the rules kept) and `batch`. An hour
        still holding a forecast value is no measurement of that day: it is left out, so the day
        stays incomplete (DJU null) and never final until real values replace it."""
        a, b = day_bounds(d, self.tz)
        merged = dict(batch)
        forecast = False
        for s in self.hours(a, b):
            if s.forecast:
                merged.pop(s.ts, None)
                forecast = True
            else:
                merged[s.ts] = Hour(s.ts, s.t, s.apparent, s.rh, s.model)
        w = aggregate(d, merged.values(), self.tz, now)
        if w is None:
            return None
        return dataclasses.replace(w, final=w.final and not forecast)

    def _write(self, days: list[DayWeather]) -> None:
        if days:
            self.db.executemany(
                "INSERT OR REPLACE INTO weather_daily"
                " (day, tmin, tmax, tmean, dju, hours, expected, model, final)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [
                    (
                        w.day.isoformat(),
                        w.tmin,
                        w.tmax,
                        w.tmean,
                        w.dju,
                        w.hours,
                        w.expected,
                        w.model,
                        int(w.final),
                    )
                    for w in days
                ],
            )

    def _rebuild(self, days: list[date], batch: list[Hour], now: float) -> None:
        if not days:
            return
        have = self.daily(days[0], days[-1] + timedelta(days=1))
        by_day: dict[date, dict[int, Hour]] = {}
        for h in batch:
            if h.ts <= now:  # a forecast value never counts in a past day
                by_day.setdefault(local_date(h.ts, self.tz), {})[h.ts] = h
        out: list[DayWeather] = []
        for d in days:
            if d in have and have[d].final:
                continue
            w = self._day(d, by_day.get(d, {}), now)
            if w is not None:
                out.append(w)
        self._write(out)

    def finalise(self, now: float) -> int:
        """Mark final the complete days that have passed the freeze window since they were built
        (days the forecast job filled are rebuilt only while recent, so they would otherwise
        stay non-final). Rebuilt from the stored hours; a day whose hours are gone (pruned) or
        still hold a forecast value keeps its row as it is."""
        cutoff = self._today(now) - timedelta(days=FINAL_AFTER_S // 86400)
        rows = self.db.rows(
            "SELECT day FROM weather_daily WHERE final = 0 AND tmean IS NOT NULL AND day < ?",
            (cutoff.isoformat(),),
        )
        done: list[DayWeather] = []
        for (iso,) in rows:
            w = self._day(date.fromisoformat(iso), {}, now)
            if w is not None and w.final and w.tmean is not None:
                done.append(w)
        self._write(done)
        return len(done)

    def hours(
        self, start_ts: int, end_ts: int, *, past_before: float | None = None
    ) -> list[StoredHour]:
        """[start_ts, end_ts); with `past_before`, only hours starting at or before it that are
        not forecasts (a history chart)."""
        sql = (
            "SELECT ts, t, apparent, rh, model, forecast, fetched_at FROM weather_hourly"
            " WHERE ts >= ? AND ts < ?"
        )
        params: list[Any] = [start_ts, end_ts]
        if past_before is not None:
            sql += " AND ts <= ? AND forecast = 0"
            params.append(past_before)
        rows = self.db.rows(sql + " ORDER BY ts", params)
        return [StoredHour(r[0], r[1], r[2], r[3], r[4], bool(r[5]), r[6]) for r in rows]

    def daily(self, start: date, end: date) -> dict[date, DayWeather]:
        rows = self.db.rows(
            "SELECT day, tmin, tmax, tmean, dju, hours, expected, model, final FROM weather_daily"
            " WHERE day >= ? AND day < ? ORDER BY day",
            (start.isoformat(), end.isoformat()),
        )
        return {
            date.fromisoformat(r[0]): DayWeather(
                date.fromisoformat(r[0]), r[1], r[2], r[3], r[4], r[5], r[6], r[7], bool(r[8])
            )
            for r in rows
        }

    def missing_days(self, start: date, end: date) -> list[date]:
        """Days of [start, end) without complete figures, or still holding a forecast hour."""
        if end <= start:
            return []
        done = {d for d, w in self.daily(start, end).items() if w.tmean is not None}
        a, _ = day_bounds(start, self.tz)
        b, _ = day_bounds(end, self.tz)
        stale = {
            local_date(r[0], self.tz)
            for r in self.db.rows(
                "SELECT ts FROM weather_hourly WHERE forecast = 1 AND ts >= ? AND ts < ?", (a, b)
            )
        }
        out, d = [], start
        while d < end:
            if d not in done or d in stale:
                out.append(d)
            d += timedelta(days=1)
        return out

    def coverage(self) -> dict[str, Any] | None:
        r = self.db.query(
            "SELECT MIN(day) AS a, MAX(day) AS b, COUNT(*) AS n FROM weather_daily"
            " WHERE tmean IS NOT NULL"
        )[0]
        return (
            None
            if r["a"] is None
            else {"first_day": r["a"], "last_day": r["b"], "complete_days": r["n"]}
        )

    def _delete_batches(self, table: str, where: str, params: tuple[Any, ...]) -> int:
        total = 0
        while True:
            n = self.db.execute(
                f"DELETE FROM {table} WHERE rowid IN"
                f" (SELECT rowid FROM {table} WHERE {where} LIMIT {BATCH})",
                params,
            )
            total += n
            if n < BATCH:
                return total

    def prune(self, now: float) -> int:
        horizon = (self._today(now) - timedelta(days=DAILY_KEEP_DAYS)).isoformat()
        return self._delete_batches(
            "weather_hourly", "ts < ?", (int(now - HOURLY_KEEP_S),)
        ) + self._delete_batches("weather_daily", "day < ?", (horizon,))

    def clear(self) -> int:
        return self._delete_batches("weather_hourly", "1", ()) + self._delete_batches(
            "weather_daily", "1", ()
        )
