"""Poll Overkiz events and keep the house model and pending commands up to date."""

from __future__ import annotations

import asyncio
import contextlib
import logging
import time
from collections.abc import Callable
from typing import Any

from kelvin.commands.service import CommandService
from kelvin.house.model import House
from kelvin.overkiz.budget import SetupReadGuard
from kelvin.overkiz.errors import AuthError, BadCredentialsError, GatewayError
from kelvin.overkiz.gateway import Gateway
from kelvin.overkiz.models import StateChange

log = logging.getLogger(__name__)


class EventPump:
    def __init__(
        self,
        gateway: Gateway,
        house: House,
        commands: CommandService,
        *,
        on_changed: Callable[[set[str]], None] | None = None,
        on_status: Callable[[dict[str, Any]], None] | None = None,
        clock: Callable[[], float] = time.monotonic,
        wall: Callable[[], float] = time.time,
        idle_interval: float = 30.0,
        busy_interval: float = 2.0,
        state_interval: float = 600.0,
        max_backoff: float = 600.0,
        guard: SetupReadGuard | None = None,
    ) -> None:
        self.gateway = gateway
        self.house = house
        self.commands = commands
        self.on_changed = on_changed or (lambda ids: None)
        self.on_status = on_status or (lambda s: None)
        self.clock = clock
        self.wall = wall
        self.idle_interval = idle_interval
        self.busy_interval = busy_interval
        self.state_interval = state_interval
        self.max_backoff = max_backoff
        self.guard = guard or SetupReadGuard(wall=wall)
        self.failures = 0
        self.last_ok_wall: float | None = None
        self.last_error: str | None = None
        self._next_state_read = clock() + state_interval
        self._rotation = 0
        self._resync_due = False
        self._wake = asyncio.Event()
        self.auth_rejected = False
        self._published: tuple[bool, bool] = (False, False)

    @property
    def connected(self) -> bool:
        return self.failures == 0 and self.last_ok_wall is not None

    def status(self) -> dict[str, Any]:
        return {
            "connected": self.connected,
            "last_ok_at": self.last_ok_wall,
            "last_error": self.last_error,
            "auth_rejected": self.auth_rejected,
            "setup_reads_24h": self.guard.used(),
        }

    def mark_ok(self) -> None:
        self.failures = 0
        self.last_error = None
        self.last_ok_wall = self.wall()
        self._published = (True, self.auth_rejected)

    def wake(self) -> None:
        self._wake.set()

    def _notify_status(self) -> None:
        now = (self.connected, self.auth_rejected)
        if now != self._published:
            self._published = now
            self._safe(self.on_status, self.status())

    def credentials_changed(self) -> None:
        """The home's account has a new, accepted password: resume and resync."""
        self.auth_rejected = False
        self.request_resync()
        self._notify_status()

    def request_resync(self) -> None:
        """Resynchronise the whole house on the next poll (a full setup read if the budget
        allows, else one state read per device)."""
        self._resync_due = True
        self.wake()

    def _safe(self, fn: Callable[..., Any], *args: Any) -> None:
        try:
            fn(*args)
        except Exception:
            log.exception("event pump callback %s failed", getattr(fn, "__name__", fn))

    def _handle(self, ev: Any, changed: set[str]) -> None:
        try:
            if isinstance(ev, StateChange):
                rid = self.house.apply(ev)
                if rid:
                    changed.add(rid)
                self.commands.on_state(ev)
            else:
                self.commands.on_exec(ev)
        except Exception:
            log.exception("failed to handle event %r", ev)

    async def run_once(self) -> float:
        if self.auth_rejected:
            # Never retry a known-bad password: it could lock the Cozytouch account.
            self._safe(self.commands.tick)
            return self.max_backoff
        changed: set[str] = set()
        try:
            if self._resync_due:
                await self._resync(changed)
                self._resync_due = False
            elif self.clock() >= self._next_state_read:
                await self._read_next_radiator(changed)
                self._next_state_read = self.clock() + self.state_interval
            for ev in await self.gateway.fetch_events():
                self._handle(ev, changed)
        except GatewayError as e:
            self.failures += 1
            self.last_error = str(e) or type(e).__name__
            log.warning("overkiz poll failed (%s): %s", self.failures, self.last_error)
            self._safe(self.commands.tick)
            self._notify_status()
            if changed:
                self._safe(self.on_changed, changed)
            if isinstance(e, AuthError):
                try:
                    await self.gateway.login()
                except BadCredentialsError:
                    self.auth_rejected = True
                    log.warning("overkiz re-login refused: the stored Cozytouch password is wrong")
                    self._notify_status()
                except GatewayError as login_err:
                    log.warning("overkiz re-login failed: %s", login_err)
            exponent = min(self.failures - 1, 16)
            return min(self.max_backoff, self.idle_interval * 2**exponent)
        finally:
            # Idempotent; guarantees timeouts fire on the unexpected-exception path too.
            self._safe(self.commands.tick)
        if self.failures > 0:
            # Back after an outage: events may have been lost, resync on the next poll (§3.1).
            self._resync_due = True
        self.failures = 0
        self.last_error = None
        self.last_ok_wall = self.wall()
        self._notify_status()
        if changed:
            self._safe(self.on_changed, changed)
        return self.busy_interval if self.commands.has_active else self.idle_interval

    async def _read_states(self, urls: list[str], changed: set[str]) -> None:
        for url in urls:
            states = await self.gateway.device_states(url)
            changed |= self.house.reload_device(url, states)

    async def _resync(self, changed: set[str]) -> None:
        if self.guard.allowed():
            self.guard.record()
            _, devices = await self.gateway.snapshot()
            changed |= self.house.reload(devices)
        else:
            log.info("full setup read budget spent; resyncing device by device")
            await self._read_states(self.house.device_urls(), changed)
        self.commands.evaluate_all()

    async def _read_next_radiator(self, changed: set[str]) -> None:
        """Reconcile one radiator per state_interval, in turn: catches lost events without the
        rate-limited full setup read."""
        ids = sorted(self.house.radiators)
        if not ids:
            return
        rid = ids[self._rotation % len(ids)]
        self._rotation += 1
        before = len(changed)
        await self._read_states(sorted(self.house.radiators[rid].states), changed)
        if len(changed) != before:
            self.commands.evaluate_all()

    async def run(self) -> None:
        while True:
            self._wake.clear()
            try:
                delay = await self.run_once()
            except Exception:  # never let the pump die
                log.exception("event pump crashed; retrying")
                delay = self.idle_interval
            with contextlib.suppress(TimeoutError):
                await asyncio.wait_for(self._wake.wait(), timeout=delay)
