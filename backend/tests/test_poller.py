import asyncio
import contextlib

import pytest

from kelvin.commands.service import CommandService
from kelvin.commands.translate import plan_mode
from kelvin.house.model import build_house
from kelvin.overkiz.errors import AuthError, QuotaError
from kelvin.overkiz.fake import FakeGateway
from kelvin.overkiz.models import StateChange
from kelvin.overkiz.poller import EventPump
from kelvin.overkiz.sample import SAMPLE_GATEWAY
from tests.conftest import ManualClock


async def _no_sleep(_seconds: float) -> None:
    return None


@pytest.fixture
def env():
    clock = ManualClock()
    gw = FakeGateway(clock=clock)
    house = build_house(gw.root, list(gw.devices.values()))
    svc = CommandService(gw, house, clock=clock)
    changed, statuses = [], []
    pump = EventPump(
        gw,
        house,
        svc,
        clock=clock,
        wall=clock,
        on_changed=changed.append,
        on_status=statuses.append,
        sleep=_no_sleep,
    )
    pump.mark_ok()
    return clock, gw, house, svc, pump, changed, statuses


async def test_idle_and_busy_intervals(env):
    clock, gw, house, svc, pump, changed, _ = env
    assert await pump.run_once() == 30.0
    r = house.radiators["9500003"]
    await svc.submit("Mode", (r.id,), plan_mode(r, "manual"))
    assert await pump.run_once() == 2.0
    clock.advance(2)
    assert await pump.run_once() == 30.0
    assert changed == [{"9500003"}]
    assert r.mode == "manual"


async def test_backoff_and_recovery(env):
    _, gw, _, _, pump, _, statuses = env
    gw.fail_fetch = QuotaError("QUOTA_EXCEEDED")
    assert await pump.run_once() == 30.0
    assert await pump.run_once() == 60.0
    assert pump.connected is False and "QUOTA" in pump.status()["last_error"]
    assert pump.status()["last_error_code"] == "quota"
    gw.fail_fetch = None
    assert await pump.run_once() == 30.0
    assert pump.connected is True
    assert pump.status()["last_error_code"] is None
    assert [s["connected"] for s in statuses] == [False, True]


async def test_auth_error_triggers_login(env):
    _, gw, _, _, pump, _, _ = env
    gw.fail_fetch = AuthError("expired")
    await pump.run_once()
    assert gw.logins == 1


async def test_state_reads_in_turn_catch_missed_changes_without_a_full_setup_read(env):
    clock, gw, house, _, pump, changed, _ = env
    gw.set_state_silently(f"{SAMPLE_GATEWAY}/9500003#2", "core:TemperatureState", 22.0)
    await pump.run_once()
    assert house.radiators["9500003"].temperature == 20.2
    for _ in house.radiators:  # one radiator per 600 s, in turn
        clock.advance(600)
        await pump.run_once()
    assert house.radiators["9500003"].temperature == 22.0
    assert {"9500003"} in changed
    assert gw.snapshots == 0


async def test_a_day_of_polling_makes_no_full_setup_read(env):
    """Ruling 8: GET /setup/devices and /setup/places are documented as 1 call a day."""
    clock, gw, house, _, pump, _, _ = env
    for _ in range(2880):  # 24 h of idle polls, every 30 s
        clock.advance(30)
        await pump.run_once()
    assert gw.snapshots == 0
    ids = sorted(house.radiators)
    expected = sum(len(house.radiators[ids[k % len(ids)]].states) for k in range(144))
    assert gw.state_reads == expected  # one radiator's devices every 10 min


async def test_resync_beyond_the_daily_budget_reads_device_by_device(env):
    _, gw, house, _, pump, changed, _ = env
    for _ in range(pump.guard.limit):
        pump.guard.record()
    gw.set_state_silently(f"{SAMPLE_GATEWAY}/9500003#2", "core:TemperatureState", 22.0)
    pauses: list[float] = []

    async def record_pause(seconds: float) -> None:
        pauses.append(seconds)

    pump.sleep = record_pause
    pump.request_resync()
    await pump.run_once()
    assert gw.snapshots == 0
    assert gw.state_reads == len(house.device_urls())
    assert pauses == [pump.device_pause] * (len(house.device_urls()) - 1)  # paced
    assert house.radiators["9500003"].temperature == 22.0
    assert {"9500003"} in changed


async def test_a_failed_state_read_backs_off_and_retries_the_resync(env):
    clock, gw, house, _, pump, _, _ = env
    for _ in range(pump.guard.limit):
        pump.guard.record()
    pump.request_resync()
    gw.fail_states = QuotaError("QUOTA_EXCEEDED")
    assert await pump.run_once() == 30.0
    assert pump.connected is False and pump._resync_due is True
    gw.fail_states = None
    clock.advance(30)
    await pump.run_once()
    assert pump.connected is True
    assert gw.state_reads == 0  # after a quota answer, no burst of device reads
    clock.advance(600)
    await pump.run_once()
    assert pump._resync_due is False
    assert gw.state_reads == len(house.device_urls())
    clock.advance(30)
    await pump.run_once()
    assert gw.state_reads == len(house.device_urls())  # recovery did not re-arm the resync


async def test_a_quota_answer_to_a_state_read_does_not_arm_a_resync(env):
    """Events were fetched first, so nothing was lost: no resync after recovery."""
    clock, gw, _, _, pump, _, _ = env
    clock.advance(600)
    gw.fail_states = QuotaError("QUOTA_EXCEEDED")
    await pump.run_once()
    assert pump.connected is False and pump._resync_due is False
    gw.fail_states = None
    clock.advance(30)
    await pump.run_once()
    assert pump.connected is True and pump._resync_due is False
    assert gw.snapshots == 0 and gw.state_reads == 0


async def test_a_device_whose_state_read_always_fails_never_stalls_the_pump(env):
    clock, gw, house, svc, pump, _, statuses = env
    gw.broken_devices.update(house.device_urls())
    r = house.radiators["9500003"]
    p = await svc.submit("Mode", (r.id,), plan_mode(r, "manual"))
    clock.advance(600)  # the rotation is due in the same poll as the confirmation
    await pump.run_once()
    assert p.status == "confirmed" and r.mode == "manual"
    assert pump.connected is True and gw.failed_state_reads > 0
    for _ in range(2880):  # a day of polls
        clock.advance(30)
        await pump.run_once()
        assert pump.connected is True
    assert statuses == []
    assert gw.snapshots == 0 and pump._resync_due is False
    # each broken device is retried less and less often (at most every 6 h in the end)
    assert gw.failed_state_reads <= 10 * len(house.device_urls())


async def test_outage_longer_than_timeout_fails_pending(env):
    clock, gw, house, svc, pump, _, _ = env
    r = house.radiators["9500003"]
    p = await svc.submit("Mode", (r.id,), plan_mode(r, "manual"))
    gw.fail_fetch = QuotaError("quota")
    clock.advance(91)
    await pump.run_once()
    assert p.status == "failed"


async def test_wake_interrupts_sleep(env):
    _, _, _, _, pump, _, _ = env
    calls = 0
    original = pump.run_once

    async def counting():
        nonlocal calls
        calls += 1
        return await original()

    pump.run_once = counting
    task = asyncio.create_task(pump.run())
    await asyncio.sleep(0.05)
    pump.wake()
    await asyncio.sleep(0.05)
    task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await task
    assert calls == 2


async def test_raising_on_changed_keeps_cadence(env):
    _, gw, house, svc, pump, _, _ = env
    r = house.radiators["9500003"]

    def boom(ids):
        raise RuntimeError("cb")

    pump.on_changed = boom
    await svc.submit("Mode", (r.id,), plan_mode(r, "manual"))

    async def fetch():
        return [StateChange(f"{SAMPLE_GATEWAY}/9500003#2", "core:TemperatureState", 21.0)]

    gw.fetch_events = fetch
    assert await pump.run_once() == 2.0  # on_changed raised, command still pending
    pump.on_changed = lambda ids: None
    assert await pump.run_once() == 2.0


async def test_event_exception_does_not_skip_batch(env):
    _, gw, house, svc, pump, changed, _ = env
    url = f"{SAMPLE_GATEWAY}/9500003#2"
    events = [
        StateChange(url, "core:TemperatureState", 20.0),
        StateChange(url, "core:TemperatureState", 21.0),
    ]

    async def fetch():
        return events

    gw.fetch_events = fetch
    original = svc.on_state
    n = 0

    def flaky(ev):
        nonlocal n
        n += 1
        if n == 1:
            raise RuntimeError("boom")
        original(ev)

    svc.on_state = flaky
    await pump.run_once()
    assert n == 2
    assert house.radiators["9500003"].temperature == 21.0


async def test_event_changes_emitted_when_a_state_read_fails(env):
    clock, gw, _, _, pump, changed, _ = env
    gw.push_state(f"{SAMPLE_GATEWAY}/9500003#2", "core:TemperatureState", 22.0)
    clock.advance(600)
    gw.fail_states = QuotaError("quota")
    await pump.run_once()
    assert {"9500003"} in changed and pump.connected is False


async def test_backoff_exponent_capped(env):
    _, gw, _, _, pump, _, _ = env
    pump.failures = 2000
    gw.fail_fetch = QuotaError("quota")
    assert await pump.run_once() == 600.0


async def test_reconnect_forces_one_full_setup_read(env):
    clock, gw, house, _, pump, changed, _ = env
    gw.fail_fetch = QuotaError("quota")
    await pump.run_once()
    await pump.run_once()
    gw.set_state_silently(f"{SAMPLE_GATEWAY}/9500003#2", "core:TemperatureState", 22.0)
    gw.fail_fetch = None
    await pump.run_once()  # reconnect: events, then the one full read, no 600 s wait
    await pump.run_once()
    assert house.radiators["9500003"].temperature == 22.0
    assert {"9500003"} in changed
    assert gw.snapshots == 1 and pump.status()["setup_reads_24h"] == 1


async def test_an_outage_resync_never_takes_the_last_full_setup_read(env):
    """Final review I1: a flaky outage must leave the last full read to a restart."""
    _, gw, house, _, pump, _, _ = env
    gw.fail_snapshot = QuotaError("flapping")
    for _ in range(2 * pump.guard.limit):  # events fail, then the resync's full read fails
        gw.fail_fetch = QuotaError("down")
        await pump.run_once()
        gw.fail_fetch = None
        pump._quota_hold_until = float("-inf")
        await pump.run_once()
    assert pump.guard.used() == pump.guard.limit - 1 and pump.guard.allowed()
    assert gw.snapshots == pump.guard.limit - 1


async def test_a_resync_with_one_full_read_left_reads_device_by_device(env):
    _, gw, house, _, pump, _, _ = env
    for _ in range(pump.guard.limit - 1):
        pump.guard.record()
    pump.request_resync()
    await pump.run_once()
    assert gw.snapshots == 0 and gw.state_reads == len(house.device_urls())
    assert pump.guard.used() == pump.guard.limit - 1


async def test_a_resync_with_two_full_reads_left_takes_one(env):
    _, gw, _, _, pump, _, _ = env
    for _ in range(pump.guard.limit - 2):
        pump.guard.record()
    pump.request_resync()
    await pump.run_once()
    assert gw.snapshots == 1 and gw.state_reads == 0


async def test_a_full_read_hands_the_setup_on_for_storage(env):
    _, gw, _, _, pump, _, _ = env
    seen = []
    pump.on_setup = lambda root, devices: seen.append((root.oid, len(devices)))
    pump.request_resync()
    await pump.run_once()
    assert seen == [(gw.root.oid, len(gw.devices))]


async def test_gateway_text_in_status_and_logs_is_scrubbed(env, caplog):
    from kelvin.overkiz.errors import GatewayError

    _, gw, _, _, pump, _, _ = env
    gw.fail_fetch = GatewayError("connect to 192.168.1.20:8443 failed for io://1234-5678-9012/1")
    with caplog.at_level("WARNING"):
        await pump.run_once()
    assert pump.status()["last_error"] == "connect to … failed for …"
    assert "192.168" not in caplog.text and "1234-5678" not in caplog.text


async def test_pump_reads_once_then_confirms_a_programme_no_event_announced(env):
    """The owner's Salon (2026-10-17): no state event in time. Before failing, the pump reads
    each unconfirmed radiator once (never a full setup read) and confirms from what it holds."""
    import copy

    from kelvin.commands.service import CONFIRM_TIMEOUT
    from kelvin.commands.translate import plan_program

    clock, gw, house, svc, pump, changed, _ = env
    rads = [house.radiators[i] for i in house.rooms["p-salon"].radiator_ids]
    week = {"monday": [{"start": "17:30", "end": "22:00"}]}
    planned = plan_program(rads[0], week) + plan_program(rads[1], week)
    gw.silent = True
    p = await svc.submit("Salon : programme", tuple(r.id for r in rads), planned)
    for c in gw.executed[-1]:
        gw.set_state_silently(c.device_url, "core:TimeProgramState", copy.deepcopy(c.parameters[0]))
    t = 0.0
    while p.active and t <= CONFIRM_TIMEOUT + 10:
        clock.advance(2)
        t += 2
        await pump.run_once()
    assert p.status == "confirmed"
    assert gw.state_reads == 2 and gw.snapshots == 0
    assert {r.id for r in rads} <= set().union(*changed)  # the read reached the clients


async def test_pump_says_when_the_radiators_kept_other_times(env):
    from kelvin.commands.translate import plan_program

    clock, gw, house, svc, pump, _, _ = env

    def snapped(value):
        return [
            {d: [{k: "17:00" if v == "17:30" else v for k, v in s.items()} for s in slots]}
            for e in value
            for d, slots in e.items()
        ]

    gw.program_rewrite = snapped
    rads = [house.radiators[i] for i in house.rooms["p-salon"].radiator_ids]
    week = {"monday": [{"start": "17:30", "end": "22:00"}]}
    planned = plan_program(rads[0], week) + plan_program(rads[1], week)
    p = await svc.submit("Salon : programme", tuple(r.id for r in rads), planned)
    for _ in range(20):
        clock.advance(2)
        await pump.run_once()
    assert (p.status, p.error_code, p.error_params) == (
        "failed",
        "program_differs",
        {
            # The kept weekdays held 17:30 too (the simulator's): the radiator moved them all.
            "days": ["monday", "tuesday", "wednesday", "thursday", "friday"],
            "day": "monday",
            "sent": "17:30",
            "kept": "17:00",
        },
    )
    assert house.radiators[rads[0].id].program["monday"] == [{"start": "17:00", "end": "22:00"}]
