"""Linky inside the runtime (spec §3.5, §3.6): sync, tariff, the Énergie report, the curve.

The token is a secret and the PDL is personal data: neither is ever logged.
"""

from __future__ import annotations

import logging
import time
from collections.abc import Callable
from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from kelvin.billing.compare import minus_years
from kelvin.billing.costs import curve_complete, day_energy
from kelvin.billing.day_detail import day_detail
from kelvin.billing.radiators import RadiatorDay
from kelvin.billing.report import (
    Group,
    ReportInputs,
    build_report,
    default_period,
    last_linky_day,
    unit_start,
)
from kelvin.billing.slots import Slot, offpeak_fraction, split_curve
from kelvin.billing.split import FallbackShares, Share
from kelvin.billing.tariff import Prices, Tariff, TariffStore
from kelvin.linky.models import LinkyAuthError, LinkyError, LinkySource, day_bounds, local_day
from kelvin.linky.radiator_cache import RadiatorDayCache
from kelvin.linky.store import LinkyStore
from kelvin.linky.sync import DAILY_BACKFILL_DAYS, DAILY_BUDGET, BudgetExceeded, LinkySync
from kelvin.recorder.db import Database
from kelvin.recorder.energy import local_edges
from kelvin.recorder.recorder import Recorder

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
        self.make_source = make_source
        self.simulator = simulator
        self.prm = credentials[0] if credentials else None
        source = make_source(*credentials) if credentials else None
        self.sync = LinkySync(self.store, db, source, tz=tz, wall=wall, budget=budget)
        self.radiator_days = RadiatorDayCache(self.tz)
        if credentials:
            self.sync.use_token(credentials[1])

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
        if contract.activation_date:
            self.sync.set_not_before(contract.activation_date)

    def seed_demo_tariff(self) -> None:
        if self.tariffs.get() is None:
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
        daily = self.store.daily(daily_lo if group == "year" else load_lo, load_hi)
        curve = self.store.curve(load_lo, load_hi)
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
            recorder, ranges, tariff, {rid: a for rid, (a, _) in extent.items()}
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
        )
        return build_report(start, end, group, inputs, period)

    def day_detail(self, day: date, recorder: Recorder, rooms: dict[str, str]) -> dict[str, Any]:
        """`GET /api/energy/day` without the room block (the route adds it). A day without a
        complete curve splits by the fallback the report uses for that day alone (`report(day,
        day + 1, "day")`): the same complete curve days, so the day has one HC/HP figure."""
        nxt = day + timedelta(days=1)
        today = self.today()
        tariff = self.tariffs.get()
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
            ranges = tariff.ranges() if tariff else None
            shares = (
                FallbackShares({d: p for d, p in full.items() if lo <= d < hi}, ranges, self.tz)
                if ranges
                else None
            )
            energy = day_energy(
                day,
                daily,
                points,
                ranges,
                self.tz,
                shares.for_day(day) if shares else Share(0.0, "slots"),
            )
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
        points = self.store.curve(day, day + timedelta(days=1)).get(day, [])
        tariff = self.tariffs.get()
        ranges = tariff.ranges() if tariff else None
        hc = hp = None
        if ranges and points:
            hc_wh, hp_wh = split_curve(points, ranges, self.tz)
            hc, hp = round(hc_wh / 1000, 3), round(hp_wh / 1000, 3)
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
                    "offpeak": round(offpeak_fraction(p, ranges, self.tz), 4) if ranges else 0.0,
                }
                for p in points
            ],
            "kwh": round(sum(p.wh for p in points) / 1000, 3) if points else None,
            "hc_kwh": hc,
            "hp_kwh": hp,
            "complete": curve_complete(day, points, self.tz),
            "available": [d.isoformat() for d in available],
        }
