"""Weather-normalised comparison (spec §6.3). Pure.

Reference model: ordinary least squares of the home's daily Linky kWh on the day's DJU,
E = a + b × DJU (a: baseload kWh/day, b: kWh per DJU), fitted on the days within 45 days of the
reference days and before the current period (never a current day). For the paired days of a
comparison row, each side's expected consumption is n·a + b·ΣDJU; the normalised change is
(E_cur / Ê_cur) / (E_ref / Ê_ref) − 1. Hidden, with a reason, when the data cannot support it."""

from __future__ import annotations

from collections.abc import Callable, Iterable
from dataclasses import dataclass
from datetime import date, timedelta
from statistics import pstdev
from typing import Any

FIT_MARGIN_DAYS = 45
MIN_FIT_DAYS = 28
MIN_HEATING_DAYS = 10
HEATING_DJU = 1.0
MIN_DJU_SD = 1.0
MIN_R2 = 0.5
MILD_DJU = 5.0


@dataclass(frozen=True)
class Fit:
    a: float
    b: float
    r2: float
    n: int


def fit(points: list[tuple[float, float]]) -> Fit | None:
    """(x, y) = (DJU, kWh). None without spread in x."""
    n = len(points)
    if n < 2:
        return None
    mx = sum(x for x, _ in points) / n
    my = sum(y for _, y in points) / n
    sxx = sum((x - mx) ** 2 for x, _ in points)
    if sxx == 0:
        return None
    b = sum((x - mx) * (y - my) for x, y in points) / sxx
    a = my - b * mx
    ss_tot = sum((y - my) ** 2 for _, y in points)
    ss_res = sum((y - a - b * x) ** 2 for x, y in points)
    return Fit(a, b, 1 - ss_res / ss_tot if ss_tot > 0 else 1.0, n)


def normalised_change(
    days: Iterable[date],
    to: Callable[[date], date | None],
    kwh: Callable[[date], float | None],
    dju: Callable[[date], float | None],
    *,
    comparable: bool,
) -> dict[str, Any]:
    out: dict[str, Any] = {
        "change": None,
        "why": None,
        "dju_cur": None,
        "dju_ref": None,
        "expected_cur_kwh": None,
        "expected_ref_kwh": None,
        "model": None,
    }

    def hidden(why: str) -> dict[str, Any]:
        out["why"] = why
        return out

    days = sorted(days)
    if not comparable or not days:
        return hidden("not_comparable")
    pairs: list[tuple[date, date]] = []
    for d in days:
        r = to(d)
        if r is not None and kwh(d) is not None and kwh(r) is not None:
            pairs.append((d, r))
    if not pairs:
        return hidden("not_comparable")
    if any(dju(c) is None or dju(r) is None for c, r in pairs):
        return hidden("weather_missing")
    dc = sum(dju(c) for c, _ in pairs)  # type: ignore[misc]
    dr = sum(dju(r) for _, r in pairs)  # type: ignore[misc]
    out["dju_cur"], out["dju_ref"] = round(dc, 1), round(dr, 1)
    if dc < MILD_DJU and dr < MILD_DJU:
        return hidden("mild_period")
    refs = [r for _, r in pairs]
    d = min(refs) - timedelta(days=FIT_MARGIN_DAYS)
    hi = min(max(refs) + timedelta(days=FIT_MARGIN_DAYS + 1), days[0])
    points: list[tuple[float, float]] = []
    while d < hi:
        k, x = kwh(d), dju(d)
        if k is not None and x is not None:
            points.append((x, k))
        d += timedelta(days=1)
    if len(points) < MIN_FIT_DAYS:
        return hidden("few_days")
    xs = [x for x, _ in points]
    if sum(1 for x in xs if x >= HEATING_DJU) < MIN_HEATING_DAYS or pstdev(xs) < MIN_DJU_SD:
        return hidden("few_heating_days")
    f = fit(points)
    if (
        f is None or f.b <= 0 or f.a < -1e-6 or f.r2 < MIN_R2
    ):  # -1e-6: an exact zero baseload's float noise
        return hidden("poor_fit")
    n = len(pairs)
    e_cur = sum(kwh(c) for c, _ in pairs)  # type: ignore[misc]
    e_ref = sum(kwh(r) for _, r in pairs)  # type: ignore[misc]
    x_cur = n * f.a + f.b * dc
    x_ref = n * f.a + f.b * dr
    if x_cur <= 0 or x_ref <= 0 or e_ref <= 0:
        return hidden("poor_fit")
    out.update(
        change=round((e_cur / x_cur) / (e_ref / x_ref) - 1, 4),
        expected_cur_kwh=round(x_cur, 3),
        expected_ref_kwh=round(x_ref, 3),
        model={
            "baseload_kwh_day": round(f.a, 3),
            "kwh_per_dju": round(f.b, 3),
            "r2": round(f.r2, 3),
            "fit_days": f.n,
        },
    )
    return out
