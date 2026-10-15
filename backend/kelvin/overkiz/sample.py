"""Synthetic house shaped like an Overkiz dump; used by tests and the simulator.

Every reading, counter and programme here is invented.
"""

import copy
from typing import Any

from kelvin.overkiz.models import RawDevice, RawPlace

SAMPLE_GATEWAY = "io://1234-5678-9012"
# The simulator's « Chambre 2 » heater is unreachable for a while after start (spec §10.2).
DEMO_OUTAGE_RID = "8370022"
DAYS = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")
EMPTY_SLOT = {"start": "00:00", "end": "00:00"}
# An invented programme: two comfort periods on weekdays, one long one at the weekend.
WEEKDAY_SLOTS = [{"start": "06:15", "end": "08:00"}, {"start": "17:30", "end": "22:30"}, EMPTY_SLOT]
WEEKEND_SLOTS = [{"start": "08:30", "end": "22:45"}, EMPTY_SLOT, EMPTY_SLOT]
WEEK_PROGRAM = [
    {day: copy.deepcopy(WEEKEND_SLOTS if day in ("saturday", "sunday") else WEEKDAY_SLOTS)}
    for day in DAYS
]
HEATER_COMMANDS = [
    "setOperatingMode",
    "setTargetTemperature",
    "setComfortTemperature",
    "setEcoTemperature",
    "setTimeProgram",
    "setOpenWindowDetectionActivation",
    "setOccupancyActivation",
    "setName",
    "identify",
    "wink",
]
LIGHT_COMMANDS = ["on", "off", "setIntensity", "setOnOff"]


def _heater(
    rid: str,
    place: str,
    model: str,
    power: int,
    *,
    mode: str,
    target: float,
    comfort: float,
    eco: float,
    level: str,
    effective: float,
) -> RawDevice:
    states: dict[str, Any] = {
        "core:NameState": "Radiateur",
        "core:ManufacturerNameState": "Sauter",
        "core:StatusState": "available",
        "io:ModelState": model,
        "io:PowerState": power,
        "core:OperatingModeState": mode,
        "core:TargetTemperatureState": target,
        "core:ComfortRoomTemperatureState": comfort,
        "core:EcoRoomTemperatureState": eco,
        "io:TargetHeatingLevelState": level,
        "io:EffectiveTemperatureSetpointState": effective,
        "core:MaximumHeatingTargetTemperatureState": 28.0,
        "core:OpenWindowDetectionActivationState": "active",
        "core:OccupancyActivationState": "inactive",
        "io:CurrentWorkingRateState": 0.0,
        "core:RSSILevelState": 100.0,
        "core:TimeProgramState": copy.deepcopy(WEEK_PROGRAM),
    }
    return RawDevice(
        f"{SAMPLE_GATEWAY}/{rid}#1",
        "Radiateur",
        "AtlanticElectricalHeaterWithAdjustableTemperatureSetpoint",
        place,
        states,
        list(HEATER_COMMANDS),
    )


def _sensors(rid: str, place: str, temp: float, wh: tuple[int, int, int]) -> list[RawDevice]:
    base = f"{SAMPLE_GATEWAY}/{rid}"
    return [
        RawDevice(
            f"{base}#2",
            f"IO ({rid}#2)",
            "TemperatureSensor",
            place,
            {"core:TemperatureState": temp, "core:StatusState": "available"},
            [],
        ),
        RawDevice(
            f"{base}#3",
            f"IO ({rid}#3)",
            "ContactSensor",
            place,
            {"core:ContactState": "closed"},
            [],
        ),
        RawDevice(
            f"{base}#4",
            f"IO ({rid}#4)",
            "OccupancySensor",
            place,
            {"core:OccupancyState": "noPersonInside"},
            [],
        ),
        RawDevice(
            f"{base}#5",
            f"IO ({rid}#5)",
            "CumulativeElectricPowerConsumptionSensor",
            place,
            {
                "core:ElectricEnergyConsumptionState": wh[0],
                "core:ConsumptionTariff1State": wh[1],
                "core:ConsumptionTariff2State": wh[2],
            },
            [],
        ),
        RawDevice(
            f"{base}#6",
            f"IO ({rid}#6)",
            "DimmerLight",
            place,
            {"core:OnOffState": "off", "core:LightState": "off", "core:LightIntensityState": 1},
            list(LIGHT_COMMANDS),
        ),
    ]


def sample_house() -> tuple[RawPlace, list[RawDevice]]:
    root = RawPlace(
        "p-house",
        "All House",
        (
            RawPlace("p-ch1", "Chambre 1 "),
            RawPlace("p-salon", "Salon"),
            RawPlace("p-ch2", "Chambre 2 "),
        ),
    )
    devices: list[RawDevice] = [
        _heater(
            "14172536",
            "p-salon",
            "HEKLA V",
            2000,
            mode="internal",
            target=20.0,
            comfort=20.0,
            eco=3.0,
            level="eco",
            effective=17.0,
        ),
        *_sensors("14172536", "p-salon", 21.4, (5_250_000, 1_050_000, 4_200_000)),
        _heater(
            "9312063",
            "p-salon",
            "HEKLA P",
            1500,
            mode="internal",
            target=20.0,
            comfort=20.0,
            eco=3.0,
            level="eco",
            effective=17.0,
        ),
        *_sensors("9312063", "p-salon", 20.2, (2_400_000, 500_000, 1_900_000)),
        _heater(
            "8370011",
            "p-ch1",
            "IPALA H BLC",
            1000,
            mode="internal",
            target=19.0,
            comfort=19.0,
            eco=3.5,
            level="off",
            effective=19.0,
        ),
        *_sensors("8370011", "p-ch1", 18.9, (2_050_000, 950_000, 1_100_000)),
        _heater(
            "8370022",
            "p-ch2",
            "IPALA H BLC",
            1000,
            mode="internal",
            target=18.0,
            comfort=18.0,
            eco=3.5,
            level="eco",
            effective=14.5,
        ),
        *_sensors("8370022", "p-ch2", 16.6, (1_800_000, 800_000, 1_000_000)),
        RawDevice(
            f"{SAMPLE_GATEWAY}/1698997",
            "IO (1698997)",
            "IOStack",
            "p-house",
            {},
            ["discoverActuators"],
        ),
    ]
    return root, devices
