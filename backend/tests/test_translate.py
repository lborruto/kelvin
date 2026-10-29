import pytest

from kelvin.commands.translate import (
    CommandError,
    Expectation,
    Planned,
    normalize_program,
    plan_feature,
    plan_identify,
    plan_light,
    plan_mode,
    plan_program,
    plan_setpoint,
)
from kelvin.house.model import build_house
from kelvin.overkiz.models import DeviceCommand
from kelvin.overkiz.sample import sample_house


@pytest.fixture
def r():
    return build_house(*sample_house()).radiators["9500003"]


def test_mode_maps_to_overkiz(r):
    p = plan_mode(r, "manual")
    assert p.commands == (DeviceCommand(r.heater_url, "setOperatingMode", ("basic",)),)
    assert p.expectations == (Expectation(r.heater_url, "core:OperatingModeState", "basic"),)


def test_unknown_mode_rejected(r):
    with pytest.raises(CommandError):
        plan_mode(r, "turbo")


def test_manual_setpoint(r):
    p = plan_setpoint(r, "manual", 21.5)
    assert p.commands[0] == DeviceCommand(r.heater_url, "setTargetTemperature", (21.5,))
    assert p.expectations[0].name == "core:TargetTemperatureState"


@pytest.mark.parametrize("value", [21.3, 6.5, 28.5])
def test_manual_setpoint_validation(r, value):
    with pytest.raises(CommandError):
        plan_setpoint(r, "manual", value)


def test_comfort_setpoint(r):
    p = plan_setpoint(r, "comfort", 20.5)
    assert p.commands[0].name == "setComfortTemperature"
    assert p.expectations[0].name == "core:ComfortRoomTemperatureState"


def test_sauter_refuses_an_eco_lowering_of_1_before_anything_is_sent(r):
    # Verified 2026-10-28 on Sauter setpoint heaters: 1 refused by the radiator, 2 and 3.5 taken.
    assert r.support == "tested"
    with pytest.raises(CommandError) as e:
        plan_setpoint(r, "eco", 1.0)
    assert (e.value.code, e.value.params) == ("temp_range", {"kind": "eco", "min": 2.0, "max": 8.0})
    with pytest.raises(CommandError):
        plan_setpoint(r, "eco", 1.5)
    for v in (2.0, 2.5, 8.0):  # half degrees stay allowed (3.5 verified)
        assert plan_setpoint(r, "eco", v).commands[0].parameters == (v,)


def test_other_servers_keep_the_expected_eco_range():
    # Not verified elsewhere: an Atlantic adjustable-setpoint heater keeps [1, 8].
    house = build_house(*sample_house(), server="atlantic_cozytouch")
    r = house.radiators["9500003"]
    assert (r.kind, r.support) == ("setpoint_heater", "expected")
    assert r.capabilities.eco == (1.0, 8.0)
    assert plan_setpoint(r, "eco", 1.0).commands[0].parameters == (1.0,)
    with pytest.raises(CommandError) as e:
        plan_setpoint(r, "eco", 0.5)
    assert e.value.params == {"kind": "eco", "min": 1.0, "max": 8.0}


def test_eco_setpoint_is_a_delta(r):
    p = plan_setpoint(r, "eco", 3.5)
    assert p.commands[0] == DeviceCommand(r.heater_url, "setEcoTemperature", (3.5,))
    with pytest.raises(CommandError):
        plan_setpoint(r, "eco", 9.0)


def test_expectation_matches_numbers_loosely():
    e = Expectation("u", "s", 20.0)
    assert e.matches(20) and e.matches("20") and e.matches(20.004)
    assert not e.matches(20.5) and not e.matches(None) and not e.matches("abc")
    assert Expectation("u", "s", "basic").matches("basic")


def test_planned_add():
    a = Planned((DeviceCommand("u", "a"),), (Expectation("u", "s", 1),))
    b = Planned((DeviceCommand("v", "b"),))
    assert (a + b).commands == (DeviceCommand("u", "a"), DeviceCommand("v", "b"))
    assert len((a + b).expectations) == 1


def test_normalize_program_pads_sorts_and_orders_days():
    out = normalize_program(
        {"tuesday": [{"start": "17:30", "end": "22:30"}, {"start": "06:00", "end": "07:30"}]}
    )
    assert [next(iter(d)) for d in out] == [
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
    ]
    assert out[0] == {"monday": [{"start": "00:00", "end": "00:00"}] * 3}
    assert out[1]["tuesday"] == [
        {"start": "06:00", "end": "07:30"},
        {"start": "17:30", "end": "22:30"},
        {"start": "00:00", "end": "00:00"},
    ]


@pytest.mark.parametrize(
    "slots",
    [
        [{"start": "08:00", "end": "07:00"}],
        [{"start": "08:00", "end": "10:00"}, {"start": "09:00", "end": "11:00"}],
        [{"start": f"0{i}:00", "end": f"0{i}:30"} for i in range(4)],
        [{"start": "25:00", "end": "26:00"}],
        [{"start": "8h", "end": "9h"}],
    ],
)
def test_normalize_program_rejects_invalid(slots):
    with pytest.raises(CommandError, match="^lundi : "):
        normalize_program({"monday": slots})


def test_normalize_program_errors_name_the_day_in_french():
    with pytest.raises(CommandError, match="^dimanche : 3 plages"):
        normalize_program({"sunday": [{"start": f"0{i}:00", "end": f"0{i}:30"} for i in range(4)]})
    with pytest.raises(CommandError, match="^mercredi : heure invalide"):
        normalize_program({"wednesday": [{"start": "8h", "end": "9h"}]})


def test_plan_program_expects_same_payload(r):
    p = plan_program(r, {"monday": [{"start": "06:30", "end": "08:00"}]})
    payload = p.commands[0].parameters[0]
    assert p.commands[0].name == "setTimeProgram"
    assert p.expectations[0] == Expectation(r.heater_url, "core:TimeProgramState", payload)


def test_features(r):
    p = plan_feature(r, "window_detection", False)
    assert p.commands[0] == DeviceCommand(
        r.heater_url, "setOpenWindowDetectionActivation", ("inactive",)
    )
    p = plan_feature(r, "presence_detection", True)
    assert p.expectations[0] == Expectation(r.heater_url, "core:OccupancyActivationState", "active")
    with pytest.raises(CommandError):
        plan_feature(r, "turbo", True)


def test_light(r):
    p = plan_light(r, True, 40)
    assert [c.name for c in p.commands] == ["on", "setIntensity"]
    assert p.commands[0].device_url == r.urls["light"]
    with pytest.raises(CommandError):
        plan_light(r, True, 0)


def test_light_missing_is_an_error(r):
    del r.urls["light"]
    with pytest.raises(CommandError):
        plan_light(r, True)


def test_identify_has_no_expectation(r):
    p = plan_identify(r)
    assert p.commands[0].name in ("identify", "wink") and p.expectations == ()


def test_unsupported_command_rejected(r):
    r.commands[r.heater_url] = []
    with pytest.raises(CommandError):
        plan_mode(r, "off")


DEVICE_ORIG = {
    day: [
        {"start": "06:15", "end": "08:00"},
        {"start": "17:30", "end": "22:30"},
        {"start": "00:00", "end": "00:00"},
    ]
    for day in ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")
}


def test_normalize_program_round_trips_device_payload():
    out = normalize_program(DEVICE_ORIG)
    assert out == [{day: DEVICE_ORIG[day]} for day in DEVICE_ORIG]


def test_normalize_program_drops_empty_slots_before_validation():
    out = normalize_program(
        {
            "monday": [
                {"start": "06:15", "end": "08:00"},
                {"start": "00:00", "end": "00:00"},
                {"start": "00:00", "end": "00:00"},
            ]
        }
    )
    assert out[0] == {
        "monday": [
            {"start": "06:15", "end": "08:00"},
            {"start": "00:00", "end": "00:00"},
            {"start": "00:00", "end": "00:00"},
        ]
    }


@pytest.mark.parametrize(
    "week",
    [
        {"mon": [{"start": "06:00", "end": "07:00"}]},
        {"Monday": [{"start": "06:00", "end": "07:00"}]},
    ],
)
def test_normalize_program_rejects_unknown_day_keys(week):
    with pytest.raises(CommandError, match="Jour inconnu"):
        normalize_program(week)


def test_light_off_emits_single_off_command(r):
    p = plan_light(r, False)
    assert p.commands == (DeviceCommand(r.urls["light"], "off", ()),)
    assert p.expectations == (Expectation(r.urls["light"], "core:OnOffState", "off"),)


def test_light_off_with_intensity_rejected(r):
    with pytest.raises(CommandError):
        plan_light(r, False, 40)


def test_command_errors_carry_codes_and_key_params(r):
    with pytest.raises(CommandError) as e:
        normalize_program({"sunday": [{"start": f"0{i}:00", "end": f"0{i}:30"} for i in range(4)]})
    assert (e.value.code, e.value.params) == ("program_too_many", {"day": "sunday"})
    with pytest.raises(CommandError) as e:
        plan_setpoint(r, "eco", 9.0)
    assert (e.value.code, e.value.params) == ("temp_range", {"kind": "eco", "min": 2.0, "max": 8.0})
    assert str(e.value) == "L’abaissement éco doit être comprise entre 2 et 8 °C."
    with pytest.raises(CommandError) as e:
        plan_mode(r, "turbo")
    assert (e.value.code, e.value.params) == ("mode_unknown", {"mode": "turbo"})


def test_programme_expectation_reads_what_the_radiator_holds():
    from kelvin.commands.translate import program_diff

    sent = [
        {"monday": [{"start": "06:15", "end": "08:00"}, {"start": "00:00", "end": "00:00"}]},
        {"tuesday": [{"start": "00:00", "end": "00:00"}]},
    ]
    e = Expectation("u", "core:TimeProgramState", sent)
    assert e.matches(sent)
    # Days in another order, seconds, no empty markers, keys in another order: the same week.
    assert e.matches([{"tuesday": []}, {"monday": [{"end": "08:00:00", "start": "06:15:00"}]}])
    # Another time, a missing day, unreadable values: not the same.
    assert not e.matches([{"monday": [{"start": "06:00", "end": "08:00"}]}, {"tuesday": []}])
    assert not e.matches([{"monday": [{"start": "06:15", "end": "08:00"}]}])
    assert not e.matches(None) and not e.matches("x")
    assert not e.matches([{"monday": [{"start": "6h15", "end": "8h"}]}, {"tuesday": []}])
    assert program_diff(sent, [{"monday": []}, {"tuesday": []}]) == ["monday"]
    assert program_diff(sent, "x") is None


def test_plan_program_refuses_a_time_off_the_radiators_step(r):
    """Owner's Sauter radiators (2026-10-17): 17:45 sent, 17:00 kept. A time the radiator cannot
    hold is refused before anything is sent."""
    assert r.capabilities.program_step_minutes == 30
    with pytest.raises(CommandError) as e:
        plan_program(r, {"monday": [{"start": "17:45", "end": "22:00"}]})
    assert (e.value.code, e.value.params) == (
        "program_step",
        {"day": "monday", "value": "17:45", "minutes": 30},
    )
    nb = "\xa0"
    assert str(e.value) == (
        f"lundi{nb}: 17:45 n’est pas possible, le radiateur ne garde que des heures"
        f" par pas de 30{nb}min."
    )
    plan_program(r, {"monday": [{"start": "17:30", "end": "22:00"}]})  # on the step: fine


def test_plan_program_accepts_a_time_the_radiator_already_holds(r):
    # The simulator's weekdays hold 06:15 (off the step): a time the radiator holds is one it
    # keeps, so a day re-sent as held, or edited around it, or copied elsewhere, still goes.
    held = r.program["tuesday"]
    assert any(s["start"].endswith(":15") for s in held)
    p = plan_program(
        r,
        {
            "tuesday": held,
            "monday": [{"start": "06:15", "end": "08:00"}],
            "sunday": [{"start": "06:15", "end": "09:00"}],
        },
    )
    assert p.commands[0].name == "setTimeProgram"
    with pytest.raises(CommandError, match="06:20"):
        plan_program(r, {"monday": [{"start": "06:20", "end": "08:00"}]})
