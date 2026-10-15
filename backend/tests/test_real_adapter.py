import asyncio
from types import SimpleNamespace

import pytest
from pyoverkiz.converter import converter
from pyoverkiz.enums import DataType, EventName, ExecutionState, UIClass, UIWidget
from pyoverkiz.models import DeviceStateChangedEvent, EventState, ExecutionStateChangedEvent
from pyoverkiz.models import Event as OverkizEvent
from pyoverkiz.models import Place as OverkizPlace

from kelvin.overkiz.errors import GatewayError
from kelvin.overkiz.models import (
    DeviceCommand,
    DeviceUpdate,
    ExecUpdate,
    PlaceEvent,
    RawPlace,
    StateChange,
)
from kelvin.overkiz.real import (
    REQUEST_TIMEOUT_S,
    PyOverkizGateway,
    to_events,
    to_raw_device,
    to_raw_place,
)


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


def test_to_events_maps_device_updates_and_payload_less_place_events():
    raw = [
        {"name": "PlaceCreatedEvent", "placeOID": "x", "timestamp": 1},
        {"name": "PlaceUpdatedEvent", "timestamp": 2},
        {"name": "PlaceDeletedEvent", "placeOID": "x", "timestamp": 3},
        {
            "name": "DeviceUpdatedEvent",
            "deviceURL": "io://g/1#1",
            "placeOID": "p2",
            "label": "Bureau",
            "timestamp": 4,
        },
        {"name": "GatewayAliveEvent", "gatewayId": "g", "timestamp": 5},
    ]
    out = to_events(converter.structure(raw, list[OverkizEvent]))
    # pyoverkiz 2.2.2 keeps only the name of a place event: no oid, no label.
    assert out == [
        PlaceEvent("created"),
        PlaceEvent("updated"),
        PlaceEvent("deleted"),
        DeviceUpdate("io://g/1#1", "p2", "Bureau"),
    ]


def test_to_raw_place_keeps_the_type():
    place = converter.structure(
        {
            "oid": "h",
            "label": "All House",
            "type": 0,
            "creationTime": 1,
            "subPlaces": [{"oid": "a", "label": "Salon", "type": 7, "creationTime": 1}],
        },
        OverkizPlace,
    )
    assert to_raw_place(place) == RawPlace("h", "All House", (RawPlace("a", "Salon", (), 7),), 0)


# Plan 12: the UI class and the allowed state values travel with the device.


def test_to_raw_device_keeps_the_ui_class_and_allowed_values():
    d = SimpleNamespace(
        device_url="io://g/1#1",
        label="Bureau",
        widget=UIWidget.ATLANTIC_ELECTRICAL_HEATER,
        ui_class=UIClass.HEATING_SYSTEM,
        place_oid="p",
        states={},
        definition=SimpleNamespace(
            commands=["setHeatingLevel"],
            states={
                "io:TargetHeatingLevelState": SimpleNamespace(values=["off", "eco", "comfort"]),
                "core:NameState": SimpleNamespace(values=None),
            },
        ),
    )
    raw = to_raw_device(d)
    assert (raw.widget, raw.ui_class) == ("AtlanticElectricalHeater", "HeatingSystem")
    assert raw.state_values == {"io:TargetHeatingLevelState": ["off", "eco", "comfort"]}
    assert raw.commands == ["setHeatingLevel"]


def test_to_raw_device_without_definition_or_ui_class():
    d = SimpleNamespace(
        device_url="io://g/2#1",
        label="X",
        widget="Unknown",
        ui_class=None,
        place_oid=None,
        states={},
        definition=None,
    )
    raw = to_raw_device(d)
    assert (raw.ui_class, raw.state_values, raw.commands) == ("", {}, [])
