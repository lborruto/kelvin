"""Linky inside the runtime (spec §3.5, §3.6): sync, tariff, the Énergie report, the curve.

The token is a secret and the PDL is personal data: neither is ever logged.
"""

from __future__ import annotations

import copy
import logging
import time
from collections.abc import Callable
from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from kelvin.billing.compare import minus_years
from kelvin.billing.costs import curve_complete, day_energy
from kelvin.billing.day_detail import day_detail
from kelvin.billing.pricing import Pricing
from kelvin.billing.radiators import RadiatorDay
from kelvin.billing.report import (
    Group,
    ReportInputs,
    build_report,
    daily_points,
    default_period,
    last_linky_day,
    model_euros,
    trailing_price,
    unit_start,
)
from kelvin.billing.room_energy import room_energy
from kelvin.billing.slots import Slot
from kelvin.billing.split import FallbackShares
from kelvin.billing.tariff import Prices, Tariff, TariffStore
from kelvin.linky.models import (
    Contract,
    LinkyAuthError,
    LinkyError,
    LinkySource,
    day_bounds,
    local_day,
)
from kelvin.linky.radiator_cache import RadiatorDayCache
from kelvin.linky.store import LinkyStore
from kelvin.linky.sync import DAILY_BACKFILL_DAYS, DAILY_BUDGET, BudgetExceeded, LinkySync
from kelvin.recorder.db import Database
from kelvin.recorder.energy import local_edges
from kelvin.recorder.recorder import Recorder
from kelvin.weather.costmodel import (
    FORECAST_DAYS,
    WINDOW_DAYS,
    Core,
    ModelInputs,
    MonthOutlook,
    build,
    period_view,
)
from kelvin.weather.dju import day_weather, forecast_days
from kelvin.weather.models import DayWeather, Hour
from kelvin.weather.normalise import FIT_MARGIN_DAYS

log = logging.getLogger(__name__)

SourceFactory = Callable[[str, str], LinkySource]


def radiator_ranges(
    window: tuple[date, date], period: tuple[date, date]
) -> list[tuple[date, date]]:
    """The days whose radiator half-hours a report loads: the window and the period, each from
    1 January of its first year (the radiators' € are running sums anchored there, so a bucket
    reads the same in any window), one range when they overlap or touch, else each on its own
    (the years between two far ranges are never bucketed). At most 365 days more per range."""
    ranges = sorted((date(a.year, 1, 1), b) for a, b in (window, period))
    if ranges[1][0] <= ranges[0][1]:
        return [(ranges[0][0], max(ranges[0][1], ranges[1][1]))]
    return ranges


LOOKBACK_DAYS = 400  # last year's period, the 30 trailing days and the ±15-day HC share
AVG4_YEARS = 4  # the comparison with the mean of the four previous periods, by year
# Simulator only: demo values so Énergie shows euros out of the box. Never a real installation.
DEMO_TARIFF = Tariff(
    "hchp", 9, (Slot("22:00", "06:00"),), (Prices(date(2000, 1, 1), 15.0, 0.20, 0.27),)
)


class LinkyService:
    def __init__(
        self,
        db: Database,
        *,
        tz: str = "Europe/Paris",
        make_source: SourceFactory,
        credentials: tuple[str, str] | None,
        simulator: bool = False,
        wall: Callable[[], float] = time.time,
        budget: int = DAILY_BUDGET,
    ) -> None:
        self.tz = ZoneInfo(tz)
        self.wall = wall
        self.store = LinkyStore(db, tz)
        self.tariffs = TariffStore(db)
        # Tempo colour per Tempo day for [start, end): the grid store's, set by the runtime.
        self.colours: Callable[[date, date], dict[date, str]] = lambda start, end: {}
        # Plan 14: complete weather days and whether a place is set (WeatherService, runtime).
        self.outdoor: Callable[[date, date], dict[date, DayWeather]] = lambda start, end: {}
        self.weather_on: Callable[[], bool] = lambda: False
        # Plan 15 (runtime): forecast and outlook hours, absence days and the stores' signatures.
        self.forecast_hours: Callable[[int, int], list[Any]] = lambda a, b: []
        self.outlook_hours: Callable[[int, int], list[Hour]] = lambda a, b: []
        self.away_days: Callable[[date, date], set[date]] = lambda a, b: set()
        self.weather_signature: Callable[[], tuple] = tuple
        self.away_signature: Callable[[], tuple] = tuple
        self._core_memo: tuple[tuple, Core, MonthOutlook | None] | None = None
        self.make_source = make_source
        self.simulator = simulator
        self.prm = credentials[0] if credentials else None
        source = make_source(*credentials) if credentials else None
        self.sync = LinkySync(self.store, db, source, tz=tz, wall=wall, budget=budget)
        self.radiator_days = RadiatorDayCache(self.tz)
        if credentials:
            self.sync.use_token(credentials[1])
        self.sync.on_contract = self._on_contract

    def _on_contract(self, contract: Contract) -> None:
        """The monthly re-read: keep it for `hc_changed`, refresh the form's prefill and the
        contract start. Nothing is applied to the tariff (spec §2.2)."""
        self.tariffs.set_contract_last(contract, self.wall())
        self.tariffs.set_prefill(contract)
        if contract.activation_date:
            self.sync.set_not_before(contract.activation_date)

    def _contract_read(self, contract: Contract) -> None:
        """A configure or prefill read counts as this month's re-read."""
        self.tariffs.set_contract_last(contract, self.wall())
        self.sync.mark_contract_read(self.today())

    def spend_grid(self) -> bool:
        """One grid call (Tempo, EcoWatt, Tempo prices) from the shared MED ledger."""
        return self.sync.spend(kind="grid")

    def today(self) -> date:
        return datetime.fromtimestamp(self.wall(), self.tz).date()

    def not_before(self) -> date | None:
        nb = self.sync.state.not_before
        return date.fromisoformat(nb) if nb else None

    def first_day(self) -> date | None:
        """The first day the report counts: the contract start, but never before the daily
        backfill window (Kelvin never fetches older days, so they are not missing). Unknown
        contract start: None, and the report starts at the earliest data. Days Kelvin did
        store before the backfill window (it has run for over a year) are data: the window
        never hides them, or last year's comparison would never find a day."""
        nb = self.not_before()
        if nb is None:
            return None
        window = self.today() - timedelta(days=DAILY_BACKFILL_DAYS)
        stored = self.store.first_day()
        return max(nb, min(window, stored) if stored is not None else window)

    async def configure(self, prm: str, token: str) -> None:
        """Test a PDL/token (1 call), read the contract to prefill the tariff (1 call), then wake
        the sync. Both calls count in the daily budget."""
        if not self.sync.spend():
            raise BudgetExceeded("daily budget spent")
        source = self.make_source(prm, token)
        try:
            access = await source.check()
            if access.banned or not access.valid:
                raise LinkyAuthError("access not valid")
            contract = None
            if self.sync.spend():
                try:
                    contract = await source.fetch_contract()
                except LinkyAuthError:
                    raise
                except LinkyError as e:  # the type only: a message could quote the PDL
                    log.warning("linky contract fetch failed: %s", type(e).__name__)
        except BaseException:
            await source.aclose()
            raise
        old = self.sync.source
        if prm != self.prm:  # another PDL: nothing of the previous one may mix with it
            self.store.clear()
            self.sync.forget()
            self.tariffs.clear_prefill()
        if contract is not None:
            self.tariffs.set_prefill(contract)
            self._contract_read(contract)
        self.prm = prm
        self.sync.use_token(token)
        self.sync.set_source(  # wakes the sync loop: no inline run
            source,
            not_before=contract.activation_date if contract else None,
            consent_expires=access.consent_expires,
        )
        if old is not None and old is not source:
            await old.aclose()

    async def ensure_prefill(self) -> None:
        """Read the contract once (1 budgeted call) when no prefill is stored yet."""
        source = self.sync.source
        if source is None or self.tariffs.prefill() is not None or not self.sync.spend():
            return
        try:
            contract = await source.fetch_contract()
        except LinkyError as e:
            log.warning("linky contract fetch failed: %s", type(e).__name__)
            return
        self.tariffs.set_prefill(contract)
        self._contract_read(contract)
        if contract.activation_date:
            self.sync.set_not_before(contract.activation_date)

    def seed_demo_tariff(self) -> None:
        if not self.tariffs.stored():  # never over a stored document, even an invalid one
            self.tariffs.save(DEMO_TARIFF)

    async def run(self) -> None:
        try:
            await self.ensure_prefill()
        except Exception as e:
            log.error("linky prefill failed: %s", type(e).__name__)
        await self.sync.run()

    async def close(self) -> None:
        if self.sync.source is not None:
            await self.sync.source.aclose()

    def status(self) -> dict[str, Any]:
        configured = self.sync.source is not None
        return {
            **self.sync.status(),
            "configured": configured,
            "prm": self.prm,
            "token_set": configured,
            "simulator": self.simulator,
        }

    def settings_view(self) -> dict[str, Any]:
        tariff = self.tariffs.get()
        return {"tariff": tariff.view() if tariff else None, "prefill": self.tariffs.prefill()}

    def report(
        self,
        start: date,
        end: date,
        group: Group,
        recorder: Recorder,
        rooms: dict[str, str],
        period: tuple[date, date] | None = None,
    ) -> dict[str, Any]:
        """`rooms`: the radiators in the house now → their room. Every radiator ever recorded
        is reported (L8); those no longer in the house exist up to their last reading."""
        inputs, period = self._inputs(start, end, group, recorder, rooms, period)
        if inputs.weather_on:  # Plan 15: the month end's weather path (§5.6)
            inputs.month_outlook = self._core(recorder, rooms)[1]
        return build_report(start, end, group, inputs, period)

    def _inputs(
        self,
        start: date,
        end: date,
        group: Group,
        recorder: Recorder,
        rooms: dict[str, str],
        period: tuple[date, date] | None,
    ) -> tuple[ReportInputs, tuple[date, date]]:
        """The report's inputs over the window and the period, and the resolved period."""
        today = self.today()
        tariff = self.tariffs.get()
        # Linky rows are loaded for the window, the period and what the comparisons, the
        # projection and the fallback HC share look back at: bounded, never the whole store.
        # A default period is the unit holding the last Linky day, so with daily rows it
        # starts at or after the unit of the last daily day (a store with only an old curve is
        # the exception: its period reads null).
        anchor = self.store.last_day() or today
        p_lo, p_hi = period or (unit_start(anchor, group), anchor)
        load_lo = min(start, p_lo, anchor) - timedelta(days=LOOKBACK_DAYS)
        load_hi = max(end, p_hi, today + timedelta(days=1))
        # The year view's mean of the four previous years reaches four years back (kWh only:
        # daily rows; their curves are not needed).
        daily_lo = min(load_lo, minus_years(min(start, p_lo), AVG4_YEARS))
        weather_on = self.weather_on()
        # Spec §6.3: the weather fit reaches 45 days before last year's reference (daily rows only).
        fit_lo = load_lo - timedelta(days=FIT_MARGIN_DAYS + 1) if weather_on else load_lo
        rows_lo = min(daily_lo, fit_lo) if group == "year" else fit_lo
        daily = self.store.daily(rows_lo, load_hi)
        outdoor = self.outdoor(rows_lo, load_hi) if weather_on else {}
        curve = self.store.curve(load_lo, load_hi)
        colours = self.colours(load_lo, load_hi)  # Tempo colour per Tempo day
        if period is None:  # the same rule and data as the report's own default
            period = default_period(last_linky_day(daily, curve, self.tz), today, group)
        # Radiator half-hours over the window and the period: one range when they overlap or
        # touch, else each on its own, so the years between two far ranges are never bucketed
        # (each range is bounded, their union is not). A day's figure does not depend on the
        # range asked (window-consistent buckets), so the merge is exact.
        # The complete radiator-days come from the cache (they can no longer change), so only the
        # days since each counter last moved are replayed (final review I-4).
        ranges = radiator_ranges((start, end), period)
        extent = recorder.energy_extent()
        radiators: dict[str, dict[date, RadiatorDay]] = self.radiator_days.days(
            recorder, ranges, tariff, {rid: a for rid, (a, _) in extent.items()}, colours=colours
        )
        life = {
            rid: (local_day(a, self.tz), None if rid in rooms else local_day(b, self.tz))
            for rid, (a, b) in extent.items()
        }
        # Room stats over the period's elapsed days, up to the end of yesterday: the same days
        # as the radiator kWh and € beside them (never today, which is still running).
        stats_end = min(day_bounds(period[1], self.tz)[0], day_bounds(today, self.tz)[0])
        stats = recorder.sample_stats(
            sorted(radiators), day_bounds(period[0], self.tz)[0], stats_end
        )
        first_day = self.first_day()
        inputs = ReportInputs(
            daily_wh=daily,
            curve=curve,
            tariff=tariff,
            tz=self.tz,
            today=today,
            first_day=first_day,
            radiators=radiators,
            radiator_life=life,
            rooms=rooms,
            sample_stats=stats,
            linky_since=self.store.first_day(first_day),
            curve_since=self.store.first_curve_day(),
            colours=colours,
            outdoor=outdoor,
            weather_on=weather_on,
        )
        return inputs, period

    def _core(self, recorder: Recorder, rooms: dict[str, str]) -> tuple[Core, MonthOutlook | None]:
        """Spec 2026-10-18 §5: the period-independent model, memoised (decision 10): rebuilt at
        most hourly, or when the energy, the weather, the tariff, the absences or the rooms
        change."""
        today = self.today()
        tariff = self.tariffs.get()
        key = (
            today,
            int(self.wall() // 3600),
            recorder.energy_epoch,
            self.store.signature(),
            self.weather_signature(),
            repr(tariff),
            self.away_signature(),
            tuple(sorted(rooms.items())),
        )
        if self._core_memo is not None and self._core_memo[0] == key:
            return self._core_memo[1], self._core_memo[2]
        w_from = today - timedelta(days=WINDOW_DAYS)
        inp, _ = self._inputs(
            w_from, today + timedelta(days=1), "day", recorder, rooms, (w_from, today)
        )
        # Forecast days are priced with tomorrow's and later colours when published.
        inp.colours.update(self.colours(today, today + timedelta(days=FORECAST_DAYS + 2)))
        on = self.weather_on()
        a0 = day_bounds(today, self.tz)[0]
        b7 = day_bounds(today + timedelta(days=FORECAST_DAYS), self.tz)[1]
        stored = self.forecast_hours(a0, b7) if on else []
        hours = [Hour(h.ts, h.t, h.apparent, h.rh, h.model) for h in stored]
        outlook = self.outlook_hours(a0, b7) if on else []
        rooms_of: dict[str, list[str]] = {}
        for rid, room in rooms.items():
            rooms_of.setdefault(room, []).append(rid)
        mi = ModelInputs(
            today=today,
            period=(today.replace(day=1), today + timedelta(days=1)),
            weather_on=on,
            linky=self.store.last_day() is not None,
            points=daily_points(inp, w_from, today) if on else {},
            weather=self.outdoor(today - timedelta(days=5 * 366 + 4), today) if on else {},
            away=self.away_days(w_from, today) if on else set(),
            rooms={k: sorted(v) for k, v in rooms_of.items()},
            radiators=inp.radiators,
            life=inp.radiator_life,
            forecast=forecast_days(hours, outlook, self.tz, today, FORECAST_DAYS) if on else [],
            today_weather=day_weather(today, hours, outlook, self.tz) if on else None,
            fetched_at=max((h.fetched_at for h in stored), default=None),
        )
        core, month = build(mi)
        model_euros(core.view, inp, trailing_price(inp))
        core.view["computed_at"] = int(self.wall())
        self._core_memo = (key, core, month)
        return core, month

    def weather_model(
        self, recorder: Recorder, rooms: dict[str, str], period: tuple[date, date] | None
    ) -> dict[str, Any]:
        """`GET /api/energy/weather` (spec 2026-10-18 §8.1)."""
        today = self.today()
        core, _ = self._core(recorder, rooms)
        return period_view(core, period or (today.replace(day=1), today + timedelta(days=1)), today)

    def weather_forecast(self, recorder: Recorder, rooms: dict[str, str]) -> dict[str, Any]:
        """`GET /api/energy/weather/forecast` (spec §8.2): the house without its points."""
        core, _ = self._core(recorder, rooms)
        v = core.view
        house = {k: x for k, x in v["house"].items() if k not in ("line", "points", "period_share")}
        return copy.deepcopy(
            {
                "computed_at": v["computed_at"],
                "level": v["level"],
                "price": v["price"],
                "house": house,
                "forecast": v["forecast"],
            }
        )

    def room_weather(
        self, room_id: str, recorder: Recorder, rooms: dict[str, str]
    ) -> dict[str, Any] | None:
        """The `weather` key of `GET /api/rooms/{id}/energy` (spec §8.3); None without a place."""
        if not self.weather_on():
            return None
        core, _ = self._core(recorder, rooms)
        r = core.view["rooms"]
        item = next((i for i in r["items"] if i["room_id"] == room_id), None)
        if item is None:
            item = {
                "room_id": room_id,
                "state": "hidden",
                "why": "no_radiator",
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
        return copy.deepcopy(
            {
                **item,
                "balance_point_c": r["balance_point_c"],
                "balance_point_source": r["balance_point_source"],
            }
        )

    def room_energy(
        self, ids: list[str], days: int, recorder: Recorder, in_house: set[str]
    ) -> dict[str, Any]:
        """`GET /api/rooms/{id}/energy` (spec QW3): the room's radiators over the last `days`
        local days, today included, from the report's RadiatorDay figures (the radiator cache)
        and its € rule (`billing/room_energy.py`). Linky is not involved. Every recorded
        radiator is gathered, as the report does: a day's cents are the house's, shared."""
        today = self.today()
        tariff = self.tariffs.get()
        first = today - timedelta(days=days - 1)
        extent = recorder.energy_extent()
        # From 1 January of the window's first year: the € running sums are anchored there.
        lo, hi = date(first.year, 1, 1), today + timedelta(days=1)
        # Each half-hour is priced by `Pricing`: the day before holds the first Tempo day's night.
        colours = self.colours(lo - timedelta(days=1), hi)
        per = self.radiator_days.days(
            recorder,
            [(lo, hi)],
            tariff,
            {rid: a for rid, (a, _) in extent.items()},
            colours=colours,
        )
        life = {
            rid: (local_day(a, self.tz), None if rid in in_house else local_day(b, self.tz))
            for rid, (a, b) in extent.items()
        }
        stats = recorder.sample_stats(ids, day_bounds(first, self.tz)[0], int(self.wall()))
        hours = {rid: stats.get(rid, {}).get("heating_hours") for rid in ids}
        return room_energy(per, life, ids, days, today, hours, priced=tariff is not None)

    def day_detail(self, day: date, recorder: Recorder, rooms: dict[str, str]) -> dict[str, Any]:
        """`GET /api/energy/day` without the room block (the route adds it). A day without a
        complete curve splits by the fallback the report uses for that day alone (`report(day,
        day + 1, "day")`): the same complete curve days, so the day has one HC/HP figure."""
        nxt = day + timedelta(days=1)
        today = self.today()
        tariff = self.tariffs.get()
        colours = self.colours(day - timedelta(days=1), nxt)  # the day before holds 00:00–06:00
        oldest = self.store.first_curve_day() or self.not_before() or today
        # The report's look-back for that window (see `report`).
        anchor = self.store.last_day() or today
        lo = min(day, anchor) - timedelta(days=LOOKBACK_DAYS)
        hi = max(nxt, today + timedelta(days=1))
        # One bounded read: the fallback's look-back and the days the picker offers.
        curves = self.store.curve(min(lo, oldest), hi)
        full = {d: p for d, p in curves.items() if curve_complete(d, p, self.tz)}
        # m-6: the report counts no day before its first day (it reads « — »): neither does
        # the day view, so a day has one figure. Its Linky data (another contract's) is left out.
        first = self.first_day()
        counted = first is None or day >= first
        points = curves.get(day, []) if counted else []
        complete = counted and day in full
        energy = None
        daily = self.store.daily(day, nxt).get(day) if counted else None
        if daily is not None or complete:
            pricing = Pricing(tariff, self.tz, colours) if tariff else None
            # The same pool as the report's for that window (`lo`/`hi`): one figure per day.
            pool = FallbackShares({d: p for d, p in full.items() if lo <= d < hi}, self.tz)
            energy = day_energy(day, daily, points, pricing, self.tz, pool.for_day(day))
        edges = local_edges(day, nxt, "halfhour", self.tz)
        radiators = recorder.energy_buckets(edges, recorder.energy_radiator_ids())
        # As in `report`: a radiator still in the house exists from its first reading on, one
        # no longer in it up to its last.
        life = {
            rid: (a, None if rid in rooms else b)
            for rid, (a, b) in recorder.energy_extent().items()
        }
        return {
            **day_detail(
                day,
                points,
                energy,
                tariff,
                self.tz,
                radiators,
                edges,
                rooms,
                complete,
                life=life,
                colours=colours,
            ),
            "available": [
                d.isoformat()
                for d in sorted(full)
                if oldest <= d < today and (first is None or d >= first)
            ],
            "counted_from": first.isoformat() if first else None,
            "not_counted": None if counted else "before_first_day",
        }

    def curve_day(self, day: date) -> dict[str, Any]:
        """`GET /api/linky/curve` (v1 alias): points with their off-peak share (0.0 when nothing
        splits, as in v1) and the day's HC/HP from the curve."""
        points = self.store.curve(day, day + timedelta(days=1)).get(day, [])
        tariff = self.tariffs.get()
        pricing = (
            Pricing(tariff, self.tz, self.colours(day - timedelta(days=1), day + timedelta(days=1)))
            if tariff
            else None
        )
        fs = [pricing.offpeak(p.ts, p.minutes * 60) if pricing else None for p in points]
        hc = hp = None
        if points and all(f is not None for f in fs):
            hc = round(sum(p.wh * f for p, f in zip(points, fs, strict=True)) / 1000, 3)  # type: ignore[operator]
            hp = round(sum(p.wh * (1 - f) for p, f in zip(points, fs, strict=True)) / 1000, 3)  # type: ignore[operator]
        today = self.today()
        oldest = self.store.first_curve_day() or self.not_before() or today
        available = sorted(self.store.complete_curve_days(oldest, today))
        return {
            "date": day.isoformat(),
            "points": [
                {
                    "ts": p.ts,
                    "minutes": p.minutes,
                    "wh": p.wh,
                    "offpeak": round(f, 4) if f is not None else 0.0,
                }
                for p, f in zip(points, fs, strict=True)
            ],
            "kwh": round(sum(p.wh for p in points) / 1000, 3) if points else None,
            "hc_kwh": hc,
            "hp_kwh": hp,
            "complete": curve_complete(day, points, self.tz),
            "available": [d.isoformat() for d in available],
        }
