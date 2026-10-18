"""Pure weather rules (spec §4.2, §5.2, §5.3, §6.1).

DJU (degrés-jours unifiés de chauffage) follow Météo-France's « méthode météo », base 18 °C, on
the **civil day in Paris time**: DJU = max(0, 18 − (Tn + Tx) / 2), Tn and Tx the min and max of the
day's hourly temperatures. Kelvin uses no other method anywhere."""

from __future__ import annotations

from collections.abc import Iterable
from datetime import date, datetime
from decimal import ROUND_HALF_UP, Decimal
from zoneinfo import ZoneInfo

from kelvin.linky.models import day_bounds
from kelvin.weather.models import MIXED, DayWeather, Hour

DJU_BASE_C = 18.0
DJU_METHOD = "meteo_civil_day"
COORD_STEP = Decimal("0.01")  # AROME HD's grid step, about 1.1 km
AROME_HD_SINCE = date(2022, 11, 13)  # Open-Meteo's historical forecast archive for AROME HD
FR_BOX = (
    41.0,
    51.6,
    -5.6,
    10.0,
)  # lat min, lat max, lon min, lon max: metropolitan France + Corsica
FINAL_AFTER_S = 72 * 3600
MISSING_HOURS_OK = 2


def round_coord(v: float) -> float:
    """0.01°, half away from zero on the decimal text: 4.845 → 4.85, −0.005 → −0.01."""
    return float(Decimal(str(v)).quantize(COORD_STEP, rounding=ROUND_HALF_UP))


def dju(tmin: float, tmax: float, base: float = DJU_BASE_C) -> float:
    return max(0.0, base - (tmin + tmax) / 2)


def mode_for(lat: float, lon: float) -> str:
    lo_lat, hi_lat, lo_lon, hi_lon = FR_BOX
    return "meteofrance" if lo_lat <= lat <= hi_lat and lo_lon <= lon <= hi_lon else "best_match"


def weight(series: int, days: float) -> float:
    """Open-Meteo's fractional call count: more than 10 series or 14 days count as several calls."""
    return max(1.0, series / 10) * max(1.0, days / 14)


def expected_hours(day: date, tz: ZoneInfo) -> int:
    a, b = day_bounds(day, tz)
    return (b - a) // 3600


def aggregate(day: date, hours: Iterable[Hour], tz: ZoneInfo, now: float) -> DayWeather | None:
    """The day's figures from its hours (others ignored); None without any hour of that day."""
    a, b = day_bounds(day, tz)
    mine = sorted((h for h in hours if a <= h.ts < b), key=lambda h: h.ts)
    if not mine:
        return None
    expected = expected_hours(day, tz)
    models = {h.model for h in mine}
    model = models.pop() if len(models) == 1 else MIXED
    complete = len(mine) >= expected - MISSING_HOURS_OK
    if not complete:
        return DayWeather(day, None, None, None, None, len(mine), expected, model, False)
    lo = min(h.t for h in mine)
    hi = max(h.t for h in mine)
    return DayWeather(
        day,
        lo,
        hi,
        round((lo + hi) / 2, 2),
        round(dju(lo, hi), 2),
        len(mine),
        expected,
        model,
        now >= b + FINAL_AFTER_S,
    )


def local_date(ts: int, tz: ZoneInfo) -> date:
    return datetime.fromtimestamp(ts, tz).date()
