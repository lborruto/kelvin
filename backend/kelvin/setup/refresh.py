"""When Kelvin spends one of its full setup reads (owner question « drift », ruling 8).

Place names and the list of places reach Kelvin only through a full setup read
(`GET /setup/places` + `/setup/devices`), which SetupReadGuard limits to 3 in any 24 h,
persisted. Device moves and renames need none: DeviceUpdatedEvent carries them. This class only
says when to spend a read; the event pump makes it:
- the daily refresh at 04:30 Europe/Paris, skipped when a full read happened in the last 12 h
  and nothing is known to be stale, and waiting for a free read when the budget is spent;
- after Kelvin's own setup writes, 30 s after the last one settles, only while a read stays in
  reserve (the confirmed write is already applied: the read only verifies it);
- after a place change made in the Cozytouch app, 10 s after the last such event, with the same
  reserve; otherwise the change stays stale until the daily read or « Synchroniser »;
- « Synchroniser », whenever a read is free.
Every reason, the daily read and « Synchroniser » included, leaves RESERVE reads: a restart
must always find one full read (Plan 5's rule, `poller.PUMP_RESERVE`).
"""

from __future__ import annotations

import time
from collections.abc import Callable
from datetime import datetime, timedelta
from datetime import time as dtime
from typing import Any, Literal
from zoneinfo import ZoneInfo

from kelvin.overkiz.budget import SetupReadGuard
from kelvin.overkiz.poller import PUMP_RESERVE

DAILY_AT = dtime(4, 30)
DAILY_SKIP_S = 12 * 3600.0
AFTER_WRITE_QUIET_S = 30.0
OUTSIDE_QUIET_S = 10.0
RESERVE = PUMP_RESERVE  # every refresh leaves this many full reads for a restart

Reason = Literal["daily", "after_write", "outside", "manual"]


class SyncSpent(Exception):
    """« Synchroniser » while the budget of full reads is spent."""

    def __init__(self, used: int, limit: int, next_at: float | None) -> None:
        super().__init__("full setup read budget spent")
        self.used = used
        self.limit = limit
        self.next_at = next_at


class SetupRefresher:
    def __init__(
        self,
        guard: SetupReadGuard,
        *,
        wall: Callable[[], float] = time.time,
        tz: str = "Europe/Paris",
    ) -> None:
        self.guard = guard
        self.wall = wall
        self.tz = ZoneInfo(tz)
        self.last_full_at: float | None = None
        self.stale_since: float | None = None  # a change made in the app, not read yet
        self.manual_requested_at: float | None = None
        self._after_write_at: float | None = None
        self._outside_at: float | None = None
        self._daily_due = False
        self.next_daily_at = self._next_daily(wall())
        # Set by the runtime: an after-write read was withheld (only the restart's read left)
        # or failed. SetupService then settles its reserved labels with targeted reads.
        self.on_withheld: Callable[[], None] = lambda: None

    def _next_daily(self, now: float) -> float:
        local = datetime.fromtimestamp(now, self.tz)
        at = datetime.combine(local.date(), DAILY_AT, tzinfo=self.tz)
        if at.timestamp() <= now:
            at = datetime.combine(local.date() + timedelta(days=1), DAILY_AT, tzinfo=self.tz)
        return at.timestamp()

    def full_read_done(self) -> None:
        """Any full read (startup, outage resync or one of ours) refreshed places and labels."""
        self.last_full_at = self.wall()
        self.stale_since = None
        self.manual_requested_at = None
        self._after_write_at = None
        self._outside_at = None
        self._daily_due = False

    def after_write(self) -> None:
        self._after_write_at = self.wall() + AFTER_WRITE_QUIET_S

    def outside_change(self) -> None:
        now = self.wall()
        self._outside_at = now + OUTSIDE_QUIET_S
        if self.stale_since is None:
            self.stale_since = now

    def _spare(self) -> int:
        """Full reads a refresh may spend now: the budget left minus the restart's reserve."""
        return self.guard.remaining() - RESERVE

    def request_manual(self) -> None:
        if self._spare() <= 0:
            raise SyncSpent(self.guard.used(), self.guard.limit, self.guard.next_at(RESERVE))
        if self.manual_requested_at is None:
            self.manual_requested_at = self.wall()

    def read_failed(self, reason: Reason) -> None:
        """A full read failed: never retry it in a loop (each attempt may count upstream)."""
        if reason == "manual":
            self.manual_requested_at = None
        elif reason == "daily":
            self._daily_due = False
        elif reason == "outside":
            self._outside_at = None
        else:
            self._after_write_at = None
            self.on_withheld()

    def due(self) -> Reason | None:
        now = self.wall()
        if now >= self.next_daily_at:
            self.next_daily_at = self._next_daily(now)
            recent = self.last_full_at is not None and now - self.last_full_at < DAILY_SKIP_S
            if not recent or self.stale_since is not None:
                self._daily_due = True
        outside_due = self._outside_at is not None and now >= self._outside_at
        after_write_due = self._after_write_at is not None and now >= self._after_write_at
        if self._spare() <= 0:
            # Only the restart's read is left. The daily read and « Synchroniser » stay owed;
            # an app change stays stale (the daily read or « Synchroniser » takes it) and a
            # confirmed write stands.
            if outside_due:
                self._outside_at = None
            if after_write_due:
                self._after_write_at = None
                self.on_withheld()
            return None
        if self.manual_requested_at is not None:
            return "manual"
        if self._daily_due:
            return "daily"
        if outside_due:
            return "outside"
        if after_write_due:
            return "after_write"
        return None

    def view(self) -> dict[str, Any]:
        return {
            "used": self.guard.used(),
            "limit": self.guard.limit,
            "next_possible_at": self.guard.next_at(RESERVE),
            "last_full_at": self.last_full_at,
            "stale_since": self.stale_since,
            "requested": self.manual_requested_at is not None,
            "next_daily_at": self.next_daily_at,
        }
