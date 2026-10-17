"""Rooms and devices API (spec §6, §9.4) on the simulator."""

import json

import pytest
from asgi_lifespan import LifespanManager
from httpx import ASGITransport, AsyncClient

from kelvin.account import Account, AccountStore
from kelvin.api.app import create_app
from kelvin.api.context import boot, open_context
from kelvin.config import Settings
from kelvin.overkiz.budget import FULL_READS_PER_DAY
from kelvin.overkiz.fake import DEMO_EMAIL, DEMO_PASSWORD, FakeGateway, setup_failures
from kelvin.overkiz.sample import SAMPLE_GATEWAY
from tests.conftest import ManualClock, err, login


@pytest.fixture
async def ctx(tmp_path):
    clock = ManualClock()
    gw = FakeGateway(clock=clock)
    app = create_app(
        Settings(_env_file=None, kelvin_data=tmp_path, kelvin_fake=True), gw, start_tasks=False
    )
    async with LifespanManager(app):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://t", headers={"X-Kelvin": "1"}
        ) as c:
            await login(c)
            yield c, app.state.ctx.rt, clock


async def settle(rt, clock):
    """Cozytouch applies the write 2 s later; one poll delivers the event and confirms it."""
    clock.advance(2)
    await rt.pump.run_once()


def salon_id(rt):
    return next(r.id for r in rt.house.rooms.values() if r.name == "Salon")


async def test_setup_devices_is_read_from_memory(ctx):
    c, rt, _ = ctx
    gw = rt.gateway
    before = (gw.snapshots, gw.place_reads, gw.device_reads)
    r = await c.get("/api/setup/devices")
    body = r.json()
    assert [x["name"] for x in body["rooms"]] == ["Maison", "Chambre 1", "Salon", "Chambre 2"]
    assert len(body["radiators"]) == 4 and len(body["bridges"]) == 3
    assert (body["sync"]["used"], body["sync"]["limit"]) == (1, 3)
    assert (gw.snapshots, gw.place_reads, gw.device_reads) == before
    assert "io://" not in r.text and "internal://" not in r.text


async def test_create_rename_and_delete_a_room(ctx):
    c, rt, clock = ctx
    r = await c.post("/api/setup/rooms", json={"label": "Bureau"})
    assert r.status_code == 202
    p = r.json()["pending"]
    assert (p["kind"], p["status"], p["label_code"]) == ("setup", "pending", "setup_room_create")
    oid = p["room_id"]
    assert [x["status"] for x in (await c.get("/api/house")).json()["pending"]] == ["pending"]
    await settle(rt, clock)
    rooms = {x["id"]: x for x in (await c.get("/api/setup/devices")).json()["rooms"]}
    assert (rooms[oid]["name"], rooms[oid]["block"]) == ("Bureau", None)
    assert (await c.patch(f"/api/setup/rooms/{oid}", json={"label": "Bureau 2"})).status_code == 202
    await settle(rt, clock)
    assert (await c.delete(f"/api/setup/rooms/{oid}")).status_code == 202
    await settle(rt, clock)
    rooms = {x["id"] for x in (await c.get("/api/setup/devices")).json()["rooms"]}
    assert oid not in rooms


async def test_labels_are_checked_by_the_route(ctx):
    c, _, _ = ctx
    r = await c.post("/api/setup/rooms", json={"label": "salon"})
    assert r.status_code == 409 and r.json() == err("room_label_taken", label="salon")
    r = await c.post("/api/setup/rooms", json={"label": "x" * 33})
    assert r.status_code == 422 and r.json()["code"] == "room_label_invalid"
    r = await c.post("/api/setup/rooms", json={"label": "x" * 201})
    assert r.status_code == 422 and r.json()["code"] == "invalid_request"


async def test_delete_room_route(ctx):
    c, rt, _ = ctx
    r = await c.delete(f"/api/setup/rooms/{salon_id(rt)}")
    assert r.status_code == 409 and r.json() == err("room_not_empty", count=12)
    r = await c.delete("/api/setup/rooms/p-house")
    assert r.status_code == 409 and r.json()["code"] == "room_protected"
    r = await c.delete("/api/setup/rooms/nope")
    assert r.status_code == 404 and r.json()["code"] == "room_unknown"
    assert rt.gateway.setup_writes == []


async def test_move_a_radiator_and_the_room_views_follow(ctx):
    c, rt, clock = ctx
    r = await c.post("/api/radiators/9000011/move", json={"room_id": salon_id(rt)})
    assert r.status_code == 202 and r.json()["pending"]["radiator_ids"] == ["9000011"]
    await settle(rt, clock)
    rooms = (await c.get("/api/house")).json()["house"]["rooms"]
    assert [x["name"] for x in rooms] == ["Salon", "Chambre 2"]
    assert "9000011" in next(x for x in rooms if x["name"] == "Salon")["radiator_ids"]
    # Every room view resolves radiator → room at query time (ruling 5).
    assert rt.house.radiators["9000011"].room_id == salon_id(rt)
    r = await c.post("/api/radiators/9000011/move", json={"room_id": salon_id(rt)})
    assert r.status_code == 409 and r.json()["code"] == "radiator_in_room"


async def test_rename_through_features_is_a_setup_write(ctx):
    c, rt, clock = ctx
    r = await c.patch("/api/radiators/9500003/features", json={"name": "Radiateur fenêtre"})
    assert r.status_code == 202 and r.json()["pending"]["label_code"] == "setup_rename_device"
    await settle(rt, clock)
    assert rt.gateway.executed == []  # no setName
    radiators = (await c.get("/api/house")).json()["house"]["radiators"]
    assert next(x for x in radiators if x["id"] == "9500003")["name"] == "Radiateur fenêtre"
    r = await c.patch(
        "/api/radiators/9500003/features", json={"name": "Salon", "window_detection": False}
    )
    assert r.status_code == 422 and r.json() == err("rename_alone")
    r = await c.patch("/api/radiators/9500003/features", json={"window_detection": False})
    assert r.status_code == 202 and r.json()["pending"].get("kind") != "setup"


async def test_tidy_route(ctx):
    c, rt, clock = ctx
    rt.gateway.outside_move(f"{SAMPLE_GATEWAY}/9000011#3", salon_id(rt))
    await settle(rt, clock)
    r = await c.post("/api/setup/devices/9000011%233/tidy")
    assert r.status_code == 202 and r.json()["pending"]["label_code"] == "setup_tidy"
    for bad in ("9000011", "x" * 80, "bridge-x", "bridge-1"):
        r = await c.post(f"/api/setup/devices/{bad}/tidy")
        assert r.status_code == 404 and r.json()["code"] == "device_unknown"


async def test_sync_route_answers_429_with_next_at_when_spent(ctx):
    c, rt, _ = ctx
    r = await c.post("/api/setup/sync")
    assert r.status_code == 202 and r.json()["sync"]["requested"] is True
    await rt.pump.run_once()
    assert rt.gateway.snapshots == 2  # the startup read and this one
    rt.pump.guard.record()  # an outage resync spent the last one
    r = await c.post("/api/setup/sync")
    body = r.json()
    assert r.status_code == 429 and body["code"] == "setup_sync_spent"
    assert (body["params"]["used"], body["params"]["limit"]) == (3, 3)
    assert body["params"]["next_at"] == rt.refresher.view()["next_possible_at"]


async def test_mutations_need_the_kelvin_header(ctx):
    c, _, _ = ctx
    r = await c.post("/api/setup/rooms", json={"label": "Bureau"}, headers={"X-Kelvin": ""})
    assert r.status_code == 403 and r.json()["code"] == "header_missing"
    r = await c.post("/api/setup/sync", headers={"X-Kelvin": ""})
    assert r.status_code == 403


async def test_a_confirmed_change_publishes_layout_and_the_pending(ctx):
    c, rt, clock = ctx
    q = rt.broadcaster.subscribe()
    await c.post("/api/setup/rooms", json={"label": "Bureau"})
    await settle(rt, clock)
    msgs = []
    while not q.empty():
        msgs.append(q.get_nowait())
    layouts = [json.loads(m["data"]) for m in msgs if m["event"] == "layout"]
    assert layouts and {"house", "setup"} <= set(layouts[-1])
    assert any(x["name"] == "Bureau" for x in layouts[-1]["setup"]["rooms"])
    assert "sync" in layouts[-1]["setup"]
    statuses = [json.loads(m["data"])["status"] for m in msgs if m["event"] == "pending"]
    assert statuses == ["sending", "pending", "confirmed"]


async def test_setup_writes_are_logged_with_labels_not_ids(ctx):
    c, rt, clock = ctx
    await c.post("/api/setup/rooms", json={"label": "Bureau"})
    await settle(rt, clock)
    row = rt.db.conn.execute(
        "SELECT label, radiator_ids, commands, status FROM command_log ORDER BY ts DESC LIMIT 1"
    ).fetchone()
    assert row["label"] == "Nouvelle pièce « Bureau »" and row["status"] == "confirmed"
    assert json.loads(row["radiator_ids"]) == []
    assert json.loads(row["commands"]) == [{"setup": "create_room", "steps": 1}]


async def test_a_start_from_the_stored_setup_claims_no_full_read(tmp_path):
    """Review T7-1: the sync line never claims a read that did not happen."""
    clock = ManualClock(0.0)
    AccountStore(tmp_path).save(Account(DEMO_EMAIL, DEMO_PASSWORD))
    settings = Settings(_env_file=None, kelvin_data=tmp_path, kelvin_fake=True)
    ctx = open_context(settings, FakeGateway(clock=clock), start_tasks=False, wall=clock)
    try:
        await boot(ctx)
        assert ctx.rt.refresher.view()["last_full_at"] == 0.0  # the startup read
        for _ in range(FULL_READS_PER_DAY - 1):
            ctx.setup_reads.record()
    finally:
        await ctx.close()
    clock.advance(3600)
    gw = FakeGateway(clock=clock)
    ctx = open_context(settings, gw, start_tasks=False, wall=clock)
    try:
        await boot(ctx)
        view = ctx.rt.refresher.view()
        assert gw.snapshots == 0
        assert view["last_full_at"] is None and view["stale_since"] == clock.t
    finally:
        await ctx.close()


async def test_features_name_is_bounded(ctx):
    c, _, _ = ctx
    r = await c.patch("/api/radiators/9500003/features", json={"name": "x" * 201})
    assert r.status_code == 422 and r.json()["code"] == "invalid_request"


async def test_the_reserved_answer_says_the_day_when_the_next_sync_is_not_today(ctx):
    c, rt, clock = ctx
    rt.gateway.fail_setup = setup_failures("create_place")
    await c.post("/api/setup/rooms", json={"label": "Bureau"})
    rt.gateway.fail_setup = {}
    for _ in range(2):
        rt.pump.guard.record()  # only the restart's read is left: the next sync is in 24 h
    r = await c.post("/api/setup/rooms", json={"label": "Bureau"})
    assert r.status_code == 409 and r.json()["code"] == "room_label_reserved"
    params = r.json()["params"]
    assert params["at"] and params["day"]  # tomorrow: « le 15/10 à … »


async def test_the_runtime_house_follows_the_injected_clock(tmp_path):
    """Final review I3: « Dernier signal » uses the same clock as the rest of the runtime."""
    clock = ManualClock(5_000.0)
    app = create_app(
        Settings(_env_file=None, kelvin_data=tmp_path, kelvin_fake=True),
        FakeGateway(clock=clock),
        start_tasks=False,
        wall=clock,
    )
    async with LifespanManager(app):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://t", headers={"X-Kelvin": "1"}
        ) as c:
            await login(c)
            assert app.state.ctx.rt.house.wall() == 5_000.0
