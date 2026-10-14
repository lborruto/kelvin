"""The Énergie report (spec §3.6): buckets, the hero comparison, projection and heating share.

Pure: the caller gathers Linky days, curves, radiator energy and the tariff into ReportInputs.
"""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any, Literal
from zoneinfo import ZoneInfo

from kelvin.billing.costs import (
    DayEnergy,
    curve_complete,
    day_energy,
    days_in_month,
    energy_eur,
    subscription_eur,
)
from kelvin.billing.radiators import RadiatorDay
from kelvin.billing.slots import offpeak_share_of_day, split_curve
from kelvin.billing.tariff import Tariff
from kelvin.linky.models import CurvePoint

Group = Literal["day", "week", "month", "year"]
TRAILING_DAYS = 30
MIN_TRAILING_DAYS = 7
MIN_MONTH_DAYS = 20
STALE_DAYS = 3  # no projection when the newest Linky day is older than this
INCONSISTENT_SHARE = 1.02  # radiators above the meter by more than 2 %: a data error (L7)
ONE = timedelta(days=1)


@dataclass
class ReportInputs:
    daily_wh: dict[date, int]
    curve: dict[date, list[CurvePoint]]
    tariff: Tariff | None
    tz: ZoneInfo
    today: date
    first_day: date | None = None  # first day Linky data can exist (contract start)
    # Every radiator Kelvin recorded, in the house or not (L8): its energy per local day...
    radiators: dict[str, dict[date, RadiatorDay]] = field(default_factory=dict)
    # ...and the days it is known to exist: its first reading's day to its last reading's day,
    # or None while it is still in the house (then a day without data is a gap, not an absence).
    radiator_life: dict[str, tuple[date, date | None]] = field(default_factory=dict)
    rooms: dict[str, str] = field(default_factory=dict)  # radiator id → current room id
    # Over the selected period, per radiator: temp_avg, setpoint_avg, heating_hours (or None).
    sample_stats: dict[str, dict[str, float | None]] = field(default_factory=dict)


def _days(a: date, b: date) -> Iterator[date]:
    d = a
    while d < b:
        yield d
        d += ONE


def unit_start(day: date, group: Group) -> date:
    if group == "day":
        return day
    if group == "week":  # ISO week, Monday first
        return day - timedelta(days=day.weekday())
    if group == "month":
        return day.replace(day=1)
    return date(day.year, 1, 1)


def next_unit(start: date, group: Group) -> date:
    if group == "day":
        return start + ONE
    if group == "week":
        return start + 7 * ONE
    if group == "month":
        return date(start.year + start.month // 12, start.month % 12 + 1, 1)
    return date(start.year + 1, 1, 1)


def prev_unit(start: date, group: Group) -> date:
    if group == "day":
        return start - ONE
    if group == "week":
        return start - 7 * ONE
    if group == "month":
        return date(start.year - (start.month == 1), (start.month - 2) % 12 + 1, 1)
    return date(start.year - 1, 1, 1)


def bucket_key(day: date, group: Group) -> str:
    if group == "day":
        return day.isoformat()
    if group == "week":
        year, week, _ = day.isocalendar()
        return f"{year:04d}-W{week:02d}"
    if group == "month":
        return f"{day.year:04d}-{day.month:02d}"
    return f"{day.year:04d}"


def minus_year(day: date) -> date:
    try:
        return day.replace(year=day.year - 1)
    except ValueError:  # 29 February
        return day.replace(year=day.year - 1, day=28)


def _r(v: float | None, n: int = 3) -> float | None:
    return None if v is None else round(v, n)


class _Energy:
    """Whole-home energy and cost per day, computed once per report."""

    def __init__(self, inp: ReportInputs) -> None:
        self.inp = inp
        self.ranges = inp.tariff.ranges() if inp.tariff else None
        complete = {d: p for d, p in inp.curve.items() if curve_complete(d, p, inp.tz)}
        known = [*inp.daily_wh, *complete]
        self.last: date | None = max(known, default=None)
        self.first: date | None = inp.first_day or min(known, default=None)
        # The first day Linky actually returned data for (the contract may start earlier).
        self.first_data: date | None = min(
            (d for d in known if self.first is None or d >= self.first), default=None
        )
        self.share = self._fallback_share(complete)
        self._cache: dict[date, DayEnergy | None] = {}

    def _fallback_share(self, complete: dict[date, list[CurvePoint]]) -> float:
        if self.ranges is None:
            return 0.0
        hc = total = 0.0
        for points in complete.values():
            h, p = split_curve(points, self.ranges, self.inp.tz)
            hc += h
            total += h + p
        return hc / total if total > 0 else offpeak_share_of_day(self.ranges)

    def day(self, d: date) -> DayEnergy | None:
        if self.first is not None and d < self.first:
            return None  # before the first day: no data, whatever the inputs hold
        if d not in self._cache:
            self._cache[d] = day_energy(
                d,
                self.inp.daily_wh.get(d),
                self.inp.curve.get(d),
                self.ranges,
                self.inp.tz,
                self.share,
            )
        return self._cache[d]

    def _known(self, rid: str, d: date) -> bool:
        life = self.inp.radiator_life.get(rid)
        if life is None:
            days = self.inp.radiators.get(rid) or {}
            life = (min(days), None) if days else None
        return life is not None and life[0] <= d and (life[1] is None or d <= life[1])

    def _radiator_sum(self, ids: list[str], a: date, b: date) -> dict[str, Any] | None:
        """Radiator energy over [a, b): None when no radiator has energy there (unknown, never
        0). coverage = radiator-days fully measured / radiator-days the radiators existed."""
        wh = hc = hp = eur = 0.0
        found = priced = False
        interp = appor = False
        known = recorded = 0
        for d in _days(a, b):
            for rid in ids:
                k = self._known(rid, d)
                rd = self.inp.radiators.get(rid, {}).get(d)
                known += k
                if rd is None or rd.wh is None:
                    continue
                found = True
                wh += rd.wh
                recorded += k and rd.complete
                interp |= rd.interpolated
                appor |= rd.apportioned
                if rd.hc_wh is not None and rd.hp_wh is not None and rd.eur is not None:
                    priced = True
                    hc, hp, eur = hc + rd.hc_wh, hp + rd.hp_wh, eur + rd.eur
        if not found:
            return None
        return {
            "kwh": _r(wh / 1000),
            "hc_kwh": _r(hc / 1000) if priced else None,
            "hp_kwh": _r(hp / 1000) if priced else None,
            "eur": _r(eur, 2) if priced else None,
            "interpolated": interp,
            "apportioned": appor,
            "coverage": _r(recorded / known, 4) if known else None,
        }

    def radiators(self, a: date, b: date) -> dict[str, Any] | None:
        return self._radiator_sum(sorted(self.inp.radiators), a, b)

    def common(self, d: date) -> bool:
        """A day both sources cover whole: Linky has it, and every radiator that existed that
        day was measured over all of it."""
        if self.day(d) is None:
            return False
        known = [rid for rid in self.inp.radiators if self._known(rid, d)]
        return bool(known) and all(
            (rd := self.inp.radiators[rid].get(d)) is not None and rd.complete for rid in known
        )

    def heating(self, a: date, b: date) -> dict[str, Any]:
        """The radiators' share of the meter over the common days of [a, b) (L7: never
        clamped; above INCONSISTENT_SHARE it is flagged, and shown as « — »)."""
        common = [d for d in _days(a, b) if self.common(d)]
        present = [d for d in _days(a, b) if self.day(d) is not None]
        linky = sum(self.day(d).kwh for d in common)  # type: ignore[union-attr]
        rad = sum(
            rd.wh or 0.0
            for d in common
            for per in self.inp.radiators.values()
            if (rd := per.get(d)) is not None
        )
        value = rad / 1000 / linky if linky > 0 else None
        return {
            "value": _r(value, 4),
            "days": len(common),
            "of_days": len(present),
            "since": common[0].isoformat() if common else None,
            "inconsistent": value is not None and value > INCONSISTENT_SHARE,
        }

    def by_radiator(self, a: date, b: date) -> list[dict[str, Any]]:
        out = []
        for rid in sorted(self.inp.radiators):
            s = self._radiator_sum([rid], a, b)
            existed = any(self._known(rid, d) for d in _days(a, b))
            if s is None and not existed:
                continue
            stats = self.inp.sample_stats.get(rid, {})
            life = self.inp.radiator_life.get(rid)
            out.append(
                {
                    "radiator_id": rid,
                    "room_id": self.inp.rooms.get(rid),
                    **(s or dict.fromkeys(("kwh", "hc_kwh", "hp_kwh", "eur", "coverage"))),
                    "interpolated": bool(s and s["interpolated"]),
                    "apportioned": bool(s and s["apportioned"]),
                    "from": life[0].isoformat() if life else None,
                    "temp_avg": _r(stats.get("temp_avg"), 1),
                    "setpoint_avg": _r(stats.get("setpoint_avg"), 1),
                    "heating_hours": _r(stats.get("heating_hours"), 1),
                }
            )
        return out

    def summary(self, a: date, b: date) -> dict[str, Any]:
        tariff = self.inp.tariff
        counted = [
            d
            for d in _days(a, b)
            if self.last is not None and self.first is not None and self.first <= d <= self.last
        ]
        present = [e for d in counted if (e := self.day(d)) is not None]
        kwh = sum(e.kwh for e in present) if present else None
        split = bool(present) and self.ranges is not None
        hc = sum(e.hc_kwh or 0.0 for e in present) if split else None
        hp = sum(e.hp_kwh or 0.0 for e in present) if split else None
        energy = sub = eur = None
        if tariff is not None and counted:
            sub = sum(subscription_eur(d, tariff.prices_on(d)) for d in counted)
            if present:
                energy = sum(energy_eur(e, tariff.prices_on(e.day)) or 0.0 for e in present)
                eur = energy + sub
        rad = self.radiators(a, b)
        rest = None
        if (
            rad is not None
            and kwh is not None
            and rad["coverage"] == 1
            and len(present) == len(counted) == (b - a).days
        ):
            rest = kwh - rad["kwh"] if kwh >= rad["kwh"] else None
        return {
            "kwh": _r(kwh),
            "hc_kwh": _r(hc),
            "hp_kwh": _r(hp),
            "radiators_kwh": rad["kwh"] if rad else None,
            "radiators": rad,
            "rest_kwh": _r(rest),
            "energy_eur": _r(energy, 2),
            "subscription_eur": _r(sub, 2),
            "eur": _r(eur, 2),
            "days": (b - a).days,
            "missing_days": len(counted) - len(present),
            "estimated_split": any(e.estimated for e in present),
        }

    def period(self, a: date, b: date) -> dict[str, Any]:
        return {"from": a.isoformat(), "to": b.isoformat(), **self.summary(a, b)}


def _projection(en: _Energy, anchor: date) -> dict[str, Any] | None:
    inp = en.inp
    trailing = [e for i in range(TRAILING_DAYS) if (e := en.day(anchor - i * ONE)) is not None]
    if len(trailing) < MIN_TRAILING_DAYS:
        return None
    avg = sum(e.kwh for e in trailing) / len(trailing)
    shifted = [
        e for i in range(TRAILING_DAYS) if (e := en.day(minus_year(anchor - i * ONE))) is not None
    ]
    shifted_avg = (
        sum(e.kwh for e in shifted) / len(shifted) if len(shifted) >= MIN_TRAILING_DAYS else None
    )

    def factor(month: date) -> float | None:
        if not shifted_avg:
            return None
        ly = date(month.year - 1, month.month, 1)
        ly_days = [e for d in _days(ly, next_unit(ly, "month")) if (e := en.day(d)) is not None]
        if len(ly_days) < MIN_MONTH_DAYS:
            return None
        return (sum(e.kwh for e in ly_days) / len(ly_days)) / shifted_avg

    tariff = inp.tariff
    price = sub_month = None
    if tariff is not None:
        p = tariff.prices_on(inp.today)
        total = sum(e.kwh for e in trailing)
        hc = sum(e.hc_kwh or 0.0 for e in trailing)
        share = hc / total if total > 0 else en.share
        price = share * p.hc_eur_kwh + (1 - share) * p.hp_eur_kwh
        sub_month = p.subscription_eur_month

    first = unit_start(anchor, "month")
    actual = en.summary(first, anchor + ONE)
    months: list[dict[str, Any]] = []
    m = first
    for i in range(12):
        dim = days_in_month(m)
        f = factor(m)
        per_day = avg * (f if f is not None else 1.0)
        if i == 0:
            remaining = (next_unit(first, "month") - (anchor + ONE)).days
            kwh = (actual["kwh"] or 0.0) + remaining * per_day
            eur = (
                (actual["eur"] or 0.0) + remaining * per_day * price + sub_month * remaining / dim
                if price is not None and sub_month is not None
                else None
            )
        else:
            kwh = dim * per_day
            eur = kwh * price + sub_month if price is not None and sub_month is not None else None
        months.append(
            {
                "key": bucket_key(m, "month"),
                "kwh": _r(kwh),
                "eur": _r(eur, 2),
                "method": "seasonal" if f is not None else "linear",
            }
        )
        m = next_unit(m, "month")
    methods = {x["method"] for x in months}
    year_eur = sum(x["eur"] for x in months) if price is not None else None
    return {
        "month": {
            **months[0],
            "actual_kwh": actual["kwh"],
            "actual_eur": actual["eur"],
        },
        "year": {
            "from": months[0]["key"],
            "to": months[-1]["key"],
            "kwh": _r(sum(x["kwh"] for x in months)),
            "eur": _r(year_eur, 2),
            "method": methods.pop() if len(methods) == 1 else "mixed",
            "months": months,
        },
    }


def build_report(
    start: date,
    end: date,
    group: Group,
    inp: ReportInputs,
    period: tuple[date, date] | None = None,
) -> dict[str, Any]:
    """`[start, end)` is the chart window. `period` is the selected period the hero, the
    per-radiator figures and the comparisons describe; by default the unit of `group` that
    holds the last Linky day (or yesterday)."""
    en = _Energy(inp)
    buckets = []
    d = start
    while d < end:
        nxt = min(next_unit(unit_start(d, group), group), end)
        buckets.append({"key": bucket_key(d, group), **en.summary(d, nxt)})
        d = nxt
    anchor = en.last or (inp.today - ONE)
    if period is None:
        period = (unit_start(anchor, group), next_unit(unit_start(anchor, group), group))
    p_from, p_to = period
    cur_start = unit_start(anchor, group)
    cur_end = anchor + ONE
    prev_start = prev_unit(cur_start, group)
    prev_end = min(prev_start + (cur_end - cur_start), cur_start)
    window_heating = en.heating(start, end)
    by_id = {}
    for rid in sorted(inp.radiators):
        x = en._radiator_sum([rid], start, end)
        if x is not None:
            by_id[rid] = x["kwh"]
    return {
        "group": group,
        "from": start.isoformat(),
        "to": end.isoformat(),
        "last_day": en.last.isoformat() if en.last else None,
        "linky_since": en.first_data.isoformat() if en.first_data else None,
        "linky": en.last is not None,
        "tariff": inp.tariff is not None,
        "buckets": buckets,
        "total": en.summary(start, end),
        "period": en.period(p_from, p_to),
        "hero": {
            "current": en.period(cur_start, cur_end),
            "previous": en.period(prev_start, prev_end),
        },
        # v1 fields, over the chart window; « — » (None) when inconsistent (L7).
        "heating_share": None if window_heating["inconsistent"] else window_heating["value"],
        "heating_share_since": window_heating["since"],
        "radiators": [{"radiator_id": rid, "kwh": v} for rid, v in by_id.items()],
        # v2, over the selected period.
        "heating": en.heating(p_from, p_to),
        "by_radiator": en.by_radiator(p_from, p_to),
        "projection": _projection(en, anchor)
        if en.last and (inp.today - en.last).days <= STALE_DAYS
        else None,
    }
