import asyncio

import pytest
from pyoverkiz.enums import DataType, EventName, ExecutionState
from pyoverkiz.models import DeviceStateChangedEvent, EventState, ExecutionStateChangedEvent

from kelvin.overkiz.errors import GatewayError
from kelvin.overkiz.models import DeviceCommand, ExecUpdate, StateChange
from kelvin.overkiz.real import REQUEST_TIMEOUT_S, PyOverkizGateway, to_events


def test_to_events_converts_state_and_execution_events():
    events = [
        DeviceStateChangedEvent(
            name=EventName.DEVICE_STATE_CHANGED,
            device_url="io://g/1#1",
            device_states=[
                EventState(
                    name="core:ComfortRoomTemperatureState", type=DataType.FLOAT, value="20.5"
                )
            ],
        ),
        ExecutionStateChangedEvent(
            name=EventName.EXECUTION_STATE_CHANGED,
            exec_id="abc",
            new_state=ExecutionState.FAILED,
            old_state=ExecutionState.TRANSMITTED,
            failure_type="OVERRIDEMODE_ERROR",
        ),
    ]
    out = to_events(events)
    assert out == [
        StateChange("io://g/1#1", "core:ComfortRoomTemperatureState", 20.5),
        ExecUpdate("abc", "FAILED", "OVERRIDEMODE_ERROR"),
    ]


class _HangingClient:
    """Stands in for pyoverkiz's client: every call hangs (no network is touched)."""

    async def execute_action_group(self, **_kw):
        await asyncio.sleep(3600)

    async def fetch_events(self):
        await asyncio.sleep(3600)

    async def close(self):
        return None


async def test_a_hung_overkiz_call_becomes_a_gateway_error():
    gw = PyOverkizGateway("me@example.fr", "pw", timeout=0.05)
    gw._client = _HangingClient()
    with pytest.raises(GatewayError, match="TimeoutError"):
        await gw.execute([DeviceCommand("io://g/1#1", "identify")], "test")
    with pytest.raises(GatewayError, match="TimeoutError"):
        await gw.fetch_events()


def test_the_default_overkiz_timeout_is_thirty_seconds():
    assert REQUEST_TIMEOUT_S == 30.0
    assert PyOverkizGateway("me@example.fr", "pw")._timeout == REQUEST_TIMEOUT_S
