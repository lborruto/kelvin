"""Translate user intents into Overkiz commands plus the device states that confirm them."""

from __future__ import annotations

import re
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any

from kelvin.devices.capabilities import COMFORT_MIN, eco_range
from kelvin.devices.registry import DRYER_ACTIONS, PILOT_LEVELS
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


PROGRAM_STATE = "core:TimeProgramState"
_HHMMSS = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)(?::00)?$")
EMPTY_TIMES = ("00:00", "00:00")


def _time(v: Any) -> str | None:
    m = _HHMMSS.match(v) if isinstance(v, str) else None
    return f"{m.group(1)}:{m.group(2)}" if m else None


def program_days(value: Any) -> dict[str, tuple[tuple[str, str], ...]] | None:
    """A `core:TimeProgramState` value as what it means: per day, its comfort slots sorted, the
    empty `00:00–00:00` markers dropped, `HH:MM:SS` read as `HH:MM`, days in any order (a day
    listed twice: the last wins, as the house reads it). None when it cannot be read whole."""
    if not isinstance(value, list):
        return None
    out: dict[str, tuple[tuple[str, str], ...]] = {}
    for entry in value:
        if not isinstance(entry, dict):
            return None
        for day, slots in entry.items():
            if not isinstance(slots, list):
                return None
            times = []
            for s in slots:
                if not isinstance(s, dict) or set(s) != {"start", "end"}:
                    return None
                t = (_time(s["start"]), _time(s["end"]))
                if t[0] is None or t[1] is None:
                    return None
                if t != EMPTY_TIMES:
                    times.append(t)
            out[day] = tuple(sorted(times))  # type: ignore[arg-type]
    return out


def program_diff(expected: Any, actual: Any) -> list[str] | None:
    """The days (in week order) where `actual` holds other slots than `expected`; None when
    either cannot be read."""
    a, b = program_days(expected), program_days(actual)
    if a is None or b is None:
        return None
    return [d for d in DAY_ORDER if a.get(d) != b.get(d)]


def day_difference(expected: Any, actual: Any, day: str) -> tuple[str, str]:
    """What was sent and what the radiator kept on `day`, as the message names them: the first
    time that differs (« 17:45 », « 17:00 ») when both hold as many slots, else the day's slots
    (« 06:00–08:00, 17:45–22:00 », « — » for none)."""
    a = (program_days(expected) or {}).get(day) or ()
    b = (program_days(actual) or {}).get(day) or ()
    if len(a) == len(b):
        for x, y in zip([t for s in a for t in s], [t for s in b for t in s], strict=True):
            if x != y:
                return x, y

    def slots(v: tuple[tuple[str, str], ...]) -> str:
        return ", ".join(f"{s}–{e}" for s, e in v) or "—"

    return slots(a), slots(b)


@dataclass(frozen=True)
class Expectation:
    device_url: str
    name: str
    value: Any

    def matches(self, actual: Any) -> bool:
        if self.name == PROGRAM_STATE and actual != self.value:
            # The radiator holds the programme asked for, whatever benign shape it reports.
            return program_diff(self.value, actual) == []
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


def _writable(r: Radiator) -> None:
    """Plan 12: a device Kelvin shows read-only refuses every command, before anything else."""
    if r.support == "readonly":
        raise CommandError("read_only_device")


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
    _writable(r)
    if mode not in OVERKIZ_MODES:
        raise CommandError("mode_unknown", mode=mode)
    p = r.profile
    command = p.mode_command or "setOperatingMode"
    _require(r, r.heater_url, command)
    if mode not in p.modes:
        raise CommandError("unsupported_command", command=command)
    v = p.modes[mode]  # Sauter: standby / basic / internal, as verified
    return _one(r.heater_url, command, (v,), p.mode_state, v)


def plan_setpoint(r: Radiator, kind: str, value: float) -> Planned:
    _writable(r)
    value = float(value)
    p = r.profile
    if kind == "manual":
        # The profile decides, not only the device: a pilot-wire heater declaring
        # setTargetTemperature still has no manual setpoint (capabilities(r).manual is None).
        cmd = p.setpoint_command or "setTargetTemperature"
        if p.setpoint_command is None or r.capabilities.manual is None:
            raise CommandError("unsupported_command", command=cmd)
        _check_temp(value, p.manual_min, r.max_temperature, "manual")
        state = p.setpoint_state or "core:TargetTemperatureState"
    elif kind == "comfort":
        _check_temp(value, COMFORT_MIN, r.max_temperature, "comfort")
        cmd, state = "setComfortTemperature", "core:ComfortRoomTemperatureState"
    elif kind == "eco":
        # Never send a lowering the radiator refuses (Sauter refuses 1: docs/overkiz-notes.md).
        lo, hi = eco_range(r)
        _check_temp(value, lo, hi, "eco")
        cmd, state = "setEcoTemperature", "core:EcoRoomTemperatureState"
    else:
        raise CommandError("setpoint_kind_unknown", kind=kind)
    if kind != "manual" and not p.setbacks:
        raise CommandError("unsupported_command", command=cmd)  # verified on Sauter only
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


def _check_step(r: Radiator, payload: list[Week], kept: set[str]) -> None:
    """Never send a time the radiator cannot keep (it stores another one and reports that): every
    time of a written day is on the device's step, unless the radiator already holds that time
    somewhere in its week (it evidently keeps it: re-sending it is no new time)."""
    step = r.capabilities.program_step_minutes or r.profile.program_step
    held = {
        t
        for slots in (program_days(r.get("heater", PROGRAM_STATE)) or {}).values()
        for slot in slots
        for t in slot
    }
    for entry in payload:
        ((day, slots),) = entry.items()
        if day in kept:
            continue
        for s in slots:
            for v in (s["start"], s["end"]):
                if _minutes(v, day) % step and v not in held:
                    raise CommandError("program_step", day=day, value=v, minutes=step)


def plan_program(
    r: Radiator, week: dict[str, list[dict[str, str]]], *, keep: Iterable[str] = ()
) -> Planned:
    """Only the days `week` names are written (`[]` clears one). A day it leaves out, a day in
    `keep`, and a locked day (a midnight end, a shape Kelvin cannot read; spec QW8) are re-sent
    exactly as this radiator reported them (final review C1). A day to keep that the radiator
    never reported is refused (`program_day_unknown`): Kelvin never writes it empty unasked."""
    _writable(r)
    if not r.profile.program:
        raise CommandError("unsupported_command", command="setTimeProgram")
    _require(r, r.heater_url, "setTimeProgram")
    kept = set(r.program_locked) | set(keep) | {d for d in DAY_ORDER if d not in week}
    payload = normalize_program({d: v for d, v in week.items() if d not in kept})
    _check_step(r, payload, kept)
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
    return _one(r.heater_url, "setTimeProgram", (payload,), PROGRAM_STATE, payload)


def plan_feature(r: Radiator, feature: str, on: bool) -> Planned:
    _writable(r)
    if feature not in _FEATURES:
        raise CommandError("feature_unknown", feature=feature)
    cmd, state = _FEATURES[feature]
    _require(r, r.heater_url, cmd)
    v = "active" if on else "inactive"
    return _one(r.heater_url, cmd, (v,), state, v)


def plan_light(r: Radiator, on: bool, intensity: int | None = None) -> Planned:
    _writable(r)
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
    _writable(r)
    cmd = "identify" if "identify" in r.commands.get(r.heater_url, []) else "wink"
    _require(r, r.heater_url, cmd)
    return _one(r.heater_url, cmd, ())


def plan_level(r: Radiator, level: str) -> Planned:
    """A pilot-wire heater's level (Plan 12; expected to work, unverified)."""
    _writable(r)
    if level not in PILOT_LEVELS:
        raise CommandError("level_unknown", level=level)
    p = r.profile
    command = p.level_command or "setHeatingLevel"
    _require(r, r.heater_url, command)
    if level not in r.capabilities.levels:
        raise CommandError("unsupported_command", command=f"{command}({level})")
    return _one(r.heater_url, command, (level,), p.level_state, level)


def plan_dryer(r: Radiator, action: str) -> Planned:
    """A towel dryer's boost, drying, or back to normal (`stop`). Expected, unverified."""
    _writable(r)
    if action not in DRYER_ACTIONS:
        raise CommandError("dryer_action_unknown", action=action)
    p = r.profile
    command = p.dryer_command or "setTowelDryerTemporaryState"
    _require(r, r.heater_url, command)
    offered = r.capabilities.dryer
    if not offered or (action != "stop" and action not in offered):
        raise CommandError("unsupported_command", command=f"{command}({action})")
    v = p.dryer_values[action]
    return _one(r.heater_url, command, (v,), p.dryer_state, v)


def plan_off(r: Radiator) -> Planned:
    """« Tout éteindre »: mode off; a pilot-wire heater has no mode, so its level off."""
    caps = r.capabilities
    if "off" not in caps.modes and "off" in caps.levels:
        return plan_level(r, "off")
    return plan_mode(r, "off")
