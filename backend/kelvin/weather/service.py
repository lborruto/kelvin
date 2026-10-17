"""Outdoor weather inside Kelvin (spec §4, §5): the private location, Kelvin's own call budget,
and the two jobs in the shared Scheduler.

- forecast, hourly at :17: the last 2 days and the next 2, one weighted call;
- backfill, 04:50 and after a save: every incomplete day from `backfill_start` to yesterday,
  AROME HD (historical forecast) from 2022-11-13, ERA5-Land before it and for AROME HD gaps older
  than 6 days; `best_match` outside France. A range is asked once (`weather_backfill`).
The location is never logged and never leaves this service except through `settings_view()`."""

from __future__ import annotations

import logging
import math
import time
from collections import deque
from collections.abc import Callable
from dataclasses import asdict
from datetime import date, datetime, timedelta
from datetime import time as dtime
from typing import Any
from zoneinfo import ZoneInfo

from kelvin.errors import UserError
from kelvin.linky.models import day_bounds
from kelvin.scheduler import Job
from kelvin.weather.client import printable
from kelvin.weather.dju import AROME_HD_SINCE, mode_for, round_coord, weight
from kelvin.weather.fake import DEMO_PLACE
from kelvin.weather.models import (
    VARIABLE_COUNT,
    HistoryKind,
    Location,
    Place,
    WeatherBudgetSpent,
    WeatherError,
    WeatherSource,
)
from kelvin.weather.store import WeatherStore

log = logging.getLogger(__name__)

LOCATION_KEY = "weather_location"
CALLS_KEY = "weather_calls"
BACKFILL_KEY = "weather_backfill"
DEMO_KEY = "weather_demo_seeded"
FORECAST_TIMES = tuple(dtime(h, 17) for h in range(24))
BACKFILL_TIMES = (dtime(4, 50),)
PAST_DAYS = 2
FORECAST_DAYS = 2
CHUNK_DAYS = 92
ERA5_DELAY_DAYS = 6
MAX_DAYS = 5 * 366
MIN_DAYS = 31
DAILY_WEIGHT_CAP = 400.0
BACKFILL_RUN_CAP = 300.0
SEARCHES_PER_HOUR = 30
SEARCHES_PER_DAY = 200
ELEVATION_MIN, ELEVATION_MAX = -50, 4900
LABEL_MAX = 80
ATTRIBUTION_URL = "https://open-meteo.com/"
KINDS: tuple[HistoryKind, ...] = ("arome_hd", "era5_land", "best_match")


def _noop() -> None:
    return None


def _label(v: str | None) -> str | None:
    if v is None:
        return None
    if not isinstance(v, str) or len(v) > LABEL_MAX:
        raise UserError("weather_location_invalid")
    return printable(v) or None


def _coord(v: Any, limit: float) -> float:
    if (
        isinstance(v, bool)
        or not isinstance(v, int | float)
        or not math.isfinite(v)
        or abs(v) > limit
    ):
        raise UserError("weather_location_invalid")
    return round_coord(float(v))


def _runs(days: list[date], size: int) -> list[tuple[date, date]]:
    """Contiguous runs of `days` (sorted) cut into [a, b) chunks of at most `size`, cut from the
    newest end (the newest chunk is a full one), newest first."""
    out: list[tuple[date, date]] = []
    run: list[date] = []
    for d in [*days, None]:
        if run and (d is None or d != run[-1] + timedelta(days=1)):
            i = len(run)
            while i > 0:
                part = run[max(0, i - size) : i]
                out.append((part[0], part[-1] + timedelta(days=1)))
                i -= size
            run = []
        if d is not None:
            run.append(d)
    return sorted(out, reverse=True)


def _merge(ranges: list[list[str]]) -> list[list[str]]:
    spans = sorted((date.fromisoformat(a), date.fromisoformat(b)) for a, b in ranges)
    out: list[list[date]] = []
    for a, b in spans:
        if out and a <= out[-1][1]:
            out[-1][1] = max(out[-1][1], b)
        else:
            out.append([a, b])
    return [[a.isoformat(), b.isoformat()] for a, b in out]


def _inside(ranges: list[list[str]], d: date) -> bool:
    iso = d.isoformat()
    return any(a <= iso < b for a, b in ranges)


class WeatherService:
    def __init__(
        self,
        store: WeatherStore,
        source: WeatherSource,
        *,
        db: Any,
        tz: str | ZoneInfo = "Europe/Paris",
        wall: Callable[[], float] = time.time,
        first_days: Callable[[], list[date | None]] = list,
        on_change: Callable[[], None] = _noop,
    ) -> None:
        self.store = store
        self.source = source
        self.db = db
        self.tz = tz if isinstance(tz, ZoneInfo) else ZoneInfo(tz)
        self.wall = wall
        self.first_days = first_days
        self.on_change = on_change
        self._searches: deque[float] = deque()

    # — location —
    def location(self) -> Location | None:
        d = self.db.get_setting(LOCATION_KEY)
        return Location.from_setting(d) if d else None

    def enabled(self) -> bool:
        return self.location() is not None

    def set_location(
        self,
        *,
        lat: Any,
        lon: Any,
        elevation_m: Any = None,
        name: str | None = None,
        admin1: str | None = None,
        admin2: str | None = None,
        country_code: str | None = None,
        origin: str = "manual",
    ) -> Location:
        la, lo = _coord(lat, 90), _coord(lon, 180)
        if elevation_m is not None and (
            isinstance(elevation_m, bool)
            or not isinstance(elevation_m, int)
            or not ELEVATION_MIN <= elevation_m <= ELEVATION_MAX
        ):
            raise UserError("weather_elevation_invalid")
        if country_code is not None and not (
            isinstance(country_code, str) and len(country_code) == 2 and country_code.isalpha()
        ):
            raise UserError("weather_location_invalid")
        if origin not in ("search", "manual"):
            raise UserError("weather_location_invalid")
        source = "none" if elevation_m is None else ("geocoder" if origin == "search" else "owner")
        loc = Location(
            _label(name),
            _label(admin1),
            _label(admin2),
            country_code.upper() if country_code else None,
            la,
            lo,
            elevation_m,
            source,
            origin,
            mode_for(la, lo),
            self.wall(),
        )
        old = self.location()
        if old is None or (old.lat, old.lon, old.elevation_m) != (
            loc.lat,
            loc.lon,
            loc.elevation_m,
        ):
            self.store.clear()  # the rows describe another place
            self.db.set_setting(BACKFILL_KEY, None)
        self.db.set_setting(LOCATION_KEY, loc.to_setting())
        log.info("weather: location set (%s mode)", loc.mode)
        self.on_change()
        return loc

    def clear_location(self) -> None:
        self.db.set_setting(LOCATION_KEY, None)
        self.db.set_setting(BACKFILL_KEY, None)
        self.store.clear()
        log.info("weather: location removed")
        self.on_change()

    def seed_demo(self) -> None:
        """Simulator only (decision 10): the demo place, once; a removal sticks."""
        if self.db.get_setting(DEMO_KEY):
            return
        p: Place = DEMO_PLACE
        self.set_location(
            lat=p.lat,
            lon=p.lon,
            elevation_m=p.elevation_m,
            name=p.name,
            admin1=p.admin1,
            admin2=p.admin2,
            country_code=p.country_code,
            origin="search",
        )
        self.db.set_setting(DEMO_KEY, True)

    # — budget —
    def _today(self) -> date:
        return datetime.fromtimestamp(self.wall(), self.tz).date()

    def _ledger(self) -> dict[str, Any]:
        today = self._today().isoformat()
        v = self.db.get_setting(CALLS_KEY) or {}
        return v if v.get("day") == today else {"day": today, "weight": 0.0, "searches": 0}

    def _spend(self, w: float) -> bool:
        v = self._ledger()
        if v["weight"] + w > DAILY_WEIGHT_CAP + 1e-9:
            return False
        v["weight"] = round(v["weight"] + w, 3)
        self.db.set_setting(CALLS_KEY, v)
        return True

    def calls_today(self) -> float:
        return self._ledger()["weight"]

    # — jobs —
    async def forecast_job(self) -> bool:
        loc = self.location()
        if loc is None:
            return False
        models = 2 if loc.mode == "meteofrance" else 1
        if not self._spend(weight(VARIABLE_COUNT * models, PAST_DAYS + FORECAST_DAYS)):
            raise WeatherBudgetSpent("budget")
        hours = await self.source.forecast(loc, PAST_DAYS, FORECAST_DAYS)
        if (
            self.location() != loc
        ):  # changed while the call was out: these hours are another place's
            return False
        self.store.ingest(hours, self.wall(), replace=True)
        self.on_change()
        return True

    def backfill_start(self, today: date) -> date:
        floor = today - timedelta(days=MAX_DAYS)
        firsts = [d for d in self.first_days() if d is not None]
        base = min(firsts) if firsts else today
        return max(floor, min(base, today - timedelta(days=MIN_DAYS)))

    def _asked(self) -> dict[str, list[list[str]]]:
        v = self.db.get_setting(BACKFILL_KEY) or {}
        return {k: v.get(k, []) for k in KINDS}

    def _record(self, kind: str, a: date, b: date) -> None:
        asked = self._asked()
        asked[kind] = _merge([*asked[kind], [a.isoformat(), b.isoformat()]])
        self.db.set_setting(BACKFILL_KEY, asked)

    def backfill_plan(self) -> list[tuple[HistoryKind, date, date]]:
        loc = self.location()
        if loc is None:
            return []
        today = self._today()
        missing = self.store.missing_days(self.backfill_start(today), today)
        asked = self._asked()
        era5_ready = today - timedelta(days=ERA5_DELAY_DAYS)
        want: dict[str, list[date]] = {k: [] for k in KINDS}
        for d in missing:
            if loc.mode == "best_match":
                if not _inside(asked["best_match"], d):
                    want["best_match"].append(d)
            elif d >= AROME_HD_SINCE and not _inside(asked["arome_hd"], d):
                want["arome_hd"].append(d)
            elif d < era5_ready and not _inside(asked["era5_land"], d):
                want["era5_land"].append(d)
        return [(k, a, b) for k in KINDS for a, b in _runs(want[k], CHUNK_DAYS)]

    async def backfill_job(self) -> bool:
        loc = self.location()
        if loc is None:
            return False
        did = False
        spent = 0.0
        # Planned again after each step: a range asked is recorded, so AROME HD's gaps become
        # ERA5-Land requests in the same run, and nothing is asked twice.
        while plan := self.backfill_plan():
            kind, a, b = plan[0]
            w = weight(VARIABLE_COUNT, (b - a).days)
            if spent + w > BACKFILL_RUN_CAP:
                break
            if not self._spend(w):
                if not did:
                    raise WeatherBudgetSpent("budget")
                break
            hours = await self.source.history(loc, a, b, kind)
            if self.location() != loc:
                return did
            self.store.ingest(hours, self.wall(), replace=False)
            self._record(kind, a, b)
            spent += w
            did = True
        self.store.prune(self.wall())
        if did:
            self.on_change()
        return did

    def jobs(self) -> list[Job]:
        return [
            Job("weather_forecast", FORECAST_TIMES, self.forecast_job, self.enabled),
            Job("weather_backfill", BACKFILL_TIMES, self.backfill_job, self.enabled),
        ]

    # — search —
    async def search_places(self, text: str, language: str) -> list[Place]:
        q = printable(text or "")
        if not 2 <= len(q) <= 60:
            raise UserError("weather_search_invalid")
        now = self.wall()
        while self._searches and self._searches[0] <= now - 3600:
            self._searches.popleft()
        v = self._ledger()
        if len(self._searches) >= SEARCHES_PER_HOUR or v["searches"] >= SEARCHES_PER_DAY:
            raise UserError("weather_search_busy", 429)
        self._searches.append(now)
        v["searches"] += 1
        self.db.set_setting(CALLS_KEY, v)
        try:
            return await self.source.search(q, language)
        except WeatherError:
            raise UserError("weather_unavailable", 503) from None

    # — views —
    def view(self) -> dict[str, Any] | None:
        """The chip's data (snapshot, SSE, GET /api/weather): never the place or its coordinates."""
        loc = self.location()
        if loc is None:
            return None
        now = self.wall()
        a, b = day_bounds(self._today(), self.tz)
        rows = self.store.hours(a, b)
        hour = int(now // 3600 * 3600)
        cur = next((h for h in rows if h.ts == hour), None)
        today = None
        if rows:
            lo = min(rows, key=lambda h: h.t)
            hi = max(rows, key=lambda h: h.t)
            today = {
                "min_c": lo.t,
                "min_at": lo.ts,
                "min_ahead": lo.ts > now,
                "max_c": hi.t,
                "max_at": hi.ts,
                "max_ahead": hi.ts > now,
                "hours": len(rows),
            }
        return {
            "now": None
            if cur is None
            else {
                "temperature_c": cur.t,
                "apparent_c": cur.apparent,
                "humidity_pct": cur.rh,
                "at": cur.ts,
                "model": cur.model,
            },
            "today": today,
            "fetched_at": max((h.fetched_at for h in rows), default=None),
            "mode": loc.mode,
        }

    def hourly(self, start: int, end: int) -> dict[str, Any]:
        if self.location() is None:
            return {"step": 3600, "points": []}
        hours = self.store.hours(start, end, past_before=self.wall())
        return {"step": 3600, "points": [{"ts": h.ts, "t": h.t, "model": h.model} for h in hours]}

    def settings_view(self) -> dict[str, Any]:
        loc = self.location()
        today = self._today()
        return {
            "location": None
            if loc is None
            else {k: v for k, v in asdict(loc).items() if k != "set_at"},
            "coverage": None
            if loc is None
            else {**(self.store.coverage() or {}), "from": self.backfill_start(today).isoformat()},
            "calls_today": self.calls_today(),
            "budget": DAILY_WEIGHT_CAP,
            "attribution": {"url": ATTRIBUTION_URL, "licence": "CC BY 4.0"},
        }

    async def aclose(self) -> None:
        await self.source.aclose()
