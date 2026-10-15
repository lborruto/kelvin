"""The house follows Cozytouch's places and placement (spec §2.7, §6, rulings 4 and 5)."""

import json
from dataclasses import replace

from kelvin.house.model import build_house
from kelvin.overkiz.models import DeviceUpdate, SetupPlace, StateChange
from kelvin.overkiz.sample import ROOM_TYPE, SAMPLE_GATEWAY, SAMPLE_INTERNAL, sample_house
from tests.conftest import ManualClock

S = SAMPLE_GATEWAY


def _house(clock=None):
    root, devices = sample_house()
    return build_house(root, devices, wall=clock or ManualClock(10_000.0))


def test_every_place_is_kept_and_rooms_follow_the_heaters():
    h = _house()
    assert list(h.places) == ["p-house", "p-ch1", "p-salon", "p-ch2"]
    assert [r.id for r in h.rooms.values()] == ["p-ch1", "p-salon", "p-ch2"]
    assert h.room_type() == ROOM_TYPE


def test_moving_the_heater_moves_the_radiator_and_rebuilds_the_rooms():
    h = _house()
    assert h.apply_device_update(DeviceUpdate(f"{S}/8370011#1", "p-salon", None))
    assert h.radiators["8370011"].room_id == "p-salon"
    assert "p-ch1" not in h.rooms  # no radiator left there…
    assert "p-ch1" in h.places  # …but the place itself stays
    assert h.rooms["p-salon"].radiator_ids == ["14172536", "8370011", "9312063"]


def test_a_sub_device_moved_alone_does_not_move_the_radiator():
    h = _house()
    assert h.apply_device_update(DeviceUpdate(f"{S}/8370011#2", "p-salon", None))
    assert h.radiators["8370011"].room_id == "p-ch1"
    rad = next(r for r in h.setup_view()["radiators"] if r["id"] == "8370011")
    dev = next(d for d in rad["devices"] if d["id"] == "8370011#2")
    assert dev["misplaced"] is True and dev["room_id"] == "p-salon"
    assert rad["devices"][0]["misplaced"] is False  # the heater defines the room


def test_an_unchanged_or_unknown_update_is_not_a_layout_change():
    h = _house()
    assert not h.apply_device_update(DeviceUpdate(f"{S}/8370011#1", "p-ch1", "Radiateur"))
    assert not h.apply_device_update(DeviceUpdate(f"{S}/1#1", "p-ch1", None))


def test_the_radiator_name_is_its_heater_label():
    h = _house()
    r = h.radiators["9312063"]
    assert r.name == "Radiateur"
    h.apply_device_update(DeviceUpdate(r.heater_url, None, "Radiateur fenêtre"))
    assert r.name == "Radiateur fenêtre"
    h.apply_device_update(DeviceUpdate(r.heater_url, None, "IO (9312063#1)"))
    assert r.name == "Radiateur"  # a generic label falls back to core:NameState


def test_put_and_remove_place():
    h = _house()
    assert h.put_place(SetupPlace("p-new", "Bureau", ROOM_TYPE))
    assert h.places["p-new"].parent == "p-house" and "p-new" not in h.rooms
    assert not h.put_place(SetupPlace("p-new", "Bureau", ROOM_TYPE))
    assert h.put_place(SetupPlace("p-ch1", "Chambre d’amis", ROOM_TYPE))
    assert h.rooms["p-ch1"].name == "Chambre d’amis"
    assert h.remove_place("p-new") and "p-new" not in h.places
    assert not h.remove_place("p-house") and not h.remove_place("p-nope")


def test_delete_block():
    h = _house()
    h.put_place(SetupPlace("p-new", "Bureau", ROOM_TYPE))
    assert h.delete_block("p-new") is None
    assert h.delete_block("p-salon") == "room_not_empty" and len(h.devices_in("p-salon")) == 12
    assert h.delete_block("p-house") == "room_protected"
    assert h.delete_block("p-nope") == "room_unknown"


def test_a_room_holding_a_bridge_device_is_protected():
    h = _house()
    h.put_place(SetupPlace("p-new", "Bureau", ROOM_TYPE))
    h.apply_device_update(DeviceUpdate(f"{SAMPLE_INTERNAL}/pod/0", "p-new", None))
    assert h.delete_block("p-new") == "room_protected"


def test_a_sub_device_left_behind_still_blocks_its_room():
    h = _house()
    for n in (1, 2, 4, 5, 6):
        h.apply_device_update(DeviceUpdate(f"{S}/8370011#{n}", "p-salon", None))
    assert "p-ch1" not in h.rooms
    assert h.delete_block("p-ch1") == "room_not_empty" and len(h.devices_in("p-ch1")) == 1


def test_a_reload_is_not_an_event_but_a_listener_event_is():
    clock = ManualClock(10_000.0)
    h = _house(clock)
    url = f"{S}/8370011#2"
    assert h.apply(StateChange(url, "core:TemperatureState", 3.0), event=False) == "8370011"
    assert h.last_event_ts == {}
    clock.advance(60)
    assert h.apply(StateChange(url, "core:TemperatureState", 3.0)) is None  # unchanged: v1 contract
    assert h.last_event_ts == {url: 10_060.0}
    h.reload_device(url, {"core:TemperatureState": 4.0})
    assert h.last_event_ts == {url: 10_060.0}


def test_an_unknown_place_is_listed_and_the_radiator_falls_back_to_the_house():
    h = _house()
    h.apply_device_update(DeviceUpdate(f"{S}/8370011#1", "p-elsewhere", None))
    assert h.unknown_places() == {"p-elsewhere"}
    assert h.radiators["8370011"].room_id == "p-house"
    h.put_place(SetupPlace("p-elsewhere", "Bureau", ROOM_TYPE))
    assert h.radiators["8370011"].room_id == "p-elsewhere" and h.unknown_places() == set()


def test_sync_setup_reports_a_layout_change_only_when_something_moved():
    root, devices = sample_house()
    h = build_house(root, devices)
    assert not h.sync_setup(root, devices)
    moved = [
        replace(d, place_oid="p-ch2") if d.device_url.startswith(f"{S}/8370011") else d
        for d in devices
    ]
    assert h.sync_setup(root, moved)
    assert h.radiators["8370011"].room_id == "p-ch2"


def test_room_view_says_which_room_is_the_house():
    h = _house()
    h.apply_device_update(DeviceUpdate(f"{S}/8370011#1", "p-house", None))
    views = {r["id"]: r for r in h.view()["rooms"]}
    assert (views["p-house"]["is_root"], views["p-house"]["name"]) == (True, "Maison")
    assert views["p-salon"]["is_root"] is False


def test_setup_view_lists_every_room_device_and_bridge_without_urls():
    h = _house()
    h.put_place(SetupPlace("p-new", "Bureau", ROOM_TYPE))
    v = h.setup_view()
    assert [(r["id"], r["is_root"], r["block"]) for r in v["rooms"]] == [
        ("p-house", True, "room_protected"),
        ("p-ch1", False, "room_not_empty"),
        ("p-salon", False, "room_not_empty"),
        ("p-ch2", False, "room_not_empty"),
        ("p-new", False, None),
    ]
    rad = next(r for r in v["radiators"] if r["id"] == "9312063")
    assert [d["id"] for d in rad["devices"]] == [f"9312063#{n}" for n in range(1, 7)]
    assert [d["role"] for d in rad["devices"]] == [
        "heater",
        "temperature",
        "window",
        "occupancy",
        "energy",
        "light",
    ]
    heater = rad["devices"][0]
    assert heater["reachable"] is True and heater["label"] == "Radiateur"
    assert heater["details"]["io:PowerState"] == 1500
    assert heater["details"]["core:VersionState"] == "1.4.0"
    assert "core:TimeProgramState" not in heater["details"]
    assert rad["devices"][2]["reachable"] is None  # the contact reports no status here
    assert [(b["id"], b["role"], b["reachable"]) for b in v["bridges"]] == [
        ("bridge-1", "box", True),
        ("bridge-2", "wifi", None),
        ("bridge-3", "bridge", None),
    ]
    text = json.dumps(v)
    assert "io://" not in text and "internal://" not in text
    assert h.device_url_for("bridge-1") == f"{SAMPLE_INTERNAL}/pod/0"
    assert h.device_url_for("9312063#2") == f"{S}/9312063#2"
    assert h.device_url_for("nope") is None


def test_bridge_events_update_their_states_and_last_signal():
    clock = ManualClock(10_000.0)
    h = _house(clock)
    clock.advance(60)
    assert (
        h.apply(StateChange(f"{SAMPLE_INTERNAL}/pod/0", "core:ConnectivityState", "offline"))
        is None
    )
    box = next(b for b in h.setup_view()["bridges"] if b["role"] == "box")
    assert box["reachable"] is False and box["last_event_at"] == 10_060.0
