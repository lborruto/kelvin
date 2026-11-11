import asyncio
import importlib.metadata
from types import SimpleNamespace

import aiohttp
import pytest
from pyoverkiz import exceptions as ox
from pyoverkiz.auth.credentials import UsernamePasswordCredentials
from pyoverkiz.client import OverkizClient
from pyoverkiz.converter import converter
from pyoverkiz.enums import DataType, EventName, ExecutionState, Server, UIClass, UIWidget
from pyoverkiz.models import (
    Action,
    Command,
    DeviceStateChangedEvent,
    EventState,
    ExecutionStateChangedEvent,
)
from pyoverkiz.models import Event as OverkizEvent
from pyoverkiz.models import Place as OverkizPlace

from kelvin.overkiz.errors import GatewayError, QuotaError, UnansweredError
from kelvin.overkiz.models import (
    DeviceCommand,
    DeviceUpdate,
    ExecUpdate,
    ListenerReset,
    PlaceEvent,
    RawPlace,
    StateChange,
)
from kelvin.overkiz.real import (
    REQUEST_TIMEOUT_S,
    PyOverkizGateway,
    _map_error,
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

    session = SimpleNamespace()  # no `post`: the call hangs before any request

    async def _refresh_token_if_expired(self):
        await asyncio.sleep(3600)

    event_listener_id = "listener-1"

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
    # pyoverkiz 2.2.3 keeps only the name of a place event: no oid, no label.
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


# `exec/apply` is sent once (never through pyoverkiz's `_post`, which re-sends after a dropped
# connection). A real pyoverkiz client on a stub session: no network is touched.


class _Resp:
    def __init__(self, status: int, body):
        self.status = status
        self._body = body
        self.url = "https://stub.example/"

    async def json(self, content_type=None):
        return self._body

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False


class _Session:
    def __init__(self, *responses):
        self.responses = list(responses)
        self.posts: list[dict] = []

    def post(self, url, **kw):
        self.posts.append({"url": url, **kw})
        r = self.responses.pop(0)
        if isinstance(r, BaseException):
            raise r
        return r

    async def close(self):
        return None


def _gateway_on(session: _Session) -> PyOverkizGateway:
    gw = PyOverkizGateway("a@example.invalid", "x")
    gw._client = OverkizClient(
        server=Server.SAUTER_COZYTOUCH,
        credentials=UsernamePasswordCredentials(username="a@example.invalid", password="x"),
        session=session,  # type: ignore[arg-type]
    )
    return gw


_COMMANDS = [
    DeviceCommand("io://g/1#1", "setTargetTemperature", (20.5,)),
    DeviceCommand("io://g/1#1", "setOperatingMode", ("internal",)),
    DeviceCommand("io://g/2#1", "identify"),
]


async def test_a_command_is_not_sent_again_after_a_dropped_connection():
    """Overkiz may have accepted the request before the connection dropped: a second send
    would run the command twice. The pending fails as `network` and the states decide."""
    session = _Session(
        aiohttp.ServerDisconnectedError("dropped"),
        _Resp(200, {"execId": "second"}),
        _Resp(200, {"execId": "third"}),
    )
    gw = _gateway_on(session)
    with pytest.raises(UnansweredError):  # it may have run: the caller must not assume it did not
        await gw.execute(_COMMANDS, "Salon")
    assert len(session.posts) == 1


def test_only_a_request_that_may_have_left_is_unanswered():
    assert isinstance(_map_error(TimeoutError()), UnansweredError)
    assert isinstance(_map_error(aiohttp.ServerDisconnectedError("x")), UnansweredError)
    assert isinstance(_map_error(aiohttp.ClientPayloadError("x")), UnansweredError)
    never_opened = aiohttp.ClientConnectorError(
        SimpleNamespace(ssl=None, host="h", port=443), OSError("refused")
    )
    for definite in (never_opened, ox.OverkizError("400"), ox.TooManyExecutionsError("x")):
        assert not isinstance(_map_error(definite), UnansweredError)


async def test_a_command_is_sent_exactly_as_pyoverkiz_sends_it():
    assert importlib.metadata.version("pyoverkiz") == "2.2.3"
    ours = _Session(_Resp(200, {"execId": "exec-1"}))
    assert await _gateway_on(ours).execute(_COMMANDS, "Salon") == "exec-1"
    theirs = _Session(_Resp(200, {"execId": "exec-1"}))
    actions = [
        Action(
            device_url="io://g/1#1",
            commands=[
                Command(name="setTargetTemperature", parameters=[20.5]),
                Command(name="setOperatingMode", parameters=["internal"]),
            ],
        ),
        Action(device_url="io://g/2#1", commands=[Command(name="identify", parameters=None)]),
    ]
    client = _gateway_on(theirs)._client
    assert await client.execute_action_group(actions=actions, label="Salon") == "exec-1"
    assert len(ours.posts) == 1 and ours.posts == theirs.posts
    assert ours.posts[0]["url"].endswith("/exec/apply")
    assert ours.posts[0]["json"] == {
        "label": "Salon",
        "actions": [
            {
                "deviceURL": "io://g/1#1",
                "commands": [
                    {"name": "setTargetTemperature", "parameters": [20.5]},
                    {"name": "setOperatingMode", "parameters": ["internal"]},
                ],
            },
            {"deviceURL": "io://g/2#1", "commands": [{"name": "identify"}]},
        ],
    }


async def test_a_refused_command_keeps_its_error_mapping():
    session = _Session(
        _Resp(400, {"errorCode": "EXEC_QUEUE_FULL", "error": "Execution queue is full"})
    )
    with pytest.raises(QuotaError):
        await _gateway_on(session).execute(_COMMANDS, "Salon")
    assert len(session.posts) == 1


class _ListenerClient:
    """pyoverkiz's client when Overkiz forgot the listener: the fetch registers a new one."""

    def __init__(self, replaced_by: str | None):
        self.event_listener_id = "listener-1"
        self.replaced_by = replaced_by

    async def fetch_events(self):
        if self.replaced_by is not None:
            self.event_listener_id, self.replaced_by = self.replaced_by, None
        return []


async def test_a_listener_replaced_inside_a_fetch_is_reported_once():
    gw = PyOverkizGateway("a@example.invalid", "x")
    gw._client = _ListenerClient("listener-2")
    assert await gw.fetch_events() == [ListenerReset()]
    assert await gw.fetch_events() == []
