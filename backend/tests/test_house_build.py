import json
from pathlib import Path

import pytest

from kelvin.house.model import build_house, program_from_state
from kelvin.overkiz.models import device_from_dict, device_to_dict, place_from_dict, place_to_dict
from kelvin.overkiz.sample import WEEK_PROGRAM, sample_house

DUMP = Path(__file__).parent / "fixtures" / "home_dump.json"


@pytest.fixture
def house():
    return build_house(*sample_house())


def test_rooms_follow_place_order_with_stripped_labels(house):
    assert [r.name for r in house.rooms.values()] == ["Chambre 1", "Salon", "Chambre 2"]


def test_salon_groups_two_radiators(house):
    salon = next(r for r in house.rooms.values() if r.name == "Salon")
    assert {house.radiators[i].model for i in salon.radiator_ids} == {"HEKLA V", "HEKLA P"}


def test_bridge_is_not_a_radiator(house):
    assert "1900001" not in house.radiators
    assert len(house.radiators) == 4


def test_radiator_reads_roles(house):
    r = house.radiators["9500003"]
    assert set(r.urls) == {"heater", "temperature", "window", "occupancy", "energy", "light"}
    assert r.temperature == 20.2
    assert r.mode == "program"
    assert r.comfort == 20.0 and r.eco_delta == 3.0 and r.eco == 17.0
    assert r.effective_setpoint == 17.0
    assert r.window_open is False and r.occupied is False
    assert r.window_detection is True and r.presence_detection is False
    assert r.energy_wh == {"total": 2_400_000, "t1": 500_000, "t2": 1_900_000}
    assert r.light_on is False
    assert r.view()["program"]["monday"] == [
        {"start": "06:15", "end": "08:00"},
        {"start": "17:30", "end": "22:30"},
    ]
    assert r.view()["program"]["saturday"] == [{"start": "08:30", "end": "22:45"}]


def test_program_from_state_drops_empty_slots():
    prog = program_from_state(WEEK_PROGRAM)
    assert list(prog) == [
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
    ]
    assert [len(slots) for slots in prog.values()] == [2, 2, 2, 2, 2, 1, 1]
    assert program_from_state(None) == {}


def test_room_view_aggregates(house):
    salon = next(r for r in house.rooms.values() if r.name == "Salon")
    v = house.room_view(salon.id)
    assert v["temperature"] == round((21.4 + 20.2) / 2, 1)
    assert v["mode"] == "program"
    assert v["comfort"] == 20.0
    assert v["radiator_ids"] == salon.radiator_ids


def test_mixed_mode_room(house):
    salon = next(r for r in house.rooms.values() if r.name == "Salon")
    first = house.radiators[salon.radiator_ids[0]]
    first.states[first.heater_url]["core:OperatingModeState"] = "standby"
    assert house.room_view(salon.id)["mode"] == "mixed"


def test_radiator_without_light_or_energy_still_renders():
    root, devices = sample_house()
    devices = [d for d in devices if not d.device_url.endswith(("9000011#5", "9000011#6"))]
    house = build_house(root, devices)
    r = house.radiators["9000011"]
    assert r.energy_wh is None and r.light_on is None
    v = r.view()
    assert v["light"] is None and v["energy_wh"] is None
    json.dumps(house.view())


def test_an_absent_register_is_none_not_zero():
    """Audit H1 case E: an absent T1/T2 state must not read as a 0 Wh counter."""
    root, devices = sample_house()
    meter = next(d for d in devices if d.device_url.endswith("9500003#5"))
    del meter.states["core:ConsumptionTariff1State"]
    r = build_house(root, devices).radiators["9500003"]
    assert r.energy_wh == {"total": 2_400_000, "t1": None, "t2": 1_900_000}


@pytest.mark.skipif(not DUMP.exists(), reason="dump fixture missing")
def test_home_dump_fixture_builds():
    data = json.loads(DUMP.read_text())
    house = build_house(
        place_from_dict(data["places"]), [device_from_dict(d) for d in data["devices"]]
    )
    assert {r.name for r in house.rooms.values()} == {"Salon", "Chambre 1", "Chambre 2"}
    salon = next(r for r in house.rooms.values() if r.name == "Salon")
    assert len(salon.radiator_ids) == 2
    json.dumps(house.view())


def test_home_dump_fixture_is_generated_from_the_simulator():
    root, devices = sample_house()
    expected = {"places": place_to_dict(root), "devices": [device_to_dict(d) for d in devices]}
    assert json.loads(DUMP.read_text()) == expected


@pytest.mark.parametrize(
    ("value", "expected", "locked"),
    [
        ([{"monday": "garbage"}], {}, {"monday": "unrecognised"}),
        (
            [{"monday": [None, 3, {"start": 1, "end": "02:00"}, {"start": "06:00"}]}],
            {},
            {"monday": "unrecognised"},
        ),
        ([{"tuesday": None}, "x", 7], {}, {"tuesday": "unrecognised"}),
    ],
)
def test_malformed_program_state_does_not_break_view(house, value, expected, locked):
    r = house.radiators["9500003"]
    r.states[r.heater_url]["core:TimeProgramState"] = value
    view = next(x for x in house.view()["radiators"] if x["id"] == "9500003")
    assert (view["program"], view["program_locked"]) == (expected, locked)


def test_a_day_with_any_malformed_slot_is_not_half_read():
    value = [{"monday": [None, {"start": "06:00", "end": "08:00"}, {"start": 6}]}]
    assert program_from_state(value) == {}
