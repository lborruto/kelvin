"""Whole-home energy and cost per day (spec §3.6). Prices are TTC; no tax engine in v1."""

from __future__ import annotations

import calendar
from dataclasses import dataclass
from datetime import date
from zoneinfo import ZoneInfo

from kelvin.billing.slots import Ranges, split_curve
from kelvin.billing.split import Share
from kelvin.billing.tariff import Prices
from kelvin.linky.models import CurvePoint, curve_complete

__all__ = [
    "DayEnergy",
    "curve_complete",
    "day_energy",
    "days_in_month",
    "energy_eur",
    "subscription_eur",
]


@dataclass(frozen=True)
class DayEnergy:
    day: date
    kwh: float
    hc_kwh: float | None  # None without a tariff (no slots, no split)
    hp_kwh: float | None
    estimated: bool  # split from the fallback HC share, not this day's curve
    method: str | None = None  # "curve" or the fallback method (L6); None without a tariff


def days_in_month(day: date) -> int:
    return calendar.monthrange(day.year, day.month)[1]


def day_energy(
    day: date,
    daily_wh: int | None,
    points: list[CurvePoint] | None,
    ranges: Ranges | None,
    tz: ZoneInfo,
    fallback: Share,
) -> DayEnergy | None:
    """The daily total is the authority; a complete curve only decides how it splits."""
    complete = curve_complete(day, points, tz)
    if daily_wh is None and not complete:
        return None
    curve_wh = sum(p.wh for p in points) if complete and points else 0.0
    total_wh = float(daily_wh) if daily_wh is not None else curve_wh
    if ranges is None:
        return DayEnergy(day, total_wh / 1000, None, None, False)
    if complete and points and curve_wh > 0:
        hc_wh, _ = split_curve(points, ranges, tz)
        share, method = hc_wh / curve_wh, "curve"
    else:
        share, method = fallback.value, fallback.method
    return DayEnergy(
        day,
        total_wh / 1000,
        total_wh * share / 1000,
        total_wh * (1 - share) / 1000,
        method != "curve",
        method,
    )


def energy_eur(e: DayEnergy, prices: Prices) -> float | None:
    if e.hc_kwh is None or e.hp_kwh is None:
        return None
    return e.hc_kwh * prices.hc_eur_kwh + e.hp_kwh * prices.hp_eur_kwh


def subscription_eur(day: date, prices: Prices) -> float:
    return prices.subscription_eur_month / days_in_month(day)
