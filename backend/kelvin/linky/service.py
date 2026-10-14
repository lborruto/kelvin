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

from kelvin.billing.costs import curve_complete
from kelvin.billing.radiators import radiator_days
from kelvin.billing.report import Group, ReportInputs, build_report, next_unit, unit_start
from kelvin.billing.slots import Slot, offpeak_fraction, split_curve
from kelvin.billing.tariff import Prices, Tariff, TariffStore
from kelvin.linky.models import LinkyAuthError, LinkyError, LinkySource, day_bounds, local_day
from kelvin.linky.store import LinkyStore
from kelvin.linky.sync import DAILY_BACKFILL_DAYS, DAILY_BUDGET, BudgetExceeded, LinkySync
from kelvin.recorder.db import Database
from kelvin.recorder.energy import local_edges
from kelvin.recorder.recorder import Recorder

log = logging.getLogger(__name__)

SourceFactory = Callable[[str, str], LinkySource]
LOOKBACK_DAYS = 400  # last year's period, the 30 trailing days and the ±15-day HC share
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
        contract start: None, and the report starts at the earliest data."""
        nb = self.not_before()
        if nb is None:
            return None
        return max(nb, self.today() - timedelta(days=DAILY_BACKFILL_DAYS))

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
        if period is None:
            last = self.store.last_day() or self.today() - timedelta(days=1)
            first = unit_start(last, group)
            period = (first, next_unit(first, group))
        tariff = self.tariffs.get()
        lo, hi = min(start, period[0]), max(end, period[1])
        # Linky rows are loaded for the window, the period and what the comparisons, the
        # projection and the fallback HC share look back at: bounded, never the whole store.
        anchor = self.store.last_day() or self.today()
        load_lo = min(lo, anchor) - timedelta(days=LOOKBACK_DAYS)
        load_hi = max(hi, self.today() + timedelta(days=1))
        edges = local_edges(lo, hi, "halfhour", self.tz)
        halfhours = recorder.energy_buckets(edges, recorder.energy_radiator_ids())
        radiators = {
            rid: radiator_days(row, edges, tariff, self.tz) for rid, row in halfhours.items()
        }
        life = {
            rid: (local_day(a, self.tz), None if rid in rooms else local_day(b, self.tz))
            for rid, (a, b) in recorder.energy_extent().items()
        }
        stats = recorder.sample_stats(
            sorted(radiators), day_bounds(period[0], self.tz)[0], day_bounds(period[1], self.tz)[0]
        )
        inputs = ReportInputs(
            daily_wh=self.store.daily(load_lo, load_hi),
            curve=self.store.curve(load_lo, load_hi),
            tariff=tariff,
            tz=self.tz,
            today=self.today(),
            first_day=self.first_day(),
            radiators=radiators,
            radiator_life=life,
            rooms=rooms,
            sample_stats=stats,
            linky_since=self.store.first_day(),
            curve_since=self.store.first_curve_day(),
        )
        return build_report(start, end, group, inputs, period)

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
