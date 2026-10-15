"""Programme days Kelvin cannot edit (spec QW8, ruling 3) and the changed-elsewhere guard."""

import copy

import pytest

from kelvin.api.schemas import ProgramBody
from kelvin.commands.translate import plan_program
from kelvin.house.model import DAY_ORDER, build_house, parse_day, parse_program
from kelvin.overkiz.sample import SAMPLE_GATEWAY, WEEK_PROGRAM, sample_house
from tests.test_api import ctx, settle  # noqa: F401  (the API fixture)

E = {"start": "00:00", "end": "00:00"}


def test_a_midnight_end_reads_as_24_00_and_locks_the_day():
    slots, lock = parse_day([{"start": "22:00", "end": "00:00"}, E, E])
    assert (slots, lock) == ([{"start": "22:00", "end": "24:00"}], "midnight")


@pytest.mark.parametrize(
    "slots",
    [
        "garbage",
        None,
        [{"start": "25:00", "end": "26:00"}],
        [{"start": "08:00"}],
        [{"start": "08:00", "end": "09:00", "mode": "x"}],
        [{"start": 8, "end": "09:00"}],
        [None, {"start": "06:00", "end": "08:00"}],
        [{"start": "09:00", "end": "08:00"}],
        [{"start": "06:00", "end": "08:00"}, {"start": "07:00", "end": "09:00"}],
        [{"start": f"{h:02d}:00", "end": f"{h:02d}:30"} for h in (6, 8, 10, 12)],
    ],
)
def test_unrecognised_shapes_lock_the_day(slots):
    assert parse_day(slots) == (None, "unrecognised")


def test_empty_markers_are_not_slots():
    assert parse_day([E, E, E]) == ([], None)
    got = parse_day([{"start": "06:15", "end": "08:00"}, {"start": "17:30", "end": "22:30"}, E])
    assert got == ([{"start": "06:15", "end": "08:00"}, {"start": "17:30", "end": "22:30"}], None)


@pytest.mark.parametrize(
    "slots",
    [
        # Readable, but not the shape Kelvin writes (sorted slots, then empty markers, three
        # entries, `start` before `end`): a send would rewrite it, so it is locked (ruling, B2).
        [{"start": "17:30", "end": "22:30"}, {"start": "06:15", "end": "08:00"}, E],
        [E, {"start": "08:00", "end": "10:00"}, E],
        [{"start": "08:00", "end": "10:00"}, E, E, E, E],
        [{"start": "08:00", "end": "10:00"}, E],
        [{"end": "10:00", "start": "08:00"}, E, E],
        [{"start": "21:00", "end": "23:00"}, {"start": "06:00", "end": "00:00"}, E],
    ],
)
def test_a_readable_day_not_in_kelvin_s_shape_is_locked_too(slots):
    assert parse_day(slots) == (None, "unrecognised")


def test_a_non_canonical_day_is_resent_byte_for_byte():
    raw = [E, {"start": "08:00", "end": "10:00"}, E]
    r = _house_with("tuesday", raw)
    assert r.program_locked == {"tuesday": "unrecognised"}
    payload = plan_program(r, {"tuesday": [{"start": "08:00", "end": "10:00"}]})
    assert payload.commands[0].parameters[0][1] == {"tuesday": raw}


def test_a_base_names_only_the_seven_days_and_at_most_three_slots():
    with pytest.raises(ValueError):
        ProgramBody.model_validate({"base": {"r": {"funday": []}}})
    four = [{"start": f"0{h}:00", "end": f"0{h}:30"} for h in range(4)]
    with pytest.raises(ValueError):
        ProgramBody.model_validate({"base": {"r": {"monday": four}}})


def test_parse_program_keeps_readable_days_and_lists_locked_ones():
    value = copy.deepcopy(WEEK_PROGRAM)
    value[4] = {"friday": [{"start": "22:00", "end": "00:00"}, E, E]}
    value[5] = {"saturday": [{"start": "aa", "end": "bb"}]}
    program, locked = parse_program(value)
    assert locked == {"friday": "midnight", "saturday": "unrecognised"}
    assert program["friday"] == [{"start": "22:00", "end": "24:00"}]
    assert "saturday" not in program
    assert program["monday"] == [
        {"start": "06:15", "end": "08:00"},
        {"start": "17:30", "end": "22:30"},
    ]
    assert parse_program(None) == ({}, {})


def _house_with(day: str, slots):
    root, devices = sample_house()
    url = f"{SAMPLE_GATEWAY}/9312063#1"
    heater = next(d for d in devices if d.device_url == url)
    prog = heater.states["core:TimeProgramState"]
    i = next(i for i, e in enumerate(prog) if day in e)
    prog[i] = {day: slots}
    return build_house(root, devices).radiators["9312063"]


def test_a_locked_day_is_resent_byte_for_byte_whatever_the_payload_says():
    raw = [{"start": "06:00", "end": "07:00"}, {"start": "06:30", "end": "09:00"}, E, {"x": 1}]
    r = _house_with("friday", raw)
    assert r.program_locked == {"friday": "unrecognised"}
    week = {
        "monday": [{"start": "07:00", "end": "09:00"}],
        "friday": [{"start": "10:00", "end": "11:00"}],
    }
    payload = plan_program(r, week).commands[0].parameters[0]
    assert payload[4] == {"friday": raw}
    assert payload[0] == {"monday": [{"start": "07:00", "end": "09:00"}, E, E]}
    assert payload[1] == {"tuesday": [E, E, E]}  # a readable day left out has no slot, as before


def test_a_midnight_day_is_resent_as_read_and_24_00_is_never_written():
    raw = [{"start": "20:00", "end": "00:00"}, E, E]
    r = _house_with("sunday", raw)
    payload = plan_program(r, {"sunday": []}).commands[0].parameters[0]
    assert payload[6] == {"sunday": raw}
    with pytest.raises(ValueError):
        plan_program(
            _house_with("sunday", [E, E, E]), {"sunday": [{"start": "20:00", "end": "24:00"}]}
        )


async def test_each_radiator_keeps_its_own_locked_day(ctx):  # noqa: F811
    c, rt, clock = ctx
    gw = rt.gateway
    a, b = f"{SAMPLE_GATEWAY}/14172536#1", f"{SAMPLE_GATEWAY}/9312063#1"
    odd = copy.deepcopy(WEEK_PROGRAM)
    odd[4] = {"friday": [{"start": "21:00", "end": "00:00"}, E, E]}
    gw.push_state(a, "core:TimeProgramState", odd)
    await settle(rt, clock)
    week = {d: [{"start": "07:00", "end": "08:00"}] for d in ("monday", "friday")}
    r = await c.put("/api/rooms/p-salon/program", json=week)
    assert r.status_code == 202, r.text
    sent = {cmd.device_url: cmd.parameters[0] for cmd in gw.executed[-1]}
    assert sent[a][4] == {"friday": [{"start": "21:00", "end": "00:00"}, E, E]}
    assert sent[b][4] == {"friday": [{"start": "07:00", "end": "08:00"}, E, E]}
    assert sent[a][0] == sent[b][0] == {"monday": [{"start": "07:00", "end": "08:00"}, E, E]}


def test_the_simulator_has_a_midnight_day_and_an_unrecognised_day():
    root, devices = sample_house()
    r = build_house(root, devices).radiators["8370011"]
    assert r.program_locked == {"saturday": "unrecognised", "sunday": "midnight"}
    assert r.view()["program"]["sunday"] == [{"start": "20:00", "end": "24:00"}]
    assert r.view()["program_locked"] == {"saturday": "unrecognised", "sunday": "midnight"}


async def _salon_base(c):
    house = (await c.get("/api/house")).json()["house"]
    return {r["id"]: r["program"] for r in house["radiators"] if r["room_id"] == "p-salon"}


WEEK = {"monday": [{"start": "07:00", "end": "08:00"}]}


async def test_a_program_changed_in_the_cozytouch_app_is_not_overwritten(ctx):  # noqa: F811
    c, rt, clock = ctx
    base = await _salon_base(c)
    changed = copy.deepcopy(WEEK_PROGRAM)
    changed[0] = {"monday": [{"start": "05:00", "end": "06:00"}, E, E]}
    rt.gateway.push_state(f"{SAMPLE_GATEWAY}/14172536#1", "core:TimeProgramState", changed)
    await settle(rt, clock)
    sent_before = len(rt.gateway.executed)
    r = await c.put("/api/rooms/p-salon/program", json={**WEEK, "base": base})
    assert r.status_code == 409
    body = r.json()
    assert (body["code"], body["params"]) == ("program_changed_elsewhere", {"days": ["monday"]})
    assert "14172536" not in r.text  # no id in an error body
    assert len(rt.gateway.executed) == sent_before  # nothing was written


async def test_force_overwrites(ctx):  # noqa: F811
    c, rt, clock = ctx
    base = await _salon_base(c)
    changed = copy.deepcopy(WEEK_PROGRAM)
    changed[2] = {"wednesday": [{"start": "05:00", "end": "06:00"}, E, E]}
    rt.gateway.push_state(f"{SAMPLE_GATEWAY}/9312063#1", "core:TimeProgramState", changed)
    await settle(rt, clock)
    r = await c.put("/api/rooms/p-salon/program", json={**WEEK, "base": base, "force": True})
    assert r.status_code == 202, r.text


async def test_an_unchanged_base_passes_and_no_base_is_not_checked(ctx):  # noqa: F811
    c, rt, _ = ctx
    base = await _salon_base(c)
    assert (
        await c.put("/api/rooms/p-salon/program", json={**WEEK, "base": base})
    ).status_code == 202
    assert (await c.put("/api/rooms/p-salon/program", json=WEEK)).status_code == 202


async def test_the_radiator_route_is_guarded_too_and_a_missing_base_entry_conflicts(ctx):  # noqa: F811
    c, rt, _ = ctx
    r = await c.put("/api/radiators/8370022/program", json={**WEEK, "base": {"other": {}}})
    assert (r.status_code, r.json()["code"]) == (409, "program_changed_elsewhere")
    assert r.json()["params"]["days"] == list(
        DAY_ORDER
    )  # no base for it: every readable day differs


def test_body_week_is_the_seven_days_only():
    body = ProgramBody.model_validate({**WEEK, "base": {"r": {}}, "force": True})
    assert list(body.week()) == list(DAY_ORDER)
    assert body.base_programs() == {"r": {}}
    with pytest.raises(ValueError):
        ProgramBody.model_validate({"base": {f"r{i}": {} for i in range(51)}})


def test_the_base_day_names_are_the_house_s_days():
    from typing import get_args

    from kelvin.api.schemas import DayName

    assert get_args(DayName) == DAY_ORDER
