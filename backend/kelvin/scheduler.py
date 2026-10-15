"""One loop for the periodic external calls (spec §2.8).

Jobs run at Europe/Paris wall-clock times, each slot once, with a deterministic jitter of up to
±2 minutes on public APIs. A slot missed while Kelvin was down runs once at start. A failure
honours the source's `retry_at` (Retry-After, nextAccessTime), else backs off from 5 minutes,
doubling, up to 6 hours, and never past the next slot. A job that finds nothing to do costs
nothing; call budgets are the jobs' own (the MED ledger). State persists in the `scheduler`
setting and feeds Réglages › Sources.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import random
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime, timedelta
from datetime import time as dtime
from typing import Any
from zoneinfo import ZoneInfo

from kelvin.recorder.db import Database

log = logging.getLogger(__name__)

STATE_KEY = "scheduler"
BACKOFF_START_S = 300
BACKOFF_MAX_S = 6 * 3600
IDLE_S = 3600.0


def _always() -> bool:
    return True


@dataclass(frozen=True)
class Job:
    name: str
    times: tuple[dtime, ...]
    run: Callable[[], Awaitable[None]]
    enabled: Callable[[], bool] = _always
    jitter_s: int = 120


class Scheduler:
    def __init__(
        self,
        db: Database,
        jobs: list[Job],
        *,
        tz: str | ZoneInfo = "Europe/Paris",
        wall: Callable[[], float] = time.time,
    ) -> None:
        self.db = db
        self.jobs = {j.name: j for j in jobs}
        self.tz = tz if isinstance(tz, ZoneInfo) else ZoneInfo(tz)
        self.wall = wall
        self.state: dict[str, dict[str, Any]] = db.get_setting(STATE_KEY) or {}
        self._wake = asyncio.Event()

    def _save(self) -> None:
        self.db.set_setting(STATE_KEY, self.state)

    def _slots(self, job: Job, now: float) -> list[float]:
        today = datetime.fromtimestamp(now, self.tz).date()
        out = []
        for k in (-1, 0, 1):
            day = today + timedelta(days=k)
            for t in job.times:
                jitter = random.Random(f"{job.name}:{day}:{t}").randint(-job.jitter_s, job.jitter_s)
                out.append(datetime.combine(day, t, tzinfo=self.tz).timestamp() + jitter)
        return sorted(out)

    def due_at(self, job: Job, now: float) -> float | None:
        if not job.enabled():
            return None
        st = self.state.get(job.name, {})
        handled = st.get("slot", 0.0)
        slots = self._slots(job, now)
        candidates = []
        missed = [s for s in slots if handled < s <= now]
        if missed and st.get("retry_at") is None:
            candidates.append(missed[-1])
        upcoming = [s for s in slots if s > now]
        if upcoming:
            candidates.append(upcoming[0])
        if st.get("retry_at") is not None:
            candidates.append(st["retry_at"])
        return min(candidates) if candidates else None

    def request(self, name: str) -> None:
        """Run this job soon (a tariff switched to Tempo needs its colours now)."""
        self.state.setdefault(name, {})["retry_at"] = self.wall()
        self._save()
        self.wake()

    async def run_due(self) -> list[str]:
        ran = []
        for job in self.jobs.values():
            now = self.wall()
            due = self.due_at(job, now)
            if due is None or due > now:
                continue
            await self._run(job, now)
            ran.append(job.name)
        return ran

    async def _run(self, job: Job, now: float) -> None:
        st = self.state.setdefault(job.name, {})
        st["slot"] = max([s for s in self._slots(job, now) if s <= now], default=now)
        st["last_attempt"] = now
        try:
            await job.run()
        except Exception as e:
            nxt = min((s for s in self._slots(job, now) if s > now), default=now + BACKOFF_MAX_S)
            if getattr(e, "quota", False):
                st["state"] = "quota"
                st["retry_at"] = None
            else:
                st["state"] = "error"
                if st.get("error_since") is None:  # a success sets it back to None
                    st["error_since"] = now
                retry = getattr(e, "retry_at", None)
                if retry is None:  # a Retry-After is the source's word: the backoff stays as is
                    backoff = min(BACKOFF_MAX_S, (st.get("backoff") or BACKOFF_START_S // 2) * 2)
                    st["backoff"] = backoff
                    retry = now + backoff
                st["retry_at"] = min(retry, nxt)
                log.warning("job %s failed: %s", job.name, type(e).__name__)
        else:
            st.update(state="ok", last_ok=now, retry_at=None, backoff=None, error_since=None)
        self._save()

    def status(self, name: str) -> dict[str, Any]:
        job = self.jobs[name]
        st = self.state.get(name, {})
        if not job.enabled():
            state = "off"
        else:
            state = st.get("state") or ("ok" if st.get("last_ok") else "never")
        return {
            "state": state,
            "last_ok": st.get("last_ok"),
            "error_since": st.get("error_since") if state == "error" else None,
            "next": self.due_at(job, self.wall()),
        }

    def wake(self) -> None:
        self._wake.set()

    async def run(self) -> None:
        while True:
            self._wake.clear()
            try:
                await self.run_due()
                now = self.wall()
                dues = [d for j in self.jobs.values() if (d := self.due_at(j, now)) is not None]
                delay = min(IDLE_S, max(1.0, min(dues, default=now + IDLE_S) - now))
            except Exception as e:  # never let one bad run kill the loop
                log.error("scheduler run failed: %s", type(e).__name__)
                delay = 60.0
            with contextlib.suppress(TimeoutError):
                await asyncio.wait_for(self._wake.wait(), timeout=delay)
