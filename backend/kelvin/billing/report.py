"""The Énergie report (spec §3.6): buckets, the hero comparison, projection and heating share.

Pure: the caller gathers Linky days, curves, radiator energy and the tariff into ReportInputs.
"""

from __future__ import annotations

from collections.abc import Callable, Iterator
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any, Literal
from zoneinfo import ZoneInfo

from kelvin.billing.compare import Mapper, average_of_four, compare, mapper, minus_years
from kelvin.billing.costs import (
    DayEnergy,
    curve_complete,
    day_energy,
    days_in_month,
    subscription_eur,
)
from kelvin.billing.power import power_stats
from kelvin.billing.pricing import COLOURS, Pricing
from kelvin.billing.radiators import RadiatorDay
from kelvin.billing.split import FallbackShares, Profile
from kelvin.billing.tariff import RATE_KEYS, PriceRow, Tariff
from kelvin.linky.models import CurvePoint
from kelvin.weather.costmodel import DayPoint, MonthOutlook
from kelvin.weather.models import DayWeather
from kelvin.weather.normalise import normalised_change

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
    # The stores' own first days: the loaded Linky data is bounded to what the report needs.
    linky_since: date | None = None
    curve_since: date | None = None
    colours: dict[date, str] = field(
        default_factory=dict
    )  # Tempo colour per Tempo day (grid store)
    # Plan 14: complete weather days by local day (store rows), and whether a place is set.
    outdoor: dict[date, DayWeather] = field(default_factory=dict)
    weather_on: bool = False
    # Plan 15: predicted kWh for the month's days without Linky data (the weather path).
    month_outlook: MonthOutlook | None = None


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


def default_period(last: date | None, today: date, group: Group) -> tuple[date, date]:
    """The selected period when none is asked: the unit of `group` holding the last Linky day
    (daily or complete curve), else yesterday. The hero's current period starts there too."""
    first = unit_start(last or (today - ONE), group)
    return first, next_unit(first, group)


def last_linky_day(
    daily_wh: dict[date, int], curve: dict[date, list[CurvePoint]], tz: ZoneInfo
) -> date | None:
    """The newest day with a daily total or a complete curve."""
    complete = (d for d, p in curve.items() if curve_complete(d, p, tz))
    return max([*daily_wh, *complete], default=None)


def _allocate(exact: list[float], cents: int) -> list[int]:
    """Whole cents proportional to `exact` that add up to `cents` (largest remainder)."""
    total = sum(exact)
    if total <= 0 or cents <= 0:  # no € to share (the cents follow the exact sum: both 0)
        return [0] * len(exact)
    raw = [v / total * cents for v in exact]
    out = [int(r) for r in raw]
    order = sorted(range(len(raw)), key=lambda i: (-(raw[i] - out[i]), i))
    for i in order[: cents - sum(out)]:
        out[i] += 1
    return out


def minus_year(day: date) -> date:
    return minus_years(day, 1)


def _r(v: float | None, n: int = 3) -> float | None:
    return None if v is None else round(v, n)


# A radiator-day counts when the radiator existed that day and the day can have been measured.
Counted = Callable[[str, date], bool]


@dataclass(frozen=True)
class RadiatorTotals:
    """Exact sums over the counted radiator-days of [a, b) that have a figure (`radiator_totals`).
    `known` counts the radiator-days that counted, `recorded` those fully measured."""

    wh: float
    hc_wh: float
    hp_wh: float
    eur: float
    priced: bool  # some radiator-day has €
    split: bool  # every radiator-day with a figure has HC/HP (none under Base)
    unpriced: frozenset[date]  # days with a figure but no € (under Tempo: a colour unknown)
    interpolated: bool
    apportioned: bool
    known: int
    recorded: int
    found: bool


def radiator_totals(
    per: dict[str, dict[date, RadiatorDay]], counted: Counted, ids: list[str], a: date, b: date
) -> RadiatorTotals:
    """The report's radiator sum, unrounded. Every figure counts exactly the radiator-days
    `counted` admits: a day it leaves out (today, still running, or outside the radiator's life)
    adds no kWh either, or coverage 1.0 could vouch for a sum holding a partial day (I2). The
    HC/HP split and the € are separate: Base has € and no split, an unknown Tempo colour a split
    and no €."""
    wh = hc = hp = eur = 0.0
    found = priced = interp = appor = False
    split = True
    unpriced: set[date] = set()
    known = recorded = 0
    for d in _days(a, b):
        for rid in ids:
            if not counted(rid, d):
                continue
            known += 1
            rd = per.get(rid, {}).get(d)
            if rd is None or rd.wh is None:
                continue
            found = True
            wh += rd.wh
            recorded += rd.complete
            interp |= rd.interpolated
            appor |= rd.apportioned
            if rd.hc_wh is not None and rd.hp_wh is not None:
                hc, hp = hc + rd.hc_wh, hp + rd.hp_wh
            else:
                split = False
            if rd.eur is not None:
                priced = True
                eur += rd.eur
            else:
                unpriced.add(d)
    return RadiatorTotals(
        wh, hc, hp, eur, priced, split, frozenset(unpriced), interp, appor, known, recorded, found
    )


def radiator_year_cum(
    per: dict[str, dict[date, RadiatorDay]], counted: Counted, year: int
) -> dict[date, float]:
    """The exact radiator energy € of every counted, priced radiator-day from 1 January of
    `year` up to each day (excluded); the next 1 January closes it."""
    e = 0.0
    cum: dict[date, float] = {}
    for d in _days(date(year, 1, 1), date(year + 1, 1, 1)):
        cum[d] = e
        for rid, days in per.items():
            rd = days.get(d)
            if rd is not None and rd.wh is not None and rd.eur is not None and counted(rid, d):
                e += rd.eur
    cum[date(year + 1, 1, 1)] = e
    return cum


def radiator_cents(
    years: Callable[[int], dict[date, float]], a: date, b: date, *, extra: float = 0.0
) -> int:
    """The radiators' € of [a, b) in whole cents, from running sums anchored on 1 January (as
    the meter's `costs`): round(cum(b) + extra) − round(cum(a)), split at each new year, so a
    bucket reads the same in every view and buckets add up to the period. `extra` is exact €
    that belong to the end of the span but to no counted day (a room's measured half-hours of
    today): they enter the same rounding, never a rounding of their own."""
    cents = 0
    x = a
    while True:
        y = min(b, date(x.year + 1, 1, 1))
        cum = years(x.year)
        end = cum[y] + (extra if y == b else 0.0)
        cents += round(end * 100) - round(cum[x] * 100)
        if y >= b:
            return cents
        x = y


def radiator_shares(
    per: dict[str, dict[date, RadiatorDay]],
    counted: Counted,
    years: Callable[[int], dict[date, float]],
    a: date,
    b: date,
) -> dict[str, int]:
    """Each priced radiator's whole cents of [a, b): the radiators' cents (`radiator_cents`)
    shared by largest remainder over each radiator's exact €, so they add up to it. This is the
    report's `by_radiator` € (Énergie's Par pièce rows)."""
    exact: dict[str, float] = {}
    for rid in sorted(per):
        t = radiator_totals(per, counted, [rid], a, b)
        if t.found and t.priced:
            exact[rid] = t.eur
    if not exact:
        return {}
    cents = _allocate(list(exact.values()), radiator_cents(years, a, b))
    return dict(zip(exact, cents, strict=True))


def _colour_counts(days: list[date], colours: dict[date, str]) -> dict[str, int]:
    counts = {"blue": 0, "white": 0, "red": 0, "unknown": 0}
    for d in days:
        c = colours.get(d)
        counts[c if c in COLOURS else "unknown"] += 1
    return counts


def _shown_parts(exact: dict[str, float], total: float, n: int) -> dict[str, float]:
    """Parts rounded to `n` decimals that add up to `total` rounded to `n` (largest remainder,
    spec §9.1-3): the shown kWh per rate add up to the shown kWh."""
    keys = list(exact)
    units = _allocate([max(exact[k], 0.0) for k in keys], round(round(total, n) * 10**n))
    return {k: u / 10**n for k, u in zip(keys, units, strict=True)}


def _projected_price(days: list[DayEnergy], row: PriceRow) -> float | None:
    """€/kWh for projected days: the trailing days' kWh per rate key re-priced at today's row
    (HC/HP: share × P_hc + (1 − share) × P_hp). When today's row lacks one of those keys (the
    option just changed, or a Tempo colour was unknown), the trailing mean price paid."""
    keyed: dict[str, float] = {}
    for e in days:
        for k, v in e.by_rate:
            keyed[k] = keyed.get(k, 0.0) + v
    total = sum(keyed.values())
    rates = {k: row.rate(k) for k in keyed}
    if total > 0 and all(r is not None for r in rates.values()):
        return sum(v * rates[k] for k, v in keyed.items()) / total  # type: ignore[operator]
    paid = [e for e in days if e.energy_eur is not None]
    kwh = sum(e.kwh for e in paid)
    return sum(e.energy_eur for e in paid) / kwh if kwh > 0 else None  # type: ignore[misc]


class _Energy:
    """Whole-home energy and cost per day, computed once per report."""

    def __init__(self, inp: ReportInputs) -> None:
        self.inp = inp
        self.pricing = Pricing(inp.tariff, inp.tz, inp.colours) if inp.tariff else None
        complete = {d: p for d, p in inp.curve.items() if curve_complete(d, p, inp.tz)}
        known = [*inp.daily_wh, *complete]
        self.last: date | None = max(known, default=None)  # as `last_linky_day`
        self.first: date | None = inp.first_day or min(known, default=None)
        # The first day Linky actually returned data for (the contract may start earlier).
        self.first_data: date | None = min(
            (d for d in known if self.first is None or d >= self.first), default=None
        )
        self.complete = complete
        # The first day the report shows Linky data: the loaded rows may not reach the store's
        # first day, so `linky_since` (the store's first daily day) counts too, but never a day
        # before the counted range.
        since = [
            d
            for d in (self.first_data, inp.linky_since)
            if d is not None and (inp.first_day is None or d >= inp.first_day)
        ]
        self.since: date | None = min(since, default=None)
        self.shares = FallbackShares(complete, inp.tz)
        self._cache: dict[date, DayEnergy | None] = {}
        self._years: dict[int, dict[date, tuple[float, float]]] = {}
        self._rad_years: dict[int, dict[date, float]] = {}

    def day(self, d: date) -> DayEnergy | None:
        if self.first is not None and d < self.first:
            return None  # before the first day: no data, whatever the inputs hold
        if d not in self._cache:
            self._cache[d] = day_energy(
                d,
                self.inp.daily_wh.get(d),
                self.inp.curve.get(d),
                self.pricing,
                self.inp.tz,
                self.shares.for_day(d),
            )
        return self._cache[d]

    def _known(self, rid: str, d: date) -> bool:
        """The radiator existed on d and d can have been measured (it is before today)."""
        if d >= self.inp.today:
            return False
        life = self.inp.radiator_life.get(rid)
        if life is None:
            days = self.inp.radiators.get(rid) or {}
            life = (min(days), None) if days else None
        return life is not None and life[0] <= d and (life[1] is None or d <= life[1])

    def _rad_year(self, year: int) -> dict[date, float]:
        """The exact radiator energy € of every radiator-day the sums count (`_known`, priced)
        from 1 January of `year` up to each day (excluded); the next 1 January closes it."""
        if year not in self._rad_years:
            self._rad_years[year] = radiator_year_cum(self.inp.radiators, self._known, year)
        return self._rad_years[year]

    def _radiator_cents(self, a: date, b: date) -> int:
        """The radiators' € of [a, b) in cents, from running sums anchored on 1 January (as
        `costs`): a bucket reads the same in every view, and buckets add up to the period."""
        return radiator_cents(self._rad_year, a, b)

    def _radiator_sum(
        self, ids: list[str], a: date, b: date, *, exact: bool = False
    ) -> dict[str, Any] | None:
        """Radiator energy over [a, b): None when no radiator has energy there (unknown, never
        0). coverage = radiator-days fully measured / radiator-days the radiators existed
        (`radiator_totals`: every figure counts exactly the radiator-days coverage counts)."""
        t = radiator_totals(self.inp.radiators, self._known, ids, a, b)
        if not t.found:
            return None
        # HC/HP only when every counted day has it (never under Base); € are the priced days'
        # (as `_rad_year`), and `missing_colour_days` says which days they leave out, so a
        # coverage of 1.0 never vouches for a partial € (review of batch 3, I-3).
        priced = self.inp.tariff is not None
        return {
            "kwh": _r(t.wh / 1000),
            "hc_kwh": _r(t.hc_wh / 1000) if t.split and priced else None,
            "hp_kwh": _r(t.hp_wh / 1000) if t.split and priced else None,
            "eur": (t.eur if exact else _r(t.eur, 2)) if t.priced else None,
            "missing_colour_days": len(t.unpriced) if priced else 0,
            "interpolated": t.interpolated,
            "apportioned": t.apportioned,
            "coverage": _r(t.recorded / t.known, 4) if t.known else None,
        }

    def radiators(self, a: date, b: date) -> dict[str, Any] | None:
        s = self._radiator_sum(sorted(self.inp.radiators), a, b)
        if s is not None and s["eur"] is not None:
            s["eur"] = self._radiator_cents(a, b) / 100
        return s

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
        """Per radiator over [a, b). Their € are the radiators' total (`radiators`) shared by
        largest remainder over each radiator's exact €, so the rooms add up to the heating cost."""
        out = []
        sums = {
            rid: self._radiator_sum([rid], a, b, exact=True) for rid in sorted(self.inp.radiators)
        }
        shares = radiator_shares(self.inp.radiators, self._known, self._rad_year, a, b)
        for rid, c in shares.items():
            sums[rid]["eur"] = c / 100  # type: ignore[index]
        for rid in sorted(self.inp.radiators):
            s = sums[rid]
            existed = any(self._known(rid, d) for d in _days(a, b))
            if s is None and not existed:
                continue
            stats = self.inp.sample_stats.get(rid, {})
            life = self.inp.radiator_life.get(rid)
            out.append(
                {
                    "radiator_id": rid,
                    "room_id": self.inp.rooms.get(rid),
                    **(
                        s
                        or dict.fromkeys(
                            ("kwh", "hc_kwh", "hp_kwh", "eur", "missing_colour_days", "coverage")
                        )
                    ),
                    "interpolated": bool(s and s["interpolated"]),
                    "apportioned": bool(s and s["apportioned"]),
                    "from": life[0].isoformat() if life else None,
                    "temp_avg": _r(stats.get("temp_avg"), 1),
                    "setpoint_avg": _r(stats.get("setpoint_avg"), 1),
                    "heating_hours": _r(stats.get("heating_hours"), 1),
                }
            )
        return out

    def _present(self, a: date, b: date) -> tuple[list[date], list[DayEnergy]]:
        """The days of [a, b) the report counts, and those of them Linky has."""
        counted = [
            d
            for d in _days(a, b)
            if self.last is not None and self.first is not None and self.first <= d <= self.last
        ]
        return counted, [e for d in counted if (e := self.day(d)) is not None]

    def _year(self, year: int) -> dict[date, tuple[float, float]]:
        """The exact energy € and subscription € of the counted days from 1 January of `year`
        up to each day (excluded), summed day by day in order; the next 1 January closes it."""
        if year not in self._years:
            tariff = self.inp.tariff
            assert tariff is not None
            e = s = 0.0
            cum: dict[date, tuple[float, float]] = {}
            for d in _days(date(year, 1, 1), date(year + 1, 1, 1)):
                cum[d] = (e, s)
                if (
                    self.last is not None
                    and self.first is not None
                    and self.first <= d <= self.last
                ):
                    s += subscription_eur(d, tariff.prices_on(d))
                    if (x := self.day(d)) is not None:
                        e += x.energy_eur or 0.0
            cum[date(year + 1, 1, 1)] = (e, s)
            self._years[year] = cum
        return self._years[year]

    def costs(self, a: date, b: date) -> tuple[float | None, float | None]:
        """The energy € and subscription € of [a, b), to the cent: None without a tariff or a
        counted day (subscription), or without a Linky day (energy).

        Cents come from running sums anchored on 1 January (a fixed origin, never the window):
        a span's cents are round(cum(to)) − round(cum(from)), split at each new year. So a day
        or a bucket reads the same € in every view, any window's buckets add up to the period
        exactly, and each stays within a cent of its exact figure."""
        tariff = self.inp.tariff
        counted, present = self._present(a, b)
        if tariff is None or not counted:
            return None, None
        cents = [0, 0]
        x = a
        while x < b:
            y = min(b, date(x.year + 1, 1, 1))
            cum = self._year(x.year)
            for i in range(2):
                cents[i] += round(cum[y][i] * 100) - round(cum[x][i] * 100)
            x = y
        priced = [e for e in present if e.energy_eur is not None]
        return (cents[0] / 100 if priced else None), cents[1] / 100

    def summary(self, a: date, b: date) -> dict[str, Any]:
        tariff = self.inp.tariff
        counted, present = self._present(a, b)
        kwh = sum(e.kwh for e in present) if present else None
        split = bool(present) and all(e.hc_kwh is not None for e in present)
        hc = sum(e.hc_kwh or 0.0 for e in present) if split else None
        hp = sum(e.hp_kwh or 0.0 for e in present) if split else None
        energy, sub = self.costs(a, b)
        # An invoice's rule: the total is the sum of the two rounded lines, so they add up.
        eur = None
        if energy is not None and sub is not None:
            eur = round(energy + sub, 2)
        rad = self.radiators(a, b)
        rest = None
        if (
            rad is not None
            and kwh is not None
            and rad["coverage"] == 1
            and len(present) == len(counted) == (b - a).days
        ):
            rest = kwh - rad["kwh"] if kwh >= rad["kwh"] else None
        methods = {e.method for e in present if e.method is not None}
        first_price = tariff.prices[0].valid_from if tariff else None
        used = (
            sorted({tariff.prices_on(d) for d in counted}, key=lambda p: p.valid_from)
            if tariff
            else []
        )
        curve_days = [d for d in _days(a, b) if d in self.complete and self.day(d) is not None]
        tempo_days = [d for d in counted if tariff is not None and tariff.option_on(d) == "tempo"]
        by_rate: dict[str, float] = {}
        for e in present:
            for k, v in e.by_rate:
                by_rate[k] = by_rate.get(k, 0.0) + v
        return {
            "kwh": _r(kwh),
            "hc_kwh": _r(hc),
            "hp_kwh": _r(hp),
            "split_method": (methods.pop() if len(methods) == 1 else "mixed") if methods else None,
            "prices": [
                {
                    "valid_from": p.valid_from.isoformat(),
                    "option": p.option,
                    "subscription_eur_month": p.subscription_eur_month,
                    "rates": dict(p.rates),
                }
                for p in used
            ],
            "retro_priced": first_price is not None and any(e.day < first_price for e in present),
            "retro_scheduled": tariff is not None
            and any(tariff.retro_scheduled(d) for d in counted),
            "tempo": _colour_counts(tempo_days, self.inp.colours) if tempo_days else None,
            "by_rate": _shown_parts(dict(sorted(by_rate.items())), kwh or 0.0, 3)
            if self.pricing
            else None,
            # Present days whose € is unknown for want of a Tempo colour: their kWh count, their €
            # does not, so `energy_eur`/`eur` are the priced days' only (never a whole) — spec §2.2.
            "missing_colour_days": sum(e.colour_missing for e in present),
            "present_days": len(present),
            "outdoor": self.outdoor(a, b),
            "curve": self._curve(curve_days),
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

    def _share_of(self, profile: Profile, day: date) -> float | None:
        """The off-peak share a profile gives on `day`'s own hours (1 kWh split)."""
        if self.pricing is None:
            return None
        e = day_energy(day, 1000, None, self.pricing, self.inp.tz, profile)
        return e.hc_kwh if e is not None else None

    def hc_lens(self, a: date, b: date) -> dict[str, Any] | None:
        """The HC/HP panel's facts over [a, b) (spec §3.2.6): the share of kWh off-peak, the
        off-peak share of the clock (averaged over the period's days), the mean price paid, and
        P_hp − P_hc at today's prices (HC/HP only: Tempo has six prices, base none)."""
        if self.pricing is None:
            return None
        _, present = self._present(a, b)  # unrounded: only the ratios are rounded (Plan 5, I-3)
        shares = [x for d in _days(a, b) if (x := self.pricing.day_share(d)) is not None]
        split = [e for e in present if e.hc_kwh is not None]
        if not split and not shares:
            return None  # base, or nothing to say
        kwh = sum(e.kwh for e in present)
        # A bucket mixing a Base day with split days has no HC/HP (decision 13): no share either.
        hc = sum(e.hc_kwh or 0.0 for e in split) if split and len(split) == len(present) else None
        priced = [e for e in present if e.energy_eur is not None]
        paid = sum(e.kwh for e in priced)
        row = self.pricing.row(self.inp.today)
        delta = (
            row.hp_eur_kwh - row.hc_eur_kwh  # type: ignore[operator]
            if row.option == "hchp"
            else None
        )
        return {
            "hc_share": _r(hc / kwh, 4) if kwh and hc is not None else None,
            "slot_share": _r(sum(shares) / len(shares), 4) if shares else None,
            "avg_price": _r(sum(e.energy_eur for e in priced) / paid, 4) if paid else None,  # type: ignore[misc]
            "delta_price": _r(delta, 4),
        }

    def tempo_lens(self, a: date, b: date) -> dict[str, Any] | None:
        """Spec §3.2.6 under Tempo: kWh and € per colour and per off-peak/peak over [a, b), and
        the Tempo days by colour. Each day is priced by its own row. A day without € (a colour
        not published) counts whole in `unknown_kwh`, as the hero leaves it out whole, so the
        rows hold the priced days only. None when no day of [a, b) is Tempo-priced or none has
        Linky data. Shown parts add up: the kWh rows and `unknown_kwh` to the Tempo days' kWh;
        the € rows to the period's energy € when every present day is Tempo-priced (else, as in
        a month that switched to Tempo, to their own total)."""
        tariff = self.inp.tariff
        if self.pricing is None or tariff is None or self.first is None or self.last is None:
            return None
        tempo_days = [
            d
            for d in _days(a, b)
            if self.first <= d <= self.last and tariff.option_on(d) == "tempo"
        ]
        found = [e for d in tempo_days if (e := self.day(d)) is not None]
        if not found:
            return None  # missing is null, never six rows of 0
        keys = RATE_KEYS["tempo"]
        kwh = dict.fromkeys(keys, 0.0)
        eur = dict.fromkeys(keys, 0.0)
        unknown = 0.0
        for e in found:
            if e.energy_eur is None:
                unknown += e.kwh
                continue
            row = self.pricing.row(e.day)
            for k, v in e.by_rate:
                kwh[k] += v
                eur[k] += v * row.rate(k)  # type: ignore[operator]
        shown = _shown_parts({**kwh, "unknown": unknown}, sum(e.kwh for e in found), 3)
        priced = any(e.energy_eur is not None for e in found)
        _, present = self._present(a, b)
        energy = self.costs(a, b)[0] if len(found) == len(present) else None
        cents = round(energy * 100) if energy is not None else round(sum(eur.values()) * 100)
        units = _allocate([eur[k] for k in keys], cents)
        return {
            "rows": [
                {"key": k, "kwh": shown[k], "eur": u / 100 if priced else None}
                for k, u in zip(keys, units, strict=True)
            ],
            "days": _colour_counts(tempo_days, self.inp.colours),
            "unknown_kwh": shown["unknown"] if unknown > 0 else None,
        }

    def _curve(self, days: list[date]) -> dict[str, Any] | None:
        """Curve figures over the complete curve days of a bucket (None without one)."""
        if not days:
            return None
        points = [p for d in days for p in self.complete[d]]
        return {
            "complete_days": len(days),
            "kwh": _r(sum(p.wh for p in points) / 1000),
            **(power_stats(points, self.inp.tz) or {}),
        }

    def quality(self, a: date, b: date) -> dict[str, Any]:
        tariff = self.inp.tariff
        present = [e for d in _days(a, b) if (e := self.day(d)) is not None]
        gaps = [
            abs(sum(p.wh for p in self.complete[d]) - w) / w * 100
            for d in _days(a, b)
            if d in self.complete and (w := self.inp.daily_wh.get(d))
        ]
        lives = [life[0] for life in self.inp.radiator_life.values()]
        overall = self.shares.overall()
        share = self._share_of(overall, self.inp.today)
        first_price = tariff.prices[0].valid_from if tariff else None
        return {
            "fallback_share": _r(share, 4),
            "fallback_method": overall.method if share is not None else None,
            "estimated_days": sum(e.estimated for e in present),
            "missing_colour_days": sum(e.colour_missing for e in present),
            "retro_scheduled_days": sum(
                1 for e in present if tariff is not None and tariff.retro_scheduled(e.day)
            ),
            "curve_vs_daily_pct": _r(sum(gaps) / len(gaps), 2) if gaps else None,
            "linky_since": self.since.isoformat() if self.since else None,
            "curve_since": self.inp.curve_since.isoformat() if self.inp.curve_since else None,
            "radiators_since": min(lives).isoformat() if lives else None,
            "retro_priced_days": sum(
                1 for e in present if first_price is not None and e.day < first_price
            ),
        }

    def outdoor(self, a: date, b: date) -> dict[str, Any] | None:
        """Spec §6.2: over the elapsed days; the DJU sum only when every one has weather."""
        if not self.inp.weather_on:
            return None
        days = [d for d in _days(a, b) if d < self.inp.today]
        if not days:
            return None
        have = [
            w for d in days if (w := self.inp.outdoor.get(d)) is not None and w.tmean is not None
        ]
        return {
            "mean_c": round(sum(w.tmean for w in have) / len(have), 1) if have else None,
            "min_c": min(w.tmin for w in have) if have else None,
            "max_c": max(w.tmax for w in have) if have else None,
            "dju": round(sum(w.dju for w in have), 1) if have and len(have) == len(days) else None,
            "days": len(have),
            "of": len(days),
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
    factors: dict[date, float | None] = {}

    def factor(month: date) -> float | None:
        if month not in factors:
            factors[month] = None
            if shifted_avg:
                ly = date(month.year - 1, month.month, 1)
                ly_days = [
                    e for d in _days(ly, next_unit(ly, "month")) if (e := en.day(d)) is not None
                ]
                if len(ly_days) >= MIN_MONTH_DAYS:
                    factors[month] = (sum(e.kwh for e in ly_days) / len(ly_days)) / shifted_avg
        return factors[month]

    tariff = inp.tariff
    price = sub_month = None
    if tariff is not None:
        p = tariff.prices_on(inp.today)
        price = _projected_price(trailing, p)
        sub_month = p.subscription_eur_month

    first = unit_start(anchor, "month")
    actual = en.summary(first, anchor + ONE)
    weather = _weather_month(en, inp, first, anchor, actual, price) if inp.weather_on else None
    weather_kwh = weather.pop("_kwh", None) if weather is not None else None
    months: list[dict[str, Any]] = []
    m = first
    for i in range(12):
        dim = days_in_month(m)
        f = factor(m)
        per_day = avg * (f if f is not None else 1.0)
        method = "seasonal" if f is not None else "linear"
        if i == 0 and weather_kwh is not None:
            # Plan 15: measured so far + each missing day predicted from its weather.
            kwh = (actual["kwh"] or 0.0) + weather_kwh
            eur = (
                (actual["energy_eur"] or 0.0)
                + weather_kwh * price
                + sum(
                    subscription_eur(d, tariff.prices_on(d))
                    for d in _days(max(first, en.first or first), next_unit(first, "month"))
                )
                if price is not None and tariff is not None
                else None
            )
            method = "weather"
        elif i == 0:
            # M4: elapsed days without Linky data are estimated at the same rate, not 0 kWh.
            filled = actual["missing_days"]
            remaining = (next_unit(first, "month") - (anchor + ONE)).days
            kwh = (actual["kwh"] or 0.0) + (remaining + filled) * per_day
            eur = (
                (actual["energy_eur"] or 0.0)
                + (remaining + filled) * per_day * price
                + sum(  # m-3: from the contract start (the first counted day) on
                    subscription_eur(d, tariff.prices_on(d))
                    for d in _days(max(first, en.first or first), next_unit(first, "month"))
                )
                if price is not None and tariff is not None
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
                "method": method,
            }
        )
        m = next_unit(m, "month")
    methods = {x["method"] for x in months}
    year_eur = sum(x["eur"] for x in months) if price is not None else None
    # M5: the next 365 days from tomorrow, day by day (first and last months prorated).
    r_from = inp.today + ONE
    first_next_year = minus_years(first, -1)
    r_to = r_from + 365 * ONE
    r_kwh = r_eur = 0.0
    r_methods = set()
    for d in _days(r_from, r_to):
        # I-1: each day's reference month lies in the year before the anchor's month: from
        # the anchor's month next year on, that is the month a year earlier, never the
        # current, partly elapsed one.
        month = d.replace(day=1)
        f = factor(month if month < first_next_year else minus_years(month, 1))
        r_methods.add("seasonal" if f is not None else "linear")
        k = avg * (f if f is not None else 1.0)
        r_kwh += k
        if price is not None and tariff is not None:
            r_eur += k * price + subscription_eur(d, tariff.prices_on(inp.today))
    return {
        "month": {
            **months[0],
            "actual_kwh": actual["kwh"],
            "actual_eur": actual["eur"],
            "actual_energy_eur": actual["energy_eur"],
            "filled_days": actual["missing_days"],
            "weather": weather,
        },
        "year": {
            "from": months[0]["key"],
            "to": months[-1]["key"],
            "kwh": _r(sum(x["kwh"] for x in months)),
            "eur": _r(year_eur, 2),
            "method": methods.pop() if len(methods) == 1 else "mixed",
            "months": months,
        },
        "rolling": {
            "from": r_from.isoformat(),
            "to": r_to.isoformat(),
            "kwh": _r(r_kwh),
            "eur": _r(r_eur, 2) if price is not None else None,
            "per_day_kwh": _r(avg),
            "price_eur_kwh": _r(price, 4),
            "method": r_methods.pop() if len(r_methods) == 1 else "mixed",
        },
    }


def _weather_month(
    en: _Energy,
    inp: ReportInputs,
    first: date,
    anchor: date,
    actual: dict[str, Any],
    price: float | None,
) -> dict[str, Any] | None:
    """Spec 2026-10-18 §5.6 / §8.4: the month's days without Linky data (counted elapsed days, and
    every day after the last Linky day) predicted from the weather: observed, today, forecast,
    normals. `_kwh` (popped by the caller) is the predicted sum when the path holds. None when no
    day of the month is left to predict (a finished month never reads « selon la météo »)."""
    blank: dict[str, Any] = {
        "why": None,
        "observed_days": 0,
        "today": False,
        "forecast_days": 0,
        "normal_days": 0,
        "kwh_lo": None,
        "kwh_hi": None,
        "eur_lo": None,
        "eur_hi": None,
        "spread": None,
    }
    end = next_unit(first, "month")
    need = [
        d
        for d in _days(first, end)
        if d > anchor or (en.first is not None and d >= en.first and en.day(d) is None)
    ]
    if not need:
        return None  # the month is measured whole: nothing to predict, v0.2's figures stand
    mo = inp.month_outlook
    if mo is None or mo.why is not None:
        return {**blank, "why": mo.why if mo is not None else "model_hidden"}
    for d in need:
        if d not in mo.days:
            return {**blank, "why": mo.missing.get(d, "weather_missing")}
    kwh = sum(mo.days[d][0] for d in need)
    lo, hi, spread = mo.interval(need) if mo.interval else (kwh, kwh, "full")
    base = actual["kwh"] or 0.0
    src = [mo.days[d][1] for d in need]
    tariff = inp.tariff
    subs = (
        sum(
            subscription_eur(d, tariff.prices_on(d))
            for d in _days(max(first, en.first or first), end)
        )
        if tariff is not None
        else 0.0
    )

    def eur(total: float) -> float | None:
        if price is None or tariff is None:
            return None
        return _r((actual["energy_eur"] or 0.0) + total * price + subs, 2)

    return {
        "why": None,
        "observed_days": src.count("observed"),
        "today": "today" in src,
        "forecast_days": src.count("forecast"),
        "normal_days": src.count("normal"),
        "kwh_lo": _r(base + lo),
        "kwh_hi": _r(base + hi),
        "eur_lo": eur(lo),
        "eur_hi": eur(hi),
        "spread": spread,
        "_kwh": kwh,
    }


def daily_points(inp: ReportInputs, start: date, end: date) -> dict[date, DayPoint]:
    """Spec 2026-10-18 §4: each day of [start, end) with Linky energy, read as its day bar reads
    it (kWh, the one-day span's energy € from the running sums, the rate parts, whether the split
    was estimated)."""
    en = _Energy(inp)
    out: dict[date, DayPoint] = {}
    for d in _days(start, end):
        e = en.day(d)
        if e is None:
            continue
        energy, _ = en.costs(d, d + ONE)
        tempo = inp.tariff is not None and inp.tariff.option_on(d) == "tempo"
        out[d] = DayPoint(
            d,
            e.kwh,
            energy,
            tuple(e.by_rate) if en.pricing is not None else None,
            e.estimated,
            inp.colours.get(d) if tempo else None,
        )
    return out


def trailing_price(inp: ReportInputs) -> float | None:
    """€/kWh at today's prices from the trailing days' rate mix: the projection's own price."""
    if inp.tariff is None:
        return None
    en = _Energy(inp)
    anchor = en.last or (inp.today - ONE)
    trailing = [e for i in range(TRAILING_DAYS) if (e := en.day(anchor - i * ONE)) is not None]
    if len(trailing) < MIN_TRAILING_DAYS:
        return None
    return _projected_price(trailing, inp.tariff.prices_on(inp.today))


def _reprice(e: DayEnergy, row: PriceRow) -> float | None:
    """€/kWh of a day's rate parts at `row`'s rates (today's prices); None when a key has no
    price."""
    if e.kwh <= 0 or not e.by_rate:
        return None
    total = 0.0
    for key, kwh in e.by_rate:
        rate = row.rate(key)
        if rate is None or key.startswith("unknown_"):
            return None
        total += kwh * rate
    return total / e.kwh


def model_euros(view: dict[str, Any], inp: ReportInputs, price: float | None) -> dict[str, Any]:
    """Spec 2026-10-18 §5.7: every € of « Météo et coût », rounded here once. Per-degree and
    baseload € and the line at `price` (today's prices, trailing mix); forecast days at today's row
    on their own split and colour, allocated to cents so the week adds up."""

    def eur(kwh: float | None) -> float | None:
        return None if kwh is None or price is None else round(kwh * price, 2)

    h = view["house"]
    h["baseload_eur_day"] = eur(h.get("baseload_kwh_day"))
    h["eur_per_c"] = eur(h.get("kwh_per_c"))
    for s in h.get("line", []):
        s["eur"], s["eur_lo"], s["eur_hi"] = eur(s["kwh"]), eur(s["kwh_lo"]), eur(s["kwh_hi"])
    for r in view["rooms"]["items"]:
        r["eur_per_c"] = eur(r.get("kwh_per_c"))
    _forecast_euros(view["forecast"], inp)
    view["price"] = (
        None
        if price is None or inp.tariff is None
        else {"eur_kwh": round(price, 4), "option": inp.tariff.option_on(inp.today)}
    )
    return view


def _forecast_euros(fc: dict[str, Any], inp: ReportInputs) -> None:
    days = [d for d in fc.get("days", []) if d.get("kwh") is not None]
    week = fc.get("week")
    if inp.tariff is None:
        for d in days:
            d["eur_why"] = "no_tariff"
        if week is not None:
            week.update(eur=None, heating_eur=None, priced_days=0)
        return
    en = _Energy(inp)
    row = inp.tariff.prices_on(inp.today)
    exact: list[tuple[dict[str, Any], float, float]] = []
    for d in days:
        day = date.fromisoformat(d["date"])
        e = day_energy(
            day, round(d["kwh"] * 1000), None, en.pricing, inp.tz, en.shares.for_day(day)
        )
        if e is None:
            d["eur_why"] = "price_unknown"
            continue
        d["parts"] = [{"key": k, "kwh": round(v, 3)} for k, v in e.by_rate]
        if inp.tariff.option_on(day) == "tempo":
            d["colour"] = inp.colours.get(day)
        if e.colour_missing:
            d["eur_why"] = "tempo_colour_unknown"
            continue
        per = _reprice(e, row)
        if per is None:
            d["eur_why"] = "price_unknown"
            continue
        d["eur_lo"] = round(d["kwh_lo"] * per, 2)
        d["eur_hi"] = round(d["kwh_hi"] * per, 2)
        exact.append((d, d["kwh"] * per, d["heating_kwh"] * per))
    if exact:
        for i, key in ((1, "eur"), (2, "heating_eur")):
            vals = [x[i] for x in exact]
            for (d, *_), c in zip(exact, _allocate(vals, round(sum(vals) * 100)), strict=True):
                d[key] = c / 100
    if week is not None:
        priced = len(exact)
        whole = priced == len(days) and priced > 0
        week["priced_days"] = priced
        week["eur"] = round(sum(d["eur"] for d, *_ in exact), 2) if whole else None
        week["heating_eur"] = round(sum(d["heating_eur"] for d, *_ in exact), 2) if whole else None


def _weather_row(
    en: _Energy, days: list[date], to: Mapper, row: dict[str, Any] | None
) -> dict[str, Any] | None:
    """Spec §6.3: the change at equal weather beside a raw comparison row; None when off."""
    if row is None or not en.inp.weather_on:
        return None
    outdoor = en.inp.outdoor

    def kwh(d: date) -> float | None:
        e = en.day(d)
        return e.kwh if e is not None else None

    def dju(d: date) -> float | None:
        w = outdoor.get(d)
        return w.dju if w is not None else None

    return normalised_change(days, to, kwh, dju, comparable=row.get("change") is not None)


def _comparison(en: _Energy, group: Group, p_from: date, p_to: date) -> dict[str, Any]:
    """M3/L4: the selected period's elapsed days against the previous period, the same dates
    last year, and the mean of the four previous periods. A period that is not one unit of
    `group` (a custom range) is compared with the runs of as many days just before it (review
    I-2): never with an overlapping range."""
    last = en.last
    days = [d for d in _days(p_from, p_to) if last is not None and d <= last]
    tariff = en.inp.tariff
    unit = p_from == unit_start(p_from, group) and p_to == next_unit(p_from, group)
    length = None if unit else (p_to - p_from).days
    to_prev = mapper(group, 1, length)
    to_last: Mapper = lambda d: minus_years(d, 1)  # noqa: E731
    previous = compare(days, to_prev, en.day, tariff)
    last_year = compare(days, to_last, en.day, tariff)
    for row, to in ((previous, to_prev), (last_year, to_last)):
        if row is not None:
            row["weather"] = _weather_row(en, days, to, row)
    return {
        "basis": "unit" if unit else "days",
        "previous": previous,
        "last_year": last_year,
        "avg4": average_of_four(days, group, en.day, tariff, period_days=length),
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
        period = default_period(en.last, inp.today, group)
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
        "linky_since": en.since.isoformat() if en.since else None,
        "linky": en.last is not None,
        "tariff": inp.tariff is not None,
        "option": inp.tariff.option_on(inp.today) if inp.tariff else None,
        "buckets": buckets,
        "total": en.summary(start, end),
        # The selected period, with its own quality facts (`quality` below is the window's, the
        # bars'; in Jour the window is the 7 days ending on the period's day).
        "period": {**en.period(p_from, p_to), "quality": en.quality(p_from, p_to)},
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
        "comparison": _comparison(en, group, p_from, p_to),
        "boundary_prorated": bool(inp.tariff) and any(m % 30 for m in inp.tariff.edges()),
        "quality": en.quality(start, end),  # the chart window (the Qualité strip's buckets)
        "hc_lens": en.hc_lens(p_from, p_to),
        "tempo_lens": en.tempo_lens(p_from, p_to),
        "by_radiator": en.by_radiator(p_from, p_to),
        "projection": _projection(en, anchor)
        if en.last and (inp.today - en.last).days <= STALE_DAYS
        else None,
    }
