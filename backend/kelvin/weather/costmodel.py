"""« Météo et coût » (spec 2026-10-18 §5): the home's and each room's heating model, the forecast
days and the month-end outlook. Pure: LinkyService.weather_model gathers the inputs; every € is
added by billing/report.py (`daily_points`, `model_euros`), the only place a € is rounded."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date


@dataclass(frozen=True)
class DayPoint:
    """A measured Linky day as the day bar reads it (report.daily_points)."""

    day: date
    kwh: float
    energy_eur: float | None  # the one-day span's cents (running sums); None, unknown colour
    parts: tuple[tuple[str, float], ...] | None  # report by_rate keys; None without a tariff
    split_estimated: bool
    colour: str | None  # the Tempo day's colour when the day is priced under Tempo


@dataclass(frozen=True)
class MonthOutlook:
    """Predicted kWh for the days of the projection months that need one (spec §5.6)."""

    why: str | None  # model_hidden: nothing below is usable
    # kWh and its source: observed | today | forecast | normal
    days: dict[date, tuple[float, str]] = field(default_factory=dict)
    # weather_missing | no_forecast | no_normals
    missing: dict[date, str] = field(default_factory=dict)
    # (Σ lo, Σ hi, spread) of the days asked
    interval: Callable[[list[date]], tuple[float, float, str]] | None = None
