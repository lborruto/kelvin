"""Commands across kinds through the API (Plan 12), on the Atlantic and Thermor simulator houses."""

from dataclasses import replace
from datetime import UTC, datetime, timedelta

import pytest
from asgi_lifespan import LifespanManager
from httpx import ASGITransport, AsyncClient

from kelvin.api.app import create_app
from kelvin.config import Settings
from kelvin.overkiz.fake import FakeGateway
from kelvin.overkiz.houses import ATLANTIC_GATEWAY, HOUSES, THERMOR_GATEWAY
from tests.conftest import ManualClock


@pytest.fixture
def client_for(tmp_path):
    async def open_(name: str, server: str, move: dict[str, str] | None = None):
        root, devices = HOUSES[name]()
        if move:  # put a radiator's devices in another place (a mixed room for the test)
            devices = [
                replace(d, place_oid=move.get(d.device_url.split("#")[0], d.place_oid))
                for d in devices
            ]
        clock = ManualClock()
        gw = FakeGateway(root, devices, clock=clock, server=server)
        app = create_app(
            Settings(_env_file=None, kelvin_data=tmp_path, kelvin_fake=True), gw, start_tasks=False
        )
        manager = LifespanManager(app)
        await manager.__aenter__()
        c = AsyncClient(
            transport=ASGITransport(app=app), base_url="http://t", headers={"X-Kelvin": "1"}
        )
        r = await c.post(
            "/api/auth/login",
            json={"email": "demo@kelvin.local", "password": "kelvin", "server": server},
        )
        assert r.status_code == 200, r.text
        return manager, c, app.state.ctx.rt, gw, clock

    return open_


async def _settle(rt, clock):
    clock.advance(2)
    await rt.pump.run_once()


def _sent(gw, since: int):
    return [
        (c.device_url.split("/")[-1], c.name, c.parameters) for b in gw.executed[since:] for c in b
    ]


async def _close(manager, c):
    await c.aclose()
    await manager.__aexit__(None, None, None)


async def test_level_and_dryer_routes(client_for):
    manager, c, rt, gw, clock = await client_for("thermor", "thermor_cozytouch")
    try:
        r = await c.post("/api/radiators/31000001/level", json={"level": "comfort-1"})
        assert r.status_code == 202 and r.json()["pending"]["label_code"] == "level"
        r = await c.post("/api/radiators/31000003/dryer", json={"action": "boost"})
        assert r.status_code == 202 and r.json()["pending"]["label_code"] == "dryer"
        await _settle(rt, clock)
        assert rt.house.radiators["31000001"].heating_level == "comfort-1"
        assert rt.house.radiators["31000003"].dryer == "boost"
        bad = [
            ("/api/radiators/31000003/level", {"level": "eco"}, "unsupported_command"),
            ("/api/radiators/31000003/dryer", {"action": "drying"}, "unsupported_command"),
            ("/api/radiators/31000004/level", {"level": "eco"}, "read_only_device"),
            ("/api/radiators/31000004/mode", {"mode": "off"}, "read_only_device"),
            ("/api/radiators/31000001/level", {"level": "turbo"}, "invalid_request"),
        ]
        for path, body, code in bad:
            r = await c.post(path, json=body)
            assert (r.status_code, r.json()["code"]) == (422, code), path
    finally:
        await _close(manager, c)


async def test_room_and_house_commands_skip_radiators_that_cannot(client_for):
    # Séjour holds the adjustable-setpoint radiator and, moved there, the towel dryer.
    manager, c, rt, gw, clock = await client_for(
        "atlantic", "atlantic_cozytouch", move={f"{ATLANTIC_GATEWAY}/21000003": "p-sejour"}
    )
    try:
        assert rt.house.rooms["p-sejour"].radiator_ids == ["21000001", "21000003"]
        n = len(gw.executed)
        r = await c.post("/api/rooms/p-sejour/mode", json={"mode": "manual"})
        assert r.status_code == 202
        assert _sent(gw, n) == [
            ("21000001#1", "setOperatingMode", ("basic",)),
            ("21000003#1", "setTowelDryerOperatingMode", ("external",)),
        ]
        await _settle(rt, clock)
        n = len(gw.executed)
        r = await c.post("/api/rooms/p-sejour/setpoint", json={"kind": "comfort", "value": 19.0})
        assert r.status_code == 202
        assert _sent(gw, n) == [("21000001#1", "setComfortTemperature", (19.0,))]
        await _settle(rt, clock)
        n = len(gw.executed)
        r = await c.put(
            "/api/rooms/p-sejour/program", json={"monday": [{"start": "06:00", "end": "08:00"}]}
        )
        assert r.status_code == 202 and {x[0] for x in _sent(gw, n)} == {"21000001#1"}
        await _settle(rt, clock)
        n = len(gw.executed)
        r = await c.post(
            "/api/rooms/p-sejour/boost", json={"temperature": 22.0, "duration_min": 60}
        )
        assert r.status_code == 202
        assert {x[0] for x in _sent(gw, n)} == {"21000001#1", "21000003#1"}
        r = await c.post("/api/rooms/p-bureau/mode", json={"mode": "manual"})  # pilot-wire only
        assert (r.status_code, r.json()["code"]) == (422, "unsupported_in_room")
        r = await c.post(
            "/api/rooms/p-bureau/boost", json={"temperature": 22.0, "duration_min": 60}
        )
        assert (r.status_code, r.json()["code"]) == (422, "unsupported_in_room")
    finally:
        await _close(manager, c)


async def test_house_commands_across_kinds(client_for):
    manager, c, rt, gw, clock = await client_for("thermor", "thermor_cozytouch")
    try:
        n = len(gw.executed)
        assert (await c.post("/api/house/off")).status_code == 202
        assert _sent(gw, n) == [
            ("31000001#1", "setHeatingLevel", ("off",)),
            ("31000002#1", "setHeatingLevel", ("off",)),
            ("31000003#1", "setTowelDryerOperatingMode", ("standby",)),
        ]  # nothing to the read-only heat-pump zone 31000004
        await _settle(rt, clock)
        n = len(gw.executed)
        assert (await c.post("/api/house/program")).status_code == 202
        assert _sent(gw, n) == [("31000003#1", "setTowelDryerOperatingMode", ("internal",))]
        await _settle(rt, clock)
        n = len(gw.executed)
        until = (datetime.now(UTC) + timedelta(hours=3)).isoformat()
        r = await c.post("/api/house/away", json={"temperature": 12.0, "until": until})
        assert r.status_code == 202, r.text
        assert _sent(gw, n) == [
            ("31000003#1", "setTowelDryerOperatingMode", ("external",)),
            ("31000003#1", "setTargetTemperature", (12.0,)),
        ]
        assert rt.overrides.active()[0]["radiator_ids"] == ["31000003"]
    finally:
        await _close(manager, c)


def test_thermor_house_ids_are_stable():
    root, devices = HOUSES["thermor"]()
    assert all(d.device_url.startswith(THERMOR_GATEWAY) for d in devices)


async def test_room_off_reaches_pilot_wire_heaters(client_for):
    manager, c, rt, gw, clock = await client_for("atlantic", "atlantic_cozytouch")
    try:  # a pilot-wire-only room can be switched off
        n = len(gw.executed)
        r = await c.post("/api/rooms/p-bureau/mode", json={"mode": "off"})
        assert r.status_code == 202, r.text
        assert _sent(gw, n) == [("21000002#1", "setHeatingLevel", ("off",))]
    finally:
        await _close(manager, c)


async def test_mixed_room_off_turns_every_heater_off(client_for):
    manager, c, rt, gw, clock = await client_for(
        "atlantic", "atlantic_cozytouch", move={f"{ATLANTIC_GATEWAY}/21000002": "p-sejour"}
    )
    try:
        n = len(gw.executed)
        r = await c.post("/api/rooms/p-sejour/mode", json={"mode": "off"})
        assert r.status_code == 202, r.text
        sent = _sent(gw, n)
        assert ("21000002#1", "setHeatingLevel", ("off",)) in sent
        assert {x[0] for x in sent} == {"21000001#1", "21000002#1"}
    finally:
        await _close(manager, c)


async def test_a_rename_is_a_label_write_where_the_setup_is_writable(client_for):
    """Plan 8b made the rename a Cozytouch label write: any radiator Kelvin drives takes one on a
    Cozytouch server (setName or not); a read-only device does not."""
    manager, c, rt, gw, clock = await client_for("thermor", "thermor_cozytouch")
    try:
        assert rt.house.radiators["31000001"].capabilities.rename
        r = await c.patch("/api/radiators/31000001/features", json={"name": "Bureau"})
        assert r.status_code == 202, r.text
        r = await c.patch("/api/radiators/31000004/features", json={"name": "Bureau"})
        assert (r.status_code, r.json()["code"]) == (422, "read_only_device")
    finally:
        await _close(manager, c)


async def test_an_experimental_server_never_writes_the_setup(client_for):
    manager, c, rt, gw, clock = await client_for("experimental", "somfy_europe")
    try:
        r = await c.patch("/api/radiators/41000001/features", json={"name": "Bureau"})
        assert (r.status_code, r.json()["code"]) == (403, "setup_experimental")
        r = await c.post("/api/setup/rooms", json={"label": "Bureau"})
        assert (r.status_code, r.json()["code"]) == (403, "setup_experimental")
    finally:
        await _close(manager, c)
