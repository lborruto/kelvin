"""The device registry (Plan 12): kinds and profiles, with pyoverkiz's own names."""

import pytest
from pyoverkiz.enums import OverkizCommand, OverkizCommandParam, OverkizState, UIClass, UIWidget

from kelvin.devices.registry import (
    APPLIANCE_KINDS,
    PILOT_LEVELS,
    PROFILES,
    RADIATOR_KINDS,
    kind_for,
    support_for,
)


def test_the_names_are_pyoverkiz_s_own():
    sp, pw, td = PROFILES["setpoint_heater"], PROFILES["pilot_wire_heater"], PROFILES["towel_dryer"]
    assert (sp.mode_command, sp.mode_state) == ("setOperatingMode", "core:OperatingModeState")
    assert dict(sp.modes) == {"off": "standby", "manual": "basic", "program": "internal"}
    assert (sp.setpoint_command, sp.setpoint_state) == (
        "setTargetTemperature",
        "core:TargetTemperatureState",
    )
    assert (pw.level_command, pw.level_state) == ("setHeatingLevel", "io:TargetHeatingLevelState")
    assert PILOT_LEVELS == ("comfort", "comfort-1", "comfort-2", "eco", "frostprotection", "off")
    assert (td.mode_command, td.mode_state) == (
        "setTowelDryerOperatingMode",
        "core:OperatingModeState",
    )
    assert dict(td.modes) == {"off": "standby", "manual": "external", "program": "internal"}
    assert (td.dryer_command, td.dryer_state) == (
        "setTowelDryerTemporaryState",
        "io:TowelDryerTemporaryStateState",
    )
    assert dict(td.dryer_values) == {
        "boost": "boost",
        "drying": "drying",
        "stop": "permanentHeating",
    }
    # Each literal above is a pyoverkiz enum value (a renamed enum fails here, not on a device).
    commands = {c.value for c in OverkizCommand}
    states = {s.value for s in OverkizState}
    params = {p.value for p in OverkizCommandParam}
    for p in PROFILES.values():
        for c in (p.mode_command, p.level_command, p.dryer_command, p.setpoint_command):
            assert c is None or c in commands
        for s in (p.mode_state, p.level_state, p.dryer_state, p.setpoint_state):
            assert s is None or s in states
        for v in [*p.modes.values(), *p.levels, *p.dryer_values.values()]:
            assert v in params


@pytest.mark.parametrize(
    ("widget", "ui_class", "kind"),
    [
        (
            UIWidget.ATLANTIC_ELECTRICAL_HEATER_WITH_ADJUSTABLE_TEMPERATURE_SETPOINT,
            "",
            "setpoint_heater",
        ),
        (UIWidget.ATLANTIC_ELECTRICAL_HEATER, "HeatingSystem", "pilot_wire_heater"),
        (UIWidget.ATLANTIC_ELECTRICAL_TOWEL_DRYER, "HeatingSystem", "towel_dryer"),
        ("TemperatureSensor", "TemperatureSensor", None),
        ("DimmerLight", "Light", None),
        ("IOStack", "ProtocolGateway", None),
        ("PositionableRollerShutter", "RollerShutter", None),
    ],
)
def test_known_widgets(widget, ui_class, kind):
    assert kind_for(str(widget), ui_class) == kind


def test_unknown_widgets_are_classified_by_ui_class():
    assert (
        kind_for("DomesticHotWaterProduction", UIClass.WATER_HEATING_SYSTEM.value) == "water_heater"
    )
    assert kind_for("AtlanticPassAPCHeatPump", UIClass.HEAT_PUMP_SYSTEM.value) == "heat_pump"
    assert (
        kind_for("SomfyHeatingTemperatureInterface", UIClass.HEATING_SYSTEM.value)
        == "heater_unknown"
    )
    assert (
        kind_for("SomeNewElectricalHeater", "") == "heater_unknown"
    )  # stored setups lack ui_class
    # A water heater's widget may say « Heater »: the UI class wins.
    assert kind_for("SomeWaterHeater", UIClass.WATER_HEATING_SYSTEM.value) == "water_heater"
    assert set(RADIATOR_KINDS) & set(APPLIANCE_KINDS) == set()


@pytest.mark.parametrize(
    ("kind", "server", "support"),
    [
        ("setpoint_heater", "sauter_cozytouch", "tested"),
        ("setpoint_heater", "atlantic_cozytouch", "expected"),
        ("pilot_wire_heater", "sauter_cozytouch", "expected"),
        ("towel_dryer", "thermor_cozytouch", "expected"),
        ("pilot_wire_heater", "somfy_europe", "experimental"),
        ("setpoint_heater", "flexom", "experimental"),
        ("heater_unknown", "sauter_cozytouch", "readonly"),
        ("water_heater", "atlantic_cozytouch", "readonly"),
        ("heat_pump", "somfy_europe", "readonly"),
    ],
)
def test_support(kind, server, support):
    assert support_for(kind, server) == support


def test_modes_read_from_the_profile():
    sp, pw, td = PROFILES["setpoint_heater"], PROFILES["pilot_wire_heater"], PROFILES["towel_dryer"]
    assert [sp.mode_of(v) for v in ("standby", "basic", "internal", "frostprotection", None)] == [
        "off",
        "manual",
        "program",
        "other",
        "other",
    ]
    assert [pw.mode_of(v) for v in ("off", "eco", "comfort-2", "comfort-3", None)] == [
        "off",
        "manual",
        "manual",
        "other",
        "other",
    ]
    assert [td.mode_of(v) for v in ("standby", "external", "internal", "auto")] == [
        "off",
        "manual",
        "program",
        "other",
    ]
    assert [td.dryer_of(v) for v in ("boost", "drying", "permanentHeating", "unknown", None)] == [
        "boost",
        "drying",
        None,
        None,
        None,
    ]
    assert PROFILES["heater_unknown"].mode_of("basic") == "other"
