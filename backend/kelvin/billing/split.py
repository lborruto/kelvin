"""The HC share of a day without a complete curve (spec §3.1 L6). Pure.

A day with a complete load curve splits by its own curve. Any other day uses, in order:
complete curve days within ±15 days ("fallback_window"), else complete days of the same
calendar month from 35 days before the day on ("fallback_month"), else every complete day from
35 days before the day on ("fallback_all"), else the slot length's share of the day ("slots").

The 35-day floor keeps a day's share independent of the window asked: the service loads curves
from 400 days before the window and every curve after it, and a day it splits is at most 365
days before the window (the running € sums start on 1 January), so the curves from 35 days
before that day on are always loaded, whatever older history some windows also load.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from zoneinfo import ZoneInfo

from kelvin.billing.slots import Ranges, offpeak_share_of_day, split_curve
from kelvin.linky.models import CurvePoint

WINDOW_DAYS = 15
FLOOR_DAYS = 35  # the month and all-days fallbacks read curves from day − 35 days on


@dataclass(frozen=True)
class Share:
    value: float
    method: str  # curve | fallback_window | fallback_month | fallback_all | slots


class FallbackShares:
    def __init__(
        self, complete: dict[date, list[CurvePoint]], ranges: Ranges, tz: ZoneInfo
    ) -> None:
        self.ranges = ranges
        self.days: dict[date, tuple[float, float]] = {}
        for d, points in complete.items():
            hc, hp = split_curve(points, ranges, tz)
            if hc + hp > 0:
                self.days[d] = (hc, hc + hp)
        self._cache: dict[date, Share] = {}

    @staticmethod
    def _share(pairs: list[tuple[float, float]]) -> float | None:
        total = sum(t for _, t in pairs)
        return sum(h for h, _ in pairs) / total if total > 0 else None

    def for_day(self, day: date) -> Share:
        if day not in self._cache:
            near = [
                v
                for i in range(-WINDOW_DAYS, WINDOW_DAYS + 1)
                if (v := self.days.get(day + timedelta(days=i))) is not None
            ]
            floor = day - timedelta(days=FLOOR_DAYS)
            later = [(d, v) for d, v in self.days.items() if d >= floor]
            month = [v for d, v in later if d.month == day.month]
            for pairs, method in (
                (near, "fallback_window"),
                (month, "fallback_month"),
                ([v for _, v in later], "fallback_all"),
            ):
                value = self._share(pairs)
                if value is not None:
                    self._cache[day] = Share(value, method)
                    break
            else:
                self._cache[day] = Share(offpeak_share_of_day(self.ranges), "slots")
        return self._cache[day]

    def overall(self) -> Share:
        """The all-loaded-days share, for the projection and the quality block."""
        value = self._share(list(self.days.values()))
        if value is None:
            return Share(offpeak_share_of_day(self.ranges), "slots")
        return Share(value, "fallback_all")
