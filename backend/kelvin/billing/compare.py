"""Comparisons on comparable days (spec §3.1 M3, L4, L13). Pure.

Each day of the selected period is paired with its counterpart (the day before, a week
before, the same date a month or a year before; 29 February maps to 28 February). Only pairs
where both days have Linky data count. More than 20 % of pairs dropped: no change is given.
Money compares energy € only: the subscription depends on the month's length (L13).
"""

from __future__ import annotations

from collections.abc import Callable, Iterable
from datetime import date, timedelta
from typing import Any

from kelvin.billing.costs import DayEnergy, energy_eur
from kelvin.billing.tariff import Tariff

MAX_DROPPED = 0.2
DayFn = Callable[[date], DayEnergy | None]
Mapper = Callable[[date], date | None]


def minus_months(day: date, k: int) -> date | None:
    """The same day of the month k months earlier, or None when that month is shorter."""
    y, m = divmod(day.year * 12 + day.month - 1 - k, 12)
    try:
        return date(y, m + 1, day.day)
    except ValueError:
        return None


def minus_years(day: date, k: int) -> date:
    try:
        return day.replace(year=day.year - k)
    except ValueError:  # 29 February
        return day.replace(year=day.year - k, day=28)


def mapper(group: str, k: int = 1, days: int | None = None) -> Mapper:
    """The k-th previous period's counterpart of a day, for a period of `group`. With `days`
    (a custom period of that many days), the k-th run of `days` days before it."""
    if days is not None:
        return lambda d: d - timedelta(days=days * k)
    if group == "day":
        return lambda d: d - timedelta(days=k)
    if group == "week":
        return lambda d: d - timedelta(days=7 * k)
    if group == "month":
        return lambda d: minus_months(d, k)
    return lambda d: minus_years(d, k)


def _r(v: float | None, n: int = 3) -> float | None:
    return None if v is None else round(v, n)


def _eur(e: DayEnergy, tariff: Tariff | None) -> float | None:
    return energy_eur(e, tariff.prices_on(e.day)) if tariff else None


def _paired(
    days: Iterable[date], to: Mapper, day: DayFn
) -> tuple[list[tuple[DayEnergy, DayEnergy]], list[date]]:
    """The (current, counterpart) pairs with Linky data on both sides, and every counterpart
    that exists (a day whose counterpart month is shorter has none)."""
    pairs: list[tuple[DayEnergy, DayEnergy]] = []
    others: list[date] = []
    for d in days:
        c = to(d)
        if c is None:
            continue
        others.append(c)
        cur, prev = day(d), day(c)
        if cur is not None and prev is not None:
            pairs.append((cur, prev))
    return pairs, others


def _comparable(pairs: int, candidates: int) -> bool:
    return pairs > 0 and 1 - pairs / candidates <= MAX_DROPPED


def compare(
    days: Iterable[date], to: Mapper, day: DayFn, tariff: Tariff | None
) -> dict[str, Any] | None:
    """Paired comparison of `days` (the period's elapsed days) with their counterparts."""
    pairs, others = _paired(days, to, day)
    if not others:
        return None
    candidates = len(others)
    ok = _comparable(len(pairs), candidates)
    cur_kwh = sum(c.kwh for c, _ in pairs)
    prev_kwh = sum(p.kwh for _, p in pairs)
    eurs = [(_eur(c, tariff), _eur(p, tariff)) for c, p in pairs]
    priced = bool(eurs) and all(a is not None and b is not None for a, b in eurs)
    cur_eur = sum(a for a, _ in eurs) if priced else None  # type: ignore[misc]
    prev_eur = sum(b for _, b in eurs) if priced else None  # type: ignore[misc]
    return {
        "from": min(others).isoformat(),
        "to": (max(others) + timedelta(days=1)).isoformat(),
        "pairs": len(pairs),
        "of": candidates,
        "comparable": ok,
        "cur_kwh": _r(cur_kwh) if pairs else None,
        "prev_kwh": _r(prev_kwh) if pairs else None,
        "cur_energy_eur": _r(cur_eur, 2),
        "prev_energy_eur": _r(prev_eur, 2),
        "change": _r(cur_kwh / prev_kwh - 1, 4) if ok and prev_kwh > 0 else None,
        "change_energy_eur": _r(cur_eur / prev_eur - 1, 4)
        if ok and cur_eur is not None and prev_eur
        else None,
    }


def average_of_four(
    days: list[date],
    group: str,
    day: DayFn,
    tariff: Tariff | None = None,
    *,
    period_days: int | None = None,
) -> dict[str, Any] | None:
    """« Moyenne des 4 dernières … »: over the four previous periods that are comparable, the
    mean kWh per day of the current days paired with each of them against the mean kWh per day
    of their paired days, so both sides are measured on the same days (review I-3). Energy
    only: `tariff` is not used. `period_days`: see `mapper`."""
    if not any(day(d) is not None for d in days):
        return None
    cur_per_day: list[float] = []
    prev_per_day: list[float] = []
    for k in range(1, 5):
        pairs, others = _paired(days, mapper(group, k, period_days), day)
        if others and _comparable(len(pairs), len(others)):  # unrounded sums
            cur_per_day.append(sum(c.kwh for c, _ in pairs) / len(pairs))
            prev_per_day.append(sum(p.kwh for _, p in pairs) / len(pairs))
    cur = sum(cur_per_day) / len(cur_per_day) if cur_per_day else None
    avg = sum(prev_per_day) / len(prev_per_day) if prev_per_day else None
    return {
        "units": len(prev_per_day),
        "cur_kwh_per_day": _r(cur),
        "prev_kwh_per_day": _r(avg),
        "change": _r(cur / avg - 1, 4) if cur is not None and avg else None,
    }
