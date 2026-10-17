"""A room programme send is judged from what the radiators hold (owner report, 2026-10-17).

The real case: a Salon of two Sauter radiators was sent weekday evenings from 17:45; both
radiators reported 17:00 (a quarter-hour Kelvin sent and the radiator did not keep), and Kelvin
waited its whole confirmation window before saying « n’a pas confirmé »."""

import copy

import pytest

from kelvin.commands.service import CONFIRM_TIMEOUT, CommandService
from kelvin.commands.translate import plan_program
from kelvin.house.model import DAY_ORDER, build_house
from kelvin.overkiz.fake import FakeGateway
from kelvin.overkiz.models import ExecUpdate, StateChange
from tests.conftest import ManualClock

PROG = "core:TimeProgramState"
WEEKDAYS = DAY_ORDER[:5]


def week(evening_start: str) -> dict:
    out = {
        d: [{"start": "05:30", "end": "06:30"}, {"start": evening_start, "end": "22:00"}]
        for d in WEEKDAYS
    }
    out |= {d: [{"start": "08:00", "end": "22:00"}] for d in DAY_ORDER[5:]}
    return out


@pytest.fixture
def env():
    clock = ManualClock()
    gw = FakeGateway(clock=clock)
    house = build_house(gw.root, list(gw.devices.values()))
    updates: list[tuple[str, str]] = []
    svc = CommandService(
        gw, house, clock=clock, on_update=lambda p: updates.append((p.status, p.error_code))
    )
    rads = [house.radiators[i] for i in house.rooms["p-salon"].radiator_ids]
    return clock, gw, house, svc, rads, updates


async def pump(gw, house, svc) -> None:
    """What EventPump.run_once does for commands: events, then the targeted reads, then tick."""
    for ev in await gw.fetch_events():
        if isinstance(ev, StateChange):
            house.apply(ev)
            svc.on_state(ev)
        else:
            svc.on_exec(ev)
    await svc.verify()
    svc.tick()


async def submit(svc, rads, w):
    planned = plan_program(rads[0], w)
    for r in rads[1:]:
        planned = planned + plan_program(r, w)
    return await svc.submit("Salon : programme", tuple(r.id for r in rads), planned)


def snapped(value):
    """A radiator keeping another time than the one sent (observed on Sauter: 17:45 sent, 17:00
    kept; Kelvin now refuses 17:45 before sending, so the test moves 17:30 instead)."""
    out = copy.deepcopy(value)
    for entry in out:
        for slots in entry.values():
            for s in slots:
                for k in ("start", "end"):
                    if s[k] == "17:30":
                        s[k] = "17:00"
    return out


async def test_radiators_holding_other_times_fail_fast_and_say_so(env):
    clock, gw, house, svc, rads, _ = env
    gw.program_rewrite = snapped
    p = await submit(svc, rads, week("17:30"))
    for _ in range(10):  # the events (5–20 s on the real radiators), then a short settle
        clock.advance(2)
        await pump(gw, house, svc)
    assert p.status == "failed"
    assert p.error_code == "program_differs"
    assert p.error_params == {
        "days": list(WEEKDAYS),
        "day": "monday",
        "sent": "17:30",
        "kept": "17:00",
    }
    assert p.error == "lundi\xa0: le radiateur a gardé 17:00 au lieu de 17:30."
    assert clock() - p.created_at < CONFIRM_TIMEOUT


async def test_a_quarter_hour_is_refused_before_anything_is_sent(env):
    from kelvin.commands.translate import CommandError

    _, gw, _, _, rads, _ = env
    with pytest.raises(CommandError) as e:
        plan_program(rads[0], week("17:45"))
    assert e.value.code == "program_step" and gw.executed == []


async def test_benign_differences_still_confirm(env):
    clock, gw, house, svc, rads, _ = env

    def reshaped(value):
        # Days in another order, seconds on the times, no empty markers.
        out = []
        for entry in reversed(value):
            ((day, slots),) = entry.items()
            out.append(
                {
                    day: [
                        {"end": s["end"] + ":00", "start": s["start"] + ":00"}
                        for s in reversed(slots)
                        if s != {"start": "00:00", "end": "00:00"}
                    ]
                }
            )
        return out

    gw.program_rewrite = reshaped
    p = await submit(svc, rads, week("17:30"))
    clock.advance(2)
    await pump(gw, house, svc)
    assert p.status == "confirmed"


async def test_no_event_one_targeted_read_per_radiator_confirms(env):
    clock, gw, house, svc, rads, updates = env
    gw.silent = True
    p = await submit(svc, rads, week("17:30"))
    # The radiators applied it but Overkiz sent nothing.
    for c in gw.executed[-1]:
        gw.set_state_silently(c.device_url, PROG, copy.deepcopy(c.parameters[0]))
    clock.advance(CONFIRM_TIMEOUT)
    await pump(gw, house, svc)
    await pump(gw, house, svc)
    assert p.status == "confirmed"
    assert ("failed", "no_confirmation") not in updates
    assert gw.state_reads == len(rads) and gw.snapshots == 0


async def test_only_one_radiator_reports_the_other_is_read(env):
    clock, gw, house, svc, rads, _ = env
    gw.silent = True
    p = await submit(svc, rads, week("17:30"))
    a, b = gw.executed[-1]
    gw.push_state(a.device_url, PROG, copy.deepcopy(a.parameters[0]))
    gw.set_state_silently(b.device_url, PROG, copy.deepcopy(b.parameters[0]))
    clock.advance(2)
    await pump(gw, house, svc)
    assert p.status == "pending"
    clock.advance(CONFIRM_TIMEOUT)
    await pump(gw, house, svc)
    await pump(gw, house, svc)
    assert p.status == "confirmed"
    assert gw.state_reads == 1  # only the radiator that had not answered


async def test_a_failure_flips_to_confirmed_when_the_programme_arrives_later(env):
    clock, gw, house, svc, rads, updates = env
    gw.silent = True
    p = await submit(svc, rads, week("17:30"))
    clock.advance(CONFIRM_TIMEOUT)
    await pump(gw, house, svc)
    await pump(gw, house, svc)
    assert (p.status, p.error_code) == ("failed", "no_confirmation")
    for c in gw.executed[-1]:
        gw.push_state(c.device_url, PROG, copy.deepcopy(c.parameters[0]))
    clock.advance(30)
    await pump(gw, house, svc)
    assert p.status == "confirmed" and p.error_code is None
    assert updates[-1] == ("confirmed", None)
    assert [x.id for x in svc.recent()] == [p.id]


async def test_no_flip_once_a_newer_command_took_over(env):
    clock, gw, house, svc, rads, _ = env
    gw.silent = True
    p = await submit(svc, rads, week("17:30"))
    clock.advance(CONFIRM_TIMEOUT)
    await pump(gw, house, svc)
    await pump(gw, house, svc)
    assert p.status == "failed"
    gw.silent = False
    await submit(svc, rads, week("18:00"))
    for c in gw.executed[0]:
        gw.push_state(c.device_url, PROG, copy.deepcopy(c.parameters[0]))
    await pump(gw, house, svc)
    assert p.status == "failed"


async def test_exec_completed_then_late_event_inside_the_settle_confirms(env):
    clock, gw, house, svc, rads, _ = env
    gw.silent = True
    p = await submit(svc, rads, week("17:30"))
    gw._events.append(ExecUpdate(p.exec_id, "COMPLETED", None))
    clock.advance(2)
    await pump(gw, house, svc)
    assert p.status == "pending"  # COMPLETED alone confirms nothing
    clock.advance(5)
    for c in gw.executed[-1]:
        gw.push_state(c.device_url, PROG, copy.deepcopy(c.parameters[0]))
    await pump(gw, house, svc)
    assert p.status == "confirmed" and gw.state_reads == 0
