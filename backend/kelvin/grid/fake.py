"""Deterministic grid signals for the simulator and tests (spec §10.2), never presented as real.

Tempo: a season with white days and, from November to March on weekdays, red days; a day's
colour is published at 11:00 the day before. EcoWatt: orange tomorrow from 18:00 to 20:00,
green otherwise, so the strip and the alert have something to show in demos.
"""

from __future__ import annotations

import time
from collections.abc import Callable
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from kelvin.grid.models import EcowattDay

PUBLISH_HOUR = 11
PRICES = {
    "blue_hc": 0.1296,
    "blue_hp": 0.1609,
    "white_hc": 0.1486,
    "white_hp": 0.1894,
    "red_hc": 0.1568,
    "red_hp": 0.7562,
}


class FakeGridSource:
    def __init__(self, *, tz: str = "Europe/Paris", wall: Callable[[], float] = time.time) -> None:
        self.tz = ZoneInfo(tz)
        self.wall = wall
        self.calls: list[str] = []
        self.fail: dict[str, Exception] = {}

    def _raise(self, kind: str) -> None:
        if kind in self.fail:
            raise self.fail[kind]

    def _now(self) -> datetime:
        return datetime.fromtimestamp(self.wall(), self.tz)

    @staticmethod
    def colour(day: date) -> str:
        n = day.toordinal()
        # Pre-flight: `n % 7 == 0` is always a Sunday (ordinal 1 is a Monday), so it never met
        # `weekday() < 5`; 9 is coprime with 7, so red days fall on every weekday over a season.
        if day.month in (11, 12, 1, 2, 3) and day.weekday() < 5 and n % 9 == 0:
            return "red"
        if day.weekday() != 6 and n % 5 == 0:
            return "white"
        return "blue"

    async def tempo(self, start: date, end: date) -> dict[date, str]:
        self.calls.append(f"tempo:{start}:{end}")
        self._raise("tempo")
        now = self._now()
        published = now.date() + timedelta(days=1 if now.hour >= PUBLISH_HOUR else 0)
        out = {}
        d = start
        while d < end:
            if d <= published:
                out[d] = self.colour(d)
            d += timedelta(days=1)
        return out

    async def ecowatt(self, start: date, end: date) -> dict[date, EcowattDay]:
        self.calls.append(f"ecowatt:{start}:{end}")
        self._raise("ecowatt")
        tomorrow = self._now().date() + timedelta(days=1)
        out = {}
        d = start
        while d < end:
            if d == tomorrow:
                out[d] = EcowattDay(d, 2, tuple(2 if h in (18, 19) else 1 for h in range(24)))
            else:
                out[d] = EcowattDay(d, 1, tuple([1] * 24))
            d += timedelta(days=1)
        return out

    async def tempo_prices(self) -> dict[str, float]:
        self.calls.append("tempo_prices")
        self._raise("tempo_prices")
        return dict(PRICES)

    async def aclose(self) -> None:
        return None
