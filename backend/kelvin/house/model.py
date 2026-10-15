from __future__ import annotations

import copy
import json
import re
import time
from collections import Counter
from collections.abc import Callable, Iterator
from dataclasses import dataclass, field
from statistics import mean
from typing import Any, Literal

from kelvin.devices.capabilities import Capabilities, capabilities
from kelvin.devices.registry import (
    APPLIANCE_KINDS,
    PROFILES,
    RADIATOR_KINDS,
    Profile,
    kind_for,
    support_for,
)
from kelvin.overkiz.models import (
    DeviceUpdate,
    RawDevice,
    RawPlace,
    SetupPlace,
    StateChange,
    iter_places,
)
from kelvin.overkiz.servers import DEFAULT_SERVER

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


ROOT_NAME = "Maison"  # the house root shown as a room (the web names it in its own language)
GENERIC_LABEL = re.compile(r"IO \(.*\)")  # Overkiz's default label for a sub-device
BRIDGE_WIDGETS = frozenset({"IOStack", "Pod", "Wifi", "ZigbeeStack"})
# Read-only states the device screen shows (spec "API coverage", Plan 8b), in display order.
DETAIL_STATES = (
    "io:ModelState",
    "core:ManufacturerNameState",
    "io:PowerState",
    "io:TensionState",
    "core:VersionState",
    "io:UptimeState",
    "core:RSSILevelState",
    "core:DiscreteRSSILevelState",
    "internal:SignalStrengthState",
    "core:ConnectivityState",
    "io:RunningState",
    "io:CurrentWorkingRateState",
    "io:MaximumHeatingLevelState",
    "io:CumulatedLoweringState",
    "core:HolidaysModeState",
    "core:DerogatedTargetTemperatureState",
    "io:PeakNoticeState",
    "io:PeakWarningState",
)


@dataclass
class Place:
    oid: str
    label: str
    type: int | None
    parent: str | None


@dataclass
class DeviceMeta:
    device_url: str
    label: str
    widget: str
    place_oid: str | None
    ui_class: str = ""


BRIDGE_ROLES = ("bridge", "box", "wifi")


def device_role(widget: str, heater: bool, ui_class: str = "") -> str:
    if heater:
        return "heater"
    if widget in ROLE_BY_WIDGET:
        return ROLE_BY_WIDGET[widget]
    if widget in ("IOStack", "ZigbeeStack"):
        return "bridge"
    kind = kind_for(widget, ui_class)
    if kind in APPLIANCE_KINDS:
        return kind  # water_heater, heat_pump
    if kind is not None:
        return "heating"  # a heating device that is not a radiator's main device
    return {"Pod": "box", "Wifi": "wifi"}.get(widget, "other")


def _walk(p: RawPlace, parent: str | None = None) -> Iterator[tuple[str | None, RawPlace]]:
    yield parent, p
    for c in p.children:
        yield from _walk(c, p.oid)


def _reachable(states: dict[str, Any]) -> bool | None:
    status = states.get("core:StatusState")
    if status is not None:
        return status == "available"
    connectivity = states.get("core:ConnectivityState")
    if connectivity is not None:
        return connectivity == "online"
    return None


def _details(states: dict[str, Any]) -> dict[str, Any]:
    return {
        k: states[k]
        for k in DETAIL_STATES
        if k in states and isinstance(states[k], str | int | float | bool)
    }


def _sub_index(url: str) -> int:
    tail = url.rsplit("#", 1)[-1]
    return int(tail) if "#" in url and tail.isdigit() else 0


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
    label: str = ""  # the heater's Cozytouch label (spec ruling 4)
    kind: str = "setpoint_heater"  # kelvin.devices.registry kind (Plan 12)
    support: str = "tested"  # tested | expected | experimental | readonly
    values: dict[str, list[str]] = field(default_factory=dict)  # the heater's allowed values

    def get(self, role: str, name: str, default: Any = None) -> Any:
        url = self.urls.get(role)
        if url is None:
            return default
        return self.states.get(url, {}).get(name, default)

    @property
    def profile(self) -> Profile:
        return PROFILES[self.kind]

    @property
    def capabilities(self) -> Capabilities:
        return capabilities(self)

    @property
    def name(self) -> str:
        """The heater's Cozytouch label (ruling 4); `core:NameState` when the label is empty
        or Overkiz's generic « IO (…) »."""
        label = self.label.strip()
        if label and not GENERIC_LABEL.fullmatch(label):
            return label
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
        p = self.profile
        return p.mode_of(self.get("heater", p.mode_state or p.level_state or ""))

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
    def dryer(self) -> str | None:
        """A towel dryer's boost or drying in progress; None otherwise (or unknown)."""
        p = self.profile
        return p.dryer_of(self.get("heater", p.dryer_state)) if p.dryer_state else None

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
            "kind": self.kind,
            "support": self.support,
            "capabilities": self.capabilities.view(),
            "dryer": self.dryer,
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
        self.wall = wall
        self.root_oid: str | None = None
        self.places: dict[str, Place] = {}
        self.meta: dict[str, DeviceMeta] = {}
        self.others: dict[str, dict[str, Any]] = {}  # bridge devices' states (Pod, Wifi, IOStack)
        self.signal = Signal(wall)
        now = wall()
        for r in radiators.values():
            r.signal = self.signal
            for url, states in r.states.items():
                if STATUS in states:
                    self.signal.status_seen[url] = StatusSeen(states[STATUS], now, False)

    @property
    def last_event_ts(self) -> dict[str, float]:
        """Device URL → wall time of its last state event, radiators' and bridges' (memory only;
        the device screen's « Dernier signal »)."""
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
            states = self.others.get(change.device_url)
            if states is not None:  # a bridge device: tracked for the device screen only
                if event:
                    self.last_event_ts[change.device_url] = self.wall()
                states[change.name] = change.value
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

    # --- places and placement (spec §2.7): Cozytouch is the source of truth ---

    def layout_key(self) -> tuple[Any, ...]:
        return (
            tuple((p.oid, p.label, p.type, p.parent) for p in self.places.values()),
            tuple(sorted((u, m.label, m.place_oid) for u, m in self.meta.items())),
        )

    def sync_setup(self, root: RawPlace, devices: list[RawDevice]) -> bool:
        """Places, labels, placement and bridge states from a full setup read. True when the
        rooms, the placement or a label changed."""
        before = self.layout_key()
        self.root_oid = root.oid
        self.places = {p.oid: Place(p.oid, p.label, p.type, parent) for parent, p in _walk(root)}
        self.meta = {
            d.device_url: DeviceMeta(d.device_url, d.label, d.widget, d.place_oid, d.ui_class)
            for d in devices
        }
        self.others = {
            d.device_url: dict(d.states) for d in devices if d.device_url not in self._by_url
        }
        self._rebuild()
        return self.layout_key() != before

    def _rebuild(self) -> None:
        """Rooms from placement: a radiator's room is its heater's place."""
        for r in self.radiators.values():
            meta = self.meta.get(r.heater_url)
            if meta is None:
                continue
            r.label = meta.label
            r.room_id = (
                meta.place_oid if meta.place_oid in self.places else self.root_oid or r.room_id
            )
        rooms: dict[str, Room] = {}
        for p in self.places.values():
            rids = sorted(rid for rid, r in self.radiators.items() if r.room_id == p.oid)
            if rids:
                rooms[p.oid] = Room(id=p.oid, name=self.room_name(p.oid), radiator_ids=rids)
        self.rooms = rooms

    def room_name(self, oid: str) -> str:
        return ROOT_NAME if oid == self.root_oid else self.places[oid].label.strip()

    def apply_device_update(self, u: DeviceUpdate) -> bool:
        """A device's place or label changed (an event or a targeted read). True if the layout
        changed."""
        meta = self.meta.get(u.device_url)
        if meta is None:
            return False
        before = (meta.place_oid, meta.label)
        if u.place_oid is not None:
            meta.place_oid = u.place_oid
        if u.label is not None:
            meta.label = u.label
        if (meta.place_oid, meta.label) == before:
            return False
        self._rebuild()
        return True

    def put_place(self, p: SetupPlace, parent: str | None = None) -> bool:
        """A place as a targeted read returned it (new or renamed). True if it changed."""
        old = self.places.get(p.oid)
        if old is not None:
            parent = old.parent
        elif parent is None:
            parent = self.root_oid
        new = Place(p.oid, p.label, p.type, parent)
        if old == new:
            return False
        self.places[p.oid] = new
        self._rebuild()
        return True

    def remove_place(self, oid: str) -> bool:
        if oid not in self.places or oid == self.root_oid:
            return False
        del self.places[oid]
        self._rebuild()
        return True

    def unknown_places(self) -> set[str]:
        return {
            m.place_oid
            for m in self.meta.values()
            if m.place_oid and m.place_oid not in self.places
        }

    def room_type(self) -> int | None:
        """A new room's type: the most common among the house's sub-places (spec §2.7)."""
        types = [
            p.type for p in self.places.values() if p.parent == self.root_oid and p.type is not None
        ]
        return Counter(types).most_common(1)[0][0] if types else None

    def devices_in(self, oid: str) -> list[DeviceMeta]:
        return [m for m in self.meta.values() if m.place_oid == oid]

    def delete_block(self, oid: str) -> str | None:
        """The error code saying why this room cannot be deleted, or None. Kelvin moves
        nothing implicitly: a room must be empty (spec §2.7); `devices_in(oid)` gives the count."""
        if oid not in self.places:
            return "room_unknown"
        inside = self.devices_in(oid)
        if (
            oid == self.root_oid
            or any(m.widget in BRIDGE_WIDGETS for m in inside)
            or any(p.parent == oid for p in self.places.values())
        ):
            return "room_protected"
        if inside:
            return "room_not_empty"
        return None

    def device_ids(self) -> dict[str, str]:
        """Public device ids: `<radiator id>#<n>` for radiator sub-devices, `bridge-<n>` for
        the others in URL order. Device URLs never leave the backend."""
        out = {url: f"{radiator_id(url)}#{_sub_index(url)}" for url in self._by_url}
        bridges = sorted(u for u in self.meta if u not in self._by_url)
        out.update({u: f"bridge-{i}" for i, u in enumerate(bridges, 1)})
        return out

    def device_url_for(self, device_id: str) -> str | None:
        return next((u for u, i in self.device_ids().items() if i == device_id), None)

    def setup_view(self) -> dict[str, Any]:
        """The device tree of `GET /api/setup/devices`, from memory (no Overkiz call)."""
        ids = self.device_ids()

        def device(url: str) -> dict[str, Any] | None:
            m = self.meta.get(url)
            if m is None:
                return None
            rid = self._by_url.get(url)
            heater = rid is not None and url == self.radiators[rid].heater_url
            if rid is not None:
                states = self.radiators[rid].states.get(url, {})
                heater_meta = self.meta.get(self.radiators[rid].heater_url)
                misplaced = heater_meta is not None and m.place_oid != heater_meta.place_oid
            else:
                states, misplaced = self.others.get(url, {}), False
            role = device_role(m.widget, heater, m.ui_class)
            return {
                "id": ids[url],
                "role": role,
                "label": m.label,
                "widget": m.widget,
                "room_id": m.place_oid if m.place_oid in self.places else None,
                "misplaced": misplaced,
                "reachable": _reachable(states),
                "last_event_at": self.last_event_ts.get(url),
                "details": _details(states),
                "support": self.radiators[rid].support
                if heater and rid is not None
                else ("readonly" if rid is None and role not in BRIDGE_ROLES else None),
            }

        rooms = [
            {
                "id": p.oid,
                "name": self.room_name(p.oid),
                "is_root": p.oid == self.root_oid,
                "radiator_ids": sorted(
                    rid for rid, r in self.radiators.items() if r.room_id == p.oid
                ),
                "device_count": len(self.devices_in(p.oid)),
                "block": self.delete_block(p.oid),
            }
            for p in self.places.values()
        ]
        radiators = [
            {
                "id": r.id,
                "room_id": r.room_id,
                "name": r.name,
                "kind": r.kind,
                "support": r.support,
                "devices": [
                    d for u in sorted(r.states, key=_sub_index) if (d := device(u)) is not None
                ],
            }
            for r in sorted(self.radiators.values(), key=lambda r: (r.name.casefold(), r.id))
        ]
        others = [d for u in sorted(self.others) if (d := device(u)) is not None]
        bridges = [d for d in others if d["role"] in BRIDGE_ROLES]
        # Plan 12: everything else Kelvin does not drive (water heaters, heat pumps, shutters…)
        # is listed read-only, never hidden.
        appliances = [d for d in others if d["role"] not in BRIDGE_ROLES]
        return {
            "rooms": rooms,
            "radiators": radiators,
            "bridges": bridges,
            "appliances": appliances,
        }

    def room_view(self, room_id: str) -> dict[str, Any]:
        room = self.rooms[room_id]
        rads = self.room_radiators(room_id)
        temps = [r.temperature for r in rads if r.temperature is not None]
        return {
            "id": room.id,
            "name": room.name,
            "is_root": room.id == self.root_oid,
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
    root: RawPlace,
    devices: list[RawDevice],
    *,
    wall: Callable[[], float] = time.time,
    server: str = DEFAULT_SERVER,
) -> House:
    """`server`: the home's Overkiz server, which sets each radiator's support (Plan 12)."""
    groups: dict[str, list[RawDevice]] = {}
    for d in devices:
        groups.setdefault(base_url(d.device_url), []).append(d)
    places = list(iter_places(root))
    labels = {p.oid: p.label.strip() for p in places}

    radiators: dict[str, Radiator] = {}
    for devs in groups.values():
        heater = next((d for d in devs if kind_for(d.widget, d.ui_class) in RADIATOR_KINDS), None)
        if heater is None:
            continue
        kind = kind_for(heater.widget, heater.ui_class) or "heater_unknown"
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
            kind=kind,
            support=support_for(kind, server),
            values=dict(heater.state_values),
        )

    rooms = []
    for p in places:
        rids = sorted(rid for rid, r in radiators.items() if r.room_id == p.oid)
        if rids:
            name = "Maison" if p.oid == root.oid else labels[p.oid]
            rooms.append(Room(id=p.oid, name=name, radiator_ids=rids))
    house = House(rooms, radiators, wall=wall)
    house.sync_setup(root, devices)
    return house
