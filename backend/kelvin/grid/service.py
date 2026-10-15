"""The grid signals inside Kelvin (spec §2.3, §5.1 QW1, §9.2): when to call, what to keep, what
to show. Every call is one MED call from the shared ledger (`spend`); a job that finds nothing
missing makes none.

- EcoWatt for everyone (ruling 1): 07:15 and 17:15, today and the next three days.
- Tempo only when the tariff has a Tempo price row: 06:30 if today's colour is missing, 11:15
  and 13:15 while tomorrow's is (RTE publishes around 10:30–11:00). The same call carries the
  Tempo history the tariff needs (from the first Tempo row, at most 366 days back).
"""

from __future__ import annotations

import asyncio
import time
from collections.abc import Callable
from datetime import date, datetime, timedelta
from datetime import time as dtime
from typing import Any
from zoneinfo import ZoneInfo

from kelvin.billing.tariff import Tariff
from kelvin.grid.models import BudgetSpent, GridSource
from kelvin.grid.store import GridStore
from kelvin.recorder.db import Database
from kelvin.scheduler import Job

TEMPO_TIMES = (dtime(6, 30), dtime(11, 15), dtime(13, 15))
ECOWATT_TIMES = (dtime(7, 15), dtime(17, 15))
TEMPO_PUBLISH = dtime(11, 0)
TEMPO_HISTORY_DAYS = 366
ECOWATT_DAYS = 4
ECOWATT_KEEP_DAYS = 30
PRICES_KEY = "tempo_price_prefill"
PRICES_TTL_S = 7 * 86400
SOURCE = "MyElectricalData"
# EcoWatt hours are served once their dating is verified (Task 15: dated by their own timestamps).
ECOWATT_HOURS_VERIFIED = True


def hour_runs(hours: tuple[int | None, ...]) -> list[dict[str, Any]]:
    """Consecutive hours at level 2 or 3 as {start, end, level}: 18 and 19 at 2 → 18:00–20:00."""
    runs: list[dict[str, Any]] = []
    for h, level in enumerate(hours):
        if level is None or level < 2:
            continue
        if runs and runs[-1]["level"] == level and runs[-1]["_end"] == h:
            runs[-1]["_end"] = h + 1
        else:
            runs.append({"_start": h, "_end": h + 1, "level": level})
    return [
        {
            "start": f"{r['_start']:02d}:00",
            "end": f"{r['_end'] % 24:02d}:00" if r["_end"] < 24 else "24:00",
            "level": r["level"],
        }
        for r in runs
    ]


def _noop() -> None:
    return None


class GridService:
    def __init__(
        self,
        store: GridStore,
        source: GridSource,
        *,
        spend: Callable[[], bool],
        tariff: Callable[[], Tariff | None],
        db: Database,
        tz: str | ZoneInfo = "Europe/Paris",
        wall: Callable[[], float] = time.time,
        on_change: Callable[[], None] = _noop,
    ) -> None:
        self.store = store
        self.source = source
        self.spend = spend
        self.tariff = tariff
        self.db = db
        self.tz = tz if isinstance(tz, ZoneInfo) else ZoneInfo(tz)
        self.wall = wall
        self.on_change = on_change
        self._prices_call: asyncio.Future[dict[str, Any]] | None = None

    def _now(self) -> datetime:
        return datetime.fromtimestamp(self.wall(), self.tz)

    def tempo_needed(self) -> bool:
        """A Tempo price row is in force today or dated ahead: after a later HC/HP or Base row
        nobody prices a day with a colour."""
        t = self.tariff()
        if t is None:
            return False
        today = self._now().date()
        return t.option_on(today) == "tempo" or any(
            p.option == "tempo" and p.valid_from > today for p in t.prices
        )

    def tempo_window(self, now: float | None = None) -> tuple[date, date] | None:
        """[from, to) for a Tempo call: the oldest Tempo-priced day without a colour (never more
        than 366 days back) to tomorrow; None when nothing is missing (tomorrow counts as missing
        only from 11:00)."""
        t = self.tariff()
        if t is None or not self.tempo_needed():
            return None
        local = datetime.fromtimestamp(now if now is not None else self.wall(), self.tz)
        today = local.date()
        first = min(p.valid_from for p in t.prices if p.option == "tempo")
        # The half-hours before 06:00 on the first Tempo day are priced by the previous day's
        # colour (the Tempo day starts at 06:00).
        lo = max(first - timedelta(days=1), today - timedelta(days=TEMPO_HISTORY_DAYS))
        expect_tomorrow = local.time() >= TEMPO_PUBLISH
        hi = today + timedelta(days=2 if expect_tomorrow else 1)
        if lo >= hi:
            return None
        missing = self.store.tempo_missing(lo, hi)
        if not missing:
            return None
        return min(missing), today + timedelta(days=2)

    async def tempo_job(self) -> None:
        window = self.tempo_window()
        if window is None:
            return
        if not self.spend():
            raise BudgetSpent("budget")
        colours = await self.source.tempo(*window)
        self.store.upsert_tempo(colours, self.wall())
        if colours:
            self.on_change()

    async def ecowatt_job(self) -> None:
        if not self.spend():
            raise BudgetSpent("budget")
        today = self._now().date()
        # Key D carries the hours of D+1: today's hours sit under yesterday's key.
        yesterday = today - timedelta(days=1)
        days = await self.source.ecowatt(yesterday, today + timedelta(days=ECOWATT_DAYS))
        self.store.upsert_ecowatt(days, self.wall())
        self.store.prune_ecowatt(today - timedelta(days=ECOWATT_KEEP_DAYS))
        self.on_change()

    def jobs(self) -> list[Job]:
        return [
            Job("tempo", TEMPO_TIMES, self.tempo_job, self.tempo_needed),
            Job("ecowatt", ECOWATT_TIMES, self.ecowatt_job),
        ]

    def planned_today(self) -> int:
        """Grid calls still planned today: the ledger keeps them free from Linky's backfill.
        EcoWatt: the slots still to come, plus one when a slot already passed without a fetch
        since (it runs at start). Tempo: one when something is missing now, plus the 11:15 and
        13:15 slots still to come while tomorrow's colour is unknown."""
        local = self._now()
        now_t = local.time()
        today = local.date()
        last = self.store.fetched_at("ecowatt_days", today)
        past = [t for t in ECOWATT_TIMES if t <= now_t]
        missed = bool(past) and (
            last is None or last < datetime.combine(today, past[-1], tzinfo=self.tz).timestamp()
        )
        n = sum(1 for t in ECOWATT_TIMES if t > now_t) + int(missed)
        if self.tempo_needed():
            n += int(self.tempo_window() is not None)
            tomorrow = today + timedelta(days=1)
            if tomorrow not in self.store.tempo_colours(tomorrow, tomorrow + timedelta(days=1)):
                n += sum(1 for t in TEMPO_TIMES[1:] if t > now_t)
        return n

    def view(self) -> dict[str, Any]:
        """The strip's data (spec §5.1 QW1). Tempo only when today's price row is Tempo."""
        local = self._now()
        today = local.date()
        tomorrow = today + timedelta(days=1)
        t = self.tariff()
        tempo = None
        if t is not None and t.option_on(today) == "tempo":
            colours = self.store.tempo_colours(today, today + timedelta(days=2))
            fetched = [
                f
                for d in (today, tomorrow)
                if (f := self.store.fetched_at("tempo_days", d)) is not None
            ]
            tempo = {
                "today": {"date": today.isoformat(), "colour": colours.get(today)},
                "tomorrow": {
                    "date": tomorrow.isoformat(),
                    "colour": colours.get(tomorrow),
                    "expected_at": None if tomorrow in colours else TEMPO_PUBLISH.strftime("%H:%M"),
                },
                "fetched_at": max(fetched) if fetched else None,
            }
        eco = self.store.ecowatt(today, today + timedelta(days=ECOWATT_DAYS))
        fetched_eco = [
            f for d in eco if (f := self.store.fetched_at("ecowatt_days", d)) is not None
        ]
        return {
            "tempo": tempo,
            "ecowatt": {
                "days": [
                    {
                        "date": d.isoformat(),
                        "level": e.level,
                        "hours": hour_runs(e.hours) if ECOWATT_HOURS_VERIFIED and e.hours else None,
                    }
                    for d, e in sorted(eco.items())
                ],
                "fetched_at": max(fetched_eco) if fetched_eco else None,
            },
            "source": SOURCE,
        }

    async def tempo_prices(self) -> dict[str, Any]:
        """The six published Tempo prices for the form's prefill (spec §2.2), at most one call a
        week. Never saved into the tariff by Kelvin."""
        cached = self.db.get_setting(PRICES_KEY)
        if cached and self.wall() - cached["fetched_at"] < PRICES_TTL_S:
            return cached
        if self._prices_call is None:  # concurrent requests share one in-flight call
            self._prices_call = asyncio.ensure_future(self._fetch_prices())
            self._prices_call.add_done_callback(self._clear_prices_call)
        return await asyncio.shield(self._prices_call)

    def _clear_prices_call(self, _: object) -> None:
        self._prices_call = None

    async def _fetch_prices(self) -> dict[str, Any]:
        if not self.spend():
            raise BudgetSpent("budget")
        rates = await self.source.tempo_prices()
        out = {"rates": rates, "fetched_at": self.wall(), "source": SOURCE}
        self.db.set_setting(PRICES_KEY, out)
        return out

    async def aclose(self) -> None:
        await self.source.aclose()
