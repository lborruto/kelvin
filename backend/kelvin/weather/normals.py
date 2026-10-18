"""Climate normals of the home's place from Kelvin's own stored days (spec 2026-10-18 §5.5). Pure.

For a calendar day D: over the YEARS years before D's, every complete day within ±WINDOW days of D's
month-day (29 February → 28), strictly before today; a year counts with MIN_DAYS_PER_YEAR of its
days. The normal degrees are the mean of max(0, Tb − T) (convex in T: never the degrees of a mean
temperature), valid with MIN_YEARS years."""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import date, timedelta
from statistics import stdev
from typing import Any

from kelvin.weather.fit import hdd

YEARS = 5
WINDOW = 3
MIN_DAYS_PER_YEAR = 4
MIN_YEARS = 3


@dataclass(frozen=True)
class Normal:
    t_c: float
    degrees: float
    years: int


def _same_day(d: date, year: int) -> date:
    return date(year, d.month, 28 if (d.month, d.day) == (2, 29) else d.day)


def normal_days(
    temps: Mapping[date, float], days: Iterable[date], tb: float, today: date
) -> dict[date, Normal]:
    out: dict[date, Normal] = {}
    for d in days:
        ts: list[float] = []
        xs: list[float] = []
        for y in range(d.year - YEARS, d.year):
            c = _same_day(d, y)
            sample = [
                temps[x]
                for i in range(-WINDOW, WINDOW + 1)
                if (x := c + timedelta(days=i)) < today and x in temps
            ]
            if len(sample) >= MIN_DAYS_PER_YEAR:
                ts.append(sum(sample) / len(sample))
                xs.append(sum(hdd(t, tb) for t in sample) / len(sample))
        if len(ts) >= MIN_YEARS:
            out[d] = Normal(sum(ts) / len(ts), sum(xs) / len(xs), len(ts))
    return out


def normal_sum_sd(
    temps: Mapping[date, float], days: Iterable[date], tb: float, today: date
) -> float | None:
    """The year-to-year spread of Σ degrees over `days` (exact calendar days, a year counting only
    with every one of them stored): the weather variability of a month end's normal days."""
    ds = list(days)
    if not ds:
        return 0.0
    sums: list[float] = []
    for back in range(1, YEARS + 1):
        same = [_same_day(d, d.year - back) for d in ds]
        if all(x in temps and x < today for x in same):
            sums.append(sum(hdd(temps[x], tb) for x in same))
    return stdev(sums) if len(sums) >= MIN_YEARS else None


def normals_info(temps: Mapping[date, float], today: date) -> dict[str, Any] | None:
    """`normals` in the view: how many whole years back the store reaches (≤ YEARS), null under
    MIN_YEARS."""
    if not temps:
        return None
    first = min(temps)
    years = min(YEARS, (today - first).days // 365)
    if years < MIN_YEARS:
        return None
    return {"years": years, "first_day": first.isoformat(), "window_days": 2 * WINDOW + 1}
