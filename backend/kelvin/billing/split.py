"""How a day's energy spreads over its half-hours when it has no complete curve (spec §3.1 L6,
§2.2 « day cost without a curve »). Pure.

A day with a complete load curve uses its own curve. Any other day uses a fallback **profile**:
the share of a day's energy in each local half-hour, pooled (energy-weighted) over complete curve
days within ±15 days ("fallback_window"), else complete days of the same calendar month
("fallback_month"), else every complete day ("fallback_all") — the last two from 35 days before
the day on (spec §2.2: the pool never depends on the window asked; the service loads curves from
400 days before the window, so day − 35 is always loaded) — else an even spread over the day's
real half-hours ("slots"). Priced by the day's own tariff, a profile gives the seasonal HC share
under HC/HP and the three Tempo windows (00:00–06:00 on the previous day's colour, 06:00–22:00 HP,
22:00–24:00 HC), on 23 h and 25 h days alike.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from kelvin.linky.models import CurvePoint

WINDOW_DAYS = 15
FLOOR_DAYS = 35  # the month and all-days pools read curves from day − 35 days on (Plan 5, kept)


@dataclass(frozen=True)
class Share:
    value: float
    method: str  # curve | fallback_window | fallback_month | fallback_all | slots


@dataclass(frozen=True)
class Profile:
    weights: tuple[tuple[int, float], ...]  # half-hour start minute → share of the energy
    method: str  # fallback_window | fallback_month | fallback_all | slots (weights empty)


def half_hour_key(ts: int, tz: ZoneInfo) -> int:
    """The local start minute of the half-hour holding `ts` (the repeated autumn hour shares
    its keys with the first one)."""
    local = datetime.fromtimestamp(ts, tz)
    return (local.hour * 60 + local.minute) // 30 * 30


class FallbackShares:
    def __init__(self, complete: dict[date, list[CurvePoint]], tz: ZoneInfo) -> None:
        self.days: dict[date, dict[int, float]] = {}
        for d, points in complete.items():
            acc: dict[int, float] = {}
            for p in points:
                k = half_hour_key(p.ts, tz)
                acc[k] = acc.get(k, 0.0) + p.wh
            if sum(acc.values()) > 0:
                self.days[d] = acc
        self._cache: dict[date, Profile] = {}

    @staticmethod
    def _pool(days: list[dict[int, float]]) -> tuple[tuple[int, float], ...] | None:
        total = sum(sum(d.values()) for d in days)
        if total <= 0:
            return None
        acc: dict[int, float] = {}
        for d in days:
            for k, v in d.items():
                acc[k] = acc.get(k, 0.0) + v
        return tuple(sorted((k, v / total) for k, v in acc.items()))

    def for_day(self, day: date) -> Profile:
        if day not in self._cache:
            near = [
                v
                for i in range(-WINDOW_DAYS, WINDOW_DAYS + 1)
                if (v := self.days.get(day + timedelta(days=i))) is not None
            ]
            floor = day - timedelta(days=FLOOR_DAYS)
            later = [v for d, v in self.days.items() if d >= floor]
            month = [v for d, v in self.days.items() if d >= floor and d.month == day.month]
            for pool, method in (
                (near, "fallback_window"),
                (month, "fallback_month"),
                (later, "fallback_all"),
            ):
                weights = self._pool(pool)
                if weights is not None:
                    self._cache[day] = Profile(weights, method)
                    break
            else:
                self._cache[day] = Profile((), "slots")
        return self._cache[day]

    def overall(self) -> Profile:
        """Every loaded complete day: the projection and the quality block."""
        weights = self._pool(list(self.days.values()))
        return Profile(weights, "fallback_all") if weights is not None else Profile((), "slots")
