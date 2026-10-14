"""Daily MyElectricalData sync (spec §3.5): 08:00 with a 14:00 retry, resumable backfill,
a budget far below the 50 calls/day quota, and Enedis 429 nextAccessTime honoured.

After the 30-day curve window, spare budget extends the curve backwards to the contract start,
at most CURVE_EXTRA_CHUNKS_PER_DAY chunks per local day, queued last so they only use spare calls.
"""

from __future__ import annotations

import asyncio
import contextlib
import hashlib
import logging
import time
from collections.abc import Callable
from dataclasses import asdict, dataclass, field
from datetime import date, datetime, timedelta
from datetime import time as dtime
from typing import Any, Literal
from zoneinfo import ZoneInfo

from kelvin.linky.models import LinkyAuthError, LinkyError, LinkySource, LinkyThrottled
from kelvin.linky.store import LinkyStore
from kelvin.recorder.db import Database

log = logging.getLogger(__name__)

DAILY_BACKFILL_DAYS = 365
CURVE_BACKFILL_DAYS = 30
CURVE_CHUNK_DAYS = 7
CURVE_EXTRA_CHUNKS_PER_DAY = 2  # older curve chunks per local day, toward the contract start
CURVE_HISTORY_DAYS = 730  # Enedis keeps about two years of load curve
DAILY_CHUNK_DAYS = 365
GIVE_UP_AFTER = 3  # tries before an old missing day is left alone
ALWAYS_RETRY_DAYS = 3  # the newest days are retried whatever (Enedis publishes D-1 late)
TRIES_HORIZON_DAYS = DAILY_BACKFILL_DAYS + 30  # try counters kept at least this far back
DAILY_BUDGET = 10  # calls per local day, every call included (MED allows 50)
RUN_AT = (dtime(8, 0), dtime(14, 0))
THROTTLE_FALLBACK_S = 3600
STATE_KEY = "linky_sync"

MESSAGES = {
    "auth": "MyElectricalData refuse le jeton : renouvelez-le dans Réglages.",
    "quota": "Quota Linky du jour atteint : reprise demain.",
    "error": "Synchronisation Linky en échec.",
}


class BudgetExceeded(LinkyError):
    """Kelvin's own daily call budget is spent."""


@dataclass(frozen=True)
class Request:
    kind: Literal["daily", "curve"]
    start: date
    end: date  # exclusive


@dataclass
class SyncState:
    last_ok_at: float | None = None
    last_attempt_at: float | None = None
    error: str | None = None  # "auth" | "throttled" | "quota" | "error"
    retry_at: float | None = None
    calls_day: str | None = None
    calls: int = 0
    extra_day: str | None = None  # local day of the `extra` counter
    extra: int = 0  # extra curve chunks (older than the 30-day window) fetched that day
    tries: dict[str, int] = field(default_factory=dict)  # "curve:2026-10-12" → failed tries
    not_before: str | None = None  # contract activation: Enedis has nothing earlier
    consent_expires: str | None = None
    token_fp: str | None = None  # SHA-256 of the token in use, never the token itself


def _runs(days: list[date]) -> list[list[date]]:
    runs: list[list[date]] = []
    for d in sorted(days):
        if runs and (d - runs[-1][-1]).days == 1:
            runs[-1].append(d)
        else:
            runs.append([d])
    return runs


def _chunks_newest_first(run: list[date], n: int) -> list[list[date]]:
    return [run[max(0, i - n) : i] for i in range(len(run), 0, -n)]


def _curve_requests(missing: list[date]) -> list[Request]:
    """Missing days as ≤ 7-day curve requests, newest first."""
    return [
        Request("curve", chunk[0], chunk[-1] + timedelta(days=1))
        for run in reversed(_runs(missing))
        for chunk in _chunks_newest_first(run, CURVE_CHUNK_DAYS)
    ]


def _days(first: date, last: date) -> list[date]:
    return [first + timedelta(days=i) for i in range((last - first).days + 1)]


class LinkySync:
    def __init__(
        self,
        store: LinkyStore,
        db: Database,
        source: LinkySource | None,
        *,
        tz: str = "Europe/Paris",
        wall: Callable[[], float] = time.time,
        budget: int = DAILY_BUDGET,
    ) -> None:
        self.store = store
        self.db = db
        self.source = source
        self.tz = ZoneInfo(tz)
        self.wall = wall
        self.budget = budget
        self.state = self._load()
        self._wake = asyncio.Event()

    def _load(self) -> SyncState:
        raw = self.db.get_setting(STATE_KEY) or {}
        known = SyncState.__dataclass_fields__
        return SyncState(**{k: v for k, v in raw.items() if k in known})

    def _save(self) -> None:
        self.db.set_setting(STATE_KEY, asdict(self.state))

    def today(self) -> date:
        return datetime.fromtimestamp(self.wall(), self.tz).date()

    def _not_before(self) -> date | None:
        return date.fromisoformat(self.state.not_before) if self.state.not_before else None

    def set_source(
        self,
        source: LinkySource | None,
        *,
        not_before: date | None = None,
        consent_expires: str | None = None,
    ) -> None:
        self.source = source
        # An Enedis retry time still ahead is kept (a new PDL was forgotten first): saving
        # Réglages while throttled must not fire a request Enedis would refuse again.
        # Tries are kept too: a new token does not re-arm given-up holes.
        st = self.state
        throttled = st.retry_at is not None and self.wall() < st.retry_at
        st.error = "throttled" if throttled else None
        if not throttled:
            st.retry_at = None
        if not_before is not None:
            self.state.not_before = not_before.isoformat()
        if consent_expires is not None:
            self.state.consent_expires = consent_expires
        self._save()
        self.wake()

    def use_token(self, token: str) -> None:
        """Record the token in use. A stored "auth" error belongs to the token it was raised
        for: another token (MED_TOKEN changed, then a restart) clears it."""
        fp = hashlib.sha256(token.encode()).hexdigest()
        if self.state.token_fp == fp:
            return
        if self.state.error == "auth":
            self.state.error = None
        self.state.token_fp = fp
        self._save()

    def forget(self) -> None:
        """Drop what belongs to the previous PDL (tries, contract start, consent, last sync).
        The day's call counters stay: the budget is per Kelvin, not per PDL."""
        st = self.state
        self.state = SyncState(
            calls_day=st.calls_day, calls=st.calls, extra_day=st.extra_day, extra=st.extra
        )
        self._save()

    def set_not_before(self, day: date | None) -> None:
        self.state.not_before = day.isoformat() if day else None
        self._save()

    def calls_today(self) -> int:
        return self.state.calls if self.state.calls_day == self.today().isoformat() else 0

    def spend(self, today: date | None = None) -> bool:
        day = (today or self.today()).isoformat()
        if self.state.calls_day != day:
            self.state.calls_day, self.state.calls = day, 0
        if self.state.calls >= self.budget:
            return False
        self.state.calls += 1
        self._save()
        return True

    def _extra_today(self, today: date) -> int:
        return self.state.extra if self.state.extra_day == today.isoformat() else 0

    def _charge_extra(self, today: date) -> None:
        self.state.extra = self._extra_today(today) + 1
        self.state.extra_day = today.isoformat()

    @staticmethod
    def _is_extra(req: Request, today: date) -> bool:
        """An extension chunk: entirely older than the 30-day curve window."""
        return req.kind == "curve" and req.end <= today - timedelta(days=CURVE_BACKFILL_DAYS)

    def _missing(self, kind: str, days: list[date], have: set[date], today: date) -> list[date]:
        out = []
        for d in days:
            if d in have:
                continue
            old = (today - d).days > ALWAYS_RETRY_DAYS
            if old and self.state.tries.get(f"{kind}:{d}", 0) >= GIVE_UP_AFTER:
                continue
            out.append(d)
        return out

    def _window(self, n: int, today: date) -> list[date]:
        last = today - timedelta(days=1)
        first = last - timedelta(days=n - 1)
        not_before = self._not_before()
        if not_before:
            first = max(first, not_before)
        return _days(first, last)

    def plan(self, today: date | None = None) -> list[Request]:
        today = today or self.today()
        reqs: list[Request] = []
        days = self._window(DAILY_BACKFILL_DAYS, today)
        if days:
            missing = self._missing("daily", days, set(self.store.daily(days[0], today)), today)
            start = missing[0] if missing else None
            while start is not None and start < today:
                end = min(start + timedelta(days=DAILY_CHUNK_DAYS), today)
                reqs.append(Request("daily", start, end))
                start = end
        days = self._window(CURVE_BACKFILL_DAYS, today)
        if days:
            have = self.store.complete_curve_days(days[0], today)
            reqs += _curve_requests(self._missing("curve", days, have, today))
        reqs += self._extra_requests(today)
        return reqs

    def _extra_requests(self, today: date) -> list[Request]:
        """Older curve chunks, from day −31 back to the contract start but never past the curve
        history Enedis keeps (or, start unknown, to the start of the daily window), newest first
        and at most the extra chunks left for today."""
        left = CURVE_EXTRA_CHUNKS_PER_DAY - self._extra_today(today)
        if left <= 0:
            return []
        newest = today - timedelta(days=CURVE_BACKFILL_DAYS + 1)
        not_before = self._not_before()
        if not_before:
            oldest = max(not_before, today - timedelta(days=CURVE_HISTORY_DAYS))
        else:
            oldest = today - timedelta(days=DAILY_BACKFILL_DAYS)
        if newest < oldest:
            return []
        have = self.store.complete_curve_days(oldest, newest + timedelta(days=1))
        return _curve_requests(self._missing("curve", _days(oldest, newest), have, today))[:left]

    def _have(self, req: Request) -> set[date]:
        if req.kind == "daily":
            return set(self.store.daily(req.start, req.end))
        return self.store.complete_curve_days(req.start, req.end)

    def _count_tries(self, req: Request, have: set[date], today: date) -> None:
        d = req.start
        while d < req.end:
            key = f"{req.kind}:{d}"
            if d in have:
                self.state.tries.pop(key, None)
            else:
                self.state.tries[key] = self.state.tries.get(key, 0) + 1
            d += timedelta(days=1)
        # Keep the counters back to the contract start, so a permanent hole near an old contract
        # start stays given up instead of being retried every day.
        horizon = today - timedelta(days=TRIES_HORIZON_DAYS)
        not_before = self._not_before()
        if not_before:
            horizon = min(horizon, not_before)
        cut = horizon.isoformat()
        self.state.tries = {k: v for k, v in self.state.tries.items() if k.split(":")[1] >= cut}

    async def run_once(self) -> int:
        if self.source is None or self.state.error == "auth":
            return 0
        now = self.wall()
        if self.state.retry_at is not None and now < self.state.retry_at:
            return 0
        today = self.today()
        self.state.retry_at = None
        self.state.last_attempt_at = now
        made = 0
        failed = False
        ok: set[str] = set()  # kinds with a request that succeeded in this run
        broken: list[Request] = []  # requests that failed with a plain LinkyError
        try:
            for req in self.plan(today):
                extra = self._is_extra(req, today)
                if extra:
                    self._charge_extra(today)  # saved by spend(), with the call itself
                if not self.spend(today):
                    if extra:
                        self.state.extra -= 1
                    self.state.error = "quota"
                    failed = True
                    break
                made += 1
                try:
                    if req.kind == "daily":
                        self.store.upsert_daily(await self.source.fetch_daily(req.start, req.end))
                    else:
                        self.store.upsert_curve(await self.source.fetch_curve(req.start, req.end))
                except LinkyThrottled as e:
                    self.state.error = "throttled"
                    self.state.retry_at = (
                        e.retry_at if e.retry_at and e.retry_at > now else now + THROTTLE_FALLBACK_S
                    )
                    failed = True
                    break
                except LinkyAuthError:
                    self.state.error = "auth"
                    failed = True
                    break
                except LinkyError as e:
                    # The type only: a message could quote a URL holding the PDL. The run goes on
                    # with the other requests.
                    log.warning("linky %s sync failed: %s", req.kind, type(e).__name__)
                    self.state.error = "error"
                    failed = True
                    broken.append(req)
                    continue
                ok.add(req.kind)
                self._count_tries(req, self._have(req), today)
            # A failing request counts a try only when another request of the same kind
            # succeeded: then this request is the problem, and GIVE_UP_AFTER applies. In an
            # outage, or with one endpoint down, nothing is given up.
            for req in broken:
                if req.kind in ok:
                    self._count_tries(req, self._have(req), today)
            if not failed:
                self.state.error = None
                self.state.last_ok_at = now
        finally:
            self._save()
        return made

    def next_wake(self, now: float) -> float:
        today = datetime.fromtimestamp(now, self.tz).date()
        slots = [
            datetime.combine(today + timedelta(days=d), t, tzinfo=self.tz).timestamp()
            for d in (0, 1)
            for t in RUN_AT
        ]
        nxt = min(s for s in slots if s > now)
        if self.state.retry_at is not None and now < self.state.retry_at < nxt:
            nxt = self.state.retry_at
        return nxt

    def wake(self) -> None:
        self._wake.set()

    async def run(self) -> None:
        while True:
            self._wake.clear()
            try:
                await self.run_once()
            except Exception as e:  # never let one bad run kill the background task
                log.error("linky sync crashed: %s", type(e).__name__)
                self.state.error = "error"
                self._save()
            delay = max(1.0, self.next_wake(self.wall()) - self.wall())
            with contextlib.suppress(TimeoutError):
                await asyncio.wait_for(self._wake.wait(), timeout=delay)

    def status(self) -> dict[str, Any]:
        st = self.state
        if self.source is None:
            state = "off"
        elif st.error:
            state = st.error
        elif st.last_ok_at is None:
            state = "never"
        else:
            state = "ok"
        if state == "throttled" and st.retry_at:
            when = datetime.fromtimestamp(st.retry_at, self.tz).strftime("%H:%M")
            message: str | None = f"Enedis limite les requêtes : nouvel essai à {when}."
        else:
            message = MESSAGES.get(state)
        last = self.store.last_day()
        return {
            "state": state,
            "message": message,
            "last_day": last.isoformat() if last else None,
            "last_ok_at": st.last_ok_at,
            "retry_at": st.retry_at,
            "calls_today": self.calls_today(),
            "budget": self.budget,
            "consent_expires": st.consent_expires,
        }
