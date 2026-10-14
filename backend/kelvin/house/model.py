from __future__ import annotations

from dataclasses import dataclass, field
from statistics import mean
from typing import Any

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


def program_from_state(value: Any) -> dict[str, list[dict[str, str]]]:
    """Overkiz TimeProgramState (list of one-key dicts) -> {day: [non-empty slots]}."""
    if not isinstance(value, list):
        return {}
    merged: dict[str, list[dict[str, str]]] = {}
    for entry in value:
        if not isinstance(entry, dict):
            continue
        for day, slots in entry.items():
            if not isinstance(slots, list):
                continue
            merged[day] = [
                {"start": s["start"], "end": s["end"]}
                for s in slots
                if isinstance(s, dict)
                and isinstance(s.get("start"), str)
                and isinstance(s.get("end"), str)
                and not (s["start"] == "00:00" and s["end"] == "00:00")
            ]
    return {d: merged[d] for d in DAY_ORDER if d in merged}


@dataclass
class Radiator:
    id: str
    room_id: str
    heater_url: str
    urls: dict[str, str]
    states: dict[str, dict[str, Any]]
    commands: dict[str, list[str]] = field(default_factory=dict)

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
        return program_from_state(self.get("heater", "core:TimeProgramState"))

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
            "program": self.program,
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


class House:
    def __init__(self, rooms: list[Room], radiators: dict[str, Radiator]) -> None:
        self.rooms: dict[str, Room] = {r.id: r for r in rooms}
        self.radiators = radiators
        self._by_url: dict[str, str] = {
            url: rid for rid, r in radiators.items() for url in r.states
        }

    def room_radiators(self, room_id: str) -> list[Radiator]:
        return [self.radiators[i] for i in self.rooms[room_id].radiator_ids]

    def radiator_for_url(self, device_url: str) -> str | None:
        return self._by_url.get(device_url)

    def device_state(self, device_url: str, name: str) -> Any:
        rid = self._by_url.get(device_url)
        if rid is None:
            return None
        return self.radiators[rid].states.get(device_url, {}).get(name)

    def apply(self, change: StateChange) -> str | None:
        rid = self._by_url.get(change.device_url)
        if rid is None:
            return None
        states = self.radiators[rid].states.setdefault(change.device_url, {})
        if change.name in states and states[change.name] == change.value:
            return None
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
                changed.add(rid)
            for name, value in d.states.items():
                changed_rid = self.apply(StateChange(d.device_url, name, value))
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
        }

    def view(self) -> dict[str, Any]:
        return {
            "rooms": [self.room_view(rid) for rid in self.rooms],
            "radiators": [r.view() for r in self.radiators.values()],
        }


def build_house(root: RawPlace, devices: list[RawDevice]) -> House:
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
    return House(rooms, radiators)
