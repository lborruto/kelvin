"""Send commands and decide when they are really done, from device state (spec §3.3)."""

from __future__ import annotations

import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any, Literal
from uuid import uuid4

from kelvin.commands.translate import Planned
from kelvin.errors import french, gateway_error_code, safe_reason
from kelvin.house.model import MODES, House
from kelvin.labels import Label
from kelvin.overkiz.errors import GatewayError
from kelvin.overkiz.gateway import Gateway
from kelvin.overkiz.models import ExecUpdate, StateChange

EXEC_FAILURE_GRACE = 15.0
CONFIRM_TIMEOUT = 90.0
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
        }


_EXPECTED_KEYS = {
    "core:OperatingModeState": "mode",
    "core:TargetTemperatureState": "target",
    "core:ComfortRoomTemperatureState": "comfort",
    "core:EcoRoomTemperatureState": "eco_delta",
}


def expected_by_radiator(house: House, planned: Planned) -> dict[str, dict[str, Any]]:
    """What the UI may show as 'pending' per radiator: mode/target/comfort/eco_delta."""
    out: dict[str, dict[str, Any]] = {}
    for e in planned.expectations:
        key = _EXPECTED_KEYS.get(e.name)
        rid = house.radiator_for_url(e.device_url)
        if key is None or rid is None:
            continue
        out.setdefault(rid, {})[key] = MODES.get(e.value, "other") if key == "mode" else e.value
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
                    reason=safe_reason(e),
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
        for p in self.active():
            if (change.device_url, change.name) in p.keys:
                self._evaluate(p)

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

    def tick(self) -> None:
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
            if p.status == "pending" and (
                p.exec_failed_at is not None and now - p.exec_failed_at >= EXEC_FAILURE_GRACE
            ):
                self._resolve(p, "failed", "radiator_refused")
            elif now - p.created_at >= CONFIRM_TIMEOUT:
                self._resolve(p, "failed", "no_confirmation")

    def _evaluate(self, p: Pending) -> None:
        if p.status != "pending" or not p.planned.expectations:
            return
        if any(not o.exec_done for o in p.after):
            return
        if all(
            e.matches(self.house.device_state(e.device_url, e.name)) for e in p.planned.expectations
        ):
            self._resolve(p, "confirmed")

    def _resolve(
        self,
        p: Pending,
        status: Status,
        code: str | None = None,
        *,
        reason_code: str | None = None,
        **params: Any,
    ) -> None:
        p.status = status
        p.error_code = code
        p.error_params = params
        p.reason_code = reason_code
        p.error = french(code, params) if code else None
        self._pending.pop(p.id, None)
        self._recent.pop(p.id, None)
        self._recent[p.id] = (self.clock(), p)
        self._prune_recent()
        if status != "superseded":
            p.after.clear()
        self.on_update(p)
