import copy
import json

from kelvin.overkiz.models import (
    RawDevice,
    RawPlace,
    device_from_dict,
    device_to_dict,
    iter_places,
    place_from_dict,
    place_to_dict,
)
from kelvin.overkiz.sample import (
    HOUSE_TYPE,
    ROOM_TYPE,
    SAMPLE_GATEWAY,
    SAMPLE_INTERNAL,
    sample_house,
)


def test_place_roundtrip_and_preorder():
    root = RawPlace("h", "All House", (RawPlace("a", "Salon"), RawPlace("b", "Chambre 1 ")))
    again = place_from_dict(json.loads(json.dumps(place_to_dict(root))))
    assert again == root
    assert [p.oid for p in iter_places(root)] == ["h", "a", "b"]


def test_device_roundtrip():
    d = RawDevice("io://x/1#1", "Radiateur", "W", "a", {"core:NameState": "R"}, ["setName"])
    assert device_from_dict(json.loads(json.dumps(device_to_dict(d)))) == d


def test_sample_house_mirrors_the_home_dump():
    root, devices = sample_house()
    labels = [p.label.strip() for p in iter_places(root)]
    assert labels == ["All House", "Chambre 1", "Salon", "Chambre 2"]
    heaters = [d for d in devices if "Heater" in d.widget]
    assert len(heaters) == 4
    assert all(d.device_url.startswith((SAMPLE_GATEWAY, SAMPLE_INTERNAL)) for d in devices)
    assert {"IOStack", "Pod", "Wifi"} <= {d.widget for d in devices}
    assert root.type == HOUSE_TYPE and {c.type for c in root.children} == {ROOM_TYPE}


def test_sample_heaters_do_not_share_time_program_state():
    from kelvin.overkiz.errors import AuthError, GatewayError, QuotaError
    from kelvin.overkiz.sample import WEEK_PROGRAM

    assert issubclass(QuotaError, GatewayError)
    assert issubclass(AuthError, GatewayError)

    _, heaters = sample_house()
    heaters = [d for d in heaters if "Heater" in d.widget]
    before = copy.deepcopy(WEEK_PROGRAM)
    original_other = copy.deepcopy(heaters[1].states["core:TimeProgramState"])

    heaters[0].states["core:TimeProgramState"][0]["monday"][0]["start"] = "05:00"

    assert heaters[1].states["core:TimeProgramState"] == original_other
    assert WEEK_PROGRAM == before
    _, fresh = sample_house()
    fresh_heater = next(d for d in fresh if "Heater" in d.widget)
    assert fresh_heater.states["core:TimeProgramState"][0]["monday"][0]["start"] == "06:15"


def test_place_type_roundtrips_and_old_dicts_still_load():
    p = RawPlace("h", "All House", (RawPlace("a", "Salon", (), 7),), 0)
    assert place_from_dict(json.loads(json.dumps(place_to_dict(p)))) == p
    assert place_from_dict({"oid": "h", "label": "H", "children": []}).type is None


def test_a_stored_device_without_the_plan_12_fields_still_loads():
    old = {
        "device_url": "io://x/1#1",
        "label": "Radiateur",
        "widget": "AtlanticElectricalHeaterWithAdjustableTemperatureSetpoint",
        "place_oid": "a",
        "states": {},
        "commands": ["setOperatingMode"],
    }
    d = device_from_dict(old)
    assert (d.ui_class, d.state_values) == ("", {})
