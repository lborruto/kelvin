"""Reads shared by the REST routes and the MCP tools: one implementation each (Plan 13)."""

from __future__ import annotations

from typing import Any

from kelvin.api.runtime import Runtime
from kelvin.errors import UserError
from kelvin.house.model import Radiator
from kelvin.linky.service import LinkyService
from kelvin.recorder.activity import (
    DUTY_WINDOW_S,
    STEP,
    radiator_duty,
    room_duty,
    runs,
    union,
)


def radiator(rt: Runtime, rid: str) -> Radiator:
    r = rt.house.radiators.get(rid)
    if r is None:
        raise UserError("radiator_unknown", 404)
    return r


def room_radiators(rt: Runtime, room_id: str) -> tuple[str, list[Radiator]]:
    room = rt.house.rooms.get(room_id)
    if room is None:
        raise UserError("room_unknown", 404)
    return room.name, rt.house.room_radiators(room_id)


def linky_of(rt: Runtime) -> LinkyService:
    if rt.linky is None:
        raise UserError("linky_unavailable", 503)
    return rt.linky


def radiator_rooms(rt: Runtime) -> dict[str, str]:
    """The radiators in the house now → their room (what the report's `rooms` argument is)."""
    return {r.id: r.room_id for r in rt.house.radiators.values()}


def rooms_duty(rt: Runtime, end: int, start: int | None = None) -> dict[str, Any]:
    """Each room's share of time heating over [start, end] (spec QW5); by default the 24 h
    before `end`."""
    if start is None:
        start = end - DUTY_WINDOW_S
    samples = rt.recorder.activity_samples(list(rt.house.radiators), start, end)
    out: dict[str, dict] = {}
    for room in rt.house.rooms.values():
        rads = rt.house.room_radiators(room.id)
        per = {
            r.id: radiator_duty(((s[0], s[3]) for s in samples.get(r.id, [])), start, end)
            for r in rads
        }
        out[room.id] = {
            "duty": room_duty(per, {r.id: r.power_w for r in rads}),
            "coverage": min((c for _, c in per.values()), default=0.0),
        }
    return {"from": start, "to": end, "rooms": out}


def room_activity(rt: Runtime, ids: list[str], a: int, z: int) -> dict[str, Any]:
    """Window-open and presence runs of these radiators over [a, z] (spec QW4)."""
    samples = rt.recorder.activity_samples(ids, a, z)
    window: list[dict] = []
    presence: list[dict] = []
    for rows in samples.values():
        window += runs(((s[0], s[1]) for s in rows), a, z)
        presence += runs(((s[0], s[2]) for s in rows), a, z)
    return {"step": STEP, "window": union(window), "presence": union(presence)}
