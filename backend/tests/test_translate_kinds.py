"""The command layer per kind (Plan 12). Sauter itself is pinned by test_sauter_golden.py."""

import pytest
from asgi_lifespan import LifespanManager
from httpx import ASGITransport, AsyncClient

from kelvin.api.app import create_app
from kelvin.commands.service import expected_by_radiator
from kelvin.commands.translate import (
    CommandError,
    plan_dryer,
    plan_feature,
    plan_identify,
    plan_level,
    plan_mode,
    plan_off,
    plan_program,
    plan_setpoint,
)
from kelvin.config import Settings
from kelvin.house.model import build_house
from kelvin.overkiz.fake import FakeGateway
from kelvin.overkiz.models import RawDevice, RawPlace
from tests.conftest import ManualClock

G = "io://4567-8901-2345"  # an invented simulator gateway (test_repo_hygiene)
ROOT = RawPlace("h", "All House", (RawPlace("p-a", "Bureau"), RawPlace("p-b", "Salle de bain")))
PILOT = f"{G}/1#1"
DRYER = f"{G}/2#1"
UNKNOWN = f"{G}/3#1"


def _devices() -> list[RawDevice]:
    return [
        RawDevice(
            PILOT,
            "Bureau",
            "AtlanticElectricalHeater",
            "p-a",
            {"io:TargetHeatingLevelState": "eco", "core:NameState": "Radiateur"},
            ["setHeatingLevel"],
            ui_class="HeatingSystem",
            state_values={
                "io:TargetHeatingLevelState": ["off", "frostprotection", "eco", "comfort"]
            },
        ),
        RawDevice(
            DRYER,
            "Sèche-serviettes",
            "AtlanticElectricalTowelDryer",
            "p-b",
            {
                "core:OperatingModeState": "internal",
                "core:TargetTemperatureState": 21.0,
                "io:TowelDryerTemporaryStateState": "permanentHeating",
                "core:NameState": "Sèche-serviettes",
            },
            ["setTowelDryerOperatingMode", "setTargetTemperature", "setTowelDryerTemporaryState"],
            ui_class="HeatingSystem",
        ),
        RawDevice(
            UNKNOWN,
            "Plancher",
            "SomfyHeatingTemperatureInterface",
            "p-a",
            {"core:TargetTemperatureState": 20.0},
            ["setTargetTemperature", "setOperatingMode", "identify"],
            ui_class="HeatingSystem",
        ),
    ]


@pytest.fixture
def house():
    return build_house(ROOT, _devices(), server="atlantic_cozytouch")


def _cmds(planned):
    return [(c.device_url, c.name, c.parameters) for c in planned.commands]


def _exp(planned):
    return [(e.device_url, e.name, e.value) for e in planned.expectations]


def test_a_pilot_wire_heater_takes_levels(house):
    r = house.radiators["1"]
    p = plan_level(r, "frostprotection")
    assert _cmds(p) == [(PILOT, "setHeatingLevel", ("frostprotection",))]
    assert _exp(p) == [(PILOT, "io:TargetHeatingLevelState", "frostprotection")]
    assert _cmds(plan_off(r)) == [(PILOT, "setHeatingLevel", ("off",))]
    with pytest.raises(CommandError) as e:
        plan_level(r, "comfort-1")  # not among this device's allowed values
    assert e.value.code == "unsupported_command"
    with pytest.raises(CommandError) as e:
        plan_level(r, "turbo")
    assert (e.value.code, e.value.params) == ("level_unknown", {"level": "turbo"})
    for attempt in (
        lambda: plan_mode(r, "manual"),
        lambda: plan_setpoint(r, "manual", 20.0),
        lambda: plan_program(r, {}),
        lambda: plan_dryer(r, "boost"),
    ):
        with pytest.raises(CommandError) as e:
            attempt()
        assert e.value.code == "unsupported_command"


def test_a_towel_dryer_takes_its_modes_setpoint_and_temporary_states(house):
    r = house.radiators["2"]
    assert _cmds(plan_mode(r, "manual")) == [(DRYER, "setTowelDryerOperatingMode", ("external",))]
    assert _exp(plan_mode(r, "off")) == [(DRYER, "core:OperatingModeState", "standby")]
    assert _cmds(plan_off(r)) == [(DRYER, "setTowelDryerOperatingMode", ("standby",))]
    assert _cmds(plan_setpoint(r, "manual", 22.5)) == [(DRYER, "setTargetTemperature", (22.5,))]
    assert _cmds(plan_dryer(r, "drying")) == [(DRYER, "setTowelDryerTemporaryState", ("drying",))]
    assert _exp(plan_dryer(r, "stop")) == [
        (DRYER, "io:TowelDryerTemporaryStateState", "permanentHeating")
    ]
    with pytest.raises(CommandError) as e:
        plan_dryer(r, "spin")
    assert e.value.code == "dryer_action_unknown"
    for kind in ("comfort", "eco"):
        with pytest.raises(CommandError) as e:
            plan_setpoint(r, kind, 3.0 if kind == "eco" else 19.0)
        assert e.value.code == "unsupported_command"
    with pytest.raises(CommandError):
        plan_program(r, {})


def test_a_read_only_device_refuses_every_command(house):
    r = house.radiators["3"]
    for attempt in (
        lambda: plan_mode(r, "off"),
        lambda: plan_setpoint(r, "manual", 20.0),
        lambda: plan_level(r, "eco"),
        lambda: plan_dryer(r, "boost"),
        lambda: plan_program(r, {}),
        lambda: plan_feature(r, "window_detection", True),
        lambda: plan_identify(r),
        lambda: plan_off(r),
    ):
        with pytest.raises(CommandError) as e:
            attempt()
        assert e.value.code == "read_only_device"


def test_expected_keys_follow_the_profile(house):
    planned = plan_mode(house.radiators["2"], "manual") + plan_level(
        house.radiators["1"], "comfort"
    )
    planned = planned + plan_dryer(house.radiators["2"], "boost")
    assert expected_by_radiator(house, planned) == {
        "2": {"mode": "manual", "dryer": "boost"},
        "1": {"level": "comfort"},
    }
    assert expected_by_radiator(house, plan_dryer(house.radiators["2"], "stop")) == {
        "2": {"dryer": None}
    }


async def test_a_towel_dryer_boost_restores_target_then_mode(tmp_path):
    clock = ManualClock()
    gw = FakeGateway(ROOT, _devices(), clock=clock, server="atlantic_cozytouch")
    app = create_app(
        Settings(_env_file=None, kelvin_data=tmp_path, kelvin_fake=True), gw, start_tasks=False
    )
    async with LifespanManager(app):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://t", headers={"X-Kelvin": "1"}
        ) as c:
            r = await c.post(
                "/api/auth/login",
                json={
                    "email": "demo@kelvin.local",
                    "password": "kelvin",
                    "server": "atlantic_cozytouch",
                },
            )
            assert r.status_code == 200, r.text
            rt = app.state.ctx.rt
            r = await c.post("/api/rooms/p-b/boost", json={"temperature": 23.0, "duration_min": 60})
            assert r.status_code == 202, r.text
            assert [(x.name, x.parameters) for x in gw.executed[-1]] == [
                ("setTowelDryerOperatingMode", ("external",)),
                ("setTargetTemperature", (23.0,)),
            ]
            clock.advance(2)
            await rt.pump.run_once()
            assert rt.house.radiators["2"].mode == "manual"
            ov = rt.overrides.active()[0]
            assert (await c.delete(f"/api/overrides/{ov['id']}")).status_code == 202
            assert [(x.name, x.parameters) for x in gw.executed[-1]] == [
                ("setTargetTemperature", (21.0,)),
                ("setTowelDryerOperatingMode", ("internal",)),
            ]
            clock.advance(2)
            await rt.pump.run_once()
            assert rt.house.radiators["2"].mode == "program"
