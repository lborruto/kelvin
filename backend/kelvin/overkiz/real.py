"""Gateway implementation backed by pyoverkiz (Overkiz cloud; the server is the account's)."""

import asyncio
import ssl
from typing import Any

import aiohttp
import certifi
from pyoverkiz import exceptions as ox
from pyoverkiz.auth.credentials import UsernamePasswordCredentials
from pyoverkiz.client import OverkizClient
from pyoverkiz.enums import Server
from pyoverkiz.models import (
    Action,
    Command,
    DeviceStateChangedEvent,
    DeviceUpdatedEvent,
    ExecutionStateChangedEvent,
)

from kelvin.overkiz.errors import AuthError, BadCredentialsError, GatewayError, QuotaError
from kelvin.overkiz.models import (
    DeviceCommand,
    DeviceUpdate,
    Event,
    ExecUpdate,
    PlaceEvent,
    PlaceKind,
    RawDevice,
    RawPlace,
    SetupDevice,
    SetupPlace,
    StateChange,
)
from kelvin.overkiz.servers import DEFAULT_SERVER
from kelvin.setup.client import (
    SetupHttp,
    device_path,
    label_path,
    place_path,
    relocate_path,
    subplaces_path,
)

_QUOTA = (
    ox.TooManyRequestsError,
    ox.TooManyExecutionsError,
    ox.ExecutionQueueFullError,
    ox.TooManyConcurrentRequestsError,
    ox.TooManyAttemptsBannedError,
)
_AUTH = (ox.BadCredentialsError, ox.NotAuthenticatedError, ox.InvalidTokenError)

# One Overkiz call (login, snapshot, events, execute) never waits longer than this. aiohttp's
# default is 5 minutes, during which a command would sit in "sending" and the pump would stall.
REQUEST_TIMEOUT_S = 30.0


def _map_error(e: BaseException) -> GatewayError:
    if isinstance(e, _QUOTA):
        return QuotaError(str(e) or type(e).__name__)
    if isinstance(e, ox.BadCredentialsError):
        return BadCredentialsError(str(e) or type(e).__name__)
    if isinstance(e, _AUTH):
        return AuthError(str(e) or type(e).__name__)
    return GatewayError(str(e) or type(e).__name__)


def to_raw_place(p: Any) -> RawPlace:
    return RawPlace(
        oid=p.oid,
        label=p.label,
        children=tuple(to_raw_place(c) for c in p.sub_places),
        type=p.type,
    )


def to_raw_device(d: Any) -> RawDevice:
    definition = d.definition
    return RawDevice(
        device_url=d.device_url,
        label=d.label,
        widget=str(d.widget),
        place_oid=d.place_oid,
        states={name: s.value for name, s in d.states.items()},
        commands=list(definition.commands) if definition else [],
        ui_class=str(d.ui_class) if d.ui_class else "",
        state_values={
            name: [str(v) for v in sd.values] for name, sd in definition.states.items() if sd.values
        }
        if definition
        else {},
    )


def to_setup_place(body: Any) -> SetupPlace:
    if not isinstance(body, dict) or not isinstance(body.get("oid"), str):
        raise GatewayError("unexpected place answer")
    t = body.get("type")
    subs = body.get("subPlaces") or []
    return SetupPlace(
        oid=body["oid"],
        label=body.get("label") if isinstance(body.get("label"), str) else "",
        type=t if isinstance(t, int) and not isinstance(t, bool) else None,
        metadata=body.get("metadata"),
        children=tuple(
            c["oid"] for c in subs if isinstance(c, dict) and isinstance(c.get("oid"), str)
        ),
    )


def to_setup_device(body: Any) -> SetupDevice:
    if not isinstance(body, dict) or not isinstance(body.get("deviceURL"), str):
        raise GatewayError("unexpected device answer")
    place = body.get("placeOID")
    label = body.get("label")
    return SetupDevice(
        body["deviceURL"],
        label if isinstance(label, str) else "",
        place if isinstance(place, str) else None,
    )


PLACE_KINDS: dict[str, PlaceKind] = {
    "PlaceCreatedEvent": "created",
    "PlaceUpdatedEvent": "updated",
    "PlaceDeletedEvent": "deleted",
}


def to_events(events: list[Any]) -> list[Event]:
    out: list[Event] = []
    for e in events:
        if isinstance(e, DeviceStateChangedEvent):
            out.extend(StateChange(e.device_url, s.name, s.value) for s in e.device_states)
        elif isinstance(e, ExecutionStateChangedEvent):
            out.append(ExecUpdate(e.exec_id, str(e.new_state), e.failure_type))
        elif isinstance(e, DeviceUpdatedEvent):
            out.append(DeviceUpdate(e.device_url, e.place_oid, e.label))
        elif str(getattr(e, "name", "")) in PLACE_KINDS:
            # pyoverkiz 2.2.2 structures Place*Event into its base Event: the name only.
            out.append(PlaceEvent(PLACE_KINDS[str(e.name)]))
    return out


class PyOverkizGateway:
    def __init__(
        self,
        username: str,
        password: str,
        *,
        server: str = DEFAULT_SERVER,
        timeout: float = REQUEST_TIMEOUT_S,
    ) -> None:
        self.server = server
        self._creds = UsernamePasswordCredentials(username=username, password=password)
        self._client: OverkizClient | None = None
        self._timeout = timeout

    def _client_for(self, creds: UsernamePasswordCredentials) -> OverkizClient:
        ssl_ctx = ssl.create_default_context(cafile=certifi.where())
        return OverkizClient(
            server=Server(self.server),
            credentials=creds,
            verify_ssl=ssl_ctx,  # type: ignore[arg-type]  # pyoverkiz forwards it as aiohttp ssl=
        )

    def _c(self) -> OverkizClient:
        if self._client is None:
            self._client = self._client_for(self._creds)
        return self._client

    async def set_credentials(self, username: str, password: str) -> None:
        # The client holds its credentials: drop it, the next login builds a new one.
        await self.close()
        self._creds = UsernamePasswordCredentials(username=username, password=password)

    async def check_credentials(self, username: str, password: str) -> None:
        client = self._client_for(UsernamePasswordCredentials(username=username, password=password))
        try:
            await self._call(client.login(register_event_listener=False))
        finally:
            await client.close()

    async def _call(self, coro):
        try:
            async with asyncio.timeout(self._timeout):
                return await coro
        except (ox.BaseOverkizError, aiohttp.ClientError, TimeoutError) as e:
            raise _map_error(e) from e

    async def login(self) -> None:
        await self._call(self._c().login(register_event_listener=True))

    async def snapshot(self) -> tuple[RawPlace, list[RawDevice]]:
        places = await self._call(self._c().get_places())
        devices = await self._call(self._c().get_devices(refresh=True))
        return to_raw_place(places), [to_raw_device(d) for d in devices]

    async def device_states(self, device_url: str) -> dict[str, Any]:
        states = await self._call(self._c().get_state(device_url))
        return {s.name: s.value for s in states}

    async def quotas(self) -> Any:
        # pyoverkiz 2.2.2 has no wrapper for this endpoint; `_get` is its own GET helper.
        return await self._call(self._c()._get("setup/quotas"))

    def _setup(self) -> SetupHttp:
        return SetupHttp(self._c, timeout=self._timeout, map_error=_map_error)

    async def read_place(self, oid: str) -> SetupPlace:
        _, body = await self._setup().request("GET", place_path(oid))
        return to_setup_place(body)

    async def read_device(self, device_url: str) -> SetupDevice:
        _, body = await self._setup().request("GET", device_path(device_url))
        return to_setup_device(body)

    async def create_place(self, parent_oid: str, label: str, type_: int) -> str:
        _, body = await self._setup().request(
            "POST", subplaces_path(parent_oid), {"type": type_, "label": label}
        )
        oid = body.get("placeOID") if isinstance(body, dict) else None
        if not isinstance(oid, str) or not oid:
            raise GatewayError("place created without an oid")
        return oid

    async def update_place(self, oid: str, label: str, type_: int | None, metadata: Any) -> None:
        payload: dict[str, Any] = {"type": type_, "label": label}
        if metadata is not None:
            payload["metadata"] = metadata
        await self._setup().request("PUT", place_path(oid), payload)

    async def delete_place(self, oid: str) -> None:
        await self._setup().request("DELETE", place_path(oid))

    async def relocate_device(self, device_url: str, place_oid: str) -> None:
        await self._setup().request("PUT", relocate_path(device_url, place_oid))

    async def rename_device(self, device_url: str, label: str) -> None:
        await self._setup().request("PUT", label_path(device_url, label))

    async def fetch_events(self) -> list[Event]:
        return to_events(await self._call(self._c().fetch_events()))

    async def execute(self, commands: list[DeviceCommand], label: str) -> str:
        by_device: dict[str, list[Command]] = {}
        for c in commands:
            by_device.setdefault(c.device_url, []).append(
                Command(name=c.name, parameters=list(c.parameters) or None)
            )
        actions = [Action(device_url=url, commands=cmds) for url, cmds in by_device.items()]
        return await self._call(self._c().execute_action_group(actions=actions, label=label))

    async def close(self) -> None:
        if self._client is not None:
            await self._client.close()
            self._client = None
