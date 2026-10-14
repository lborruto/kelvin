"""Gateway implementation backed by pyoverkiz (Overkiz cloud, Sauter Cozytouch server)."""

import asyncio
import ssl
from typing import Any

import aiohttp
import certifi
from pyoverkiz import exceptions as ox
from pyoverkiz.auth.credentials import UsernamePasswordCredentials
from pyoverkiz.client import OverkizClient
from pyoverkiz.enums import Server
from pyoverkiz.models import Action, Command, DeviceStateChangedEvent, ExecutionStateChangedEvent

from kelvin.overkiz.errors import AuthError, BadCredentialsError, GatewayError, QuotaError
from kelvin.overkiz.models import DeviceCommand, Event, ExecUpdate, RawDevice, RawPlace, StateChange

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
    return RawPlace(oid=p.oid, label=p.label, children=tuple(to_raw_place(c) for c in p.sub_places))


def to_raw_device(d: Any) -> RawDevice:
    return RawDevice(
        device_url=d.device_url,
        label=d.label,
        widget=str(d.widget),
        place_oid=d.place_oid,
        states={name: s.value for name, s in d.states.items()},
        commands=list(d.definition.commands) if d.definition else [],
    )


def to_events(events: list[Any]) -> list[Event]:
    out: list[Event] = []
    for e in events:
        if isinstance(e, DeviceStateChangedEvent):
            out.extend(StateChange(e.device_url, s.name, s.value) for s in e.device_states)
        elif isinstance(e, ExecutionStateChangedEvent):
            out.append(ExecUpdate(e.exec_id, str(e.new_state), e.failure_type))
    return out


class PyOverkizGateway:
    def __init__(self, username: str, password: str, *, timeout: float = REQUEST_TIMEOUT_S) -> None:
        self._creds = UsernamePasswordCredentials(username=username, password=password)
        self._client: OverkizClient | None = None
        self._timeout = timeout

    @staticmethod
    def _client_for(creds: UsernamePasswordCredentials) -> OverkizClient:
        ssl_ctx = ssl.create_default_context(cafile=certifi.where())
        return OverkizClient(
            server=Server.SAUTER_COZYTOUCH,
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
