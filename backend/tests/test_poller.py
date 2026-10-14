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
    )
    pump.mark_ok()
    return clock, gw, house, svc, pump, changed, statuses


async def test_idle_and_busy_intervals(env):
    clock, gw, house, svc, pump, changed, _ = env
    assert await pump.run_once() == 30.0
    r = house.radiators["9312063"]
    await svc.submit("Mode", (r.id,), plan_mode(r, "manual"))
    assert await pump.run_once() == 2.0
    clock.advance(2)
    assert await pump.run_once() == 30.0
    assert changed == [{"9312063"}]
    assert r.mode == "manual"


async def test_backoff_and_recovery(env):
    _, gw, _, _, pump, _, statuses = env
    gw.fail_fetch = QuotaError("QUOTA_EXCEEDED")
    assert await pump.run_once() == 30.0
    assert await pump.run_once() == 60.0
    assert pump.connected is False and "QUOTA" in pump.status()["last_error"]
    gw.fail_fetch = None
    assert await pump.run_once() == 30.0
    assert pump.connected is True
    assert [s["connected"] for s in statuses] == [False, True]


async def test_auth_error_triggers_login(env):
    _, gw, _, _, pump, _, _ = env
    gw.fail_fetch = AuthError("expired")
    await pump.run_once()
    assert gw.logins == 1


async def test_periodic_refresh_catches_missed_changes(env):
    clock, gw, house, _, pump, changed, _ = env
    gw.set_state_silently(f"{SAMPLE_GATEWAY}/9312063#2", "core:TemperatureState", 22.0)
    await pump.run_once()
    assert house.radiators["9312063"].temperature == 20.2
    clock.advance(600)
    await pump.run_once()
    assert house.radiators["9312063"].temperature == 22.0
    assert {"9312063"} in changed


async def test_outage_longer_than_timeout_fails_pending(env):
    clock, gw, house, svc, pump, _, _ = env
    r = house.radiators["9312063"]
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
    r = house.radiators["9312063"]

    def boom(ids):
        raise RuntimeError("cb")

    pump.on_changed = boom
    await svc.submit("Mode", (r.id,), plan_mode(r, "manual"))

    async def fetch():
        return [StateChange(f"{SAMPLE_GATEWAY}/9312063#2", "core:TemperatureState", 21.0)]

    gw.fetch_events = fetch
    assert await pump.run_once() == 2.0  # on_changed raised, command still pending
    pump.on_changed = lambda ids: None
    assert await pump.run_once() == 2.0


async def test_event_exception_does_not_skip_batch(env):
    _, gw, house, svc, pump, changed, _ = env
    url = f"{SAMPLE_GATEWAY}/9312063#2"
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
    assert house.radiators["9312063"].temperature == 21.0


async def test_refresh_changes_emitted_when_fetch_fails(env):
    clock, gw, _, _, pump, changed, _ = env
    gw.set_state_silently(f"{SAMPLE_GATEWAY}/9312063#2", "core:TemperatureState", 22.0)
    clock.advance(600)
    gw.fail_fetch = QuotaError("quota")
    await pump.run_once()
    assert {"9312063"} in changed


async def test_backoff_exponent_capped(env):
    _, gw, _, _, pump, _, _ = env
    pump.failures = 2000
    gw.fail_fetch = QuotaError("quota")
    assert await pump.run_once() == 600.0


async def test_reconnect_forces_full_refresh(env):
    clock, gw, house, _, pump, changed, _ = env
    gw.fail_fetch = QuotaError("quota")
    await pump.run_once()
    await pump.run_once()
    gw.set_state_silently(f"{SAMPLE_GATEWAY}/9312063#2", "core:TemperatureState", 22.0)
    gw.fail_fetch = None
    await pump.run_once()  # reconnect
    await pump.run_once()  # full refresh, no 600 s wait
    assert house.radiators["9312063"].temperature == 22.0
    assert {"9312063"} in changed
