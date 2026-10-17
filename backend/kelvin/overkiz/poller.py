"""Poll Overkiz events and keep the house model and pending commands up to date."""

from __future__ import annotations

import asyncio
import contextlib
import logging
import time
from collections.abc import Awaitable, Callable
from typing import TYPE_CHECKING, Any

from kelvin.commands.service import CommandService
from kelvin.errors import gateway_error_code, safe_reason
from kelvin.house.model import House
from kelvin.overkiz.budget import SetupReadGuard
from kelvin.overkiz.errors import AuthError, BadCredentialsError, GatewayError, QuotaError
from kelvin.overkiz.gateway import Gateway
from kelvin.overkiz.models import DeviceUpdate, PlaceEvent, RawDevice, RawPlace, StateChange

if TYPE_CHECKING:  # types only: no import cycle at runtime
    from kelvin.setup.refresh import Reason, SetupRefresher
    from kelvin.setup.service import SetupService

log = logging.getLogger(__name__)

DEVICE_BACKOFF_MAX_S = 6 * 3600.0  # a device whose state read fails is retried at most this rarely
PUMP_RESERVE = 1  # full setup reads the pump leaves for a restart


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
        device_pause: float = 0.2,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
        on_setup: Callable[[RawPlace, list[RawDevice]], None] | None = None,
        setup: SetupService | None = None,
        refresher: SetupRefresher | None = None,
        on_layout: Callable[[], None] | None = None,
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
        self.device_pause = device_pause  # between the reads of a device-by-device resync
        self.sleep = sleep
        self.on_setup = on_setup or (lambda root, devices: None)  # after each full read
        self.failures = 0
        self.last_ok_wall: float | None = None
        self.last_error: str | None = None
        self.last_error_code: str | None = None  # quota, auth, network or unknown
        self._next_state_read = clock() + state_interval
        self._rotation = 0
        self._resync_due = False
        # After a quota answer, no device-by-device reads until then (no burst on recovery).
        self._quota_hold_until = float("-inf")
        self._device_failures: dict[str, int] = {}
        self._device_retry_at: dict[str, float] = {}
        self._wake = asyncio.Event()
        self.auth_rejected = False
        self._published: tuple[bool, bool] = (False, False)
        self.setup = setup
        self.refresher = refresher
        self.on_layout = on_layout or (lambda: None)
        self._layout_dirty = False

    @property
    def connected(self) -> bool:
        return self.failures == 0 and self.last_ok_wall is not None

    def status(self) -> dict[str, Any]:
        return {
            "connected": self.connected,
            "last_ok_at": self.last_ok_wall,
            "last_error": self.last_error,
            "last_error_code": self.last_error_code,
            "auth_rejected": self.auth_rejected,
            "setup_reads_24h": self.guard.used(),
        }

    def mark_ok(self) -> None:
        self.failures = 0
        self.last_error = None
        self.last_error_code = None
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
        """Resynchronise the whole house on the next poll (a full setup read while at least two
        are left in the budget, else one state read per device)."""
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
            elif isinstance(ev, DeviceUpdate | PlaceEvent):
                if self.setup is not None and self.setup.on_event(ev):
                    self._layout_dirty = True
            else:
                self.commands.on_exec(ev)
        except Exception:
            log.exception("failed to handle event %s", type(ev).__name__)

    async def run_once(self) -> float:
        if self.auth_rejected:
            # Never retry a known-bad password: it could lock the Cozytouch account.
            self._safe(self.commands.tick)
            return self.max_backoff
        changed: set[str] = set()
        events_ok = False
        try:
            # Events first: a failing state read must never hold up commands and changes.
            for ev in await self.gateway.fetch_events():
                self._handle(ev, changed)
            events_ok = True
            # A command about to fail reads its radiators once first (device state is the truth).
            self.commands.tick()
            changed |= await self.commands.verify()
            if self._resync_due:
                if await self._resync(changed):
                    self._resync_due = False
            elif reason := self.refresher.due() if self.refresher is not None else None:
                try:
                    await self._full_read(changed, reason)
                except QuotaError as e:
                    # A refused refresh (« Synchroniser » on a spent Overkiz quota) is not a lost
                    # connection: the events came through. The refresher already dropped it.
                    log.warning("full setup read refused (%s)", safe_reason(e))
                    self._quota_hold_until = self.clock() + self.state_interval
            elif self.clock() >= self._next_state_read and self._may_read_devices():
                await self._read_next_radiator(changed)
                self._next_state_read = self.clock() + self.state_interval
            if self.setup is not None and await self.setup.tick():
                self._layout_dirty = True
        except GatewayError as e:
            self.failures += 1
            self.last_error = safe_reason(e)
            self.last_error_code = gateway_error_code(e)
            log.warning("overkiz poll failed (%s): %s", self.failures, self.last_error)
            if not events_ok:
                # Events may have been lost: resync once Overkiz answers again (§3.1). A state
                # read failing after the events were fetched loses nothing.
                self._resync_due = True
            if isinstance(e, QuotaError):
                self._quota_hold_until = self.clock() + self.state_interval
            # No targeted read can confirm a command during an outage: judge without it.
            self._safe(lambda: self.commands.tick(can_read=False))
            self._notify_status()
            self._publish_layout()
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
                    log.warning("overkiz re-login failed: %s", safe_reason(login_err))
            exponent = min(self.failures - 1, 16)
            return min(self.max_backoff, self.idle_interval * 2**exponent)
        finally:
            # Idempotent; guarantees timeouts fire on the unexpected-exception path too.
            self._safe(self.commands.tick)
            if self.setup is not None:  # setup writes time out during an outage too
                self._safe(self.setup.timeouts)
        self.failures = 0
        self.last_error = None
        self.last_error_code = None
        self.last_ok_wall = self.wall()
        self._notify_status()
        self._publish_layout()
        if changed:
            self._safe(self.on_changed, changed)
        busy = self.commands.has_active or (self.setup is not None and self.setup.has_active)
        return self.busy_interval if busy else self.idle_interval

    def _may_read_devices(self) -> bool:
        return self.clock() >= self._quota_hold_until

    async def _read_states(self, urls: list[str], changed: set[str], *, paced: bool) -> None:
        """Read these devices' states. A device whose read fails is skipped and retried later
        with its own backoff; only a quota or auth answer fails the poll."""
        first = True
        for url in urls:
            if self.clock() < self._device_retry_at.get(url, float("-inf")):
                continue
            if paced and not first and self.device_pause > 0:
                await self.sleep(self.device_pause)
            first = False
            try:
                states = await self.gateway.device_states(url)
            except (QuotaError, AuthError):
                raise
            except GatewayError as e:
                n = self._device_failures.get(url, 0) + 1
                self._device_failures[url] = n
                backoff = min(self.state_interval * 2 ** min(n - 1, 16), DEVICE_BACKOFF_MAX_S)
                self._device_retry_at[url] = self.clock() + backoff
                log.warning("device state read failed (%s); skipping it", type(e).__name__)
                continue
            self._device_failures.pop(url, None)
            self._device_retry_at.pop(url, None)
            changed |= self.house.reload_device(url, states)

    async def _resync(self, changed: set[str]) -> bool:
        """Resynchronise the whole house; False when it has to wait (quota hold).

        The pump never takes the last full read of the day: it can always resync device by
        device, while a restart needs a full read (final review I1). Without this reserve, a
        flaky outage (events fail, then the full read fails, again and again) spends the whole
        budget in minutes and the next restart cannot read the setup for up to 24 h."""
        if self.guard.remaining() >= PUMP_RESERVE + 1:
            self.guard.record()
            root, devices = await self.gateway.snapshot()
            self._apply_full_read(root, devices, changed)
            self._safe(self.on_setup, root, devices)
        elif not self._may_read_devices():
            return False
        else:
            log.info("full setup read budget spent; resyncing device by device")
            await self._read_states(self.house.device_urls(), changed, paced=True)
        self._next_state_read = self.clock() + self.state_interval  # everything was just read
        self.commands.evaluate_all()
        return True

    def _apply_full_read(self, root: RawPlace, devices: list[RawDevice], changed: set[str]) -> None:
        """A full read refreshes states, and also places, labels and placement (spec §2.7)."""
        changed |= self.house.reload(devices)
        if self.house.sync_setup(root, devices):
            self._layout_dirty = True
        if self.setup is not None:
            self.setup.reconciled()  # what the unconfirmed writes did is in this read
        if self.refresher is not None:
            self.refresher.full_read_done()
            self._layout_dirty = True  # the sync line changed

    async def _full_read(self, changed: set[str], reason: Reason) -> None:
        self.guard.record()
        try:
            root, devices = await self.gateway.snapshot()
        except GatewayError:
            if self.refresher is not None:
                self.refresher.read_failed(reason)
            raise
        log.info("full setup read (%s)", reason)
        self._apply_full_read(root, devices, changed)
        self._safe(self.on_setup, root, devices)
        self.commands.evaluate_all()

    def _publish_layout(self) -> None:
        if self._layout_dirty:
            self._layout_dirty = False
            self._safe(self.on_layout)

    async def _read_next_radiator(self, changed: set[str]) -> None:
        """Reconcile one radiator per state_interval, in turn: catches lost events without the
        rate-limited full setup read."""
        ids = sorted(self.house.radiators)
        if not ids:
            return
        rid = ids[self._rotation % len(ids)]
        self._rotation += 1
        before = len(changed)
        await self._read_states(sorted(self.house.radiators[rid].states), changed, paced=False)
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
