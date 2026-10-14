"""Translate user intents into Overkiz commands plus the device states that confirm them."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from kelvin.house.model import DAY_ORDER, OVERKIZ_MODES, Radiator
from kelvin.overkiz.models import DeviceCommand

MODE_LABELS = {"off": "Arrêt", "manual": "Manuel", "program": "Programme"}
DAY_LABELS = {
    "monday": "lundi",
    "tuesday": "mardi",
    "wednesday": "mercredi",
    "thursday": "jeudi",
    "friday": "vendredi",
    "saturday": "samedi",
    "sunday": "dimanche",
}
EMPTY_SLOT = {"start": "00:00", "end": "00:00"}
_HHMM = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")
_FEATURES = {
    "window_detection": (
        "setOpenWindowDetectionActivation",
        "core:OpenWindowDetectionActivationState",
    ),
    "presence_detection": ("setOccupancyActivation", "core:OccupancyActivationState"),
}


class CommandError(ValueError):
    """Invalid request; the message is shown to the user (French)."""


@dataclass(frozen=True)
class Expectation:
    device_url: str
    name: str
    value: Any

    def matches(self, actual: Any) -> bool:
        if isinstance(self.value, int | float) and not isinstance(self.value, bool):
            try:
                return abs(float(actual) - float(self.value)) < 0.01
            except (TypeError, ValueError):
                return False
        return actual == self.value


@dataclass(frozen=True)
class Planned:
    commands: tuple[DeviceCommand, ...]
    expectations: tuple[Expectation, ...] = ()

    def __add__(self, other: Planned) -> Planned:
        return Planned(self.commands + other.commands, self.expectations + other.expectations)


def _require(r: Radiator, url: str, command: str) -> None:
    if command not in r.commands.get(url, []):
        raise CommandError(f"Ce radiateur ne prend pas en charge « {command} ».")


def _one(
    url: str, command: str, params: tuple[Any, ...], state: str | None = None, value: Any = None
) -> Planned:
    exp = (Expectation(url, state, value),) if state else ()
    return Planned((DeviceCommand(url, command, params),), exp)


def _check_temp(value: float, lo: float, hi: float, label: str) -> None:
    if not lo <= value <= hi:
        raise CommandError(f"{label} doit être comprise entre {lo:g} et {hi:g} °C.")
    if round(value * 2) != value * 2:
        raise CommandError(f"{label} se règle par pas de 0,5 °C.")


def plan_mode(r: Radiator, mode: str) -> Planned:
    if mode not in OVERKIZ_MODES:
        raise CommandError(f"Mode inconnu : {mode}.")
    _require(r, r.heater_url, "setOperatingMode")
    v = OVERKIZ_MODES[mode]
    return _one(r.heater_url, "setOperatingMode", (v,), "core:OperatingModeState", v)


def plan_setpoint(r: Radiator, kind: str, value: float) -> Planned:
    value = float(value)
    if kind == "manual":
        _check_temp(value, 7.0, r.max_temperature, "La consigne")
        cmd, state = "setTargetTemperature", "core:TargetTemperatureState"
    elif kind == "comfort":
        _check_temp(value, 12.0, r.max_temperature, "La température confort")
        cmd, state = "setComfortTemperature", "core:ComfortRoomTemperatureState"
    elif kind == "eco":
        _check_temp(value, 1.0, 8.0, "L'abaissement éco")
        cmd, state = "setEcoTemperature", "core:EcoRoomTemperatureState"
    else:
        raise CommandError(f"Type de consigne inconnu : {kind}.")
    _require(r, r.heater_url, cmd)
    return _one(r.heater_url, cmd, (value,), state, value)


def _minutes(hhmm: str, day: str) -> int:
    m = _HHMM.match(hhmm or "")
    if not m:
        raise CommandError(f"{day} : heure invalide « {hhmm} » (format HH:MM).")
    return int(m.group(1)) * 60 + int(m.group(2))


Week = dict[str, list[dict[str, str]]]


def normalize_program(week: Week) -> list[Week]:
    unknown = [k for k in week if k not in DAY_ORDER]
    if unknown:
        raise CommandError(f"Jour inconnu : {unknown[0]}.")
    out: list[Week] = []
    for day in DAY_ORDER:
        label = DAY_LABELS[day]
        # Drop the device's empty padding slots so a programme read back round-trips.
        slots = [s for s in week.get(day) or [] if s != EMPTY_SLOT]
        if len(slots) > 3:
            raise CommandError(f"{label} : 3 plages confort au maximum.")
        parsed = []
        for s in slots:
            start, end = _minutes(s.get("start", ""), label), _minutes(s.get("end", ""), label)
            if start >= end:
                raise CommandError(f"{label} : la plage {s['start']}–{s['end']} est invalide.")
            parsed.append((start, end, s["start"], s["end"]))
        parsed.sort()
        for a, b in zip(parsed, parsed[1:], strict=False):
            if b[0] < a[1]:
                raise CommandError(f"{label} : des plages se chevauchent.")
        padded = [{"start": p[2], "end": p[3]} for p in parsed]
        padded += [dict(EMPTY_SLOT) for _ in range(3 - len(padded))]
        out.append({day: padded})
    return out


def plan_program(r: Radiator, week: dict[str, list[dict[str, str]]]) -> Planned:
    _require(r, r.heater_url, "setTimeProgram")
    payload = normalize_program(week)
    return _one(r.heater_url, "setTimeProgram", (payload,), "core:TimeProgramState", payload)


def plan_feature(r: Radiator, feature: str, on: bool) -> Planned:
    if feature not in _FEATURES:
        raise CommandError(f"Fonction inconnue : {feature}.")
    cmd, state = _FEATURES[feature]
    _require(r, r.heater_url, cmd)
    v = "active" if on else "inactive"
    return _one(r.heater_url, cmd, (v,), state, v)


def plan_light(r: Radiator, on: bool, intensity: int | None = None) -> Planned:
    url = r.urls.get("light")
    if url is None:
        raise CommandError("Ce radiateur n'a pas de veilleuse.")
    name = "on" if on else "off"
    _require(r, url, name)
    planned = _one(url, name, (), "core:OnOffState", name)
    if intensity is not None and not on:
        raise CommandError("L'intensité ne peut être réglée que veilleuse allumée.")
    if intensity is not None:
        if not 1 <= intensity <= 100:
            raise CommandError("L'intensité doit être comprise entre 1 et 100 %.")
        _require(r, url, "setIntensity")
        planned = planned + _one(
            url, "setIntensity", (int(intensity),), "core:LightIntensityState", int(intensity)
        )
    return planned


def plan_identify(r: Radiator) -> Planned:
    cmd = "identify" if "identify" in r.commands.get(r.heater_url, []) else "wink"
    _require(r, r.heater_url, cmd)
    return _one(r.heater_url, cmd, ())


def plan_rename(r: Radiator, name: str) -> Planned:
    name = name.strip()
    if not 1 <= len(name) <= 32:
        raise CommandError("Le nom doit faire entre 1 et 32 caractères.")
    _require(r, r.heater_url, "setName")
    return _one(r.heater_url, "setName", (name,), "core:NameState", name)
