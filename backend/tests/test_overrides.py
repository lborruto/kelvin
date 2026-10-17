import asyncio
import json

import pytest

from kelvin.commands.overrides import (
    RESTORE_RETRY_FIRST_S,
    OverrideManager,
    restore_retry_delay,
)
from kelvin.commands.service import CommandService
from kelvin.commands.translate import CommandError, plan_mode
from kelvin.house.model import build_house
from kelvin.overkiz.errors import GatewayError
from kelvin.overkiz.fake import FakeGateway
from kelvin.overkiz.models import StateChange
from kelvin.recorder.db import Database
from tests.conftest import ManualClock

SALON = ("10000001", "9500003")


@pytest.fixture
def env(tmp_path):
    clock = ManualClock(1_000_000.0)
    gw = FakeGateway(clock=clock)
    # Chambre 2 off at 16.5 (the sample runs it in programme): restores must bring "off" back.
    ch2 = next(d for d in gw.devices.values() if d.device_url.endswith("/9000022#1"))
    ch2.states["core:OperatingModeState"] = "standby"
    ch2.states["core:TargetTemperatureState"] = 16.5
    house = build_house(gw.root, list(gw.devices.values()))
    svc = CommandService(gw, house, clock=clock, wall=clock)
    db = Database(tmp_path / "k.db")
    mgr = OverrideManager(db, house, svc, wall=clock)
    return clock, gw, house, svc, db, mgr


async def settle(clock, gw, house, svc):
    clock.advance(2)
    for ev in await gw.fetch_events():
        if isinstance(ev, StateChange):
            house.apply(ev)
            svc.on_state(ev)
        else:
            svc.on_exec(ev)


async def test_boost_applies_then_restores(env):
    clock, gw, house, svc, _, mgr = env
    o, p = await mgr.start("boost", list(SALON), 21.0, clock() + 3600, label="b", room_id="p-salon")
    await settle(clock, gw, house, svc)
    assert p.status == "confirmed"
    assert all(
        house.radiators[i].mode == "manual" and house.radiators[i].target == 21.0 for i in SALON
    )
    assert mgr.active()[0]["kind"] == "boost"
    assert await mgr.tick() == []
    clock.advance(3600)
    restored = await mgr.tick()
    await settle(clock, gw, house, svc)
    assert len(restored) == 1 and restored[0].status == "confirmed"
    assert all(house.radiators[i].mode == "program" for i in SALON)
    # Programme mode remembers the manual setpoint: the restore puts it back too (I5).
    assert all(house.radiators[i].target == 20.0 for i in SALON)
    assert mgr.active() == []


async def test_restore_sends_target_before_mode_for_each_radiator(env):
    clock, gw, house, svc, _, mgr = env
    ids = ["9500003", "9000022"]  # programme 20.0 and off 16.5
    await mgr.start("away", ids, 12.0, clock() + 60, label="a")
    await settle(clock, gw, house, svc)
    clock.advance(60)
    assert len(await mgr.tick()) == 1
    sent = [(c.device_url, c.name, c.parameters) for c in gw.executed[-1]]
    h = {i: house.radiators[i].heater_url for i in ids}
    assert sent == [
        (h["9500003"], "setTargetTemperature", (20.0,)),
        (h["9500003"], "setOperatingMode", ("internal",)),
        (h["9000022"], "setTargetTemperature", (16.5,)),
        (h["9000022"], "setOperatingMode", ("standby",)),
    ]
    await settle(clock, gw, house, svc)
    assert house.radiators["9000022"].mode == "off" and house.radiators["9000022"].target == 16.5
    assert mgr.active() == []


async def test_restore_skips_radiator_changed_by_hand(env):
    clock, gw, house, svc, _, mgr = env
    await mgr.start("boost", list(SALON), 21.0, clock() + 60, label="b")
    await settle(clock, gw, house, svc)
    gw.push_state(house.radiators["9500003"].heater_url, "core:TargetTemperatureState", 22.0)
    await settle(clock, gw, house, svc)
    clock.advance(60)
    restored = await mgr.tick()
    await settle(clock, gw, house, svc)
    assert restored[0].radiator_ids == ("10000001",)
    assert house.radiators["9500003"].mode == "manual"


async def test_cancel_restores_now(env):
    clock, gw, house, svc, _, mgr = env
    o, _ = await mgr.start("boost", ["9500003"], 21.0, clock() + 3600, label="b")
    await settle(clock, gw, house, svc)
    p = await mgr.cancel(o.id)
    await settle(clock, gw, house, svc)
    assert p.status == "confirmed" and house.radiators["9500003"].mode == "program"
    with pytest.raises(KeyError):
        await mgr.cancel(o.id)


async def test_survives_restart(env):
    clock, gw, house, svc, db, mgr = env
    await mgr.start("away", list(house.radiators), 12.0, clock() + 600, label="a")
    await settle(clock, gw, house, svc)
    mgr2 = OverrideManager(db, house, svc, wall=clock)
    assert mgr2.active()[0]["kind"] == "away"
    clock.advance(600)
    restored = await mgr2.tick()
    await settle(clock, gw, house, svc)
    assert restored and house.radiators["9000022"].mode == "off"
    assert house.radiators["9500003"].mode == "program"


async def test_boost_during_away_returns_to_pre_away_state(env):
    clock, gw, house, svc, _, mgr = env
    await mgr.start("away", list(house.radiators), 12.0, clock() + 600, label="a")
    await settle(clock, gw, house, svc)
    await mgr.start("boost", ["9500003"], 21.0, clock() + 3600, label="b")
    await settle(clock, gw, house, svc)
    clock.advance(600)  # away expires first
    await mgr.tick()
    await settle(clock, gw, house, svc)
    assert house.radiators["9500003"].target == 21.0  # boost untouched
    assert house.radiators["10000001"].mode == "program"  # others restored
    clock.advance(3000)  # boost expires
    await mgr.tick()
    await settle(clock, gw, house, svc)
    assert house.radiators["9500003"].mode == "program"


async def test_validation(env):
    clock, _, _, _, _, mgr = env
    with pytest.raises(CommandError):
        await mgr.start("boost", ["9500003"], 21.0, clock() - 1, label="b")
    with pytest.raises(CommandError):
        await mgr.start("boost", ["9500003"], 40.0, clock() + 60, label="b")


async def test_boost_ending_inside_away_returns_to_away_then_program(env):
    clock, gw, house, svc, _, mgr = env
    await mgr.start("away", list(house.radiators), 12.0, clock() + 600, label="a")
    await settle(clock, gw, house, svc)
    await mgr.start("boost", ["9500003"], 21.0, clock() + 60, label="b")
    await settle(clock, gw, house, svc)
    clock.advance(60)
    await mgr.tick()
    await settle(clock, gw, house, svc)
    assert house.radiators["9500003"].mode == "manual"
    assert house.radiators["9500003"].target == 12.0
    assert [a["kind"] for a in mgr.active()] == ["away"]
    assert "9500003" in mgr.active()[0]["radiator_ids"]
    clock.advance(600)
    await mgr.tick()
    await settle(clock, gw, house, svc)
    assert house.radiators["9500003"].mode == "program"


async def test_cancel_away_under_boost_hands_state_to_boost(env):
    clock, gw, house, svc, _, mgr = env
    away, _ = await mgr.start("away", list(house.radiators), 12.0, clock() + 600, label="a")
    await settle(clock, gw, house, svc)
    await mgr.start("boost", ["9500003"], 21.0, clock() + 3600, label="b")
    await settle(clock, gw, house, svc)
    await mgr.cancel(away.id)
    await settle(clock, gw, house, svc)
    assert house.radiators["9500003"].target == 21.0
    assert house.radiators["10000001"].mode == "program"
    clock.advance(3600)
    await mgr.tick()
    await settle(clock, gw, house, svc)
    assert house.radiators["9500003"].mode == "program"


async def test_start_uses_in_flight_restore_as_previous(env):
    clock, gw, house, svc, _, mgr = env
    await mgr.start("boost", ["9500003"], 21.0, clock() + 60, label="b")
    await settle(clock, gw, house, svc)
    clock.advance(60)
    assert len(await mgr.tick()) == 1  # restore submitted, not yet drained
    o, _ = await mgr.start("boost", ["9500003"], 22.0, clock() + 600, label="b2")
    assert o.previous["9500003"]["mode"] == "program"


async def test_tick_defers_while_own_command_pending(env):
    clock, gw, house, svc, _, mgr = env
    await mgr.start("boost", ["9500003"], 21.0, clock() + 1, label="b")
    clock.advance(5)
    assert await mgr.tick() == []
    assert len(mgr.active()) == 1
    await settle(clock, gw, house, svc)
    restored = await mgr.tick()
    await settle(clock, gw, house, svc)
    assert len(restored) == 1 and house.radiators["9500003"].mode == "program"


async def test_unknown_state_keeps_override(env):
    clock, gw, house, svc, _, mgr = env
    await mgr.start("boost", ["9500003"], 21.0, clock() + 60, label="b")
    await settle(clock, gw, house, svc)
    r = house.radiators["9500003"]
    r.states[r.heater_url].clear()
    clock.advance(60)
    assert await mgr.tick() == []
    assert len(mgr.active()) == 1


async def test_failed_send_is_not_persisted(env):
    clock, gw, house, svc, db, mgr = env
    gw.fail_next_execute = GatewayError("x")
    _, p = await mgr.start("boost", ["9500003"], 21.0, clock() + 60, label="b")
    assert p.status == "failed"
    assert mgr.active() == []
    assert db.query("SELECT id FROM overrides") == []


async def test_rejects_empty_and_unknown_radiators(env):
    clock, _, _, _, _, mgr = env
    with pytest.raises(CommandError):
        await mgr.start("boost", [], 21.0, clock() + 60, label="b")
    with pytest.raises(CommandError):
        await mgr.start("boost", ["nope"], 21.0, clock() + 60, label="b")


async def test_failed_restore_keeps_override_and_retries(env):
    clock, gw, house, svc, db, mgr = env
    o, _ = await mgr.start("away", list(house.radiators), 12.0, clock() + 600, label="a")
    await settle(clock, gw, house, svc)
    clock.advance(600)
    gw.fail_next_execute = GatewayError("QUOTA")
    [p] = await mgr.tick()
    assert p.status == "failed"
    [view] = mgr.active()
    assert view["id"] == o.id and view["restoring"] is True
    assert json.loads(db.query("SELECT payload FROM overrides")[0]["payload"])["restoring"] is True
    assert all(house.radiators[i].mode == "manual" for i in SALON)
    assert await mgr.tick() == []  # the failure is settled: back off before the next try
    clock.advance(RESTORE_RETRY_FIRST_S)
    [p2] = await mgr.tick()
    assert p2.status == "pending"
    assert len(mgr.active()) == 1  # kept until the device confirms
    await settle(clock, gw, house, svc)
    assert p2.status == "confirmed"
    assert all(house.radiators[i].mode == "program" for i in SALON)
    assert house.radiators["9000022"].mode == "off"
    assert mgr.active() == []
    assert db.query("SELECT id FROM overrides") == []


async def test_unconfirmed_restore_is_retried_after_timeout(env):
    clock, gw, house, svc, _, mgr = env
    await mgr.start("boost", ["9500003"], 21.0, clock() + 60, label="b")
    await settle(clock, gw, house, svc)
    clock.advance(60)
    gw.silent = True
    [p] = await mgr.tick()
    assert await mgr.tick() == []  # in flight: no duplicate
    clock.advance(91)
    svc.tick()
    await svc.verify()  # the one targeted read finds the old state
    assert p.status == "failed" and mgr.active()[0]["restoring"] is True
    gw.silent = False
    assert await mgr.tick() == []
    clock.advance(RESTORE_RETRY_FIRST_S)
    [p2] = await mgr.tick()
    await settle(clock, gw, house, svc)
    assert p2.status == "confirmed" and house.radiators["9500003"].mode == "program"
    assert mgr.active() == []


async def test_no_restore_while_disconnected(env):
    clock, gw, house, svc, db, _ = env
    connected = False
    mgr = OverrideManager(db, house, svc, wall=clock, is_connected=lambda: connected)
    await mgr.start("boost", ["9500003"], 21.0, clock() + 60, label="b")
    await settle(clock, gw, house, svc)
    sent = len(gw.executed)
    clock.advance(60)
    assert await mgr.tick() == []
    assert len(gw.executed) == sent and len(mgr.active()) == 1
    connected = True
    [p] = await mgr.tick()
    await settle(clock, gw, house, svc)
    assert p.status == "confirmed" and mgr.active() == []


async def test_cancel_while_restoring_returns_in_flight_or_resubmits(env):
    clock, gw, house, svc, _, mgr = env
    o, _ = await mgr.start("boost", ["9500003"], 21.0, clock() + 60, label="b")
    await settle(clock, gw, house, svc)
    clock.advance(60)
    [p] = await mgr.tick()
    assert await mgr.cancel(o.id) is p
    gw2_fail = GatewayError("QUOTA")
    clock.advance(91)
    svc.tick()  # p times out
    await svc.verify()
    gw.fail_next_execute = gw2_fail
    p2 = await mgr.cancel(o.id)
    assert p2 is not p and p2.status == "failed"
    p3 = await mgr.cancel(o.id)
    await settle(clock, gw, house, svc)
    assert p3.status == "confirmed" and mgr.active() == []
    with pytest.raises(KeyError):
        await mgr.cancel(o.id)


class YieldingGateway(FakeGateway):
    async def execute(self, commands, label):
        await asyncio.sleep(0)
        await asyncio.sleep(0)
        return await super().execute(commands, label)


async def test_concurrent_boosts_restore_to_program(tmp_path):
    clock = ManualClock(1_000_000.0)
    gw = YieldingGateway(clock=clock)
    house = build_house(gw.root, list(gw.devices.values()))
    svc = CommandService(gw, house, clock=clock, wall=clock)
    mgr = OverrideManager(Database(tmp_path / "k.db"), house, svc, wall=clock)
    await asyncio.gather(
        mgr.start("boost", list(SALON), 21.0, clock() + 60, label="b1"),
        mgr.start("boost", list(SALON), 21.0, clock() + 60, label="b2"),
    )
    await settle(clock, gw, house, svc)
    [view] = mgr.active()
    clock.advance(60)
    await mgr.tick()
    await settle(clock, gw, house, svc)
    assert all(house.radiators[i].mode == "program" for i in SALON)
    assert all(house.radiators[i].target == 20.0 for i in SALON)
    assert mgr.active() == []


THREE = ["10000001", "9500003", "9000011"]


async def test_unmapped_mode_skips_only_that_radiator(env):
    clock, gw, house, svc, _, mgr = env
    await mgr.start("away", THREE, 12.0, clock() + 600, label="a")
    await settle(clock, gw, house, svc)
    gw.push_state(
        house.radiators["9000011"].heater_url, "core:OperatingModeState", "frostprotection"
    )
    await settle(clock, gw, house, svc)
    clock.advance(600)
    [p] = await mgr.tick()
    assert p.radiator_ids == ("10000001", "9500003")
    await settle(clock, gw, house, svc)
    assert p.status == "confirmed"
    assert all(house.radiators[i].mode == "program" for i in SALON)
    assert house.radiators["9000011"].mode == "other"
    assert mgr.active() == []


async def test_unloaded_radiator_waits_alone_then_is_dropped(env):
    clock, gw, house, svc, _, mgr = env
    await mgr.start("away", THREE, 12.0, clock() + 600, label="a")
    await settle(clock, gw, house, svc)
    r = house.radiators["9000011"]
    del r.states[r.heater_url]["core:OperatingModeState"]
    clock.advance(600)
    [p] = await mgr.tick()
    assert p.radiator_ids == ("10000001", "9500003")
    await settle(clock, gw, house, svc)
    assert all(house.radiators[i].mode == "program" for i in SALON)
    [view] = mgr.active()
    assert view["radiator_ids"] == ["9000011"] and view["restoring"] is True
    clock.advance(1800)
    assert await mgr.tick() == [] and len(mgr.active()) == 1
    clock.advance(1800)  # one hour past ends_at: give up on it
    assert await mgr.tick() == []
    assert mgr.active() == []


async def test_unloaded_radiator_restored_once_state_returns(env):
    clock, gw, house, svc, _, mgr = env
    await mgr.start("away", THREE, 12.0, clock() + 600, label="a")
    await settle(clock, gw, house, svc)
    r = house.radiators["9000011"]
    del r.states[r.heater_url]["core:OperatingModeState"]
    clock.advance(600)
    await mgr.tick()
    await settle(clock, gw, house, svc)
    r.states[r.heater_url]["core:OperatingModeState"] = "basic"
    [p] = await mgr.tick()
    assert p.radiator_ids == ("9000011",)
    await settle(clock, gw, house, svc)
    assert r.mode == "program" and r.target == 19.0
    assert mgr.active() == []


async def test_override_dropped_once_nothing_is_held(env):
    clock, gw, house, svc, _, mgr = env
    await mgr.start("boost", list(SALON), 21.0, clock() + 3600, label="b")
    await settle(clock, gw, house, svc)
    rads = list(house.radiators.values())
    off = plan_mode(rads[0], "off")
    for x in rads[1:]:
        off = off + plan_mode(x, "off")
    p = await svc.submit("Tout éteindre", tuple(x.id for x in rads), off)
    assert await mgr.tick() == [] and len(mgr.active()) == 1  # house off not applied yet
    await settle(clock, gw, house, svc)
    assert p.status == "confirmed"
    sent = len(gw.executed)
    assert await mgr.tick() == []
    assert mgr.active() == []
    assert len(gw.executed) == sent  # no restore
    assert all(x.mode == "off" for x in rads)


async def test_override_kept_while_start_not_applied(env):
    clock, gw, house, svc, _, mgr = env
    await mgr.start("boost", ["9500003"], 21.0, clock() + 3600, label="b")
    assert await mgr.tick() == [] and len(mgr.active()) == 1


async def test_away_under_newer_boost_is_kept(env):
    clock, gw, house, svc, _, mgr = env
    await mgr.start("away", ["9500003"], 12.0, clock() + 600, label="a")
    await settle(clock, gw, house, svc)
    await mgr.start("boost", ["9500003"], 21.0, clock() + 60, label="b")
    await settle(clock, gw, house, svc)
    await mgr.tick()
    assert sorted(a["kind"] for a in mgr.active()) == ["away", "boost"]


async def test_corrupt_override_rows_are_skipped(tmp_path):
    clock = ManualClock(1_000_000.0)
    gw = FakeGateway(clock=clock)
    house = build_house(gw.root, list(gw.devices.values()))
    svc = CommandService(gw, house, clock=clock, wall=clock)
    db = Database(tmp_path / "k.db")
    good = {
        "id": "good",
        "kind": "boost",
        "radiator_ids": ["9500003"],
        "temperature": 21.0,
        "ends_at": clock() + 60,
        "previous": {"9500003": {"mode": "program", "target": 20.0}},
        "created_at": clock(),
        "future_field": 1,
    }
    rows = [
        ("good", json.dumps(good)),
        ("garbage", "{not json"),
        ("list", "[1, 2]"),
        ("missing", json.dumps({"id": "missing", "kind": "boost"})),
        ("badkind", json.dumps({**good, "id": "badkind", "kind": "party"})),
        ("badids", json.dumps({**good, "id": "badids", "radiator_ids": "9500003"})),
    ]
    for row in rows:
        db.execute("INSERT INTO overrides (id, payload) VALUES (?, ?)", row)
    mgr = OverrideManager(db, house, svc, wall=clock)
    assert [o["id"] for o in mgr.active()] == ["good"]


def test_restore_retry_delay_doubles_up_to_half_an_hour():
    assert [restore_retry_delay(n) for n in range(1, 9)] == [
        30.0,
        60.0,
        120.0,
        240.0,
        480.0,
        960.0,
        1800.0,
        1800.0,
    ]


async def test_a_failing_restore_waits_longer_each_time(env):
    clock, gw, house, svc, _, mgr = env
    await mgr.start("boost", list(SALON), 21.0, clock() + 60, label="b")
    await settle(clock, gw, house, svc)
    clock.advance(60)
    for delay in (30.0, 60.0, 120.0):
        gw.fail_next_execute = GatewayError("QUOTA")
        [p] = await mgr.tick()
        assert p.status == "failed"
        assert await mgr.tick() == []  # settled now: the next try is `delay` away
        clock.advance(delay - 1)
        assert await mgr.tick() == []
        clock.advance(1)
    [p] = await mgr.tick()
    await settle(clock, gw, house, svc)
    assert p.status == "confirmed" and mgr.active() == []


async def test_cancel_ignores_the_backoff(env):
    clock, gw, house, svc, _, mgr = env
    o, _ = await mgr.start("boost", list(SALON), 21.0, clock() + 60, label="b")
    await settle(clock, gw, house, svc)
    clock.advance(60)
    gw.fail_next_execute = GatewayError("QUOTA")
    [p] = await mgr.tick()
    assert p.status == "failed"
    assert await mgr.tick() == []
    p2 = await mgr.cancel(o.id)  # the user asked: no waiting
    await settle(clock, gw, house, svc)
    assert p2.status == "confirmed" and mgr.active() == []


async def test_a_backing_off_override_does_not_delay_another(env):
    clock, gw, house, svc, _, mgr = env
    await mgr.start("boost", ["9500003"], 21.0, clock() + 60, label="b1")
    await mgr.start("boost", ["10000001"], 21.0, clock() + 60, label="b2")
    await settle(clock, gw, house, svc)
    clock.advance(60)
    gw.fail_next_execute = GatewayError("QUOTA")
    ps = await mgr.tick()
    assert sorted(p.status for p in ps) == ["failed", "pending"]
    await settle(clock, gw, house, svc)
    assert await mgr.tick() == []  # the failed one backs off, the other is done
    assert len(mgr.active()) == 1
    clock.advance(RESTORE_RETRY_FIRST_S)
    [p] = await mgr.tick()
    await settle(clock, gw, house, svc)
    assert p.status == "confirmed" and mgr.active() == []


async def test_confirmed_restore_clears_failure_and_retry_state(env):
    clock, gw, house, svc, _, mgr = env
    o, _ = await mgr.start("boost", ["9500003", "10000001"], 21.0, clock() + 60, label="b")
    await settle(clock, gw, house, svc)
    clock.advance(60)
    gw.fail_next_execute = GatewayError("QUOTA")
    await mgr.tick()
    await mgr.tick()
    assert mgr._failures[o.id] == 1 and o.id in mgr._retry_at
    clock.advance(RESTORE_RETRY_FIRST_S)
    await mgr.tick()
    await settle(clock, gw, house, svc)
    mgr.active()
    assert o.id not in mgr._failures and o.id not in mgr._retry_at
    assert mgr.active() == []


async def test_third_failure_warning_names_the_reason(env, caplog):
    clock, gw, house, svc, _, mgr = env
    await mgr.start("boost", ["9500003"], 21.0, clock() + 60, label="b")
    await settle(clock, gw, house, svc)
    clock.advance(60)
    for delay in (30.0, 60.0, 120.0):
        gw.fail_next_execute = GatewayError("QUOTA")
        await mgr.tick()
        await mgr.tick()
        clock.advance(delay)
    assert any("QUOTA" in r.getMessage() for r in caplog.records if r.levelname == "WARNING")
