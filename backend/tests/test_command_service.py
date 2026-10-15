import asyncio

import pytest

from kelvin.commands.service import CONFIRM_TIMEOUT, SUPERSEDED_WAIT, CommandService
from kelvin.commands.translate import plan_identify, plan_mode, plan_setpoint
from kelvin.house.model import build_house
from kelvin.overkiz.errors import GatewayError
from kelvin.overkiz.fake import FakeGateway
from kelvin.overkiz.models import ExecUpdate, StateChange
from tests.conftest import ManualClock


@pytest.fixture
def env():
    clock = ManualClock()
    gw = FakeGateway(clock=clock)
    house = build_house(gw.root, list(gw.devices.values()))
    updates = []
    svc = CommandService(gw, house, clock=clock, on_update=lambda p: updates.append(p.status))
    return clock, gw, house, svc, updates


async def drain(gw, house, svc):
    for ev in await gw.fetch_events():
        if isinstance(ev, StateChange):
            house.apply(ev)
            svc.on_state(ev)
        else:
            svc.on_exec(ev)
    svc.tick()


async def test_confirmed_by_state(env):
    clock, gw, house, svc, updates = env
    r = house.radiators["9312063"]
    p = await svc.submit("Mode", (r.id,), plan_mode(r, "manual"))
    assert p.status == "pending" and svc.has_active
    clock.advance(2)
    await drain(gw, house, svc)
    assert p.status == "confirmed" and not svc.has_active
    assert updates == ["sending", "pending", "confirmed"]


async def test_overridemode_failure_with_applied_state_is_success(env):
    clock, gw, house, svc, _ = env
    r = house.radiators["9312063"]
    p = await svc.submit("Confort", (r.id,), plan_setpoint(r, "comfort", 20.5))
    clock.advance(2)
    events = await gw.fetch_events()
    # The quirk really reports FAILED, yet the state change that precedes it confirms.
    assert any(isinstance(e, ExecUpdate) and e.state == "FAILED" for e in events)
    for ev in events:
        if isinstance(ev, StateChange):
            house.apply(ev)
            svc.on_state(ev)
        else:
            svc.on_exec(ev)
    svc.tick()
    assert p.status == "confirmed"


async def test_failed_exec_without_state_fails_after_grace(env):
    clock, gw, house, svc, _ = env
    gw.unresponsive = True
    r = house.radiators["9312063"]
    p = await svc.submit("Mode", (r.id,), plan_mode(r, "manual"))
    clock.advance(2)
    await drain(gw, house, svc)
    assert p.status == "pending"
    clock.advance(15)
    await drain(gw, house, svc)
    assert p.status == "failed" and p.error == "Le radiateur a refusé la commande."
    assert (p.error_code, p.error_params) == ("radiator_refused", {})


async def test_timeout_without_any_event(env):
    clock, gw, house, svc, _ = env
    gw.silent = True
    r = house.radiators["9312063"]
    p = await svc.submit("Mode", (r.id,), plan_mode(r, "manual"))
    clock.advance(CONFIRM_TIMEOUT)
    svc.tick()
    assert p.status == "failed" and p.error == "Pas de confirmation du radiateur."
    assert p.error_code == "no_confirmation"


async def test_newer_command_supersedes_older(env):
    clock, gw, house, svc, _ = env
    r = house.radiators["9312063"]
    first = await svc.submit("A", (r.id,), plan_setpoint(r, "manual", 19.0))
    second = await svc.submit("B", (r.id,), plan_setpoint(r, "manual", 21.0))
    assert first.status == "superseded"
    clock.advance(2)
    await drain(gw, house, svc)
    assert second.status == "confirmed" and r.target == 21.0


async def test_noop_confirms_immediately(env):
    _, _, house, svc, _ = env
    r = house.radiators["9312063"]
    p = await svc.submit("Mode", (r.id,), plan_mode(r, "program"))
    assert p.status == "confirmed"


async def test_send_error_fails_immediately(env):
    _, gw, house, svc, _ = env
    gw.fail_next_execute = GatewayError("réseau")
    r = house.radiators["9312063"]
    p = await svc.submit("Mode", (r.id,), plan_mode(r, "manual"))
    assert p.status == "failed" and p.error == "Envoi impossible : réseau"
    assert (p.error_code, p.error_params, p.reason_code) == (
        "send_failed",
        {},
        "network",
    )
    assert p.view()["reason_code"] == "network"


async def test_command_without_expectation_confirms_on_completion(env):
    clock, gw, house, svc, _ = env
    r = house.radiators["9312063"]
    p = await svc.submit("Identifier", (r.id,), plan_identify(r))
    assert p.status == "pending"
    clock.advance(2)
    await drain(gw, house, svc)
    assert p.status == "confirmed"


async def test_on_sent_is_called(env):
    _, _, house, svc, _ = env
    calls = []
    svc.on_sent = lambda: calls.append(1)
    r = house.radiators["9312063"]
    await svc.submit("Mode", (r.id,), plan_mode(r, "manual"))
    assert calls == [1]


async def test_view_shape(env):
    _, _, house, svc, _ = env
    r = house.radiators["9312063"]
    p = await svc.submit("Mode", (r.id,), plan_mode(r, "manual"))
    assert set(p.view()) == {
        "id",
        "label",
        "radiator_ids",
        "status",
        "error",
        "created_at",
        "expected",
        "label_code",
        "label_params",
        "error_code",
        "error_params",
        "reason_code",
    }


async def test_supersede_during_send_is_not_resurrected(env):
    clock, gw, house, svc, updates = env
    release = asyncio.Event()
    real = gw.execute

    async def slow(commands, label):
        if label == "A":
            await release.wait()
        return await real(commands, label)

    gw.execute = slow
    seen: dict[str, list[str]] = {"A": [], "B": []}
    svc.on_update = lambda p: seen[p.label].append(p.status)
    r = house.radiators["9312063"]
    ta = asyncio.create_task(svc.submit("A", (r.id,), plan_setpoint(r, "manual", 19.0)))
    await asyncio.sleep(0)
    tb = asyncio.create_task(svc.submit("B", (r.id,), plan_setpoint(r, "manual", 21.0)))
    await asyncio.sleep(0)
    release.set()
    a, b = await asyncio.gather(ta, tb)
    assert a.status == "superseded" and a.exec_id is not None
    assert seen["A"] == ["sending", "superseded"]
    assert b.status == "pending"


async def test_unexpected_execute_error_fails_and_propagates(env):
    _, gw, house, svc, _ = env

    async def boom(commands, label):
        raise RuntimeError("bug")

    gw.execute = boom
    r = house.radiators["9312063"]
    with pytest.raises(RuntimeError):
        await svc.submit("Mode", (r.id,), plan_mode(r, "manual"))
    assert not svc.has_active


async def test_tick_times_out_stuck_sending(env):
    clock, _, house, svc, _ = env
    r = house.radiators["9312063"]
    from kelvin.commands.service import Pending

    p = Pending("x", "Mode", (r.id,), plan_mode(r, "manual"), clock(), 0.0)
    svc._pending["x"] = p
    clock.advance(CONFIRM_TIMEOUT)
    svc.tick()
    assert p.status == "failed" and not svc.has_active


async def test_superseding_waits_for_the_older_execution(env):
    """A superseded command still runs on the device: the newer one must not be judged
    on the state from before it, or it 'confirms' a value the older command then overwrites."""
    clock, gw, house, svc, _ = env
    r = house.radiators["9312063"]
    assert r.mode == "program"
    first = await svc.submit("A", (r.id,), plan_mode(r, "manual"))
    clock.advance(1)
    second = await svc.submit("B", (r.id,), plan_mode(r, "program"))
    assert first.status == "superseded"
    assert second.status == "pending"  # the device is in program now, but A will change that
    clock.advance(0.6)
    await drain(gw, house, svc)  # A runs: the device goes manual
    assert r.mode == "manual" and second.status == "pending"
    clock.advance(1)
    await drain(gw, house, svc)  # B runs
    assert second.status == "confirmed" and r.mode == "program"


async def test_superseded_execution_that_never_reports_stops_blocking(env):
    clock, gw, house, svc, _ = env
    r = house.radiators["9312063"]
    gw.silent = True
    await svc.submit("A", (r.id,), plan_mode(r, "manual"))
    gw.silent = False
    second = await svc.submit("B", (r.id,), plan_mode(r, "program"))
    assert second.status == "pending"
    clock.advance(SUPERSEDED_WAIT)
    await drain(gw, house, svc)  # B's own execution already reported: only A held it
    assert second.status == "confirmed"


async def test_superseded_execution_blocks_until_a_terminal_state(env):
    clock, gw, house, svc, _ = env
    gw.silent = True  # events are fed by hand below
    r = house.radiators["9312063"]
    assert r.mode == "program"
    a = await svc.submit("A", (r.id,), plan_mode(r, "manual"))
    b = await svc.submit("B", (r.id,), plan_mode(r, "program"))
    assert a.status == "superseded" and b.status == "pending"
    svc.on_exec(ExecUpdate(a.exec_id, "NOT_TRANSMITTED", None))
    svc.on_exec(ExecUpdate(a.exec_id, "TRANSMITTED", None))
    assert b.status == "pending"  # A has not run yet: the pre-A state proves nothing
    change = StateChange(r.heater_url, "core:OperatingModeState", "basic")
    house.apply(change)
    svc.on_state(change)
    svc.on_exec(ExecUpdate(a.exec_id, "COMPLETED", None))
    assert b.status == "pending"  # judged now, against A's result
    change = StateChange(r.heater_url, "core:OperatingModeState", "internal")
    house.apply(change)
    svc.on_state(change)
    assert b.status == "confirmed"


async def test_superseded_send_error_releases_newer_commands(env):
    _, gw, house, svc, _ = env
    release = asyncio.Event()
    real = gw.execute

    async def slow(commands, label):
        if label == "A":
            await release.wait()
            raise GatewayError("réseau")
        return await real(commands, label)

    gw.execute = slow
    r = house.radiators["9312063"]
    ta = asyncio.create_task(svc.submit("A", (r.id,), plan_mode(r, "manual")))
    await asyncio.sleep(0)
    b = await svc.submit("B", (r.id,), plan_mode(r, "program"))
    assert b.status == "pending"  # A might still run
    release.set()
    a = await ta
    assert a.status == "superseded"
    assert b.status == "confirmed"  # A never reached the device: B already holds


async def test_settled_commands_stay_in_recent_for_a_while(env):
    from kelvin.commands.service import RECENT_KEEP

    clock, gw, house, svc, _ = env
    r = house.radiators["9312063"]
    p1 = await svc.submit("Mode", (r.id,), plan_mode(r, "manual"))
    p2 = await svc.submit("Mode", (r.id,), plan_mode(r, "off"))
    assert p1.status == "superseded"
    assert [p.id for p in svc.recent()] == [p1.id]
    clock.advance(2)
    await drain(gw, house, svc)
    assert p2.status == "confirmed"
    assert {p.id: p.status for p in svc.recent()} == {p1.id: "superseded", p2.id: "confirmed"}
    clock.advance(RECENT_KEEP + 1)
    assert svc.recent() == []


async def test_a_label_gives_the_pending_its_code_and_french_text(env):
    from kelvin.labels import Label

    _, gw, house, svc, _ = env
    r = house.radiators["9312063"]
    labels = []
    execute = gw.execute

    async def spy(commands, label):
        labels.append(label)
        return await execute(commands, label)

    gw.execute = spy
    p = await svc.submit(
        Label.of("mode", name="Salon", mode="manual"), (r.id,), plan_mode(r, "manual")
    )
    v = p.view()
    assert (v["label"], v["label_code"], v["label_params"]) == (
        "Salon : Manuel",
        "mode",
        {"name": "Salon", "mode": "manual"},
    )
    assert labels == ["Salon : Manuel"]  # Overkiz gets the French text, never the Label


async def test_gateway_text_reaches_the_french_error_scrubbed_and_never_the_params(env):
    _, gw, house, svc, _ = env
    gw.fail_next_execute = GatewayError(
        "connect to [2001:db8::1]:443; serial 1234-5678-9012 token=x"
    )
    r = house.radiators["9312063"]
    p = await svc.submit("Mode", (r.id,), plan_mode(r, "manual"))
    v = p.view()
    assert v["error"] == "Envoi impossible : connect to …; serial … …"
    assert (v["error_code"], v["error_params"], v["reason_code"]) == ("send_failed", {}, "network")
