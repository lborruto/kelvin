"""Translate user intents into Overkiz commands plus the device states that confirm them."""

from __future__ import annotations

import re
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any

from kelvin.errors import UserError
from kelvin.house.model import DAY_ORDER, OVERKIZ_MODES, Radiator
from kelvin.overkiz.models import DeviceCommand

EMPTY_SLOT = {"start": "00:00", "end": "00:00"}
_HHMM = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")
_FEATURES = {
    "window_detection": (
        "setOpenWindowDetectionActivation",
        "core:OpenWindowDetectionActivationState",
    ),
    "presence_detection": ("setOccupancyActivation", "core:OccupancyActivationState"),
}


class CommandError(UserError):
    """Invalid request: a stable code and params; `str(e)` is the French detail
    (kelvin/errors.py)."""


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
        raise CommandError("unsupported_command", command=command)


def _one(
    url: str, command: str, params: tuple[Any, ...], state: str | None = None, value: Any = None
) -> Planned:
    exp = (Expectation(url, state, value),) if state else ()
    return Planned((DeviceCommand(url, command, params),), exp)


def _check_temp(value: float, lo: float, hi: float, kind: str) -> None:
    if not lo <= value <= hi:
        raise CommandError("temp_range", kind=kind, min=lo, max=hi)
    if round(value * 2) != value * 2:
        raise CommandError("temp_step", kind=kind)


def plan_mode(r: Radiator, mode: str) -> Planned:
    if mode not in OVERKIZ_MODES:
        raise CommandError("mode_unknown", mode=mode)
    _require(r, r.heater_url, "setOperatingMode")
    v = OVERKIZ_MODES[mode]
    return _one(r.heater_url, "setOperatingMode", (v,), "core:OperatingModeState", v)


def plan_setpoint(r: Radiator, kind: str, value: float) -> Planned:
    value = float(value)
    if kind == "manual":
        _check_temp(value, 7.0, r.max_temperature, "manual")
        cmd, state = "setTargetTemperature", "core:TargetTemperatureState"
    elif kind == "comfort":
        _check_temp(value, 12.0, r.max_temperature, "comfort")
        cmd, state = "setComfortTemperature", "core:ComfortRoomTemperatureState"
    elif kind == "eco":
        _check_temp(value, 1.0, 8.0, "eco")
        cmd, state = "setEcoTemperature", "core:EcoRoomTemperatureState"
    else:
        raise CommandError("setpoint_kind_unknown", kind=kind)
    _require(r, r.heater_url, cmd)
    return _one(r.heater_url, cmd, (value,), state, value)


def _minutes(hhmm: str, day: str) -> int:
    m = _HHMM.match(hhmm or "")
    if not m:
        raise CommandError("program_time_invalid", day=day, value=hhmm)
    return int(m.group(1)) * 60 + int(m.group(2))


Week = dict[str, list[dict[str, str]]]


def normalize_program(week: Week) -> list[Week]:
    unknown = [k for k in week if k not in DAY_ORDER]
    if unknown:
        raise CommandError("day_unknown", day=unknown[0])
    out: list[Week] = []
    for day in DAY_ORDER:
        # Drop the device's empty padding slots so a programme read back round-trips.
        slots = [s for s in week.get(day) or [] if s != EMPTY_SLOT]
        if len(slots) > 3:
            raise CommandError("program_too_many", day=day)
        parsed = []
        for s in slots:
            start, end = _minutes(s.get("start", ""), day), _minutes(s.get("end", ""), day)
            if start >= end:
                raise CommandError("program_slot_invalid", day=day, start=s["start"], end=s["end"])
            parsed.append((start, end, s["start"], s["end"]))
        parsed.sort()
        for a, b in zip(parsed, parsed[1:], strict=False):
            if b[0] < a[1]:
                raise CommandError("program_overlap", day=day)
        padded = [{"start": p[2], "end": p[3]} for p in parsed]
        padded += [dict(EMPTY_SLOT) for _ in range(3 - len(padded))]
        out.append({day: padded})
    return out


def plan_program(
    r: Radiator, week: dict[str, list[dict[str, str]]], *, keep: Iterable[str] = ()
) -> Planned:
    """Only the days `week` names are written (`[]` clears one). A day it leaves out, a day in
    `keep`, and a locked day (a midnight end, a shape Kelvin cannot read; spec QW8) are re-sent
    exactly as this radiator reported them (final review C1). A day to keep that the radiator
    never reported is refused (`program_day_unknown`): Kelvin never writes it empty unasked."""
    _require(r, r.heater_url, "setTimeProgram")
    kept = set(r.program_locked) | set(keep) | {d for d in DAY_ORDER if d not in week}
    payload = normalize_program({d: v for d, v in week.items() if d not in kept})
    out = []
    for entry in payload:
        day = next(iter(entry))
        if day in kept:
            raw = r.raw_day(day)
            if raw is None:
                raise CommandError("program_day_unknown", day=day)
            entry = raw
        out.append(entry)
    payload = out
    return _one(r.heater_url, "setTimeProgram", (payload,), "core:TimeProgramState", payload)


def plan_feature(r: Radiator, feature: str, on: bool) -> Planned:
    if feature not in _FEATURES:
        raise CommandError("feature_unknown", feature=feature)
    cmd, state = _FEATURES[feature]
    _require(r, r.heater_url, cmd)
    v = "active" if on else "inactive"
    return _one(r.heater_url, cmd, (v,), state, v)


def plan_light(r: Radiator, on: bool, intensity: int | None = None) -> Planned:
    url = r.urls.get("light")
    if url is None:
        raise CommandError("no_night_light")
    name = "on" if on else "off"
    _require(r, url, name)
    planned = _one(url, name, (), "core:OnOffState", name)
    if intensity is not None and not on:
        raise CommandError("intensity_light_off")
    if intensity is not None:
        if not 1 <= intensity <= 100:
            raise CommandError("intensity_range")
        _require(r, url, "setIntensity")
        planned = planned + _one(
            url, "setIntensity", (int(intensity),), "core:LightIntensityState", int(intensity)
        )
    return planned


def plan_identify(r: Radiator) -> Planned:
    cmd = "identify" if "identify" in r.commands.get(r.heater_url, []) else "wink"
    _require(r, r.heater_url, cmd)
    return _one(r.heater_url, cmd, ())
