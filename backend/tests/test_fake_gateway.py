import pytest

from kelvin.overkiz.errors import GatewayError, QuotaError
from kelvin.overkiz.fake import FakeGateway
from kelvin.overkiz.models import DeviceCommand, ExecUpdate, StateChange
from kelvin.overkiz.sample import SAMPLE_GATEWAY
from tests.conftest import ManualClock

H = f"{SAMPLE_GATEWAY}/9500003#1"


async def test_command_applies_after_delay():
    clock = ManualClock()
    gw = FakeGateway(clock=clock)
    exec_id = await gw.execute([DeviceCommand(H, "setOperatingMode", ("basic",))], "t")
    assert await gw.fetch_events() == [
        ExecUpdate(exec_id, "NOT_TRANSMITTED", None),
        ExecUpdate(exec_id, "TRANSMITTED", None),
    ]
    clock.advance(2)
    assert await gw.fetch_events() == [
        StateChange(H, "core:OperatingModeState", "basic"),
        ExecUpdate(exec_id, "COMPLETED", None),
    ]
    _, devices = await gw.snapshot()
    assert (
        next(d for d in devices if d.device_url == H).states["core:OperatingModeState"] == "basic"
    )


async def test_comfort_quirk_reports_failed_but_applies():
    clock = ManualClock()
    gw = FakeGateway(clock=clock)
    exec_id = await gw.execute([DeviceCommand(H, "setComfortTemperature", (20.5,))], "t")
    clock.advance(2)
    events = await gw.fetch_events()
    assert StateChange(H, "core:ComfortRoomTemperatureState", 20.5) in events
    assert ExecUpdate(exec_id, "FAILED", "OVERRIDEMODE_ERROR") in events


async def test_eco_quirk_orders_state_change_before_failed_update():
    clock = ManualClock()
    gw = FakeGateway(clock=clock)
    exec_id = await gw.execute([DeviceCommand(H, "setEcoTemperature", (3.5,))], "t")
    clock.advance(2)
    events = await gw.fetch_events()
    change = StateChange(H, "core:EcoRoomTemperatureState", 3.5)
    failed = ExecUpdate(exec_id, "FAILED", "OVERRIDEMODE_ERROR")
    assert events.index(change) < events.index(failed)


async def test_quirk_disabled_reports_completed():
    clock = ManualClock()
    gw = FakeGateway(clock=clock, quirk_override_mode=False)
    exec_id = await gw.execute([DeviceCommand(H, "setComfortTemperature", (20.5,))], "t")
    clock.advance(2)
    assert await gw.fetch_events() == [
        ExecUpdate(exec_id, "NOT_TRANSMITTED", None),
        ExecUpdate(exec_id, "TRANSMITTED", None),
        StateChange(H, "core:ComfortRoomTemperatureState", 20.5),
        ExecUpdate(exec_id, "COMPLETED", None),
    ]


async def test_set_state_silently_changes_device_without_events():
    clock = ManualClock()
    gw = FakeGateway(clock=clock)
    gw.set_state_silently(H, "core:ComfortRoomTemperatureState", 21.5)
    _, devices = await gw.snapshot()
    assert (
        next(d for d in devices if d.device_url == H).states["core:ComfortRoomTemperatureState"]
        == 21.5
    )
    assert await gw.fetch_events() == []


async def test_unresponsive_and_silent_modes():
    clock = ManualClock()
    gw = FakeGateway(clock=clock)
    gw.unresponsive = True
    exec_id = await gw.execute([DeviceCommand(H, "setOperatingMode", ("basic",))], "t")
    clock.advance(2)
    assert await gw.fetch_events() == [
        ExecUpdate(exec_id, "NOT_TRANSMITTED", None),
        ExecUpdate(exec_id, "TRANSMITTED", None),
        ExecUpdate(exec_id, "FAILED", "ACTUATORNOANSWER"),
    ]
    gw.unresponsive, gw.silent = False, True
    await gw.execute([DeviceCommand(H, "setOperatingMode", ("basic",))], "t")
    clock.advance(2)
    assert await gw.fetch_events() == []


async def test_failures_and_external_changes():
    gw = FakeGateway(clock=ManualClock())
    gw.fail_next_execute = GatewayError("boom")
    with pytest.raises(GatewayError):
        await gw.execute([DeviceCommand(H, "setOperatingMode", ("basic",))], "t")
    gw.fail_fetch = QuotaError("quota")
    with pytest.raises(QuotaError):
        await gw.fetch_events()
    gw.fail_fetch = None
    gw.push_state(f"{SAMPLE_GATEWAY}/9500003#2", "core:TemperatureState", 21.0)
    assert await gw.fetch_events() == [
        StateChange(f"{SAMPLE_GATEWAY}/9500003#2", "core:TemperatureState", 21.0)
    ]
    await gw.login()
    assert gw.logins == 1
