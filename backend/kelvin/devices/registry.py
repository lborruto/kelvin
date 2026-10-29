"""Device registry (Plan 12): what kind of heating device a widget is, and how Kelvin drives it.

Every widget, UI class, command, state and value is pyoverkiz 2.2.2's own (UIWidget, UIClass,
OverkizCommand, OverkizState, OverkizCommandParam). Only `setpoint_heater` on the Sauter server
is tested on real hardware (docs/overkiz-notes.md). The pilot-wire and towel-dryer profiles
follow pyoverkiz's names and Home Assistant's Overkiz mapping: expected to work, unverified.
Water heaters, heat pumps and unknown heating devices are read-only.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any

from pyoverkiz.enums import OverkizCommand as C
from pyoverkiz.enums import OverkizCommandParam as P
from pyoverkiz.enums import OverkizState as S
from pyoverkiz.enums import UIClass, UIWidget

from kelvin.overkiz.servers import DEFAULT_SERVER, is_cozytouch

RADIATOR_KINDS: tuple[str, ...] = (
    "setpoint_heater",
    "pilot_wire_heater",
    "towel_dryer",
    "heater_unknown",
)
APPLIANCE_KINDS: tuple[str, ...] = ("water_heater", "heat_pump")
SUPPORTS: tuple[str, ...] = ("tested", "expected", "experimental", "readonly")
PILOT_LEVELS: tuple[str, ...] = (
    P.COMFORT.value,
    P.COMFORT_1.value,
    P.COMFORT_2.value,
    P.ECO.value,
    P.FROSTPROTECTION.value,
    P.OFF.value,
)
DRYER_ACTIONS: tuple[str, ...] = ("boost", "drying", "stop")


@dataclass(frozen=True)
class Profile:
    """How a kind of device is driven. A capability also needs the device's own command
    (kelvin.devices.capabilities)."""

    kind: str
    mode_command: str | None = None
    mode_state: str | None = None
    modes: Mapping[str, str] = field(default_factory=dict)  # Kelvin mode → Overkiz value
    level_command: str | None = None
    level_state: str | None = None
    levels: tuple[str, ...] = ()
    dryer_command: str | None = None
    dryer_state: str | None = None
    dryer_values: Mapping[str, str] = field(default_factory=dict)  # boost|drying|stop → value
    setpoint_command: str | None = None
    setpoint_state: str | None = None
    setbacks: bool = False  # comfort temperature and eco setback (verified on Sauter only)
    program: bool = False  # the weekly programme Kelvin edits (core:TimeProgramState)
    # The programme times the device keeps, in minutes. 30 on Sauter radiators (verified
    # 2026-10-17: 17:45 sent, 17:00 kept; every held time is on :00 or :30). 30 for every
    # other kind too until a finer step is verified (docs/overkiz-notes.md).
    program_step: int = 30
    manual_min: float = 7.0
    # The eco lowering below comfort (setEcoTemperature), in °C, 0.5 steps. `eco_offset` is what
    # Kelvin allows where the hardware is not verified; `eco_offset_tested` replaces it where the
    # profile is `tested`. Sauter setpoint heaters, verified 2026-10-28: 1 refused, 2 and 3.5
    # accepted (docs/overkiz-notes.md), so [2, 8] there.
    eco_offset: tuple[float, float] = (1.0, 8.0)
    eco_offset_tested: tuple[float, float] | None = None

    def mode_of(self, value: Any) -> str:
        """Kelvin's mode for a reported value: off, manual, program or other."""
        for mode, v in self.modes.items():
            if v == value:
                return mode
        if self.mode_command is None and self.level_command is not None:
            # A pilot-wire heater has no mode: off is level off, any known level is « Manuel ».
            if value == P.OFF.value:
                return "off"
            if value in self.levels:
                return "manual"
        return "other"

    def dryer_of(self, value: Any) -> str | None:
        """The towel dryer's temporary state: boost, drying, or None (normal or unknown)."""
        for action, v in self.dryer_values.items():
            if v == value and action != "stop":
                return action
        return None


_MANUAL_SETPOINT = {
    "setpoint_command": C.SET_TARGET_TEMPERATURE.value,
    "setpoint_state": S.CORE_TARGET_TEMPERATURE.value,
}

PROFILES: dict[str, Profile] = {
    "setpoint_heater": Profile(
        "setpoint_heater",
        mode_command=C.SET_OPERATING_MODE.value,
        mode_state=S.CORE_OPERATING_MODE.value,
        modes={"off": P.STANDBY.value, "manual": P.BASIC.value, "program": P.INTERNAL.value},
        setbacks=True,
        program=True,
        eco_offset_tested=(2.0, 8.0),
        **_MANUAL_SETPOINT,
    ),
    "pilot_wire_heater": Profile(
        "pilot_wire_heater",
        level_command=C.SET_HEATING_LEVEL.value,
        level_state=S.IO_TARGET_HEATING_LEVEL.value,
        levels=PILOT_LEVELS,
    ),
    "towel_dryer": Profile(
        "towel_dryer",
        mode_command=C.SET_TOWEL_DRYER_OPERATING_MODE.value,
        mode_state=S.CORE_OPERATING_MODE.value,
        modes={"off": P.STANDBY.value, "manual": P.EXTERNAL.value, "program": P.INTERNAL.value},
        dryer_command=C.SET_TOWEL_DRYER_TEMPORARY_STATE.value,
        dryer_state=S.IO_TOWEL_DRYER_TEMPORARY_STATE.value,
        dryer_values={
            "boost": P.BOOST.value,
            "drying": P.DRYING.value,
            "stop": P.PERMANENT_HEATING.value,
        },
        **_MANUAL_SETPOINT,
    ),
    "heater_unknown": Profile("heater_unknown"),
    "water_heater": Profile("water_heater"),
    "heat_pump": Profile("heat_pump"),
}

WIDGET_KINDS: dict[str, str] = {
    UIWidget.ATLANTIC_ELECTRICAL_HEATER_WITH_ADJUSTABLE_TEMPERATURE_SETPOINT.value: (
        "setpoint_heater"
    ),
    UIWidget.ATLANTIC_ELECTRICAL_HEATER.value: "pilot_wire_heater",
    UIWidget.ATLANTIC_ELECTRICAL_TOWEL_DRYER.value: "towel_dryer",
}


def kind_for(widget: str, ui_class: str = "") -> str | None:
    """The kind of a device, or None when it is not a heating device (sensors, lights,
    bridges, shutters…). Unknown widgets fall back on the UI class; setups stored before
    Plan 12 have no UI class, so a widget naming a heater still counts as one. A sensor never
    does, whatever it measures (GasHeaterConsumptionSensor)."""
    if widget in WIDGET_KINDS:
        return WIDGET_KINDS[widget]
    if widget.endswith("Sensor"):
        return None
    if ui_class == UIClass.WATER_HEATING_SYSTEM.value:
        return "water_heater"
    if ui_class == UIClass.HEAT_PUMP_SYSTEM.value:
        return "heat_pump"
    if ui_class == UIClass.HEATING_SYSTEM.value or "Heater" in widget:
        return "heater_unknown"
    return None


def support_for(kind: str, server: str = DEFAULT_SERVER) -> str:
    """tested: the hardware verified (Sauter adjustable-setpoint heaters on the Sauter server);
    expected: a known kind on a Cozytouch server; experimental: a known kind elsewhere;
    readonly: everything Kelvin does not drive."""
    if kind not in ("setpoint_heater", "pilot_wire_heater", "towel_dryer"):
        return "readonly"
    if not is_cozytouch(server):
        return "experimental"
    if kind == "setpoint_heater" and server == DEFAULT_SERVER:
        return "tested"
    return "expected"
