"""In-memory Overkiz: used by tests and by the simulator (KELVIN_FAKE=1)."""

from __future__ import annotations

import copy
import time
from collections.abc import Callable
from typing import Any
from uuid import uuid4

from kelvin.overkiz.errors import BadCredentialsError
from kelvin.overkiz.models import DeviceCommand, Event, ExecUpdate, RawDevice, RawPlace, StateChange
from kelvin.overkiz.sample import sample_house

EFFECTS: dict[str, Callable[[tuple[Any, ...]], list[tuple[str, Any]]]] = {
    "setOperatingMode": lambda p: [("core:OperatingModeState", p[0])],
    "setTargetTemperature": lambda p: [("core:TargetTemperatureState", float(p[0]))],
    "setComfortTemperature": lambda p: [("core:ComfortRoomTemperatureState", float(p[0]))],
    "setEcoTemperature": lambda p: [("core:EcoRoomTemperatureState", float(p[0]))],
    "setTimeProgram": lambda p: [("core:TimeProgramState", copy.deepcopy(p[0]))],
    "setOpenWindowDetectionActivation": lambda p: [
        ("core:OpenWindowDetectionActivationState", p[0])
    ],
    "setOccupancyActivation": lambda p: [("core:OccupancyActivationState", p[0])],
    "on": lambda p: [("core:OnOffState", "on"), ("core:LightState", "on")],
    "off": lambda p: [("core:OnOffState", "off"), ("core:LightState", "off")],
    "setIntensity": lambda p: [("core:LightIntensityState", int(p[0]))],
    "setName": lambda p: [("core:NameState", p[0])],
}

QUIRK_COMMANDS = frozenset({"setComfortTemperature", "setEcoTemperature"})

DEMO_EMAIL = "demo@kelvin.local"
DEMO_PASSWORD = "kelvin"


class FakeGateway:
    def __init__(
        self,
        root: RawPlace | None = None,
        devices: list[RawDevice] | None = None,
        *,
        clock: Callable[[], float] = time.monotonic,
        delay: float = 1.5,
        quirk_override_mode: bool = True,
        username: str = DEMO_EMAIL,
        password: str = DEMO_PASSWORD,
    ) -> None:
        if root is None:
            root, devices = sample_house()
        self.root = root
        self.devices = {d.device_url: d for d in copy.deepcopy(devices or [])}
        self.clock = clock
        self.delay = delay
        self.quirk = quirk_override_mode
        self.logins = 0
        self.username = username
        self.password = password
        self.cloud_username = DEMO_EMAIL  # what the simulated Cozytouch accepts
        self.cloud_password = DEMO_PASSWORD
        self.fail_login: Exception | None = None
        self.checks = 0
        self.executed: list[list[DeviceCommand]] = []
        self.fail_next_execute: Exception | None = None
        self.fail_fetch: Exception | None = None
        self.fail_states: Exception | None = None
        self.silent = False
        self.unresponsive = False
        self.snapshots = 0  # full setup reads served (quota guard tests)
        self.state_reads = 0  # per-device state reads served
        self.quota_reads = 0
        self._scheduled: list[tuple[float, str, list[DeviceCommand]]] = []
        self._events: list[Event] = []

    def _accepts(self, username: str, password: str) -> bool:
        return (
            username.strip().casefold() == self.cloud_username.casefold()
            and password == self.cloud_password
        )

    async def login(self) -> None:
        self.logins += 1
        if self.fail_login is not None:
            raise self.fail_login
        if not self._accepts(self.username, self.password):
            raise BadCredentialsError("bad credentials")

    async def set_credentials(self, username: str, password: str) -> None:
        self.username, self.password = username, password

    async def check_credentials(self, username: str, password: str) -> None:
        self.checks += 1
        if self.fail_login is not None:
            raise self.fail_login
        if not self._accepts(username, password):
            raise BadCredentialsError("bad credentials")

    async def close(self) -> None:
        return None

    async def snapshot(self) -> tuple[RawPlace, list[RawDevice]]:
        self.snapshots += 1
        return self.root, copy.deepcopy(list(self.devices.values()))

    async def device_states(self, device_url: str) -> dict[str, Any]:
        if self.fail_states is not None:
            raise self.fail_states
        self.state_reads += 1
        return copy.deepcopy(self.devices[device_url].states)

    async def quotas(self) -> Any:
        self.quota_reads += 1
        if self.fail_states is not None:
            raise self.fail_states
        # Invented values in an invented shape: the real one is recorded in overkiz-notes.
        return [
            {"name": "setup-bulk-load", "remaining": 2, "limit": 3, "gatewayId": "x"},
            {"name": "exec", "remaining": 48, "limit": 50},
        ]

    async def execute(self, commands: list[DeviceCommand], label: str) -> str:
        if self.fail_next_execute is not None:
            exc, self.fail_next_execute = self.fail_next_execute, None
            raise exc
        exec_id = uuid4().hex
        self.executed.append(list(commands))
        if not self.silent:
            # Real order (docs/overkiz-notes.md): NOT_TRANSMITTED, TRANSMITTED, states, final.
            self._events.append(ExecUpdate(exec_id, "NOT_TRANSMITTED", None))
            self._events.append(ExecUpdate(exec_id, "TRANSMITTED", None))
            self._scheduled.append((self.clock() + self.delay, exec_id, list(commands)))
        return exec_id

    async def fetch_events(self) -> list[Event]:
        if self.fail_fetch is not None:
            raise self.fail_fetch
        now = self.clock()
        due = [s for s in self._scheduled if s[0] <= now]
        self._scheduled = [s for s in self._scheduled if s[0] > now]
        for _, exec_id, commands in due:
            if self.unresponsive:
                self._events.append(ExecUpdate(exec_id, "FAILED", "ACTUATORNOANSWER"))
                continue
            quirk_hit = False
            for c in commands:
                for name, value in EFFECTS.get(c.name, lambda p: [])(c.parameters):
                    self._set(c.device_url, name, value, emit=True)
                quirk_hit |= self.quirk and c.name in QUIRK_COMMANDS
            self._events.append(
                ExecUpdate(exec_id, "FAILED", "OVERRIDEMODE_ERROR")
                if quirk_hit
                else ExecUpdate(exec_id, "COMPLETED", None)
            )
        out, self._events = self._events, []
        return out

    def push_state(self, device_url: str, name: str, value: Any) -> None:
        self._set(device_url, name, value, emit=True)

    def set_state_silently(self, device_url: str, name: str, value: Any) -> None:
        self._set(device_url, name, value, emit=False)

    def _set(self, device_url: str, name: str, value: Any, *, emit: bool) -> None:
        dev = self.devices[device_url]
        if dev.states.get(name) == value:
            return
        dev.states[name] = value
        if emit:
            self._events.append(StateChange(device_url, name, value))
