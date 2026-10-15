"""Setup writes (spec §2.7): one pending per user action, done only when Cozytouch says so.

A step is one Overkiz write. It is confirmed by its event (a DeviceUpdate with the wanted place
or label; a place event carrying its oid) or by a targeted re-read of that one place or device
at +5, +15 and +30 s; a place event without payload asks for the read at once. A deleted place
is confirmed by a 404. A confirmed step is applied to the house at once. Nothing confirms
within 60 s of the last write → failed (« Pas de confirmation de Cozytouch »). The whole place
tree is never read here (ruling 8): full reads belong to the pump and SetupRefresher.
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any, Literal
from uuid import uuid4

from kelvin.errors import UserError, french, gateway_error_code
from kelvin.house.model import House, Radiator, _sub_index
from kelvin.labels import Label
from kelvin.overkiz.errors import GatewayError, SetupNotFoundError
from kelvin.overkiz.gateway import Gateway
from kelvin.overkiz.models import DeviceUpdate, PlaceEvent, SetupEvent, SetupPlace
from kelvin.setup.validate import device_label, room_label

log = logging.getLogger(__name__)

READS_AT = (5.0, 15.0, 30.0)
SETUP_TIMEOUT = 60.0
# Place events this soon after Kelvin's own place write are its echoes. Capped at SETUP_TIMEOUT:
# once a write has timed out, a late event is a fact to read, never swallowed (review T4-1).
ECHO_S = 60.0
RECENT_KEEP = 300.0
MAX_PLACE_LOOKUPS = 5
MISSING_RETRY_S = 600.0  # a place that answered 404 is not looked up again before this

Op = Literal["create", "rename", "delete", "relocate", "label"]
# « unconfirmed »: sent, accepted, but not confirmed within SETUP_TIMEOUT. Not a refusal:
# Cozytouch may still apply it, so the next full read reconciles it (spec §9.1 rule 9).
Status = Literal["sending", "pending", "confirmed", "failed", "unconfirmed"]
PLACE_OPS: dict[str, Op] = {"created": "create", "updated": "rename", "deleted": "delete"}


@dataclass
class Step:
    """One Overkiz write: `target` is a place oid or a device URL ("" until a create returns
    its oid); `want` is the label (create, rename, label) or the place oid (relocate)."""

    op: Op
    target: str
    want: str
    parent: str | None = None
    type_: int | None = None
    sent_at: float | None = None
    reads: int = 0
    read_now: bool = False
    done: bool = False


@dataclass
class SetupPending:
    id: str
    label: Label
    action: str
    room_id: str | None
    radiator_ids: tuple[str, ...]
    steps: list[Step]
    created_at: float
    created_wall: float
    status: Status = "sending"
    last_sent_at: float | None = None
    error: str | None = None  # the French text of error_code, set by _resolve (like Pending)
    error_code: str | None = None
    error_params: dict[str, Any] = field(default_factory=dict)
    reason_code: str | None = None
    # A write was refused part-way (a move): why, once the sent steps are judged.
    refusal: tuple[str, str | None] | None = None

    @property
    def active(self) -> bool:
        return self.status in ("sending", "pending")

    def view(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "kind": "setup",
            "label": self.label.text,
            "label_code": self.label.code,
            "label_params": self.label.params,
            "radiator_ids": list(self.radiator_ids),
            "room_id": self.room_id,
            "status": self.status,
            "error": self.error,
            "error_code": self.error_code,
            "error_params": self.error_params,
            "reason_code": self.reason_code,
            "created_at": self.created_wall,
            "expected": {},
            "progress": {"done": sum(s.done for s in self.steps), "total": len(self.steps)},
        }


class SetupService:
    def __init__(
        self,
        gateway: Gateway,
        house: House,
        *,
        clock: Callable[[], float] = time.monotonic,
        wall: Callable[[], float] = time.time,
        on_update: Callable[[SetupPending], None] | None = None,
    ) -> None:
        self.gateway = gateway
        self.house = house
        self.clock = clock
        self.wall = wall
        self.on_update = on_update or (lambda p: None)
        # Set by the runtime (Task 6): a place change Kelvin did not make; a write settled.
        self.on_outside_change: Callable[[], None] = lambda: None
        self.on_written: Callable[[], None] = lambda: None
        self._pending: dict[str, SetupPending] = {}
        self._recent: dict[str, tuple[float, SetupPending]] = {}
        self._lock = asyncio.Lock()
        self._last_place_write: float | None = None
        self._lookups: set[str] = set()
        # Labels of writes that may have applied (unconfirmed, or a create whose answer was
        # lost): reserved until a full read shows the truth (`reconciled`). Casefolded.
        self._reserved: set[str] = set()
        self._missing: dict[str, float] = {}  # place oid -> when it answered 404

    # --- state ---

    def active(self) -> list[SetupPending]:
        return list(self._pending.values())

    def recent(self) -> list[SetupPending]:
        self._prune_recent()
        return [p for _, p in self._recent.values()]

    @property
    def has_active(self) -> bool:
        return bool(self._pending) or bool(self._lookups)

    def reconciled(self) -> None:
        """A full read was applied to the house: it shows what the unconfirmed writes did."""
        self._reserved.clear()
        self._missing.clear()

    def _reserve(self, p: SetupPending) -> None:
        for st in p.steps:
            if st.op in ("create", "rename") and not st.done:
                self._reserved.add(st.want.casefold())

    def _prune_recent(self) -> None:
        cutoff = self.clock() - RECENT_KEEP
        for pid, (at, _) in list(self._recent.items()):
            if at < cutoff:
                del self._recent[pid]

    def _busy(self, room_ids: set[str], radiator_ids: set[str]) -> None:
        for p in self.active():
            if (
                (p.room_id is not None and p.room_id in room_ids)
                or radiator_ids & set(p.radiator_ids)
                or any(s.op == "relocate" and s.want in room_ids for s in p.steps)
            ):
                raise UserError("setup_busy", 409)

    def _room_labels(self, except_oid: str | None = None) -> list[str]:
        labels = [
            p.label
            for oid, p in self.house.places.items()
            if oid not in (self.house.root_oid, except_oid)
        ]
        labels += [
            s.want
            for p in self.active()
            for s in p.steps
            if s.op in ("create", "rename") and s.target != except_oid
        ]
        labels += list(self._reserved)
        return labels

    def _new(
        self,
        action: str,
        label: Label,
        room_id: str | None,
        radiator_ids: tuple[str, ...],
        steps: list[Step],
    ) -> SetupPending:
        return SetupPending(
            id=uuid4().hex[:12],
            label=label,
            action=action,
            room_id=room_id,
            radiator_ids=radiator_ids,
            steps=steps,
            created_at=self.clock(),
            created_wall=self.wall(),
        )

    # --- room actions ---

    async def create_room(self, raw: str) -> SetupPending:
        label = room_label(raw, self._room_labels())
        type_ = self.house.room_type()
        if type_ is None or self.house.root_oid is None:
            raise UserError("room_type_unknown", 409)
        step = Step("create", "", label, parent=self.house.root_oid, type_=type_)
        p = self._new("create_room", Label.of("setup_room_create", label=label), None, (), [step])
        return await self._run(p)

    async def rename_room(self, oid: str, raw: str) -> SetupPending:
        if oid not in self.house.places:
            raise UserError("room_unknown", 404)
        if oid == self.house.root_oid:
            raise UserError("room_protected", 409)
        label = room_label(raw, self._room_labels(except_oid=oid))
        if label == self.house.places[oid].label.strip():
            raise UserError("nothing_to_change")
        self._busy({oid}, set())
        name = self.house.room_name(oid)
        p = self._new(
            "rename_room",
            Label.of("setup_room_rename", name=name, label=label),
            oid,
            (),
            [Step("rename", oid, label)],
        )
        return await self._run(p)

    async def delete_room(self, oid: str) -> SetupPending:
        # One literal code per raise: tests/test_error_codes.py reads them (and refuses **params).
        block = self.house.delete_block(oid)
        if block == "room_unknown":
            raise UserError("room_unknown", 404)
        if block == "room_protected":
            raise UserError("room_protected", 409)
        if block == "room_not_empty":
            raise UserError("room_not_empty", 409, count=len(self.house.devices_in(oid)))
        self._busy({oid}, set())
        name = self.house.room_name(oid)
        p = self._new(
            "delete_room",
            Label.of("setup_room_delete", name=name),
            oid,
            (),
            [Step("delete", oid, "")],
        )
        return await self._run(p)

    # --- radiator actions ---

    def _radiator(self, rid: str) -> Radiator:
        r = self.house.radiators.get(rid)
        if r is None:
            raise UserError("radiator_unknown", 404)
        return r

    async def move_radiator(self, rid: str, room_id: str) -> SetupPending:
        """Relocate every sub-device, then the heater: the room changes once all is there."""
        r = self._radiator(rid)
        if room_id == self.house.root_oid:
            raise UserError("room_protected", 409)
        if room_id not in self.house.places:
            raise UserError("room_unknown", 404)
        urls = sorted((u for u in r.states if u != r.heater_url), key=_sub_index)
        steps = []
        for url in [*urls, r.heater_url]:
            meta = self.house.meta.get(url)
            steps.append(
                Step("relocate", url, room_id, done=meta is not None and meta.place_oid == room_id)
            )
        if all(s.done for s in steps):
            raise UserError("radiator_in_room", 409)
        self._busy({room_id, r.room_id}, {rid})
        label = Label.of("setup_move", name=r.name, room=self.house.room_name(room_id))
        return await self._run(self._new("move", label, room_id, (rid,), steps))

    async def rename_radiator(self, rid: str, raw: str) -> SetupPending:
        """Set the heater's Cozytouch label (ruling 4); no device command."""
        r = self._radiator(rid)
        label = device_label(raw)
        if label == r.label.strip():  # the Cozytouch label, not the name shown
            raise UserError("nothing_to_change")
        self._busy(set(), {rid})
        p = self._new(
            "rename_radiator",
            Label.of("setup_rename_device", name=r.name, label=label),
            None,
            (rid,),
            [Step("label", r.heater_url, label)],
        )
        return await self._run(p)

    async def tidy(self, device_id: str) -> SetupPending:
        """« Ranger avec le radiateur »: a sub-device back in its heater's place."""
        url = self.house.device_url_for(device_id)
        rid = self.house.radiator_for_url(url) if url else None
        if url is None or rid is None:
            raise UserError("device_unknown", 404)
        r = self.house.radiators[rid]
        heater_meta = self.house.meta.get(r.heater_url)
        place = heater_meta.place_oid if heater_meta else None
        if place is None or place not in self.house.places:
            raise UserError("room_unknown", 404)  # the heater is in a place Kelvin does not know
        if self.house.meta[url].place_oid == place:
            raise UserError("device_in_place", 409)
        self._busy({place}, {rid})
        p = self._new(
            "tidy",
            Label.of("setup_tidy", name=r.name),
            place,
            (rid,),
            [Step("relocate", url, place)],
        )
        return await self._run(p)

    # --- sending ---

    async def _write(self, p: SetupPending, s: Step) -> None:
        g = self.gateway
        if s.op == "create":
            assert s.parent is not None and s.type_ is not None
            s.target = await g.create_place(s.parent, s.want, s.type_)
            p.room_id = s.target
        elif s.op == "rename":
            current = await g.read_place(s.target)  # send type and metadata back unchanged
            await g.update_place(s.target, s.want, current.type, current.metadata)
        elif s.op == "delete":
            await g.delete_place(s.target)
        elif s.op == "relocate":
            await g.relocate_device(s.target, s.want)
        else:
            await g.rename_device(s.target, s.want)

    async def _run(self, p: SetupPending) -> SetupPending:
        self._pending[p.id] = p
        self.on_update(p)
        refusal: tuple[str, str | None] | None = None
        lost: Step | None = None  # a create whose answer was lost: it may have applied
        try:
            async with self._lock:  # one setup write at a time
                for s in p.steps:
                    if s.done:  # already where it should be (a retried move)
                        continue
                    try:
                        await self._write(p, s)
                    except SetupNotFoundError:
                        refusal = ("setup_not_found", None)
                        break
                    except GatewayError as e:
                        refusal = ("setup_failed", gateway_error_code(e))
                        if s.op == "create" and refusal[1] == "network":
                            lost = s
                        break
                    s.sent_at = self.clock()
                    p.last_sent_at = s.sent_at
                    if s.op in ("create", "rename", "delete"):
                        self._last_place_write = s.sent_at
        except BaseException:
            if p.active:
                self._resolve(p, "failed", "setup_failed", reason_code="unknown")
            raise
        if p.last_sent_at is None:  # nothing was accepted
            code, reason = refusal or ("setup_failed", "unknown")
            if lost is not None:
                # A timeout or a dropped connection can hide a create that reached Cozytouch:
                # keep the label until a full read says, and ask for that read.
                self._reserved.add(lost.want.casefold())
            self._resolve(p, "failed", code, reason_code=reason)
            if lost is not None:
                self.on_written()
            return p
        p.refusal = refusal
        p.status = "pending"
        self.on_update(p)
        self._judge(p)
        return p

    # --- confirming ---

    def _judge(self, p: SetupPending) -> None:
        if not p.active:
            return
        sent = [s for s in p.steps if s.sent_at is not None]
        if not sent or not all(s.done for s in sent):
            return
        if p.refusal is None and all(s.done for s in p.steps):
            self._resolve(p, "confirmed")
            return
        code, reason = p.refusal or ("setup_failed", None)
        if len(p.steps) > 1 and any(s.done for s in p.steps):
            done = sum(s.done for s in p.steps)
            self._resolve(
                p,
                "failed",
                "setup_move_partial",
                reason_code=reason,
                done=done,
                total=len(p.steps),
            )
        else:
            self._resolve(p, "failed", code, reason_code=reason)

    def _resolve(
        self,
        p: SetupPending,
        status: Status,
        code: str | None = None,
        *,
        reason_code: str | None = None,
        **params: Any,
    ) -> None:
        """`params` go to the API as `error_params` (keys and figures only: the AST guard in
        tests/test_error_codes.py reads them at every call)."""
        p.status = status
        p.error_code = code
        p.error_params = params
        p.reason_code = reason_code
        p.error = french(code, params) if code else None
        self._pending.pop(p.id, None)
        self._recent[p.id] = (self.clock(), p)
        self._prune_recent()
        self.on_update(p)
        if p.last_sent_at is not None:  # something reached Cozytouch: the refresher checks
            self.on_written()

    def _recent_place_write(self) -> bool:
        return self._last_place_write is not None and (
            self.clock() - self._last_place_write < ECHO_S
        )

    def on_event(self, ev: SetupEvent) -> bool:
        """Apply a setup event from the listener. True when the house layout changed."""
        if isinstance(ev, DeviceUpdate):
            changed = self.house.apply_device_update(ev)
            for p in self.active():
                for s in p.steps:
                    if s.sent_at is None or s.done or s.target != ev.device_url:
                        continue
                    if (s.op == "relocate" and ev.place_oid == s.want) or (
                        s.op == "label" and ev.label == s.want
                    ):
                        s.done = True
                self._judge(p)
            self._lookups |= self.house.unknown_places()
            return changed
        return self._on_place_event(ev)

    def _on_place_event(self, ev: PlaceEvent) -> bool:
        op = PLACE_OPS[ev.kind]
        changed = matched = False
        for p in self.active():
            for s in p.steps:
                if s.op != op or s.sent_at is None or s.done:
                    continue
                if ev.place_oid is None:
                    s.read_now = True  # which place it is: ask Cozytouch now
                    matched = True
                elif ev.place_oid == s.target:
                    matched = True
                    if op == "delete":
                        s.done = True
                        changed |= self.house.remove_place(s.target)
                    elif ev.label == s.want:
                        s.done = True
                        changed |= self.house.put_place(
                            SetupPlace(s.target, s.want, s.type_), s.parent
                        )
            self._judge(p)
        if matched:
            return changed
        if ev.place_oid is not None:  # a payload says exactly what changed: no read needed
            if ev.kind == "deleted":
                return self.house.remove_place(ev.place_oid)
            old = self.house.places.get(ev.place_oid)
            return self.house.put_place(
                SetupPlace(ev.place_oid, ev.label or "", old.type if old else None)
            )
        if not self._recent_place_write():
            self.on_outside_change()
        return False

    async def _confirm_by_read(self, s: Step) -> bool:
        g = self.gateway
        if s.op in ("create", "rename"):
            try:
                place = await g.read_place(s.target)
            except SetupNotFoundError:
                if s.op == "create":
                    return False  # not there yet
                raise
            if place.label != s.want:
                return False
            s.done = True
            return self.house.put_place(place, s.parent)
        if s.op == "delete":
            try:
                await g.read_place(s.target)
            except SetupNotFoundError:
                s.done = True
                return self.house.remove_place(s.target)
            return False
        dev = await g.read_device(s.target)
        if (s.op == "relocate" and dev.place_oid == s.want) or (
            s.op == "label" and dev.label == s.want
        ):
            s.done = True
            return self.house.apply_device_update(
                DeviceUpdate(dev.device_url, dev.place_oid, dev.label)
            )
        return False

    async def tick(self) -> bool:
        """Due re-reads, unknown places, timeouts. True when the house layout changed."""
        changed = False
        for p in self.active():
            now = self.clock()
            for s in p.steps:
                if s.sent_at is None or s.done or s.reads >= len(READS_AT):
                    continue
                if not (s.read_now or now >= s.sent_at + READS_AT[s.reads]):
                    continue
                s.reads += 1
                s.read_now = False
                try:
                    changed |= await self._confirm_by_read(s)
                except SetupNotFoundError:
                    self._resolve(p, "failed", "setup_not_found")
                    break
                except GatewayError as e:
                    log.info("setup re-read failed (%s)", type(e).__name__)
            self._judge(p)
        changed |= await self._lookup_places()
        self._timeouts()
        return changed

    async def _lookup_places(self) -> bool:
        """A device moved (in the app) to a place Kelvin does not know: read that one place."""
        changed = False
        for oid in sorted(self._lookups)[:MAX_PLACE_LOOKUPS]:
            self._lookups.discard(oid)
            seen = self._missing.get(oid)
            if seen is not None and self.clock() - seen < MISSING_RETRY_S:
                continue
            try:
                place = await self.gateway.read_place(oid)
            except SetupNotFoundError:
                self._missing[oid] = self.clock()
                continue
            except GatewayError:
                self.on_outside_change()  # the next full read will bring it
                continue
            changed |= self.house.put_place(place)
        return changed

    def _timeouts(self) -> None:
        now = self.clock()
        for p in self.active():
            if p.status != "pending" or p.last_sent_at is None:
                continue
            if now - p.last_sent_at < SETUP_TIMEOUT:
                continue
            # Sent and accepted, not confirmed: not a refusal. Its labels stay reserved and
            # the refresher's next full read reconciles it (`on_written` via _resolve).
            self._reserve(p)
            self._resolve(
                p,
                "unconfirmed",
                "setup_no_confirmation",
                reason_code=p.refusal[1] if p.refusal else None,
            )
