"""Invented simulator houses per brand (Plan 12): KELVIN_FAKE=1 with KELVIN_FAKE_HOUSE, or the
house of the server chosen at login. Every value, label, model and id here is invented.

- sauter: the v1 sample (kelvin.overkiz.sample), unchanged: four adjustable-setpoint radiators.
- atlantic: an adjustable-setpoint radiator without night light, a pilot-wire heater without
  « Confort −1/−2 », a towel dryer, and a water heater (a read-only appliance).
- thermor: two pilot-wire heaters (every level), a towel dryer with boost only, a heat-pump zone
  Kelvin does not know (a read-only radiator, sharing the Salon) and its heat pump (read-only).
- experimental: a pilot-wire heater paired through a Somfy box, a Somfy heating interface Kelvin
  does not know (a read-only radiator) and a roller shutter (never commanded).
"""

from __future__ import annotations

import copy
from collections.abc import Callable
from typing import Any

from kelvin.overkiz.models import RawDevice, RawPlace
from kelvin.overkiz.sample import HOUSE_TYPE, ROOM_TYPE, WEEK_PROGRAM, sample_house

ATLANTIC_GATEWAY = "io://2345-6789-0123"
THERMOR_GATEWAY = "io://3456-7890-1234"
EXPERIMENTAL_GATEWAY = "io://4567-8901-2345"

SETPOINT_COMMANDS = [
    "setOperatingMode",
    "setTargetTemperature",
    "setComfortTemperature",
    "setEcoTemperature",
    "setTimeProgram",
    "setOpenWindowDetectionActivation",
    "setOccupancyActivation",
    "identify",
]
PILOT_COMMANDS = ["setHeatingLevel", "refreshHeatingLevel"]
DRYER_COMMANDS = [
    "setTowelDryerOperatingMode",
    "setTargetTemperature",
    "setTowelDryerTemporaryState",
    "setTowelDryerBoostModeDuration",
    "setDryingDuration",
    "identify",
]
FOUR_LEVELS = ["off", "frostprotection", "eco", "comfort"]
SIX_LEVELS = ["off", "frostprotection", "eco", "comfort-2", "comfort-1", "comfort"]

House = tuple[RawPlace, list[RawDevice]]


def _root(*rooms: tuple[str, str]) -> RawPlace:
    # Typed like the Sauter sample, so Plan 8b's « Nouvelle pièce » finds the room type.
    return RawPlace(
        "p-house",
        "All House",
        tuple(RawPlace(oid, label, type=ROOM_TYPE) for oid, label in rooms),
        type=HOUSE_TYPE,
    )


def _common(name: str, model: str, power: int, maker: str) -> dict[str, Any]:
    return {
        "core:NameState": name,
        "core:StatusState": "available",
        "core:ManufacturerNameState": maker,
        "io:ModelState": model,
        "io:PowerState": power,
    }


def _setpoint(gw: str, rid: str, place: str, maker: str) -> RawDevice:
    states = {
        **_common("Radiateur", "Radiateur à consigne (simulé)", 1500, maker),
        "core:OperatingModeState": "internal",
        "core:TargetTemperatureState": 20.0,
        "core:ComfortRoomTemperatureState": 20.0,
        "core:EcoRoomTemperatureState": 3.0,
        "io:TargetHeatingLevelState": "comfort",
        "io:EffectiveTemperatureSetpointState": 20.0,
        "core:MaximumHeatingTargetTemperatureState": 28.0,
        "core:OpenWindowDetectionActivationState": "active",
        "core:OccupancyActivationState": "inactive",
        "io:CurrentWorkingRateState": 0.0,
        "core:TimeProgramState": copy.deepcopy(WEEK_PROGRAM),
    }
    return RawDevice(
        f"{gw}/{rid}#1",
        "Radiateur",
        "AtlanticElectricalHeaterWithAdjustableTemperatureSetpoint",
        place,
        states,
        list(SETPOINT_COMMANDS),
        ui_class="HeatingSystem",
    )


def _pilot(
    gw: str, rid: str, place: str, maker: str, level: str, values: list[str] | None
) -> RawDevice:
    states = {
        **_common("Radiateur", "Radiateur fil pilote (simulé)", 1000, maker),
        "io:TargetHeatingLevelState": level,
        "core:OnOffState": "off" if level == "off" else "on",
    }
    return RawDevice(
        f"{gw}/{rid}#1",
        "Radiateur",
        "AtlanticElectricalHeater",
        place,
        states,
        list(PILOT_COMMANDS),
        ui_class="HeatingSystem",
        state_values={"io:TargetHeatingLevelState": list(values)} if values else {},
    )


def _dryer(gw: str, rid: str, place: str, maker: str, mode: str, temporary: list[str]) -> RawDevice:
    states = {
        **_common("Sèche-serviettes", "Sèche-serviettes (simulé)", 750, maker),
        "core:OperatingModeState": mode,
        "core:TargetTemperatureState": 21.0,
        "io:EffectiveTemperatureSetpointState": 19.0,
        "core:MaximumHeatingTargetTemperatureState": 26.0,
        "io:TowelDryerTemporaryStateState": "permanentHeating",
    }
    return RawDevice(
        f"{gw}/{rid}#1",
        "Sèche-serviettes",
        "AtlanticElectricalTowelDryer",
        place,
        states,
        list(DRYER_COMMANDS),
        ui_class="HeatingSystem",
        state_values={"io:TowelDryerTemporaryStateState": list(temporary)},
    )


def _temp(gw: str, rid: str, place: str, value: float) -> RawDevice:
    return RawDevice(
        f"{gw}/{rid}#2",
        f"IO ({rid}#2)",
        "TemperatureSensor",
        place,
        {"core:TemperatureState": value, "core:StatusState": "available"},
        [],
        ui_class="TemperatureSensor",
    )


def _contact(gw: str, rid: str, place: str) -> RawDevice:
    return RawDevice(
        f"{gw}/{rid}#3",
        f"IO ({rid}#3)",
        "ContactSensor",
        place,
        {"core:ContactState": "closed"},
        [],
        ui_class="ContactSensor",
    )


def _meter(gw: str, rid: str, place: str, wh: int) -> RawDevice:
    return RawDevice(
        f"{gw}/{rid}#5",
        f"IO ({rid}#5)",
        "CumulativeElectricPowerConsumptionSensor",
        place,
        {"core:ElectricEnergyConsumptionState": wh},
        [],
        ui_class="ConsumptionSensor",
    )


def _bridge(gw: str, rid: str) -> RawDevice:
    return RawDevice(f"{gw}/{rid}", f"IO ({rid})", "IOStack", "p-house", {}, ["discoverActuators"])


def atlantic_house() -> House:
    g, maker = ATLANTIC_GATEWAY, "Atlantic"
    root = _root(
        ("p-sejour", "Séjour"),
        ("p-bureau", "Bureau"),
        ("p-sdb", "Salle de bain"),
        ("p-cellier", "Cellier"),
    )
    devices = [
        _setpoint(g, "21000001", "p-sejour", maker),
        _temp(g, "21000001", "p-sejour", 20.6),
        _contact(g, "21000001", "p-sejour"),
        _meter(g, "21000001", "p-sejour", 3_100_000),
        _pilot(g, "21000002", "p-bureau", maker, "eco", FOUR_LEVELS),
        _temp(g, "21000002", "p-bureau", 18.4),
        _dryer(g, "21000003", "p-sdb", maker, "internal", ["permanentHeating", "boost", "drying"]),
        _temp(g, "21000003", "p-sdb", 21.2),
        _meter(g, "21000003", "p-sdb", 900_000),
        RawDevice(
            f"{g}/21000004#1",
            "Chauffe-eau",
            "DomesticHotWaterProduction",
            "p-cellier",
            {"core:NameState": "Chauffe-eau", "core:StatusState": "available"},
            [],
            ui_class="WaterHeatingSystem",
        ),
        _bridge(g, "1700001"),
    ]
    return root, devices


def thermor_house() -> House:
    g, maker = THERMOR_GATEWAY, "Thermor"
    root = _root(
        ("p-salon", "Salon"),
        ("p-chambre", "Chambre"),
        ("p-sdb", "Salle d’eau"),
        ("p-garage", "Garage"),
    )
    devices = [
        _pilot(g, "31000001", "p-salon", maker, "comfort", SIX_LEVELS),
        _temp(g, "31000001", "p-salon", 20.3),
        _pilot(g, "31000002", "p-chambre", maker, "off", None),
        _temp(g, "31000002", "p-chambre", 16.9),
        _dryer(g, "31000003", "p-sdb", maker, "standby", ["permanentHeating", "boost"]),
        RawDevice(
            f"{g}/31000004#1",
            "Zone PAC",
            "AtlanticPassAPCHeatingZone",
            "p-salon",
            {
                "core:NameState": "Zone PAC",
                "core:TargetTemperatureState": 20.0,
                "core:StatusState": "available",
            },
            ["setOperatingMode", "setTargetTemperature"],
            ui_class="HeatingSystem",
        ),
        _temp(g, "31000004", "p-salon", 20.1),
        RawDevice(
            f"{g}/31000005#1",
            "Pompe à chaleur",
            "AtlanticPassAPCHeatPump",
            "p-garage",
            {"core:NameState": "Pompe à chaleur", "core:StatusState": "available"},
            [],
            ui_class="HeatPumpSystem",
        ),
        _bridge(g, "1700002"),
    ]
    return root, devices


def experimental_house() -> House:
    g = EXPERIMENTAL_GATEWAY
    root = _root(("p-sejour", "Séjour"), ("p-chambre", "Chambre"))
    devices = [
        _pilot(g, "41000001", "p-chambre", "Atlantic", "eco", FOUR_LEVELS),
        _temp(g, "41000001", "p-chambre", 18.8),
        RawDevice(
            f"{g}/41000002#1",
            "Chauffage",
            "SomfyHeatingTemperatureInterface",
            "p-sejour",
            {"core:NameState": "Chauffage", "core:TargetTemperatureState": 20.5},
            ["setTargetTemperature", "setOperatingMode"],
            ui_class="HeatingSystem",
        ),
        _temp(g, "41000002", "p-sejour", 20.0),
        RawDevice(
            f"{g}/41000003#1",
            "Volet",
            "PositionableRollerShutter",
            "p-sejour",
            {"core:ClosureState": 0, "core:StatusState": "available"},
            ["open", "close", "setClosure"],
            ui_class="RollerShutter",
        ),
        _bridge(g, "1700003"),
    ]
    return root, devices


HOUSES: dict[str, Callable[[], House]] = {
    "sauter": sample_house,
    "atlantic": atlantic_house,
    "thermor": thermor_house,
    "experimental": experimental_house,
}

_BY_SERVER = {
    "sauter_cozytouch": "sauter",
    "atlantic_cozytouch": "atlantic",
    "thermor_cozytouch": "thermor",
}


def house_for_server(server: str) -> str:
    return _BY_SERVER.get(server, "experimental")
