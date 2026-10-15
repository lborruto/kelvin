"""Capabilities per radiator (Plan 12): the profile, the device's commands, its allowed values."""

from kelvin.house.model import build_house
from kelvin.overkiz.models import RawDevice, RawPlace
from kelvin.overkiz.sample import sample_house

G = "io://9999-0000-1111"


def _house(devices: list[RawDevice], server: str = "atlantic_cozytouch"):
    root = RawPlace("h", "All House", (RawPlace("p-a", "Bureau"), RawPlace("p-b", "Salle de bain")))
    return build_house(root, devices, server=server)


def _pilot(values: list[str] | None, level="eco", commands=("setHeatingLevel",)) -> list[RawDevice]:
    return [
        RawDevice(
            f"{G}/1#1",
            "Bureau",
            "AtlanticElectricalHeater",
            "p-a",
            {"core:NameState": "Radiateur", "io:TargetHeatingLevelState": level},
            list(commands),
            ui_class="HeatingSystem",
            state_values={"io:TargetHeatingLevelState": values} if values else {},
        ),
        RawDevice(
            f"{G}/1#2", "IO", "TemperatureSensor", "p-a", {"core:TemperatureState": 19.5}, []
        ),
    ]


def _dryer(temp_values=("permanentHeating", "boost", "drying")) -> list[RawDevice]:
    return [
        RawDevice(
            f"{G}/2#1",
            "Sèche-serviettes",
            "AtlanticElectricalTowelDryer",
            "p-b",
            {
                "core:OperatingModeState": "external",
                "core:TargetTemperatureState": 21.0,
                "core:MaximumHeatingTargetTemperatureState": 26.0,
                "io:TowelDryerTemporaryStateState": "permanentHeating",
            },
            [
                "setTowelDryerOperatingMode",
                "setTargetTemperature",
                "setTowelDryerTemporaryState",
                "identify",
            ],
            ui_class="HeatingSystem",
            state_values={"io:TowelDryerTemporaryStateState": list(temp_values)},
        ),
        RawDevice(
            f"{G}/2#5",
            "IO",
            "CumulativeElectricPowerConsumptionSensor",
            "p-b",
            {"core:ElectricEnergyConsumptionState": 1000},
            [],
        ),
    ]


def test_the_sauter_radiators_keep_every_control():
    root, devices = sample_house()
    house = build_house(root, devices)
    for r in house.radiators.values():
        assert (r.kind, r.support) == ("setpoint_heater", "tested")
        v = r.view()
        assert (v["kind"], v["support"], v["dryer"]) == ("setpoint_heater", "tested", None)
        assert v["capabilities"] == {
            "modes": ["off", "manual", "program"],
            "manual": [7.0, 28.0],
            "comfort": [12.0, 28.0],
            "eco": [1.0, 8.0],
            "levels": [],
            "program": True,
            "dryer": [],
            "window_detection": True,
            "presence_detection": True,
            "night_light": True,
            "night_light_intensity": True,
            "identify": True,
            "energy": True,
            "boost": True,
            "read_only": False,
        }


def test_a_stored_setup_without_ui_class_builds_the_same_radiators():
    root, devices = sample_house()
    assert all(d.ui_class == "" for d in devices)  # like a setup stored before Plan 12
    house = build_house(root, devices)
    assert sorted(house.radiators) == ["14172536", "8370011", "8370022", "9312063"]
    assert house.radiators["9312063"].mode == "program"


def test_the_server_sets_the_support():
    root, devices = sample_house()
    atlantic = build_house(root, devices, server="atlantic_cozytouch")
    assert {r.support for r in atlantic.radiators.values()} == {"expected"}
    flexom = build_house(root, devices, server="flexom")
    assert {r.support for r in flexom.radiators.values()} == {"experimental"}


def test_a_pilot_wire_heater_offers_its_allowed_levels_and_no_setpoint():
    r = _house(_pilot(["off", "frostprotection", "eco", "comfort"])).radiators["1"]
    c = r.capabilities
    assert (r.kind, r.support, r.mode) == ("pilot_wire_heater", "expected", "manual")
    assert c.levels == ("comfort", "eco", "frostprotection", "off")
    assert c.modes == () and c.manual is None and c.comfort is None and c.eco is None
    assert not c.program and not c.boost and not c.read_only
    assert r.view()["heating_level"] == "eco"


def test_a_pilot_wire_heater_without_listed_values_offers_every_level():
    r = _house(_pilot(None, level="off")).radiators["1"]
    assert r.capabilities.levels == (
        "comfort",
        "comfort-1",
        "comfort-2",
        "eco",
        "frostprotection",
        "off",
    )
    assert r.mode == "off"


def test_a_towel_dryer_has_modes_a_setpoint_and_boost_and_drying():
    r = _house(_dryer()).radiators["2"]
    c = r.capabilities
    assert (r.kind, r.mode, r.dryer) == ("towel_dryer", "manual", None)
    assert c.modes == ("off", "manual", "program")
    assert c.manual == (7.0, 26.0) and c.comfort is None and c.eco is None
    assert c.dryer == ("boost", "drying") and c.boost and c.identify and c.energy
    assert not c.program  # its programme format is not Kelvin's
    only_boost = _house(_dryer(("permanentHeating", "boost"))).radiators["2"]
    assert only_boost.capabilities.dryer == ("boost",)


def test_unexpected_state_values_read_as_unknown():
    r = _house(_pilot(None, level="comfort-3")).radiators["1"]
    assert r.mode == "other"
    devices = _dryer()
    devices[0].states["io:TowelDryerTemporaryStateState"] = "unknown"
    devices[0].states["core:OperatingModeState"] = "auto"
    d = _house(devices).radiators["2"]
    assert (d.mode, d.dryer) == ("other", None)
    d.view()  # never raises


def test_a_heater_without_commands_offers_nothing():
    r = _house(_pilot(None, commands=())).radiators["1"]
    assert r.capabilities.read_only and r.support == "expected"


def test_an_unknown_heater_is_a_read_only_radiator_in_its_room():
    devices = [
        RawDevice(
            f"{G}/3#1",
            "Plancher",
            "SomfyHeatingTemperatureInterface",
            "p-a",
            {"core:TargetTemperatureState": 20.0, "core:OperatingModeState": "manu"},
            ["setTargetTemperature", "setOperatingMode"],
            ui_class="HeatingSystem",
        )
    ]
    house = _house(devices)
    r = house.radiators["3"]
    assert (r.kind, r.support, r.mode) == ("heater_unknown", "readonly", "other")
    assert r.capabilities.read_only and r.capabilities.view()["read_only"] is True
    assert house.rooms["p-a"].radiator_ids == ["3"]


def test_water_heaters_heat_pumps_and_other_devices_are_never_radiators():
    """They are never commanded; Task 17 lists them read-only in the device tree once Plan 8b's
    setup view exists (the `appliances` assertions live there)."""
    devices = [
        *_pilot(None),
        RawDevice(
            f"{G}/4#1",
            "Chauffe-eau",
            "DomesticHotWaterProduction",
            "p-b",
            {"core:StatusState": "available"},
            [],
            ui_class="WaterHeatingSystem",
        ),
        RawDevice(
            f"{G}/5#1", "PAC", "AtlanticPassAPCHeatPump", "h", {}, [], ui_class="HeatPumpSystem"
        ),
        RawDevice(
            f"{G}/6#1",
            "Volet",
            "PositionableRollerShutter",
            "p-b",
            {},
            ["open", "close"],
            ui_class="RollerShutter",
        ),
        RawDevice(f"{G}/7", "IO", "IOStack", "h", {}, ["discoverActuators"]),
    ]
    house = _house(devices)
    assert sorted(house.radiators) == ["1"]
    for url in (f"{G}/4#1", f"{G}/5#1", f"{G}/6#1", f"{G}/7"):
        assert house.radiator_for_url(url) is None
    r = house.radiators["1"]
    assert (r.kind, r.support) == ("pilot_wire_heater", "expected")
    assert sorted(house.rooms) == ["p-a"]  # a place with only a water heater is no room today
