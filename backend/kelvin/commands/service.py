"""Send commands and decide when they are really done, from device state (spec §3.3)."""

from __future__ import annotations

import copy
import logging
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any, Literal
from uuid import uuid4

from kelvin.commands.translate import PROGRAM_STATE, Planned, day_difference, program_diff
from kelvin.errors import french, gateway_error_code, safe_reason
from kelvin.house.model import DAY_ORDER, House
from kelvin.labels import Label
from kelvin.overkiz.errors import GatewayError
from kelvin.overkiz.gateway import Gateway
from kelvin.overkiz.models import ExecUpdate, StateChange

log = logging.getLogger(__name__)

EXEC_FAILURE_GRACE = 15.0
CONFIRM_TIMEOUT = 90.0
# After the device reported its execution COMPLETED (the states come before it), how long a
# command whose states do not match yet waits before Kelvin reads them once to judge it.
SETTLE_AFTER_COMPLETED = 10.0
# A due targeted read that never happens (Overkiz unreachable) stops holding the verdict back.
VERIFY_WAIT = 30.0
# Failures a later state can still turn into a confirmation (the radiator was only slow).
FLIPPABLE = frozenset(
    {"no_confirmation", "program_differs", "radiator_refused", "radiator_offline"}
)
# How long a superseded command that never reports its execution may hold back newer ones.
SUPERSEDED_WAIT = 30.0
# How long a settled command stays in the snapshot, so a client that slept learns its real outcome.
RECENT_KEEP = 300.0
Status = Literal["sending", "pending", "confirmed", "failed", "superseded"]


@dataclass
class Pending:
    id: str
    label: str
    radiator_ids: tuple[str, ...]
    planned: Planned
    created_at: float
    created_wall: float
    status: Status = "sending"
    exec_id: str | None = None
    error: str | None = None
    exec_failed_at: float | None = None
    expected: dict[str, dict[str, Any]] = field(default_factory=dict)
    # Set once the device has finished (or can no longer run) this command's execution.
    exec_done: bool = False
    # Superseded commands still executing on the device: this one is judged only after them.
    after: list[Pending] = field(default_factory=list)
    # The codes the web translates (kelvin/labels.py, kelvin/errors.py); label/error stay French.
    label_code: str | None = None
    label_params: dict[str, Any] = field(default_factory=dict)
    error_code: str | None = None
    error_params: dict[str, Any] = field(default_factory=dict)
    reason_code: str | None = None  # send_failed: quota, auth, network or unknown
    exec_completed_at: float | None = None
    # Each expected state as the house held it when the command was sent.
    before: dict[tuple[str, str], Any] = field(default_factory=dict)
    # A verdict is due: the failure code it gets unless one targeted read shows the states.
    verify_code: str | None = None
    verify_since: float | None = None
    verified: bool = False
    # A failure a later matching state may still turn into a confirmation.
    flippable: bool = False
    # Radiators unreachable (core:StatusState) that did not take it: they never fail a command
    # the reachable ones took; « confirmé, N hors ligne ».
    offline: tuple[str, ...] = ()

    @property
    def active(self) -> bool:
        return self.status in ("sending", "pending")

    @property
    def keys(self) -> set[tuple[str, str]]:
        return {(e.device_url, e.name) for e in self.planned.expectations}

    def view(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "label": self.label,
            "radiator_ids": list(self.radiator_ids),
            "status": self.status,
            "error": self.error,
            "label_code": self.label_code,
            "label_params": self.label_params,
            "error_code": self.error_code,
            "error_params": self.error_params,
            "reason_code": self.reason_code,
            "created_at": self.created_wall,
            "expected": self.expected,
            "offline": list(self.offline),
        }


_EXPECTED_KEYS = {
    "core:OperatingModeState": "mode",
    "core:TargetTemperatureState": "target",
    "core:ComfortRoomTemperatureState": "comfort",
    "core:EcoRoomTemperatureState": "eco_delta",
    "core:LightIntensityState": "light_intensity",
}


def expected_by_radiator(house: House, planned: Planned) -> dict[str, dict[str, Any]]:
    """What the UI may show as 'pending' per radiator. The mode, a pilot-wire level and a
    towel dryer's temporary state read through the radiator's profile (Plan 12)."""
    out: dict[str, dict[str, Any]] = {}
    for e in planned.expectations:
        rid = house.radiator_for_url(e.device_url)
        if rid is None:
            continue
        p = house.radiators[rid].profile
        if e.name == p.mode_state:
            key, value = "mode", p.mode_of(e.value)
        elif p.level_command is not None and e.name == p.level_state:
            key, value = "level", e.value
        elif p.dryer_state is not None and e.name == p.dryer_state:
            key, value = "dryer", p.dryer_of(e.value)
        elif e.name in _EXPECTED_KEYS:
            key, value = _EXPECTED_KEYS[e.name], e.value
        else:
            continue
        out.setdefault(rid, {})[key] = value
    return out


class CommandService:
    def __init__(
        self,
        gateway: Gateway,
        house: House,
        *,
        clock: Callable[[], float] = time.monotonic,
        wall: Callable[[], float] = time.time,
        on_update: Callable[[Pending], None] | None = None,
    ) -> None:
        self.gateway = gateway
        self.house = house
        self.clock = clock
        self.wall = wall
        self.on_update = on_update or (lambda p: None)
        self.on_sent: Callable[[], None] = lambda: None
        self._pending: dict[str, Pending] = {}
        # Executions sent and not reported yet, superseded ones included.
        self._running: dict[str, Pending] = {}
        # Settled commands (confirmed, failed, superseded) with the time they settled.
        self._recent: dict[str, tuple[float, Pending]] = {}

    def active(self) -> list[Pending]:
        return list(self._pending.values())

    def recent(self) -> list[Pending]:
        """Commands settled in the last RECENT_KEEP seconds, oldest first."""
        self._prune_recent()
        return [p for _, p in self._recent.values()]

    def _prune_recent(self) -> None:
        cutoff = self.clock() - RECENT_KEEP
        for pid, (at, _) in list(self._recent.items()):
            if at < cutoff:
                del self._recent[pid]

    @property
    def has_active(self) -> bool:
        return bool(self._pending)

    async def submit(
        self, label: Label | str, radiator_ids: tuple[str, ...], planned: Planned
    ) -> Pending:
        coded = isinstance(label, Label)
        text = label.text if coded else label
        p = Pending(
            id=uuid4().hex[:12],
            label=text,
            radiator_ids=tuple(radiator_ids),
            planned=planned,
            created_at=self.clock(),
            created_wall=self.wall(),
            label_code=label.code if coded else None,
            label_params=dict(label.params) if coded else {},
        )
        p.expected = expected_by_radiator(self.house, planned)
        p.before = {
            (e.device_url, e.name): copy.deepcopy(self.house.device_state(e.device_url, e.name))
            for e in planned.expectations
        }
        for _, q in self._recent.values():
            if q.keys & p.keys:
                q.flippable = False  # a newer command owns these states now
        for other in self.active():
            if other.keys & p.keys:
                self._resolve(other, "superseded")
                p.after += [o for o in (other, *other.after) if not o.exec_done]
        self._pending[p.id] = p
        self.on_update(p)
        try:
            exec_id = await self.gateway.execute(list(planned.commands), text)
        except GatewayError as e:
            p.exec_done = True
            if p.status == "sending":
                self._resolve(
                    p,
                    "failed",
                    "send_failed",
                    reason_code=gateway_error_code(e),
                    detail_reason=safe_reason(e),
                )
            self._release(p)
            return p
        except BaseException:
            p.exec_done = True
            if p.status == "sending":
                self._resolve(p, "failed", "send_internal")
            self._release(p)
            raise
        p.exec_id = exec_id
        self._running[exec_id] = p
        if p.status != "sending":
            return p
        p.status = "pending"
        self.on_update(p)
        self.on_sent()
        self._evaluate(p)
        return p

    def on_state(self, change: StateChange) -> None:
        key = (change.device_url, change.name)
        for p in self.active():
            if key in p.keys:
                self._evaluate(p)
        for p in self._flippable():
            if key in p.keys:
                self._flip(p)

    def on_exec(self, update: ExecUpdate) -> None:
        done = None
        if update.state in ("COMPLETED", "FAILED"):  # NOT_TRANSMITTED/TRANSMITTED: still running
            done = self._running.pop(update.exec_id, None)
        if done is not None:
            done.exec_done = True
        for p in self.active():
            if p.exec_id != update.exec_id:
                continue
            if update.state == "COMPLETED":
                p.exec_completed_at = self.clock()
                if not p.planned.expectations:
                    self._resolve(p, "confirmed")
                else:
                    self._evaluate(p)
            elif update.state == "FAILED":
                p.exec_failed_at = self.clock()
                self._evaluate(p)
        if done is not None:
            self._release(done)

    def _release(self, done: Pending) -> None:
        """An execution others were waiting for is over: judge them now."""
        for p in self.active():
            if any(o is done for o in p.after):
                self._evaluate(p)

    def evaluate_all(self) -> None:
        for p in self.active():
            self._evaluate(p)
        for p in self._flippable():
            self._flip(p)

    def tick(self, *, can_read: bool = True) -> None:
        """Time-outs. `can_read=False` (Overkiz unreachable this poll): a due failure is decided
        without the targeted read, as no read could happen."""
        now = self.clock()
        released = False
        for exec_id, q in list(self._running.items()):
            # A superseded execution that never reports stops holding newer commands back.
            if now - q.created_at >= (CONFIRM_TIMEOUT if q.active else SUPERSEDED_WAIT):
                del self._running[exec_id]
                q.exec_done = released = True
        if released:
            self.evaluate_all()
        for p in self.active():
            if p.verify_code is not None:
                # The targeted read never came (Overkiz unreachable): judge without it.
                if now - (p.verify_since or now) >= VERIFY_WAIT:
                    self._fail(p, p.verify_code, how="no read")
                continue
            if p.status == "pending" and (
                p.exec_failed_at is not None and now - p.exec_failed_at >= EXEC_FAILURE_GRACE
            ):
                self._due(p, code="radiator_refused", can_read=can_read)
            elif (
                p.status == "pending"
                and p.exec_completed_at is not None
                and now - p.exec_completed_at >= SETTLE_AFTER_COMPLETED
                and not any(not o.exec_done for o in p.after)
            ):
                self._due(p, code="no_confirmation", can_read=can_read)
            elif now - p.created_at >= CONFIRM_TIMEOUT:
                self._due(p, code="no_confirmation", can_read=can_read)

    def _due(self, p: Pending, *, code: str, can_read: bool) -> None:
        """A failure is due: first read the unconfirmed devices once (`verify`)."""
        if p.verified or not can_read:
            self._fail(p, code, how="read" if p.verified else "no read")
            return
        p.verify_code = code
        p.verify_since = self.clock()
        log.info(
            "command '%s': no matching state after %.0f s; reading its radiators once",
            p.label,
            self.clock() - p.created_at,
        )

    async def verify(self) -> set[str]:
        """One targeted state read (`GET /setup/devices/{url}/states`, no quota printed; never
        a full setup read nor states/refresh) per device whose expected state is still missing,
        for each command whose failure is due; then its verdict. Returns the radiators whose
        states changed, for the house event."""
        due = [p for p in self.active() if p.verify_code is not None and not p.verified]
        if not due:
            return set()
        urls: list[str] = []
        for p in due:
            p.verified = True
            for e in p.planned.expectations:
                if e.device_url not in urls and not e.matches(
                    self.house.device_state(e.device_url, e.name)
                ):
                    urls.append(e.device_url)
        changed: set[str] = set()
        for url in urls:
            try:
                states = await self.gateway.device_states(url)
            except GatewayError as e:
                log.warning("state read to confirm a command failed (%s)", type(e).__name__)
                continue
            changed |= self.house.reload_device(url, states)
        for p in due:
            if not p.active:
                continue
            self._evaluate(p, how="read")
            if p.active and p.verify_code is not None:
                self._fail(p, p.verify_code, how="read")
        return changed

    def _fail(self, p: Pending, code: str, *, how: str) -> None:
        """The verdict once the states were read (or could not be): a programme the radiators
        changed to something else says so, with the days that differ."""
        days: list[str] = []
        first: tuple[str, str] | None = None  # the first day's (sent, kept), for the message
        for e in p.planned.expectations:
            if e.name != PROGRAM_STATE:
                continue
            actual = self.house.device_state(e.device_url, e.name)
            if e.matches(actual) or actual == p.before.get((e.device_url, e.name)):
                continue  # unchanged: the radiator did not take it (not « other times »)
            diff = program_diff(e.value, actual) or []
            if diff and (not days or DAY_ORDER.index(diff[0]) < DAY_ORDER.index(days[0])):
                first = day_difference(e.value, actual, diff[0])
            days = [d for d in DAY_ORDER if d in days or d in diff]
        missing = self._missing(p)
        p.offline = self._offline(missing)
        if days and first is not None:
            sent, kept = first
            self._resolve(
                p, "failed", "program_differs", days=days, day=days[0], sent=sent, kept=kept
            )
        elif p.offline and len(p.offline) == len(missing):
            # Nothing reached a radiator because every one it was for is unreachable.
            self._resolve(p, "failed", "radiator_offline")
        else:
            self._resolve(p, "failed", code)
        p.flippable = p.error_code in FLIPPABLE and bool(p.planned.expectations)
        log.warning(
            "command '%s' failed after %.0f s (%s, %s)%s",
            p.label,
            self.clock() - p.created_at,
            p.error_code,
            how,
            f": radiators hold other slots on {', '.join(days)}" if days else "",
        )

    def _flippable(self) -> list[Pending]:
        self._prune_recent()
        return [p for _, p in self._recent.values() if p.flippable and p.status == "failed"]

    def _flip(self, p: Pending) -> None:
        """A failed command whose states all arrived after all: it is done."""
        done, offline = self._outcome(p)
        if done:
            p.flippable = False
            p.offline = offline
            self._resolve(p, "confirmed")
            log.info(
                "command '%s' confirmed late, %.0f s after it was sent",
                p.label,
                self.clock() - p.created_at,
            )

    def _evaluate(self, p: Pending, *, how: str = "event") -> None:
        if p.status != "pending" or not p.planned.expectations:
            return
        if any(not o.exec_done for o in p.after):
            return
        done, offline = self._outcome(p)
        if done:
            p.offline = offline
            self._resolve(p, "confirmed")
            log.info(
                "command '%s' confirmed in %.0f s (%s)%s",
                p.label,
                self.clock() - p.created_at,
                how,
                f" for {len(p.radiator_ids) - len(offline)} radiators, {len(offline)} offline"
                if offline
                else "",
            )

    def _outcome(self, p: Pending) -> tuple[bool, tuple[str, ...]]:
        """The verdict radiator by radiator: done when every radiator holds its expected states,
        or every one that does not is unreachable (core:StatusState) while at least one took
        it. Returns (done, the offline radiators that did not take it)."""
        missing = self._missing(p)
        if not missing:
            return True, ()
        offline = self._offline(missing)
        took = any(
            self.house.radiator_for_url(e.device_url) not in missing for e in p.planned.expectations
        )
        if len(offline) == len(missing) and took:
            return True, offline
        return False, offline

    def _missing(self, p: Pending) -> list[str | None]:
        """The radiators (None: a device of no radiator) still missing an expected state."""
        out: list[str | None] = []
        for e in p.planned.expectations:
            if not e.matches(self.house.device_state(e.device_url, e.name)):
                rid = self.house.radiator_for_url(e.device_url)
                if rid not in out:
                    out.append(rid)
        return out

    def _offline(self, rids: list[str | None]) -> tuple[str, ...]:
        return tuple(
            r
            for r in rids
            if r is not None
            and r in self.house.radiators
            and self.house.radiators[r].reachable is False
        )

    def _resolve(
        self,
        p: Pending,
        status: Status,
        code: str | None = None,
        *,
        reason_code: str | None = None,
        detail_reason: str | None = None,
        **params: Any,
    ) -> None:
        """`params` go to the API as `error_params`; `detail_reason` (scrubbed gateway text) only
        into the French `error` (kelvin.errors.DETAIL_ONLY)."""
        p.status = status
        p.error_code = code
        p.error_params = params
        p.reason_code = reason_code
        shown = params if detail_reason is None else params | {"reason": detail_reason}
        p.error = french(code, shown) if code else None
        self._pending.pop(p.id, None)
        self._recent.pop(p.id, None)
        self._recent[p.id] = (self.clock(), p)
        self._prune_recent()
        if status != "superseded":
            p.after.clear()
        self.on_update(p)
