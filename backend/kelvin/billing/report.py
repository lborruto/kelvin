"""The Énergie report (spec §3.6): buckets, the hero comparison, projection and heating share.

Pure: the caller gathers Linky days, curves, radiator energy and the tariff into ReportInputs.
"""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass
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
from kelvin.billing.slots import offpeak_share_of_day, split_curve
from kelvin.billing.tariff import Tariff
from kelvin.linky.models import CurvePoint

Group = Literal["day", "month", "year"]
TRAILING_DAYS = 30
MIN_TRAILING_DAYS = 7
MIN_MONTH_DAYS = 20
STALE_DAYS = 3  # no projection when the newest Linky day is older than this
ONE = timedelta(days=1)


@dataclass
class ReportInputs:
    daily_wh: dict[date, int]
    curve: dict[date, list[CurvePoint]]
    radiators_kwh: dict[date, float]  # whole-house radiator kWh per local day Kelvin recorded
    radiators_by_id: dict[str, float]  # per radiator over [start, end)
    tariff: Tariff | None
    tz: ZoneInfo
    today: date
    first_day: date | None = None  # first day Linky data can exist (contract start)
    # First whole day the radiators were recorded: the day after the recorder's first reading.
    radiators_from: date | None = None


def _days(a: date, b: date) -> Iterator[date]:
    d = a
    while d < b:
        yield d
        d += ONE


def unit_start(day: date, group: Group) -> date:
    if group == "day":
        return day
    if group == "month":
        return day.replace(day=1)
    return date(day.year, 1, 1)


def next_unit(start: date, group: Group) -> date:
    if group == "day":
        return start + ONE
    if group == "month":
        return date(start.year + start.month // 12, start.month % 12 + 1, 1)
    return date(start.year + 1, 1, 1)


def prev_unit(start: date, group: Group) -> date:
    if group == "day":
        return start - ONE
    if group == "month":
        return date(start.year - (start.month == 1), (start.month - 2) % 12 + 1, 1)
    return date(start.year - 1, 1, 1)


def bucket_key(day: date, group: Group) -> str:
    if group == "day":
        return day.isoformat()
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

    def _radiators(self, a: date, b: date) -> float | None:
        """None when Kelvin recorded no day of [a, b): unknown, never 0 kWh."""
        recorded = [v for d in _days(a, b) if (v := self.inp.radiators_kwh.get(d)) is not None]
        return sum(recorded) if recorded else None

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
        return {
            "kwh": _r(kwh),
            "hc_kwh": _r(hc),
            "hp_kwh": _r(hp),
            "radiators_kwh": _r(self._radiators(a, b)),
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


def build_report(start: date, end: date, group: Group, inp: ReportInputs) -> dict[str, Any]:
    en = _Energy(inp)
    buckets = []
    d = start
    while d < end:
        nxt = min(next_unit(unit_start(d, group), group), end)
        buckets.append({"key": bucket_key(d, group), **en.summary(d, nxt)})
        d = nxt
    anchor = en.last or (inp.today - ONE)
    cur_start = unit_start(anchor, group)
    cur_end = anchor + ONE
    prev_start = prev_unit(cur_start, group)
    prev_end = min(prev_start + (cur_end - cur_start), cur_start)
    # Radiators only report since Kelvin started recording: the share runs over the days
    # both sources cover, and the report says from which day. The recorder's first day is
    # partial (it starts mid-day), so it is left out.
    common = [
        x
        for x in _days(start, end)
        if x in inp.radiators_kwh
        and (inp.radiators_from is None or x >= inp.radiators_from)
        and en.day(x) is not None
    ]
    linky_kwh = sum(en.day(x).kwh for x in common)  # type: ignore[union-attr]
    share = (
        min(sum(inp.radiators_kwh[x] for x in common) / linky_kwh, 1.0) if linky_kwh > 0 else None
    )
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
        "hero": {
            "current": en.period(cur_start, cur_end),
            "previous": en.period(prev_start, prev_end),
        },
        "heating_share": _r(share, 4),
        "heating_share_since": common[0].isoformat() if share is not None else None,
        "radiators": [
            {"radiator_id": rid, "kwh": _r(v)} for rid, v in sorted(inp.radiators_by_id.items())
        ],
        "projection": _projection(en, anchor)
        if en.last and (inp.today - en.last).days <= STALE_DAYS
        else None,
    }
