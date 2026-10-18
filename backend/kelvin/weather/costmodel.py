"""« Météo et coût » (spec 2026-10-18 §5): the home's and each room's heating model, the forecast
days and the month-end outlook. Pure: LinkyService.weather_model gathers the inputs; every € is
added by billing/report.py (`daily_points`, `model_euros`), the only place a € is rounded."""

from __future__ import annotations

import copy
import math
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any

from kelvin.billing.radiators import RadiatorDay
from kelvin.weather import fit as F
from kelvin.weather.models import DayWeather
from kelvin.weather.normals import normal_days, normal_sum_sd, normals_info


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


WINDOW_DAYS = 365
FORECAST_DAYS = 7
SIGMA_C = (
    1.0,
    1.2,
    1.5,
    1.8,
    2.1,
    2.4,
    2.7,
)  # assumed error of a daily mean forecast, leads 1…7 (§5.6)
MILD_PERIOD_DEGREES = 5.0  # v0.2 normalise.MILD_DJU
LINE_STEP_C = 0.5
ONE = timedelta(days=1)
HOUSE_EXCLUDED = ("no_energy", "no_weather", "away", "outlier")
ROOM_EXCLUDED = ("incomplete", "no_weather", "away", "outlier")


@dataclass
class ModelInputs:
    today: date
    period: tuple[date, date]
    weather_on: bool
    linky: bool
    points: dict[date, DayPoint]  # W's measured Linky days (report.daily_points)
    weather: dict[date, DayWeather]  # stored daily rows, up to 5 years (normals)
    away: set[date]
    rooms: dict[str, list[str]]  # room id → its current radiator ids
    radiators: dict[str, dict[date, RadiatorDay]]
    life: dict[str, tuple[date, date | None]]
    forecast: list[DayWeather]  # tomorrow … today + 7 (dju.forecast_days)
    today_weather: DayWeather | None
    fetched_at: float | None

    @property
    def window(self) -> tuple[date, date]:
        return self.today - timedelta(days=WINDOW_DAYS), self.today


@dataclass
class Core:
    view: dict[str, Any]  # period-independent part of the §8.1 view (no €)
    fit: F.Fit | None
    raw: dict[date, tuple[float, float, bool]]  # day → (T, kWh, counted in U: not away)


def _t(w: DayWeather | None) -> float | None:
    return w.tmean if w is not None and w.tmean is not None else None


def _r(v: float | None, n: int = 3) -> float | None:
    return None if v is None else round(v, n)


def _days(a: date, b: date):
    d = a
    while d < b:
        yield d
        d += ONE


def _alive(span: tuple[date, date | None], d: date) -> bool:
    return span[0] <= d and (span[1] is None or d <= span[1])


def _model_numbers(f: F.Fit | None) -> dict[str, Any]:
    keys = (
        "balance_point_c",
        "balance_point_source",
        "baseload_kwh_day",
        "baseload_kwh_day_range",
        "baseload_eur_day",
        "kwh_per_c",
        "kwh_per_c_range",
        "eur_per_c",
        "r2",
        "residual_sd_kwh",
        "fit_days",
        "heating_days",
    )
    if f is None:
        return dict.fromkeys(keys)
    ln = f.line
    alo, ahi = F.coef_range(f, "a")
    blo, bhi = F.coef_range(f, "b")
    return {
        "balance_point_c": round(f.tb, 1),
        "balance_point_source": f.source,
        "baseload_kwh_day": _r(ln.a),
        "baseload_kwh_day_range": [_r(alo), _r(ahi)],
        "baseload_eur_day": None,
        "kwh_per_c": _r(ln.b),
        "kwh_per_c_range": [_r(blo), _r(bhi)],
        "eur_per_c": None,
        "r2": round(ln.r2, 3),
        "residual_sd_kwh": _r(math.sqrt(ln.s2)),
        "fit_days": ln.n,
        "heating_days": f.heating_days,
    }


def _house(
    inp: ModelInputs,
) -> tuple[F.Assessment | None, dict[str, int], dict[date, tuple[float, float, bool]]]:
    excluded = dict.fromkeys(HOUSE_EXCLUDED, 0)
    raw: dict[date, tuple[float, float, bool]] = {}
    days: list[F.Day] = []
    for d in _days(*inp.window):
        p, t = inp.points.get(d), _t(inp.weather.get(d))
        if p is None:
            excluded["no_energy"] += 1
            continue
        if t is None:
            excluded["no_weather"] += 1
            continue
        raw[d] = (t, p.kwh, d not in inp.away)
        if d in inp.away:
            excluded["away"] += 1
            continue
        days.append(F.Day(d, t, p.kwh))
    if not inp.weather_on or not inp.linky:
        return None, excluded, raw
    res = F.assess(days)
    excluded["outlier"] = len(res.outliers)
    return res, excluded, raw


def _room_days(inp: ModelInputs, rids: list[str]) -> tuple[list[F.Day], dict[str, int], int]:
    excluded = dict.fromkeys(ROOM_EXCLUDED, 0)
    days: list[F.Day] = []
    candidates = 0
    for d in _days(*inp.window):
        alive = [r for r in rids if r in inp.life and _alive(inp.life[r], d)]
        if not alive:
            continue
        candidates += 1
        rds = [inp.radiators.get(r, {}).get(d) for r in alive]
        if any(rd is None or not rd.complete or rd.wh is None for rd in rds):
            excluded["incomplete"] += 1  # never a partial room: unknown, not 0
            continue
        t = _t(inp.weather.get(d))
        if t is None:
            excluded["no_weather"] += 1
            continue
        if d in inp.away:
            excluded["away"] += 1
            continue
        days.append(F.Day(d, t, sum(rd.wh for rd in rds) / 1000))  # type: ignore[union-attr]
    return days, excluded, candidates


def _rooms_tb(inp: ModelInputs, house: F.Fit | None) -> tuple[float, str]:
    if house is not None:
        return house.tb, "house"
    every = sorted({r for rids in inp.rooms.values() for r in rids})
    days, _, _ = _room_days(inp, every)
    res = F.assess(days, room=True)
    if res.fit is not None and res.fit.source == "estimated":
        return res.fit.tb, "radiators"
    return F.TB_CONVENTION, "convention"


def _rooms(inp: ModelInputs, house: F.Fit | None) -> dict[str, Any]:
    tb, source = _rooms_tb(inp, house)
    items: list[dict[str, Any]] = []
    for room_id, rids in sorted(inp.rooms.items()):
        base: dict[str, Any] = {
            "room_id": room_id,
            "state": "hidden",
            "why": None,
            "thin": [],
            "kwh_per_c": None,
            "kwh_per_c_range": None,
            "eur_per_c": None,
            "baseload_kwh_day": None,
            "r2": None,
            "fit_days": None,
            "heating_days": None,
            "coverage": None,
            "excluded": None,
        }
        if not inp.weather_on:
            items.append({**base, "why": "weather_off"})
            continue
        if not any(r in inp.life for r in rids):
            items.append({**base, "why": "no_radiator"})
            continue
        days, excluded, cand = _room_days(inp, rids)
        res = F.assess(days, tb=tb, room=True)
        excluded["outlier"] = len(res.outliers)
        measured = cand - excluded["incomplete"]
        base.update(
            coverage={
                "days": measured,
                "of": cand,
                "share": round(measured / cand, 4) if cand else None,
            },
            excluded=excluded,
        )
        if res.fit is None:
            items.append({**base, "why": res.why})
            continue
        f, (blo, bhi) = res.fit, F.coef_range(res.fit, "b")
        items.append(
            {
                **base,
                "state": "ok",
                "thin": [t for t in res.thin if t != "no_mild_days"],
                "kwh_per_c": _r(f.line.b),
                "kwh_per_c_range": [_r(blo), _r(bhi)],
                "baseload_kwh_day": _r(f.line.a),
                "r2": round(f.line.r2, 3),
                "fit_days": f.line.n,
                "heating_days": f.heating_days,
            }
        )
    return {"balance_point_c": round(tb, 1), "balance_point_source": source, "items": items}


def _forecast(inp: ModelInputs, f: F.Fit | None) -> dict[str, Any]:
    if not inp.weather_on:
        return {
            "state": "hidden",
            "why": "weather_off",
            "fetched_at": None,
            "days": [],
            "week": None,
        }
    days: list[dict[str, Any]] = []
    for lead, w in enumerate(inp.forecast[:FORECAST_DAYS], start=1):
        t = _t(w)
        d: dict[str, Any] = {
            "date": w.day.isoformat(),
            "lead": lead,
            "t_c": _r(t, 1),
            "tmin_c": _r(w.tmin, 1),
            "tmax_c": _r(w.tmax, 1),
            "degrees_c": None,
            "model": w.model if w.hours else None,
            "complete": t is not None,
            "kwh": None,
            "kwh_lo": None,
            "kwh_hi": None,
            "heating_kwh": None,
            "heating_kwh_lo": None,
            "heating_kwh_hi": None,
            "eur": None,
            "eur_lo": None,
            "eur_hi": None,
            "heating_eur": None,
            "eur_why": None,
            "colour": None,
            "parts": None,
            "sigma_c": SIGMA_C[lead - 1],
        }
        if t is not None and f is not None:
            y, lo, hi = F.predict(f, t, SIGMA_C[lead - 1])
            a = f.line.a
            d.update(
                degrees_c=round(F.hdd(t, f.tb), 1),
                kwh=_r(y),
                kwh_lo=_r(lo),
                kwh_hi=_r(hi),
                heating_kwh=_r(y - a),
                heating_kwh_lo=_r(max(0.0, lo - a)),
                heating_kwh_hi=_r(max(0.0, hi - a)),
            )
        days.append(d)
    have = [d for d in days if d["kwh"] is not None]
    if not any(d["complete"] for d in days):
        state, why = "hidden", "no_forecast"
    elif f is None:
        state, why = "hidden", "model_hidden"
    else:
        state, why = "ok", None
    week = (
        {
            "kwh": _r(sum(d["kwh"] for d in have)),
            "heating_kwh": _r(sum(d["heating_kwh"] for d in have)),
            "eur": None,
            "heating_eur": None,
            "days": len(have),
            "priced_days": 0,
        }
        if have
        else None
    )
    return {"state": state, "why": why, "fetched_at": inp.fetched_at, "days": days, "week": week}


def _month_outlook(inp: ModelInputs, f: F.Fit | None) -> MonthOutlook | None:
    if not inp.weather_on:
        return None
    if f is None:
        return MonthOutlook("model_hidden")
    t0 = inp.today
    first = (t0.replace(day=1) - ONE).replace(day=1)  # the previous month too: the anchor may lag
    end = (t0.replace(day=28) + timedelta(days=4)).replace(day=1)
    temps = {d: w.tmean for d, w in inp.weather.items() if w.tmean is not None}
    late = [d for d in _days(t0 + timedelta(days=FORECAST_DAYS + 1), end)]
    normals = normal_days(temps, late, f.tb, t0)
    fc = {w.day: (lead, _t(w)) for lead, w in enumerate(inp.forecast[:FORECAST_DAYS], start=1)}
    days: dict[date, tuple[float, str]] = {}
    missing: dict[date, str] = {}
    xs: dict[date, tuple[float, float]] = {}  # day → (degrees, extra variance)
    b = f.line.b
    for d in _days(first, end):
        if d < t0:
            t, src, var = _t(inp.weather.get(d)), "observed", 0.0
            reason = "weather_missing"
        elif d == t0:
            t, src, reason = _t(inp.today_weather), "today", "weather_missing"
            var = (b * SIGMA_C[0]) ** 2
        elif d in fc:
            lead, t = fc[d]
            src, reason, var = "forecast", "no_forecast", (b * SIGMA_C[lead - 1]) ** 2
        else:
            n = normals.get(d)
            if n is None:
                missing[d] = "no_normals"
                continue
            x = n.degrees
            days[d] = (f.line.a + b * x, "normal")
            xs[d] = (x, 0.0)
            continue
        if t is None:
            missing[d] = reason
            continue
        x = F.hdd(t, f.tb)
        days[d] = (f.line.a + b * x, src)
        xs[d] = (x, var if x > 0 else 0.0)

    def interval(need: list[date]) -> tuple[float, float, str]:
        extra = sum(xs[d][1] for d in need)
        normal = [d for d in need if days[d][1] == "normal"]
        spread = "full"
        if normal:
            sd = normal_sum_sd(temps, normal, f.tb, t0)
            if sd is None:
                spread = "no_normals_spread"
            else:
                extra += (b * sd) ** 2
        _, lo, hi = F.sum_interval(f, [xs[d][0] for d in need], extra)
        return lo, hi, spread

    return MonthOutlook(None, days, missing, interval)


def build(inp: ModelInputs) -> tuple[Core, MonthOutlook | None]:
    res, excluded, raw = _house(inp)
    f = res.fit if res is not None else None
    why = (
        "weather_off" if not inp.weather_on else "no_linky" if not inp.linky else res.why  # type: ignore[union-attr]
    )
    temps = {d: w.tmean for d, w in inp.weather.items() if w.tmean is not None}
    house: dict[str, Any] = {
        "state": "ok" if f is not None else "hidden",
        "why": None if f is not None else why,
        "thin": list(res.thin) if res is not None and f is not None else [],
        **_model_numbers(f),
        "excluded": excluded,
        "period_share": None,
        "line": _line(f, raw) if f is not None else [],
        "points": _points(inp, f, res, raw) if inp.weather_on else [],
    }
    w_from, w_to = inp.window
    view = {
        "window": {"from": w_from.isoformat(), "to": w_to.isoformat()},
        "level": F.LEVEL,
        "price": None,
        "house": house,
        "rooms": _rooms(inp, f),
        "forecast": _forecast(inp, f),
        "normals": normals_info(temps, inp.today) if inp.weather_on else None,
    }
    counted = {d: v for d, v in raw.items()} if inp.weather_on else {}
    return Core(view, f, counted), _month_outlook(inp, f)


def _line(f: F.Fit, raw: dict[date, tuple[float, float, bool]]) -> list[dict[str, Any]]:
    if not raw:
        return []
    lo = math.floor(min(t for t, _, _ in raw.values()))
    hi = math.ceil(max(t for t, _, _ in raw.values()))
    steps = {round(lo + LINE_STEP_C * i, 1) for i in range(int((hi - lo) / LINE_STEP_C) + 1)}
    out = []
    for t in sorted(steps | {round(f.tb, 1)}):
        y, ylo, yhi = F.band(f, t)
        out.append(
            {
                "t_c": t,
                "kwh": _r(y),
                "kwh_lo": _r(ylo),
                "kwh_hi": _r(yhi),
                "eur": None,
                "eur_lo": None,
                "eur_hi": None,
            }
        )
    return out


def _points(inp, f, res, raw) -> list[dict[str, Any]]:
    # a hidden model's outlier pass proves nothing: only absences are marked then (spec §8.1 hidden
    # forms)
    outliers = {d.key for d in res.outliers} if res is not None and f is not None else set()
    out = []
    for d in sorted(raw):
        t, y, _ = raw[d]
        p = inp.points[d]
        excluded = "away" if d in inp.away else "outlier" if d in outliers else None
        x = F.hdd(t, f.tb) if f is not None else None
        out.append(
            {
                "date": d.isoformat(),
                "t_c": round(t, 1),
                "degrees_c": _r(x, 1),
                "kwh": _r(y),
                "energy_eur": p.energy_eur,
                "parts": [{"key": k, "kwh": _r(v)} for k, v in p.parts]
                if p.parts is not None
                else None,
                "split_estimated": p.split_estimated,
                "colour": p.colour,
                "used": excluded is None,
                "excluded": excluded,
                "in_period": False,
                "expected_kwh": _r(f.line.a + f.line.b * x) if f is not None else None,
            }
        )
    return out


def period_view(core: Core, period: tuple[date, date], today: date) -> dict[str, Any]:
    """The view for a selected period: `in_period` on W's points and the share due to the cold
    over P ∩ W."""
    v = copy.deepcopy(core.view)
    v["period"] = {"from": period[0].isoformat(), "to": period[1].isoformat()}
    p_from, p_to = period
    for p in v["house"]["points"]:
        p["in_period"] = p_from.isoformat() <= p["date"] < p_to.isoformat()
    f = core.fit
    if f is not None:
        w_from = today - timedelta(days=WINDOW_DAYS)
        span = [d for d in _days(max(p_from, w_from), min(p_to, today))]
        if span:
            mine = [(r[0], r[1]) for d in span if (r := core.raw.get(d)) is not None and r[2]]
            degrees = sum(F.hdd(t, f.tb) for t, _ in mine)
            weather = f.line.b * degrees
            total = sum(y for _, y in mine)
            v["house"]["period_share"] = {
                "weather_kwh": _r(weather),
                "kwh": _r(total),
                "share": round(weather / total, 4) if total > 0 else None,
                "degrees": round(degrees, 1),
                "mild": degrees < MILD_PERIOD_DEGREES,
                "days": len(mine),
                "of": len(span),
            }
    return v
