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
        refresh_interval: float = 600.0,
        max_backoff: float = 600.0,
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
        self.refresh_interval = refresh_interval
        self.max_backoff = max_backoff
        self.failures = 0
        self.last_ok_wall: float | None = None
        self.last_error: str | None = None
        self._last_refresh = clock()
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
        self._last_refresh = float("-inf")
        self._notify_status()
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
            if self.clock() - self._last_refresh >= self.refresh_interval:
                _, devices = await self.gateway.snapshot()
                changed |= self.house.reload(devices)
                self._last_refresh = self.clock()
                self.commands.evaluate_all()
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
            self._last_refresh = float("-inf")
        self.failures = 0
        self.last_error = None
        self.last_ok_wall = self.wall()
        self._notify_status()
        if changed:
            self._safe(self.on_changed, changed)
        return self.busy_interval if self.commands.has_active else self.idle_interval

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
