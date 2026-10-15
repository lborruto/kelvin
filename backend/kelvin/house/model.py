from __future__ import annotations

import copy
import json
import re
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from statistics import mean
from typing import Any, Literal

from kelvin.overkiz.models import RawDevice, RawPlace, StateChange, iter_places

MODES = {"standby": "off", "basic": "manual", "internal": "program"}
OVERKIZ_MODES = {v: k for k, v in MODES.items()}
ROLE_BY_WIDGET = {
    "TemperatureSensor": "temperature",
    "ContactSensor": "window",
    "OccupancySensor": "occupancy",
    "CumulativeElectricPowerConsumptionSensor": "energy",
    "DimmerLight": "light",
}
DAY_ORDER = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")
STATUS = "core:StatusState"


@dataclass(frozen=True)
class StatusSeen:
    """A `core:StatusState` value and since when Kelvin has observed it.

    `known_start` is False when the value was already there at startup: Kelvin does not know
    when it began, only that it has lasted at least since `since`."""

    value: Any
    since: float
    known_start: bool


@dataclass
class Signal:
    """What Kelvin learned from the event stream, kept in memory (spec QW3)."""

    wall: Callable[[], float] = time.time
    last_event_ts: dict[str, float] = field(default_factory=dict)
    status_seen: dict[str, StatusSeen] = field(default_factory=dict)


def base_url(device_url: str) -> str:
    return device_url.split("#", 1)[0]


def radiator_id(device_url: str) -> str:
    return base_url(device_url).rsplit("/", 1)[-1]


def _num(v: Any) -> float | None:
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


EMPTY_SLOT = {"start": "00:00", "end": "00:00"}
_HHMM = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")
LockReason = Literal["midnight", "unrecognised"]


def _minutes(hhmm: str) -> int:
    return int(hhmm[:2]) * 60 + int(hhmm[3:])


def parse_day(slots: Any) -> tuple[list[dict[str, str]] | None, LockReason | None]:
    """One day of `core:TimeProgramState` → (comfort slots sorted by start, lock).

    `00:00–00:00` is the device's empty marker. `X–00:00` with X ≠ 00:00 reads as « until
    midnight » (`24:00`, ruling 3) and locks the day: nothing ever wrote one, so Kelvin shows it
    but never edits it. Anything else Kelvin cannot read whole locks the day as unrecognised
    (slots None): it is shown as such and re-sent exactly as read (spec QW8). So does a readable
    day not in the exact shape Kelvin writes (its slots sorted, `start` then `end`, then empty
    markers, three entries): a send would rewrite what Kelvin did not write (ruling, B2)."""
    if not isinstance(slots, list):
        return None, "unrecognised"
    parsed: list[tuple[int, int, dict[str, str]]] = []
    midnight = False
    for s in slots:
        if not (
            isinstance(s, dict)
            and set(s) == {"start", "end"}
            and all(isinstance(s[k], str) and _HHMM.match(s[k]) for k in ("start", "end"))
        ):
            return None, "unrecognised"
        if s == EMPTY_SLOT:
            continue
        a, b, end = _minutes(s["start"]), _minutes(s["end"]), s["end"]
        if b == 0:
            b, end, midnight = 1440, "24:00", True
        if a >= b:
            return None, "unrecognised"
        parsed.append((a, b, {"start": s["start"], "end": end}))
    parsed.sort(key=lambda p: p[0])
    if len(parsed) > 3 or any(y[0] < x[1] for x, y in zip(parsed, parsed[1:], strict=False)):
        return None, "unrecognised"
    written = [{"start": s["start"], "end": s["end"]} for s in slots if s != EMPTY_SLOT]
    canonical = sorted(written, key=lambda s: _minutes(s["start"]))
    canonical += [dict(EMPTY_SLOT) for _ in range(3 - len(canonical))]
    if json.dumps(slots) != json.dumps(canonical):
        return None, "unrecognised"
    return [p[2] for p in parsed], ("midnight" if midnight else None)


def parse_program(value: Any) -> tuple[dict[str, list[dict[str, str]]], dict[str, LockReason]]:
    """Overkiz TimeProgramState (a list of one-key dicts) → (readable days, locked days)."""
    if not isinstance(value, list):
        return {}, {}
    program: dict[str, list[dict[str, str]]] = {}
    locked: dict[str, LockReason] = {}
    for entry in value:
        if not isinstance(entry, dict):
            continue
        for day, slots in entry.items():
            if day not in DAY_ORDER:
                continue
            parsed, lock = parse_day(slots)
            program.pop(day, None)
            locked.pop(day, None)
            if parsed is not None:
                program[day] = parsed
            if lock is not None:
                locked[day] = lock
    order = {d: i for i, d in enumerate(DAY_ORDER)}
    return (
        dict(sorted(program.items(), key=lambda kv: order[kv[0]])),
        dict(sorted(locked.items(), key=lambda kv: order[kv[0]])),
    )


def program_from_state(value: Any) -> dict[str, list[dict[str, str]]]:
    return parse_program(value)[0]


@dataclass
class Radiator:
    id: str
    room_id: str
    heater_url: str
    urls: dict[str, str]
    states: dict[str, dict[str, Any]]
    commands: dict[str, list[str]] = field(default_factory=dict)
    signal: Signal | None = field(default=None, repr=False, compare=False)

    def get(self, role: str, name: str, default: Any = None) -> Any:
        url = self.urls.get(role)
        if url is None:
            return default
        return self.states.get(url, {}).get(name, default)

    @property
    def name(self) -> str:
        return self.get("heater", "core:NameState") or "Radiateur"

    @property
    def model(self) -> str | None:
        return self.get("heater", "io:ModelState")

    @property
    def power_w(self) -> int | None:
        v = _num(self.get("heater", "io:PowerState"))
        return int(v) if v is not None else None

    @property
    def temperature(self) -> float | None:
        return _num(self.get("temperature", "core:TemperatureState"))

    @property
    def mode(self) -> str:
        return MODES.get(self.get("heater", "core:OperatingModeState"), "other")

    @property
    def target(self) -> float | None:
        return _num(self.get("heater", "core:TargetTemperatureState"))

    @property
    def comfort(self) -> float | None:
        return _num(self.get("heater", "core:ComfortRoomTemperatureState"))

    @property
    def eco_delta(self) -> float | None:
        return _num(self.get("heater", "core:EcoRoomTemperatureState"))

    @property
    def eco(self) -> float | None:
        if self.comfort is None or self.eco_delta is None:
            return None
        return self.comfort - self.eco_delta

    @property
    def effective_setpoint(self) -> float | None:
        return _num(self.get("heater", "io:EffectiveTemperatureSetpointState"))

    @property
    def heating_level(self) -> str | None:
        return self.get("heater", "io:TargetHeatingLevelState")

    @property
    def max_temperature(self) -> float:
        return _num(self.get("heater", "core:MaximumHeatingTargetTemperatureState")) or 28.0

    @property
    def window_open(self) -> bool | None:
        v = self.get("window", "core:ContactState")
        return None if v is None else v == "open"

    @property
    def occupied(self) -> bool | None:
        v = self.get("occupancy", "core:OccupancyState")
        return None if v is None else v == "personInside"

    @property
    def window_detection(self) -> bool:
        return self.get("heater", "core:OpenWindowDetectionActivationState") == "active"

    @property
    def presence_detection(self) -> bool:
        return self.get("heater", "core:OccupancyActivationState") == "active"

    @property
    def light_on(self) -> bool | None:
        v = self.get("light", "core:OnOffState")
        return None if v is None else v == "on"

    @property
    def light_intensity(self) -> int | None:
        v = _num(self.get("light", "core:LightIntensityState"))
        return int(v) if v is not None else None

    @property
    def energy_wh(self) -> dict[str, float | None] | None:
        """Lifetime counters in Wh. An absent register is None, never 0 (audit H1)."""
        total = _num(self.get("energy", "core:ElectricEnergyConsumptionState"))
        if total is None:
            return None
        return {
            "total": total,
            "t1": _num(self.get("energy", "core:ConsumptionTariff1State")),
            "t2": _num(self.get("energy", "core:ConsumptionTariff2State")),
        }

    @property
    def working_rate(self) -> float | None:
        return _num(self.get("heater", "io:CurrentWorkingRateState"))

    @property
    def rssi(self) -> float | None:
        return _num(self.get("heater", "core:RSSILevelState"))

    @property
    def program(self) -> dict[str, list[dict[str, str]]]:
        return parse_program(self.get("heater", "core:TimeProgramState"))[0]

    @property
    def program_locked(self) -> dict[str, LockReason]:
        return parse_program(self.get("heater", "core:TimeProgramState"))[1]

    def raw_day(self, day: str) -> dict[str, Any] | None:
        """That day's entry exactly as the radiator reported it (re-sent for a locked day)."""
        value = self.get("heater", "core:TimeProgramState")
        found = None
        if isinstance(value, list):
            for entry in value:
                if isinstance(entry, dict) and day in entry:
                    found = {day: copy.deepcopy(entry[day])}
        return found

    @property
    def reachable(self) -> bool | None:
        # Only these two values are known; anything else is unknown (null), not unreachable.
        return {"available": True, "unavailable": False}.get(self.get("heater", STATUS))

    @property
    def unreachable_since(self) -> float | None:
        if self.reachable is not False or self.signal is None:
            return None
        seen = self.signal.status_seen.get(self.heater_url)
        return seen.since if seen is not None and seen.known_start else None

    @property
    def last_event_at(self) -> float | None:
        if self.signal is None:
            return None
        times = [
            self.signal.last_event_ts[u] for u in self.states if u in self.signal.last_event_ts
        ]
        return max(times) if times else None

    def view(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "room_id": self.room_id,
            "name": self.name,
            "model": self.model,
            "power_w": self.power_w,
            "temperature": self.temperature,
            "mode": self.mode,
            "target": self.target,
            "comfort": self.comfort,
            "eco_delta": self.eco_delta,
            "eco": self.eco,
            "effective_setpoint": self.effective_setpoint,
            "heating_level": self.heating_level,
            "max_temperature": self.max_temperature,
            "window_open": self.window_open,
            "occupied": self.occupied,
            "window_detection": self.window_detection,
            "presence_detection": self.presence_detection,
            "light": None
            if self.light_on is None
            else {"on": self.light_on, "intensity": self.light_intensity},
            "energy_wh": self.energy_wh,
            "working_rate": self.working_rate,
            "rssi": self.rssi,
            "reachable": self.reachable,
            "unreachable_since": self.unreachable_since,
            "last_event_at": self.last_event_at,
            "program": self.program,
            "program_locked": self.program_locked,
        }


@dataclass
class Room:
    id: str
    name: str
    radiator_ids: list[str]


def _common(values: list[Any], mixed: Any = None) -> Any:
    present = [v for v in values if v is not None]
    if not present:
        return None
    return present[0] if all(v == present[0] for v in present) else mixed


def _presence(values: list[bool | None]) -> bool | None:
    """Detected if any radiator reports presence; None when none reports the sensor."""
    present = [v for v in values if v is not None]
    return any(present) if present else None


class House:
    def __init__(
        self,
        rooms: list[Room],
        radiators: dict[str, Radiator],
        *,
        wall: Callable[[], float] = time.time,
    ) -> None:
        self.rooms: dict[str, Room] = {r.id: r for r in rooms}
        self.radiators = radiators
        self._by_url: dict[str, str] = {
            url: rid for rid, r in radiators.items() for url in r.states
        }
        self.signal = Signal(wall)
        now = wall()
        for r in radiators.values():
            r.signal = self.signal
            for url, states in r.states.items():
                if STATUS in states:
                    self.signal.status_seen[url] = StatusSeen(states[STATUS], now, False)

    @property
    def last_event_ts(self) -> dict[str, float]:
        """Device URL → wall time of its last state event (memory only; Plan 8b reads it)."""
        return self.signal.last_event_ts

    def _track_status(self, device_url: str, value: Any) -> None:
        seen = self.signal.status_seen.get(device_url)
        if seen is None or seen.value != value:
            self.signal.status_seen[device_url] = StatusSeen(value, self.signal.wall(), True)

    def backdate_status(self, since: dict[str, float]) -> None:
        """Simulator only: the demo outage began before Kelvin started."""
        for url, t in since.items():
            seen = self.signal.status_seen.get(url)
            if seen is not None:
                self.signal.status_seen[url] = StatusSeen(seen.value, t, True)

    def unreachable_for(self, rid: str, now: float) -> float | None:
        r = self.radiators.get(rid)
        if r is None or r.reachable is not False:
            return None
        seen = self.signal.status_seen.get(r.heater_url)
        return None if seen is None else max(0.0, now - seen.since)

    def room_radiators(self, room_id: str) -> list[Radiator]:
        return [self.radiators[i] for i in self.rooms[room_id].radiator_ids]

    def radiator_for_url(self, device_url: str) -> str | None:
        return self._by_url.get(device_url)

    def device_state(self, device_url: str, name: str) -> Any:
        rid = self._by_url.get(device_url)
        if rid is None:
            return None
        return self.radiators[rid].states.get(device_url, {}).get(name)

    def apply(self, change: StateChange, *, event: bool = True) -> str | None:
        """Apply one state. `event` marks a listener event: it counts as a sign of life and
        returns the radiator id even when the value did not change (its `last_event_at` moved).
        Reads (startup, resync, per-device state reads) pass event=False."""
        rid = self._by_url.get(change.device_url)
        if rid is None:
            return None
        if event:
            self.signal.last_event_ts[change.device_url] = self.signal.wall()
        if change.name == STATUS:
            self._track_status(change.device_url, change.value)
        states = self.radiators[rid].states.setdefault(change.device_url, {})
        if change.name in states and states[change.name] == change.value:
            return rid if event else None
        states[change.name] = change.value
        return rid

    def reload(self, devices: list[RawDevice]) -> set[str]:
        changed: set[str] = set()
        for d in devices:
            rid = self._by_url.get(d.device_url)
            if rid is None:
                continue
            states = self.radiators[rid].states.get(d.device_url, {})
            for name in [n for n in states if n not in d.states]:
                del states[name]
                if name == STATUS:
                    self.signal.status_seen.pop(d.device_url, None)
                changed.add(rid)
            for name, value in d.states.items():
                changed_rid = self.apply(StateChange(d.device_url, name, value), event=False)
                if changed_rid:
                    changed.add(changed_rid)
        return changed

    def device_urls(self) -> list[str]:
        return sorted(self._by_url)

    def reload_device(self, device_url: str, states: dict[str, Any]) -> set[str]:
        """Replace one device's states with a fresh read (`GET /setup/devices/{url}/states`)."""
        return self.reload([RawDevice(device_url, "", "", None, states)])

    def room_view(self, room_id: str) -> dict[str, Any]:
        room = self.rooms[room_id]
        rads = self.room_radiators(room_id)
        temps = [r.temperature for r in rads if r.temperature is not None]
        return {
            "id": room.id,
            "name": room.name,
            "radiator_ids": list(room.radiator_ids),
            "temperature": round(mean(temps), 1) if temps else None,
            "mode": _common([r.mode for r in rads], "mixed"),
            "target": _common([r.target for r in rads]),
            "comfort": _common([r.comfort for r in rads]),
            "eco": _common([r.eco for r in rads]),
            "effective_setpoint": _common([r.effective_setpoint for r in rads]),
            "heating_level": _common([r.heating_level for r in rads], "mixed"),
            "window_open": any(r.window_open for r in rads),
            "occupied": any(r.occupied for r in rads),
            "presence": _presence([r.occupied for r in rads]),
        }

    def view(self) -> dict[str, Any]:
        return {
            "rooms": [self.room_view(rid) for rid in self.rooms],
            "radiators": [r.view() for r in self.radiators.values()],
        }


def build_house(
    root: RawPlace, devices: list[RawDevice], *, wall: Callable[[], float] = time.time
) -> House:
    groups: dict[str, list[RawDevice]] = {}
    for d in devices:
        groups.setdefault(base_url(d.device_url), []).append(d)
    places = list(iter_places(root))
    labels = {p.oid: p.label.strip() for p in places}

    radiators: dict[str, Radiator] = {}
    for devs in groups.values():
        heater = next((d for d in devs if "Heater" in d.widget), None)
        if heater is None:
            continue
        urls = {"heater": heater.device_url}
        for d in devs:
            role = ROLE_BY_WIDGET.get(d.widget)
            if role:
                urls[role] = d.device_url
        rid = radiator_id(heater.device_url)
        radiators[rid] = Radiator(
            id=rid,
            room_id=heater.place_oid if heater.place_oid in labels else root.oid,
            heater_url=heater.device_url,
            urls=urls,
            states={d.device_url: dict(d.states) for d in devs},
            commands={d.device_url: list(d.commands) for d in devs},
        )

    rooms = []
    for p in places:
        rids = sorted(rid for rid, r in radiators.items() if r.room_id == p.oid)
        if rids:
            name = "Maison" if p.oid == root.oid else labels[p.oid]
            rooms.append(Room(id=p.oid, name=name, radiator_ids=rids))
    return House(rooms, radiators, wall=wall)
