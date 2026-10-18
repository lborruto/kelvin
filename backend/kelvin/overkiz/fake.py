"""In-memory Overkiz: used by tests and by the simulator (KELVIN_FAKE=1)."""

from __future__ import annotations

import copy
import time
from collections.abc import Callable
from typing import Any
from uuid import uuid4

from kelvin.config import split_list
from kelvin.overkiz.errors import BadCredentialsError, GatewayError, SetupNotFoundError
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
from kelvin.overkiz.sample import ROOM_TYPE, sample_house
from kelvin.overkiz.servers import DEFAULT_SERVER
from kelvin.setup.client import (
    check_allowed,
    device_path,
    label_path,
    place_path,
    relocate_path,
    subplaces_path,
)

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
    # Plan 12 kinds (simulator only; the real behaviour is unverified, docs/overkiz-notes.md).
    "setHeatingLevel": lambda p: [
        ("io:TargetHeatingLevelState", p[0]),
        ("core:OnOffState", "off" if p[0] == "off" else "on"),
    ],
    "setTowelDryerOperatingMode": lambda p: [("core:OperatingModeState", p[0])],
    "setTowelDryerTemporaryState": lambda p: [("io:TowelDryerTemporaryStateState", p[0])],
}

QUIRK_COMMANDS = frozenset({"setComfortTemperature", "setEcoTemperature"})

DEMO_EMAIL = "demo@kelvin.local"
DEMO_PASSWORD = "kelvin"

SETUP_OPS = ("create_place", "update_place", "delete_place", "relocate_device", "rename_device")
# Cozytouch applies a setup write and announces it 1–3 s later (spec §2.7); fixed for tests.
SETUP_DELAY_S = 2.0


def setup_failures(value: str) -> dict[str, Exception]:
    """KELVIN_FAKE_SETUP_FAIL: setup operations the simulator always refuses."""
    out: dict[str, Exception] = {}
    for op in split_list(value):
        if op not in SETUP_OPS:
            raise ValueError(f"unknown setup operation: {op}")
        out[op] = GatewayError("simulated setup failure")
    return out


def _walk(p: RawPlace, parent: str | None = None):
    yield parent, p
    for c in p.children:
        yield from _walk(c, p.oid)


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
        server: str = DEFAULT_SERVER,
    ) -> None:
        if root is None:
            root, devices = sample_house()
        # The place tree, mutable (spec §2.7): oid -> label, type, parent, metadata, tree order.
        self.places: dict[str, dict[str, Any]] = {
            p.oid: {"label": p.label, "type": p.type, "parent": parent, "metadata": None}
            for parent, p in _walk(root)
        }
        self.root_oid = root.oid
        self.setup_delay = SETUP_DELAY_S
        self.place_event_payload = False  # like pyoverkiz 2.2.2: place events carry no payload
        self.silent_setup = False  # no setup events at all (confirmation by re-read only)
        self.fail_setup: dict[str, Exception] = {}  # operation -> raised on every call
        self.refuse_relocate: dict[str, Exception] = {}  # device URL -> raised by relocate
        self.setup_writes: list[tuple[Any, ...]] = []
        self.place_reads = 0
        self.device_reads = 0
        self._setup_due: list[tuple[float, Callable[[], None]]] = []
        self.devices = {d.device_url: d for d in copy.deepcopy(devices or [])}
        self.clock = clock
        self.delay = delay
        self.quirk = quirk_override_mode
        self.server = server
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
        self.fail_snapshot: Exception | None = None
        self.fail_quotas: Exception | None = None
        self.broken_devices: set[str] = set()  # their state reads always fail
        self.silent = False
        self.unresponsive = False
        # Tests: what the radiator stores of a setTimeProgram payload (None: the payload as sent).
        self.program_rewrite: Callable[[Any], Any] | None = None
        self.snapshots = 0  # full setup reads served (quota guard tests)
        self.state_reads = 0  # per-device state reads served
        self.quota_reads = 0
        self.failed_state_reads = 0
        self._scheduled: list[tuple[float, str, list[DeviceCommand]]] = []
        self._events: list[Event] = []
        # States the simulator changes by itself once a clock reaches a time (the demo outage).
        self._timed: list[tuple[float, Callable[[], float], str, str, Any]] = []
        # Simulator only: wall time a demo status began, before Kelvin started.
        self.sim_status_since: dict[str, float] = {}

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

    @property
    def root(self) -> RawPlace:
        """The current place tree, as `GET /setup/places` answers it."""

        def build(oid: str) -> RawPlace:
            p = self.places[oid]
            kids = tuple(build(c) for c, q in self.places.items() if q["parent"] == oid)
            return RawPlace(oid, p["label"], kids, p["type"])

        return build(self.root_oid)

    # --- setup (spec §2.7): the same allowlist as the real client, applied 2 s later ---

    def _later(self, apply: Callable[[], None]) -> None:
        self._setup_due.append((self.clock() + self.setup_delay, apply))

    def _apply_due_setup(self) -> None:
        now = self.clock()
        due = [s for s in self._setup_due if s[0] <= now]
        self._setup_due = [s for s in self._setup_due if s[0] > now]
        for _, apply in due:
            apply()

    def _emit_setup(self, ev: Event) -> None:
        if not self.silent_setup:
            self._events.append(ev)

    def _place_event(self, kind: PlaceKind, oid: str, label: str | None = None) -> None:
        self._emit_setup(
            PlaceEvent(kind, oid, label) if self.place_event_payload else PlaceEvent(kind)
        )

    def _check(self, op: str, method: str, path: str) -> None:
        check_allowed(method, path)
        self._apply_due_setup()
        exc = self.fail_setup.get(op)
        if exc is not None:
            raise exc

    def _children(self, oid: str) -> tuple[str, ...]:
        return tuple(c for c, q in self.places.items() if q["parent"] == oid)

    async def read_place(self, oid: str) -> SetupPlace:
        check_allowed("GET", place_path(oid))
        self._apply_due_setup()
        self.place_reads += 1
        p = self.places.get(oid)
        if p is None:
            raise SetupNotFoundError("place not found")
        return SetupPlace(oid, p["label"], p["type"], p["metadata"], self._children(oid))

    async def read_device(self, device_url: str) -> SetupDevice:
        check_allowed("GET", device_path(device_url))
        self._apply_due_setup()
        self.device_reads += 1
        d = self.devices.get(device_url)
        if d is None:
            raise SetupNotFoundError("device not found")
        return SetupDevice(device_url, d.label, d.place_oid)

    async def create_place(self, parent_oid: str, label: str, type_: int) -> str:
        self._check("create_place", "POST", subplaces_path(parent_oid))
        if parent_oid not in self.places:
            raise SetupNotFoundError("parent not found")
        oid = f"p-{uuid4().hex[:8]}"
        self.setup_writes.append(("create_place", parent_oid, label, type_))

        def apply() -> None:
            self.places[oid] = {
                "label": label,
                "type": type_,
                "parent": parent_oid,
                "metadata": None,
            }
            self._place_event("created", oid, label)

        self._later(apply)
        return oid

    async def update_place(self, oid: str, label: str, type_: int | None, metadata: Any) -> None:
        self._check("update_place", "PUT", place_path(oid))
        if oid not in self.places:
            raise SetupNotFoundError("place not found")
        self.setup_writes.append(("update_place", oid, label, type_))

        def apply() -> None:
            if oid in self.places:
                self.places[oid].update(label=label, type=type_, metadata=metadata)
                self._place_event("updated", oid, label)

        self._later(apply)

    async def delete_place(self, oid: str) -> None:
        self._check("delete_place", "DELETE", place_path(oid))
        if oid not in self.places:
            raise SetupNotFoundError("place not found")
        if (
            oid == self.root_oid
            or self._children(oid)
            or any(d.place_oid == oid for d in self.devices.values())
        ):
            # What Overkiz does here is undocumented; Kelvin never sends it (delete guard).
            raise GatewayError("place not empty")
        self.setup_writes.append(("delete_place", oid))

        def apply() -> None:
            if self.places.pop(oid, None) is not None:
                self._place_event("deleted", oid)

        self._later(apply)

    async def relocate_device(self, device_url: str, place_oid: str) -> None:
        self._check("relocate_device", "PUT", relocate_path(device_url, place_oid))
        if device_url not in self.devices or place_oid not in self.places:
            raise SetupNotFoundError("device or place not found")
        exc = self.refuse_relocate.get(device_url)
        if exc is not None:
            raise exc
        self.setup_writes.append(("relocate_device", device_url, place_oid))

        def apply() -> None:
            d = self.devices.get(device_url)
            if d is None:  # removed meanwhile
                return
            d.place_oid = place_oid
            self._emit_setup(DeviceUpdate(device_url, place_oid, d.label))

        self._later(apply)

    async def rename_device(self, device_url: str, label: str) -> None:
        self._check("rename_device", "PUT", label_path(device_url, label))
        if device_url not in self.devices:
            raise SetupNotFoundError("device not found")
        self.setup_writes.append(("rename_device", device_url, label))

        def apply() -> None:
            d = self.devices.get(device_url)
            if d is None:  # removed meanwhile
                return
            d.label = label
            self._emit_setup(DeviceUpdate(device_url, d.place_oid, label))

        self._later(apply)

    # --- changes made in the Cozytouch app (applied at once, as the listener reports them) ---

    def outside_move(self, device_url: str, place_oid: str) -> None:
        d = self.devices[device_url]
        d.place_oid = place_oid
        self._emit_setup(DeviceUpdate(device_url, place_oid, d.label))

    def outside_rename_place(self, oid: str, label: str) -> None:
        self.places[oid]["label"] = label
        self._place_event("updated", oid, label)

    def outside_create_place(self, label: str, type_: int | None = ROOM_TYPE) -> str:
        oid = f"p-{uuid4().hex[:8]}"
        self.places[oid] = {
            "label": label,
            "type": type_,
            "parent": self.root_oid,
            "metadata": None,
        }
        self._place_event("created", oid, label)
        return oid

    def outside_delete_place(self, oid: str) -> None:
        del self.places[oid]
        self._place_event("deleted", oid)

    async def snapshot(self) -> tuple[RawPlace, list[RawDevice]]:
        self.snapshots += 1  # counts attempts: a refused call may still count upstream
        self._apply_due_setup()
        if self.fail_snapshot is not None:
            raise self.fail_snapshot
        return self.root, copy.deepcopy(list(self.devices.values()))

    async def device_states(self, device_url: str) -> dict[str, Any]:
        if self.fail_states is not None:
            raise self.fail_states
        if device_url in self.broken_devices:
            self.failed_state_reads += 1
            raise GatewayError("device unavailable")
        self.state_reads += 1
        return copy.deepcopy(self.devices[device_url].states)

    async def quotas(self) -> Any:
        self.quota_reads += 1
        if self.fail_quotas is not None:
            raise self.fail_quotas
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
        self._apply_due_setup()
        now = self.clock()
        timed = [t for t in self._timed if t[0] <= t[1]()]
        self._timed = [t for t in self._timed if t not in timed]
        for _, _, url, name, value in timed:
            self._set(url, name, value, emit=True)
        due = [s for s in self._scheduled if s[0] <= now]
        self._scheduled = [s for s in self._scheduled if s[0] > now]
        for _, exec_id, commands in due:
            if self.unresponsive:
                self._events.append(ExecUpdate(exec_id, "FAILED", "ACTUATORNOANSWER"))
                continue
            quirk_hit = offline_hit = False
            for c in commands:
                if self.devices[c.device_url].states.get("core:StatusState") == "unavailable":
                    # An unreachable device takes nothing; the others in the same execution do,
                    # and the execution reports FAILED (docs/overkiz-notes.md, 2026-10-18).
                    offline_hit = True
                    continue
                for name, value in EFFECTS.get(c.name, lambda p: [])(c.parameters):
                    if c.name == "setTimeProgram" and self.program_rewrite is not None:
                        value = self.program_rewrite(value)
                    self._set(c.device_url, name, value, emit=True)
                quirk_hit |= self.quirk and c.name in QUIRK_COMMANDS
            if offline_hit:
                self._events.append(ExecUpdate(exec_id, "FAILED", "ACTUATORNOANSWER"))
            elif quirk_hit:
                self._events.append(ExecUpdate(exec_id, "FAILED", "OVERRIDEMODE_ERROR"))
            else:
                self._events.append(ExecUpdate(exec_id, "COMPLETED", None))
        out, self._events = self._events, []
        return out

    def push_state(self, device_url: str, name: str, value: Any) -> None:
        self._set(device_url, name, value, emit=True)

    def set_state_silently(self, device_url: str, name: str, value: Any) -> None:
        self._set(device_url, name, value, emit=False)

    def schedule_state(
        self,
        after_s: float,
        device_url: str,
        name: str,
        value: Any,
        *,
        clock: Callable[[], float] | None = None,
    ) -> None:
        """The device reports `name = value` by itself, `after_s` seconds from now on `clock`
        (the fake's own clock by default)."""
        clock = clock or self.clock
        self._timed.append((clock() + after_s, clock, device_url, name, value))

    def demo_outage(
        self, rid: str, *, before_s: float, after_s: float, wall: Callable[[], float]
    ) -> None:
        """Simulator scenario (spec §10.2): this radiator's heater has been unreachable since
        `before_s` before now and comes back `after_s` from now, both on the runtime's `wall`."""
        url = next(u for u in self.devices if u.endswith(f"/{rid}#1"))
        self._set(url, "core:StatusState", "unavailable", emit=False)
        self.sim_status_since[url] = wall() - before_s
        self.schedule_state(after_s, url, "core:StatusState", "available", clock=wall)

    def _set(self, device_url: str, name: str, value: Any, *, emit: bool) -> None:
        dev = self.devices[device_url]
        if dev.states.get(name) == value:
            return
        dev.states[name] = value
        if emit:
            self._events.append(StateChange(device_url, name, value))
