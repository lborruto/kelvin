"""Deterministic outdoor temperatures for the simulator and tests (spec §11), invented and never
presented as real: a seasonal curve (≈ 3 °C around 20 January, ≈ 19 °C around 21 July), a daily
swing of ±4 °C peaking at 15:00, a per-day offset of up to ±2 °C. Coordinates are ignored. Models
are tagged like the real sources (AROME HD for 36 h ahead then ARPEGE; ERA5-Land before
2022-11-13). Its search knows four public town centres."""

from __future__ import annotations

import math
import time
import unicodedata
from collections.abc import Callable
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from kelvin.linky.models import day_bounds
from kelvin.weather.dju import AROME_HD_SINCE
from kelvin.weather.models import (
    AROME_HD,
    ARPEGE,
    BEST_MATCH,
    ECMWF,
    ERA5_LAND,
    HistoryKind,
    Hour,
    Location,
    Place,
)

AROME_AHEAD_S = 36 * 3600
PLACES = (
    Place("Lyon", "Auvergne-Rhône-Alpes", "Rhône", "FR", 45.76, 4.84, 173),
    Place("Lille", "Hauts-de-France", "Nord", "FR", 50.63, 3.06, 21),
    Place("Chamonix-Mont-Blanc", "Auvergne-Rhône-Alpes", "Haute-Savoie", "FR", 45.92, 6.87, 1035),
    Place("Genève", "Genève", None, "CH", 46.2, 6.15, 375),
)
DEMO_PLACE = Place("Lyon (simulateur)", "Auvergne-Rhône-Alpes", "Rhône", "FR", 45.76, 4.84, 173)


def _fold(s: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", s.casefold()) if not unicodedata.combining(c)
    )


class FakeWeatherSource:
    def __init__(self, *, tz: str = "Europe/Paris", wall: Callable[[], float] = time.time) -> None:
        self.tz = ZoneInfo(tz)
        self.wall = wall
        self.calls: list[str] = []
        self.fail: dict[str, Exception] = {}

    def _raise(self, kind: str) -> None:
        if kind in self.fail:
            raise self.fail[kind]

    def temp_at(self, ts: int) -> float:
        local = datetime.fromtimestamp(ts, self.tz)
        day = local.date()
        seasonal = 11.0 - 8.0 * math.cos(2 * math.pi * (day.timetuple().tm_yday - 20) / 365.25)
        swing = 4.0 * math.cos(2 * math.pi * (local.hour - 15) / 24)
        offset = ((day.toordinal() * 7919) % 41 - 20) / 10
        return round(seasonal + swing + offset, 1)

    def _hour(self, ts: int, model: str) -> Hour:
        t = self.temp_at(ts)
        return Hour(ts, t, round(t - 2.5, 1), float(70 + (ts // 3600) % 20), model)

    def _days(self, start: date, end: date) -> list[int]:
        out: list[int] = []
        d = start
        while d < end:
            a, b = day_bounds(d, self.tz)
            out.extend(range(a, b, 3600))
            d += timedelta(days=1)
        return out

    async def forecast(self, loc: Location, past_days: int, forecast_days: int) -> list[Hour]:
        self.calls.append("forecast")
        self._raise("forecast")
        now = self.wall()
        today = datetime.fromtimestamp(now, self.tz).date()
        hours = self._days(today - timedelta(days=past_days), today + timedelta(days=forecast_days))
        if loc.mode != "meteofrance":
            return [self._hour(t, BEST_MATCH) for t in hours]
        return [self._hour(t, AROME_HD if t < now + AROME_AHEAD_S else ARPEGE) for t in hours]

    async def history(self, loc: Location, start: date, end: date, kind: HistoryKind) -> list[Hour]:
        self.calls.append(f"history:{kind}:{start}:{end}")
        self._raise("history")
        code = {"arome_hd": AROME_HD, "era5_land": ERA5_LAND, "best_match": BEST_MATCH}[kind]
        hours = self._days(start, end)
        if kind == "arome_hd":
            first = day_bounds(AROME_HD_SINCE, self.tz)[0]
            hours = [t for t in hours if t >= first]
        return [self._hour(t, code) for t in hours]

    async def outlook(self, loc: Location, days: int) -> list[Hour]:
        self.calls.append("outlook")
        self._raise("outlook")
        now = self.wall()
        today = datetime.fromtimestamp(now, self.tz).date()
        return [
            Hour(t, self.temp_at(t), None, None, ECMWF)
            for t in self._days(today, today + timedelta(days=days))
            if t >= now - 3600
        ]

    def day_mean(self, day: date) -> float:
        """The day's (Tn + Tx) / 2, as a stored day would read: the simulator's Linky follows it."""
        a, b = day_bounds(day, self.tz)
        ts = [self.temp_at(t) for t in range(a, b, 3600)]
        return (min(ts) + max(ts)) / 2

    async def search(self, text: str, language: str) -> list[Place]:
        self.calls.append("search")
        self._raise("search")
        q = _fold(text.strip())
        if len(q) < 2:
            return []
        return [p for p in PLACES if _fold(p.name).startswith(q)]

    async def aclose(self) -> None:
        return None
