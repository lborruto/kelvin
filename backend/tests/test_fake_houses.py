"""Simulator houses per brand (Plan 12): one test per capability set."""

import pytest
from pydantic import ValidationError
from pyoverkiz.enums import UIClass, UIWidget

from kelvin.api.runtime import make_gateway
from kelvin.commands.service import CommandService
from kelvin.commands.translate import plan_dryer, plan_level, plan_mode, plan_off, plan_setpoint
from kelvin.config import Settings
from kelvin.house.model import build_house
from kelvin.overkiz.fake import FakeGateway
from kelvin.overkiz.houses import (
    ATLANTIC_GATEWAY,
    EXPERIMENTAL_GATEWAY,
    HOUSES,
    THERMOR_GATEWAY,
    house_for_server,
)
from kelvin.overkiz.models import ExecUpdate, StateChange
from kelvin.overkiz.sample import SAMPLE_GATEWAY, sample_house
from tests.conftest import ManualClock

SERVER = {
    "sauter": "sauter_cozytouch",
    "atlantic": "atlantic_cozytouch",
    "thermor": "thermor_cozytouch",
    "experimental": "somfy_europe",
}


def _build(name: str):
    root, devices = HOUSES[name]()
    return build_house(root, devices, server=SERVER[name])


def _summary(house):
    return {
        rid: (r.kind, r.support, r.capabilities.modes, r.capabilities.levels, r.capabilities.dryer)
        for rid, r in sorted(house.radiators.items())
    }


def test_the_sauter_house_is_the_v1_sample():
    assert HOUSES["sauter"]() == sample_house()
    house = _build("sauter")
    assert {r.support for r in house.radiators.values()} == {"tested"}
    assert all(r.capabilities.program and r.capabilities.boost for r in house.radiators.values())


def test_the_atlantic_house():
    house = _build("atlantic")
    modes = ("off", "manual", "program")
    four = ("comfort", "eco", "frostprotection", "off")
    assert _summary(house) == {
        "21000001": ("setpoint_heater", "expected", modes, (), ()),
        "21000002": ("pilot_wire_heater", "expected", (), four, ()),
        "21000003": ("towel_dryer", "expected", modes, (), ("boost", "drying")),
    }
    c = house.radiators["21000001"].capabilities
    assert c.program and c.boost and c.comfort and not c.night_light and c.energy
    assert not house.radiators["21000003"].capabilities.program
    # Rooms with radiators only, today; Task 17 (Plan 8b merged) adds « Cellier » with its
    # water heater.
    assert [r.name for r in house.rooms.values()] == ["Séjour", "Bureau", "Salle de bain"]
    assert house.radiator_for_url(f"{ATLANTIC_GATEWAY}/21000004#1") is None  # the water heater


def test_the_thermor_house():
    house = _build("thermor")
    every = ("comfort", "comfort-1", "comfort-2", "eco", "frostprotection", "off")
    assert _summary(house) == {
        "31000001": ("pilot_wire_heater", "expected", (), every, ()),
        "31000002": ("pilot_wire_heater", "expected", (), every, ()),
        "31000003": ("towel_dryer", "expected", ("off", "manual", "program"), (), ("boost",)),
        "31000004": ("heater_unknown", "readonly", (), (), ()),
    }
    assert house.radiators["31000002"].mode == "off"
    assert house.radiators["31000004"].capabilities.read_only
    assert house.rooms["p-salon"].radiator_ids == ["31000001", "31000004"]  # a mixed room
    assert house.radiator_for_url(f"{THERMOR_GATEWAY}/31000005#1") is None  # the heat pump


def test_the_experimental_house_commands_only_heating():
    house = _build("experimental")
    four = ("comfort", "eco", "frostprotection", "off")
    assert _summary(house) == {
        "41000001": ("pilot_wire_heater", "experimental", (), four, ()),
        "41000002": ("heater_unknown", "readonly", (), (), ()),
    }
    shutter = f"{EXPERIMENTAL_GATEWAY}/41000003#1"
    assert house.radiator_for_url(shutter) is None
    planned = [plan_off(r) for r in house.radiators.values() if not r.capabilities.read_only]
    assert [c.device_url for p in planned for c in p.commands] == [
        f"{EXPERIMENTAL_GATEWAY}/41000001#1"
    ]


def test_every_widget_and_ui_class_is_pyoverkiz_s():
    widgets = {w.value for w in UIWidget}
    classes = {c.value for c in UIClass}
    for name, make in HOUSES.items():
        for d in make()[1]:
            assert d.widget in widgets, (name, d.widget)
            assert d.ui_class in classes or d.ui_class == "", (name, d.ui_class)


async def _settle(gw, house, svc, clock):
    clock.advance(2)
    for ev in await gw.fetch_events():
        if isinstance(ev, StateChange):
            house.apply(ev)
            svc.on_state(ev)
        elif isinstance(ev, ExecUpdate):
            svc.on_exec(ev)


@pytest.mark.parametrize(
    ("name", "rid", "plan", "check"),
    [
        (
            "atlantic",
            "21000002",
            lambda r: plan_level(r, "frostprotection"),
            lambda r: r.heating_level == "frostprotection",
        ),
        ("atlantic", "21000003", lambda r: plan_dryer(r, "drying"), lambda r: r.dryer == "drying"),
        ("atlantic", "21000003", lambda r: plan_mode(r, "off"), lambda r: r.mode == "off"),
        (
            "atlantic",
            "21000003",
            lambda r: plan_setpoint(r, "manual", 24.0),
            lambda r: r.target == 24.0,
        ),
        ("atlantic", "21000001", lambda r: plan_mode(r, "manual"), lambda r: r.mode == "manual"),
        ("thermor", "31000002", lambda r: plan_level(r, "comfort-2"), lambda r: r.mode == "manual"),
        ("thermor", "31000003", lambda r: plan_dryer(r, "boost"), lambda r: r.dryer == "boost"),
        ("experimental", "41000001", lambda r: plan_level(r, "off"), lambda r: r.mode == "off"),
    ],
)
async def test_commands_are_confirmed_on_the_simulator(name, rid, plan, check):
    clock = ManualClock()
    root, devices = HOUSES[name]()
    gw = FakeGateway(root, devices, clock=clock, server=SERVER[name])
    house = build_house(root, devices, server=SERVER[name])
    svc = CommandService(gw, house, clock=clock, wall=clock)
    p = await svc.submit("test", (rid,), plan(house.radiators[rid]))
    await _settle(gw, house, svc, clock)
    assert p.status == "confirmed" and check(house.radiators[rid])


def test_the_house_follows_the_login_server_unless_named(tmp_path):
    def urls(settings, server):
        gw = make_gateway(settings, "demo@kelvin.local", "kelvin", server)
        assert isinstance(gw, FakeGateway) and gw.server == server
        return {u.split("/")[0] + "//" + u.split("/")[2] for u in gw.devices}

    plain = Settings(_env_file=None, kelvin_data=tmp_path, kelvin_fake=True)
    assert urls(plain, "sauter_cozytouch") == {SAMPLE_GATEWAY}
    assert urls(plain, "atlantic_cozytouch") == {ATLANTIC_GATEWAY}
    assert urls(plain, "thermor_cozytouch") == {THERMOR_GATEWAY}
    assert urls(plain, "nexity") == {EXPERIMENTAL_GATEWAY}
    named = Settings(
        _env_file=None, kelvin_data=tmp_path, kelvin_fake=True, kelvin_fake_house="thermor"
    )
    assert urls(named, "sauter_cozytouch") == {THERMOR_GATEWAY}
    assert house_for_server("hi_kumo_asia") == "experimental"


def test_an_unknown_house_name_is_refused():
    with pytest.raises(ValidationError):
        Settings(_env_file=None, kelvin_fake_house="daikin")
