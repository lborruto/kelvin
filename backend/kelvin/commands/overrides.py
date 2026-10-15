"""Kelvin-managed temporary overrides: boost (a room) and away (the house). Spec §4."""

from __future__ import annotations

import asyncio
import json
import logging
import time
from collections.abc import Callable
from dataclasses import asdict, dataclass, field, fields
from typing import Any, Literal
from uuid import uuid4

from kelvin.commands.service import CommandService, Pending
from kelvin.commands.translate import CommandError, Planned, plan_mode, plan_setpoint
from kelvin.house.model import MODES, House, Radiator
from kelvin.labels import Label
from kelvin.recorder.db import Database

log = logging.getLogger(__name__)

Kind = Literal["boost", "away"]
RESTORABLE_MODES = ("off", "manual", "program")
# How long past ends_at a radiator whose state is not loaded may hold up its restore.
UNLOADED_WAIT = 3600.0
# A restore the device did not confirm is retried after 30 s, then 1, 2, 4… min, at most every
# 30 min: a dead radiator must not cost one Overkiz execution per tick forever.
RESTORE_RETRY_FIRST_S = 30.0
RESTORE_RETRY_MAX_S = 1800.0


def restore_retry_delay(failures: int) -> float:
    return min(RESTORE_RETRY_FIRST_S * 2 ** (failures - 1), RESTORE_RETRY_MAX_S)


@dataclass
class Override:
    id: str
    kind: Kind
    radiator_ids: list[str]
    temperature: float
    ends_at: float
    previous: dict[str, dict[str, Any]] = field(default_factory=dict)
    room_id: str | None = None
    created_at: float = 0.0
    # Ended (expired or cancelled); kept until the restore is confirmed by the device.
    restoring: bool = False

    def view(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "kind": self.kind,
            "room_id": self.room_id,
            "radiator_ids": list(self.radiator_ids),
            "temperature": self.temperature,
            "ends_at": self.ends_at,
            "restoring": self.restoring,
        }

    @classmethod
    def from_payload(cls, payload: str) -> Override:
        """Parse a stored row; unknown keys are ignored, anything malformed raises."""
        data = json.loads(payload)
        if not isinstance(data, dict):
            raise ValueError("payload is not an object")
        names = {f.name for f in fields(cls)}
        o = cls(**{k: v for k, v in data.items() if k in names})
        if not isinstance(o.id, str) or o.kind not in ("boost", "away"):
            raise ValueError("bad id or kind")
        if not isinstance(o.radiator_ids, list) or not all(
            isinstance(i, str) for i in o.radiator_ids
        ):
            raise ValueError("bad radiator_ids")
        if not isinstance(o.previous, dict) or not all(
            isinstance(v, dict) for v in o.previous.values()
        ):
            raise ValueError("bad previous")
        if o.room_id is not None and not isinstance(o.room_id, str):
            raise ValueError("bad room_id")
        o.temperature = float(o.temperature)
        o.ends_at = float(o.ends_at)
        o.created_at = float(o.created_at)
        o.restoring = bool(o.restoring)
        return o


class OverrideManager:
    def __init__(
        self,
        db: Database,
        house: House,
        commands: CommandService,
        *,
        wall: Callable[[], float] = time.time,
        is_connected: Callable[[], bool] = lambda: True,
    ) -> None:
        self.db = db
        self.house = house
        self.commands = commands
        self.wall = wall
        self.is_connected = is_connected
        # start/cancel/tick read state, await a submit, then write state: serialise them.
        self._lock = asyncio.Lock()
        self._restore_pending: dict[str, tuple[Pending, list[str]]] = {}
        # Backoff state is in memory only: after a restart each override gets one immediate
        # retry, then backs off again. Accepted.
        self._failures: dict[str, int] = {}  # override id → consecutive failed restores
        self._retry_at: dict[str, float] = {}  # override id → no restore before this wall time
        self._items: dict[str, Override] = {}
        for row in db.query("SELECT id, payload FROM overrides"):
            try:
                o = Override.from_payload(row["payload"])
            except Exception as e:
                log.warning("skipping unreadable override row %r: %s", row.get("id"), e)
                continue
            self._items[o.id] = o

    def active(self) -> list[dict[str, Any]]:
        self._reap()
        return [o.view() for o in sorted(self._items.values(), key=lambda o: o.ends_at)]

    def _save(self, o: Override) -> None:
        self.db.execute(
            "INSERT OR REPLACE INTO overrides (id, payload) VALUES (?, ?)",
            (o.id, json.dumps(asdict(o))),
        )

    def _delete(self, o: Override) -> None:
        self._items.pop(o.id, None)
        self._restore_pending.pop(o.id, None)
        self._failures.pop(o.id, None)
        self._retry_at.pop(o.id, None)
        self.db.execute("DELETE FROM overrides WHERE id = ?", (o.id,))

    def _drop(self, o: Override, rid: str) -> None:
        if rid in o.radiator_ids:
            o.radiator_ids.remove(rid)
        o.previous.pop(rid, None)

    def _reap(self) -> None:
        """Settle finished restores: confirmed radiators leave the override; failed ones retry
        after a backoff."""
        for oid, (p, rids) in list(self._restore_pending.items()):
            if p.active:
                continue
            del self._restore_pending[oid]
            o = self._items.get(oid)
            if o is None:
                continue
            if p.status != "confirmed":
                if p.status == "failed":
                    n = self._failures.get(oid, 0) + 1
                    self._failures[oid] = n
                    delay = restore_retry_delay(n)
                    self._retry_at[oid] = self.wall() + delay
                    if n >= 3:
                        log.warning(
                            "override %s: restore failed %d times (%s); next try in %d s",
                            oid,
                            n,
                            p.error or "no reason given",
                            int(delay),
                        )
                continue
            self._failures.pop(oid, None)
            self._retry_at.pop(oid, None)
            for rid in rids:
                self._drop(o, rid)
            if o.radiator_ids:
                self._save(o)
            else:
                self._delete(o)

    def _holder(
        self, rid: str, *, kind: Kind | None = None, exclude: str | None = None
    ) -> Override | None:
        for o in self._items.values():
            if o.id != exclude and rid in o.radiator_ids and (kind is None or o.kind == kind):
                return o
        return None

    def _newer_holder(self, o: Override, rid: str) -> Override | None:
        """The next override stacked on top of o for this radiator, if any."""
        newer = [
            x
            for x in self._items.values()
            if x.id != o.id and rid in x.radiator_ids and x.created_at > o.created_at
        ]
        return min(newer, key=lambda x: x.created_at) if newer else None

    def _intended(self, r: Radiator) -> tuple[str, float | None]:
        """Mode and target the radiator is heading to (in-flight expectations, else house)."""
        mode, target = r.mode, r.target
        for p in self.commands.active():
            for e in p.planned.expectations:
                if e.device_url != r.heater_url:
                    continue
                if e.name == "core:OperatingModeState":
                    mode = MODES.get(e.value, "other")
                elif e.name == "core:TargetTemperatureState":
                    target = float(e.value)
        return mode, target

    def _ours(self, o: Override, r: Radiator) -> bool | None:
        """True: still on our setpoint. False: changed by hand. None: state not loaded."""
        mode, target = self._intended(r)
        if mode == "other":
            # A mode Kelvin does not map (e.g. frost set on the panel) is a hand change;
            # a missing mode state means we simply do not know yet.
            return None if r.get("heater", "core:OperatingModeState") is None else False
        if mode == "manual" and target is None:
            return None
        return mode == "manual" and target is not None and abs(target - o.temperature) < 0.01

    def _half_restored(self, r: Radiator, prev: dict[str, Any]) -> bool:
        """A failed restore may have applied the target but not the mode: still ours."""
        mode, target = self._intended(r)
        t = prev.get("target")
        return (
            mode == "manual"
            and prev.get("mode") != "manual"
            and isinstance(t, int | float)
            and target is not None
            and abs(target - t) < 0.01
        )

    def _busy(self, o: Override) -> bool:
        return any(set(p.radiator_ids) & set(o.radiator_ids) for p in self.commands.active())

    def _abandoned(self, o: Override) -> bool:
        """Applied, yet no radiator holds our setpoint any more (all changed by hand).

        Judged only when no command touching it is in flight: that covers our own start
        (not applied yet) and a change that could still fail and leave our setpoint on.
        """
        if self._busy(o):
            return False
        for rid in o.radiator_ids:
            r = self.house.radiators.get(rid)
            if r is None:
                continue
            if self._newer_holder(o, rid) is not None or self._ours(o, r) is not False:
                return False
        return True

    async def start(
        self,
        kind: Kind,
        radiator_ids: list[str],
        temperature: float,
        ends_at: float,
        *,
        label: Label | str,
        room_id: str | None = None,
    ) -> tuple[Override, Pending]:
        async with self._lock:
            return await self._start(kind, radiator_ids, temperature, ends_at, label, room_id)

    async def _start(
        self,
        kind: Kind,
        radiator_ids: list[str],
        temperature: float,
        ends_at: float,
        label: Label | str,
        room_id: str | None,
    ) -> tuple[Override, Pending]:
        ids = list(dict.fromkeys(radiator_ids))
        if not ids:
            raise CommandError("no_radiator")
        for rid in ids:
            if rid not in self.house.radiators:
                raise CommandError("radiator_unknown_id")
        now = self.wall()
        if ends_at <= now:
            raise CommandError("end_in_past")
        self._reap()
        rads = [self.house.radiators[i] for i in ids]
        planned: Planned | None = None
        for r in rads:
            part = plan_mode(r, "manual") + plan_setpoint(r, "manual", temperature)
            planned = part if planned is None else planned + part
        assert planned is not None
        previous: dict[str, dict[str, Any]] = {}
        for r in rads:
            same = self._holder(r.id, kind=kind)
            if same is not None:
                previous[r.id] = dict(same.previous[r.id])
            else:
                mode, target = self._intended(r)
                previous[r.id] = {"mode": mode, "target": target}
        # Strictly increasing so ordering between overlapping overrides is never ambiguous.
        created_at = max([now, *(x.created_at + 1e-6 for x in self._items.values())])
        o = Override(
            id=uuid4().hex[:12],
            kind=kind,
            radiator_ids=ids,
            temperature=float(temperature),
            ends_at=ends_at,
            previous=previous,
            room_id=room_id,
            created_at=created_at,
        )
        pending = await self.commands.submit(label, tuple(ids), planned)
        if pending.status == "failed":
            return o, pending
        for r in rads:
            same = self._holder(r.id, kind=kind)
            if same is not None:
                self._drop(same, r.id)
                if same.radiator_ids:
                    self._save(same)
                else:
                    self._delete(same)
        self._items[o.id] = o
        self._save(o)
        return o, pending

    async def cancel(self, override_id: str) -> Pending | None:
        async with self._lock:
            self._reap()
            o = self._items[override_id]
            rp = self._restore_pending.get(o.id)
            if rp is not None and rp[0].active:
                return rp[0]
            o.ends_at = min(o.ends_at, self.wall())  # due now, so a failed restore is retried
            return await self._restore(o, force=True)

    async def tick(self) -> list[Pending]:
        async with self._lock:
            self._reap()
            out: list[Pending] = []
            now = self.wall()
            for o in sorted(self._items.values(), key=lambda o: o.created_at):
                if o.id not in self._items:
                    continue  # removed while handling an earlier override
                if o.ends_at > now and not o.restoring:
                    if self._abandoned(o):
                        log.info("override %s no longer holds any radiator; dropped", o.id)
                        self._delete(o)
                    continue
                if not self.is_connected():
                    continue
                rp = self._restore_pending.get(o.id)
                if (rp is not None and rp[0].active) or self._busy(o):
                    continue
                if now < self._retry_at.get(o.id, 0.0):
                    continue  # backing off after a failed restore
                p = await self._restore(o, force=False)
                if p is not None:
                    out.append(p)
            return out

    async def _restore(self, o: Override, *, force: bool) -> Pending | None:
        """Send one action putting every radiator still ours back to its previous state.

        The override stays (restoring) until that action is confirmed; radiators whose
        state is not loaded yet stay in it and are retried on later ticks.
        """
        now = self.wall()
        o.restoring = True
        planned: Planned | None = None
        rids: list[str] = []
        for rid in list(o.radiator_ids):
            prev = o.previous.get(rid)
            r = self.house.radiators.get(rid)
            if r is None or prev is None or prev.get("mode") not in RESTORABLE_MODES:
                self._drop(o, rid)
                continue
            newer = self._newer_holder(o, rid)
            if newer is not None:
                # A newer override owns the radiator now: it inherits our saved state.
                newer.previous[rid] = prev
                self._save(newer)
                self._drop(o, rid)
                continue
            if not force:
                ours = self._ours(o, r)
                if ours is None:
                    if now >= o.ends_at + UNLOADED_WAIT:
                        # no radiator id in a log (CLAUDE.md: log no ids)
                        log.warning(
                            "override %s: a radiator's state still unknown; not restored", o.id
                        )
                        self._drop(o, rid)
                    continue
                if not ours and not self._half_restored(r, prev):
                    self._drop(o, rid)  # changed by hand: leave it alone
                    continue
            try:
                part = plan_mode(r, prev["mode"])
            except CommandError:
                self._drop(o, rid)
                continue
            # The device keeps the manual setpoint in every mode: restore it first (I5).
            target = prev.get("target")
            if target is not None:
                try:
                    part = plan_setpoint(r, "manual", target) + part
                except (CommandError, TypeError, ValueError):
                    pass
            planned = part if planned is None else planned + part
            rids.append(rid)
        if not o.radiator_ids:
            self._delete(o)
            return None
        self._save(o)
        if planned is None:
            return None
        label = Label.of("boost_end" if o.kind == "boost" else "away_end")
        p = await self.commands.submit(label, tuple(rids), planned)
        self._restore_pending[o.id] = (p, rids)
        return p
