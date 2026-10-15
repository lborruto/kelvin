"""Whole-home energy and cost per day (spec §2.2, §3.6). Prices are TTC; no tax engine.

The daily reading is the authority (M7). A complete curve — else the fallback profile — only
decides how it spreads over the day's half-hours, hence over rate keys: `hc`/`hp`, a Tempo
colour's `_hc`/`_hp`, or `base`. Each half-hour is priced by `Pricing` (its option, its slots
or Tempo hours, its Tempo day's colour). A Tempo half-hour whose colour is unknown keeps its
kWh under `unknown_hc`/`unknown_hp`, and the day then has no € (`colour_missing`).
"""

from __future__ import annotations

import calendar
from dataclasses import dataclass
from datetime import date
from zoneinfo import ZoneInfo

from kelvin.billing.pricing import Pricing
from kelvin.billing.split import Profile, half_hour_key
from kelvin.billing.tariff import PriceRow
from kelvin.linky.models import CurvePoint, curve_complete, day_bounds

__all__ = [
    "DayEnergy",
    "curve_complete",
    "day_energy",
    "days_in_month",
    "energy_eur",
    "shape_of",
    "subscription_eur",
]


@dataclass(frozen=True)
class DayEnergy:
    day: date
    kwh: float
    hc_kwh: float | None  # None without a tariff or under base (no split)
    hp_kwh: float | None
    estimated: bool  # split from the fallback profile, not this day's curve
    method: str | None = None  # "curve" or the fallback method; None when nothing was split
    by_rate: tuple[tuple[str, float], ...] = ()  # kWh per rate key, scaled to the daily total
    energy_eur: float | None = None  # None without a tariff or with an unknown Tempo colour
    colour_missing: bool = False


def days_in_month(day: date) -> int:
    return calendar.monthrange(day.year, day.month)[1]


def shape_of(day: date, tz: ZoneInfo, profile: Profile | None) -> list[tuple[int, int, float]]:
    """The day's real half-hours (46, 48 or 50) as (start, seconds, weight), weighted by the
    profile, or evenly when it has none (or none of its keys fall on this day)."""
    a, b = day_bounds(day, tz)
    starts = list(range(a, b, 1800))
    weights = dict(profile.weights) if profile else {}
    raw = [weights.get(half_hour_key(t, tz), 0.0) for t in starts]
    if sum(raw) <= 0:
        raw = [1.0] * len(starts)
    return [(t, 1800, w) for t, w in zip(starts, raw, strict=True)]


def day_energy(
    day: date,
    daily_wh: int | None,
    points: list[CurvePoint] | None,
    pricing: Pricing | None,
    tz: ZoneInfo,
    fallback: Profile | None,
) -> DayEnergy | None:
    """The daily total is the authority; a complete curve (else the profile) decides the split."""
    complete = curve_complete(day, points, tz)
    if daily_wh is None and not complete:
        return None
    curve_wh = sum(p.wh for p in points) if complete and points else 0.0
    total_wh = float(daily_wh) if daily_wh is not None else curve_wh
    if pricing is None:
        return DayEnergy(day, total_wh / 1000, None, None, False)
    if complete and points and curve_wh > 0:
        shape = [(p.ts, p.minutes * 60, p.wh) for p in points]
        method = "curve"
    else:
        shape = shape_of(day, tz, fallback)
        method = fallback.method if fallback else "slots"
    weight = sum(w for _, _, w in shape)
    acc: dict[str, float] = {}  # weight per rate key
    hc_w = 0.0
    split = True
    for ts, seconds, w in shape:
        sl = pricing.slice(ts, seconds)
        for key, share in sl.keys:
            acc[key] = acc.get(key, 0.0) + w * share
        if sl.offpeak is None:
            split = False
        else:
            hc_w += w * sl.offpeak
    # Plan 5's arithmetic, kept so that an HC/HP day reads the same figures to the last digit
    # (tests/test_tariff_migration_figures.py): the off-peak share of the shape, then the daily
    # total × share and × (1 − share); with two keys the second is the complement too.
    share = hc_w / weight if weight > 0 else 0.0
    frac = {k: v / weight if weight > 0 else 0.0 for k, v in acc.items()}
    if set(frac) == {"hc", "hp"}:
        frac = {"hc": share, "hp": 1 - share}
    by = {k: total_wh * f / 1000 for k, f in sorted(frac.items())}
    if len(by) <= 1 and method != "curve":
        method = None  # one key (base): the shape decides nothing, nothing is estimated
    row = pricing.row(day)
    missing = any(k.startswith("unknown_") for k in by)
    rates = {k: row.rate(k) for k in by}
    eur = (
        None
        if missing or any(r is None for r in rates.values())
        else sum(kwh * rates[k] for k, kwh in by.items())  # type: ignore[operator]
    )
    return DayEnergy(
        day,
        total_wh / 1000,
        total_wh * share / 1000 if split else None,
        total_wh * (1 - share) / 1000 if split else None,
        method not in ("curve", None),
        method,
        tuple(by.items()),
        eur,
        missing,
    )


def energy_eur(e: DayEnergy, prices: PriceRow | None = None) -> float | None:
    """The day's energy €. A DayEnergy built by day_energy carries it; the v1 two-argument form
    prices an HC/HP split by one row."""
    if e.energy_eur is not None or prices is None:
        return e.energy_eur
    if None in (e.hc_kwh, e.hp_kwh, prices.hc_eur_kwh, prices.hp_eur_kwh):
        return None
    return e.hc_kwh * prices.hc_eur_kwh + e.hp_kwh * prices.hp_eur_kwh  # type: ignore[operator]


def subscription_eur(day: date, prices: PriceRow) -> float:
    return prices.subscription_eur_month / days_in_month(day)
