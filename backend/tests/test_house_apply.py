import copy
import json

from kelvin.house.model import build_house
from kelvin.overkiz.models import StateChange
from kelvin.overkiz.sample import SAMPLE_GATEWAY, sample_house

TEMP_URL = f"{SAMPLE_GATEWAY}/9312063#2"


def test_apply_updates_and_returns_radiator_id():
    house = build_house(*sample_house())
    assert house.apply(StateChange(TEMP_URL, "core:TemperatureState", 21.0)) == "9312063"
    assert house.radiators["9312063"].temperature == 21.0


def test_apply_same_value_returns_none():
    house = build_house(*sample_house())
    assert house.apply(StateChange(TEMP_URL, "core:TemperatureState", 20.2)) is None


def test_apply_unknown_device_returns_none():
    house = build_house(*sample_house())
    assert house.apply(StateChange("io://nope/1#1", "core:X", 1)) is None


def test_reload_reports_changed_radiators():
    root, devices = sample_house()
    house = build_house(root, devices)
    devices2 = copy.deepcopy(devices)
    next(d for d in devices2 if d.device_url == TEMP_URL).states["core:TemperatureState"] = 22.0
    assert house.reload(devices2) == {"9312063"}
    assert house.reload(devices2) == set()


def test_view_is_json_serialisable_after_changes():
    house = build_house(*sample_house())
    house.apply(StateChange(TEMP_URL, "core:TemperatureState", "21.5"))
    json.dumps(house.view())


def test_reload_drops_state_keys_missing_from_snapshot():
    root, devices = sample_house()
    house = build_house(root, devices)
    devices2 = copy.deepcopy(devices)
    target = next(d for d in devices2 if d.device_url == TEMP_URL)
    assert "core:TemperatureState" in target.states
    del target.states["core:TemperatureState"]
    assert house.reload(devices2) == {"9312063"}
    assert "core:TemperatureState" not in house.radiators["9312063"].states[TEMP_URL]
    assert house.reload(devices2) == set()


def test_apply_none_value_for_new_key_is_stored():
    house = build_house(*sample_house())
    assert house.apply(StateChange(TEMP_URL, "core:NewState", None)) == "9312063"
    assert "core:NewState" in house.radiators["9312063"].states[TEMP_URL]
