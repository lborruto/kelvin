import asyncio
import time
from datetime import UTC, datetime, timedelta

import pytest
from asgi_lifespan import LifespanManager
from httpx import ASGITransport, AsyncClient

from kelvin.api.app import create_app
from kelvin.api.runtime import override_step
from kelvin.api.sse import event_stream
from kelvin.config import Settings
from kelvin.overkiz.fake import FakeGateway
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
    clock.advance(2)
    await rt.pump.run_once()


def salon_id(rt):
    return next(r.id for r in rt.house.rooms.values() if r.name == "Salon")


async def test_health_and_house(ctx):
    c, rt, _ = ctx
    assert (await c.get("/api/health")).json()["status"] == "ok"
    body = (await c.get("/api/house")).json()
    assert [r["name"] for r in body["house"]["rooms"]] == ["Chambre 1", "Salon", "Chambre 2"]
    assert body["pending"] == [] and body["overrides"] == []
    assert body["status"]["connected"] is True


async def test_room_mode_roundtrip(ctx):
    c, rt, clock = ctx
    r = await c.post(f"/api/rooms/{salon_id(rt)}/mode", json={"mode": "manual"})
    assert r.status_code == 202 and r.json()["pending"]["status"] == "pending"
    await settle(rt, clock)
    room = next(
        x for x in (await c.get("/api/house")).json()["house"]["rooms"] if x["name"] == "Salon"
    )
    assert room["mode"] == "manual"


async def test_radiator_setpoint_validation_is_french(ctx):
    c, _, _ = ctx
    r = await c.post("/api/radiators/9312063/setpoint", json={"kind": "manual", "value": 21.3})
    assert r.status_code == 422 and "0,5 °C" in r.json()["detail"]


async def test_unknown_ids_404(ctx):
    c, _, _ = ctx
    assert (await c.post("/api/rooms/nope/mode", json={"mode": "off"})).status_code == 404
    assert (await c.post("/api/radiators/nope/identify")).status_code == 404


async def test_program_features_light_identify(ctx):
    c, rt, clock = ctx
    prog = {"monday": [{"start": "06:00", "end": "08:00"}]}
    assert (await c.put("/api/radiators/9312063/program", json=prog)).status_code == 202
    assert (
        await c.patch("/api/radiators/9312063/features", json={"window_detection": False})
    ).status_code == 202
    assert (await c.patch("/api/radiators/9312063/features", json={})).status_code == 422
    assert (await c.post("/api/radiators/9312063/light", json={"on": True})).status_code == 202
    assert (await c.post("/api/radiators/9312063/identify")).status_code == 202
    await settle(rt, clock)
    r = rt.house.radiators["9312063"]
    assert r.program["monday"] == [{"start": "06:00", "end": "08:00"}]
    assert r.window_detection is False and r.light_on is True


async def test_boost_and_cancel(ctx):
    c, rt, clock = ctx
    r = await c.post(
        f"/api/rooms/{salon_id(rt)}/boost", json={"temperature": 21, "duration_min": 60}
    )
    assert r.status_code == 202
    await settle(rt, clock)
    overrides = (await c.get("/api/house")).json()["overrides"]
    assert overrides[0]["kind"] == "boost"
    assert (await c.delete(f"/api/overrides/{overrides[0]['id']}")).status_code == 202
    assert (await c.delete("/api/overrides/nope")).status_code == 404


async def test_away_and_house_off(ctx):
    c, rt, clock = ctx
    until = (datetime.now(UTC) + timedelta(days=2)).isoformat()
    assert (await c.post("/api/house/away", json={"until": until})).status_code == 202
    past = (datetime.now(UTC) - timedelta(days=1)).isoformat()
    assert (await c.post("/api/house/away", json={"until": past})).status_code == 422
    assert (await c.post("/api/house/off")).status_code == 202
    await settle(rt, clock)
    assert all(r.mode == "off" for r in rt.house.radiators.values())


async def test_history(ctx):
    c, rt, _ = ctx
    rt.recorder.sample()
    now = int(time.time())
    r = await c.get(
        "/api/history",
        params={"radiators": "9312063", "start": now - 3600, "end": now + 60, "step": 300},
    )
    assert r.status_code == 200 and r.json()[0]["radiator_id"] == "9312063"
    assert (
        await c.get("/api/history", params={"radiators": "9312063", "step": 10})
    ).status_code == 422


async def test_event_stream_starts_with_snapshot(ctx):
    _, rt, _ = ctx
    gen = event_stream(rt)
    first = await anext(gen)
    assert first["event"] == "snapshot"
    rt.broadcaster.publish("status", {"connected": True})
    second = await anext(gen)
    assert second["event"] == "status"
    await gen.aclose()
    assert rt.broadcaster.subscriber_count == 0


async def test_validation_errors_are_french_strings(ctx):
    c, rt, _ = ctx
    r = await c.post(
        f"/api/rooms/{salon_id(rt)}/boost", json={"temperature": 21, "duration_min": 5}
    )
    assert r.status_code == 422 and isinstance(r.json()["detail"], str)
    assert "invalide" in r.json()["detail"]
    r = await c.get("/api/history", params={"radiators": "9312063", "step": 10})
    assert r.status_code == 422 and "invalide" in r.json()["detail"]


async def test_room_command_is_one_pending_covering_all_radiators(ctx):
    c, rt, _ = ctx
    r = await c.post(f"/api/rooms/{salon_id(rt)}/mode", json={"mode": "off"})
    assert r.status_code == 202
    pend = rt.commands.active()
    assert len(pend) == 1
    urls = {cmd.device_url for cmd in pend[0].planned.commands}
    salon = rt.house.room_radiators(salon_id(rt))
    assert len(salon) == 2 and urls == {x.heater_url for x in salon}


async def test_naive_away_uses_settings_tz(ctx):
    c, _, _ = ctx
    until = (datetime.now() + timedelta(days=2)).replace(microsecond=0).isoformat()
    assert (await c.post("/api/house/away", json={"until": until})).status_code == 202


async def test_program_unknown_day_key_is_rejected(ctx):
    c, rt, clock = ctx
    before = rt.house.radiators["9312063"].program
    r = await c.put(
        "/api/radiators/9312063/program", json={"lundi": [{"start": "06:00", "end": "08:00"}]}
    )
    assert r.status_code == 422 and isinstance(r.json()["detail"], str)
    r = await c.put(
        "/api/radiators/9312063/program",
        json={"monday": [{"start": "06:00", "end": "08:00", "foo": 1}]},
    )
    assert r.status_code == 422
    await settle(rt, clock)
    assert rt.commands.active() == []
    assert rt.house.radiators["9312063"].program == before


async def test_mutating_routes_require_kelvin_header(ctx):
    c, _, _ = ctx
    r = await c.post("/api/house/off", headers={"X-Kelvin": ""})
    assert r.status_code == 403
    assert r.json() == err("header_missing")
    assert r.json()["detail"] == "En-tête X-Kelvin manquant."
    del c.headers["X-Kelvin"]
    assert (await c.post("/api/house/off")).status_code == 403
    assert (await c.delete("/api/overrides/x")).status_code == 403
    assert (await c.patch("/api/radiators/9312063/features", json={})).status_code == 403
    assert (await c.put("/api/radiators/9312063/program", json={})).status_code == 403
    assert (await c.get("/api/house")).status_code == 200
    assert (await c.get("/api/health")).status_code == 200


async def test_override_step_publishes_restore_lifecycle(ctx):
    c, rt, clock = ctx
    r = await c.post(
        f"/api/rooms/{salon_id(rt)}/boost", json={"temperature": 21, "duration_min": 60}
    )
    assert r.status_code == 202
    await settle(rt, clock)
    assert rt.overrides.is_connected() is True
    rt.pump.failures = 1
    assert rt.overrides.is_connected() is False
    rt.pump.failures = 0
    q = rt.broadcaster.subscribe()
    [o] = rt.overrides.active()
    rt.overrides.wall = lambda: o["ends_at"] + 1
    last = await override_step(rt)
    assert last[0]["restoring"] is True
    assert q.get_nowait()["event"] == "pending"
    assert [m["event"] for m in [q.get_nowait() for _ in range(q.qsize())]][-1] == "overrides"
    await settle(rt, clock)
    last = await override_step(rt)
    assert last == []
    events = [q.get_nowait() for _ in range(q.qsize())]
    assert events[-1]["event"] == "overrides" and events[-1]["data"] == "[]"
    rt.broadcaster.unsubscribe(q)


async def test_restore_confirmation_publishes_overrides_without_a_tick(ctx):
    """An override started and cancelled between two override ticks must still leave the UI."""
    c, rt, clock = ctx
    r = await c.post(
        f"/api/rooms/{salon_id(rt)}/boost", json={"temperature": 21, "duration_min": 60}
    )
    assert r.status_code == 202
    [o] = rt.overrides.active()
    assert (await c.delete(f"/api/overrides/{o['id']}")).status_code == 202
    q = rt.broadcaster.subscribe()
    await settle(rt, clock)  # the boost runs, then the restore it was superseded by
    await settle(rt, clock)
    await asyncio.sleep(0)
    assert rt.overrides.active() == []
    events = [q.get_nowait() for _ in range(q.qsize())]
    overrides = [e for e in events if e["event"] == "overrides"]
    assert overrides and overrides[-1]["data"] == "[]"
    rt.broadcaster.unsubscribe(q)


async def test_no_override_sync_after_shutdown(tmp_path):
    gw = FakeGateway(clock=ManualClock())
    app = create_app(
        Settings(_env_file=None, kelvin_data=tmp_path, kelvin_fake=True), gw, start_tasks=False
    )
    async with LifespanManager(app):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://t", headers={"X-Kelvin": "1"}
        ) as c:
            await login(c)
            rt = app.state.ctx.rt
    q = rt.broadcaster.subscribe()
    rt.published_overrides = None  # would publish if still running
    rt.sync_overrides()  # a late call_soon after stop_runtime: must not touch the closed db
    assert q.qsize() == 0


async def test_house_program_puts_every_radiator_back_in_program(ctx):
    c, rt, clock = ctx
    assert (await c.post("/api/house/off")).status_code == 202
    await settle(rt, clock)
    assert all(r.mode == "off" for r in rt.house.radiators.values())
    r = await c.post("/api/house/program")
    assert r.status_code == 202 and r.json()["pending"]["label"] == "Tout en programme"
    await settle(rt, clock)
    assert all(r.mode == "program" for r in rt.house.radiators.values())


async def test_snapshot_carries_recently_settled_commands(ctx):
    c, rt, clock = ctx
    r = await c.post("/api/radiators/9312063/identify")
    assert r.status_code == 202
    pid = r.json()["pending"]["id"]
    await settle(rt, clock)
    snap = (await c.get("/api/house")).json()
    assert pid not in [p["id"] for p in snap["pending"]]
    assert {p["id"]: p["status"] for p in snap["recent"]}[pid] in ("confirmed", "failed")


async def test_startup_makes_one_full_setup_read_and_reports_it(ctx):
    c, rt, _ = ctx
    assert rt.gateway.snapshots == 1
    body = (await c.get("/api/status")).json()
    assert body["overkiz"]["setup_reads_24h"] == 1


async def test_overkiz_quotas_are_read_on_demand_and_cached(ctx):
    c, rt, _ = ctx
    assert rt.gateway.quota_reads == 0  # nothing reads them unless asked
    body = (await c.get("/api/overkiz/quotas")).json()
    assert body["quotas"][0] == {"name": "setup-bulk-load", "remaining": 2, "limit": 3}
    await c.get("/api/overkiz/quotas")
    assert rt.gateway.quota_reads == 1


async def test_overkiz_quotas_unreachable_is_a_french_503(ctx):
    from kelvin.overkiz.errors import QuotaError

    c, rt, _ = ctx
    rt.gateway.fail_quotas = QuotaError("QUOTA_EXCEEDED")
    r = await c.get("/api/overkiz/quotas")
    assert r.status_code == 503
    assert r.json()["detail"] == "Cozytouch injoignable, réessayez plus tard."
    rt.quotas = None
    r = await c.get("/api/overkiz/quotas")
    assert r.status_code == 503
    assert r.json()["detail"] == "Quotas indisponibles."


@pytest.mark.parametrize(
    "params",
    [
        {"start": 0, "end": 3600},  # before 2000
        {"start": 2_000_000_000, "end": 1_999_000_000},  # end before start
        {"start": 1_000_000_000, "end": 1_000_000_000 + 5 * 366 * 86400},  # over 4 years
        {"start": 1_700_000_000, "end": 1_700_000_000 + 300 * 10_001},  # 10 001 points
    ],
)
async def test_history_windows_are_bounded(ctx, params):
    c, _, _ = ctx
    p = {"radiators": "9312063", **params}
    r = await c.get("/api/history", params=p)
    assert r.status_code == 422 and r.json()["detail"] == "Période invalide."


async def test_too_many_or_malformed_radiator_ids_are_refused(ctx):
    c, _, _ = ctx
    now = time.time()
    many = ",".join(f"r{i}" for i in range(51))
    for path in ("/api/history", "/api/energy/radiators"):
        r = await c.get(path, params={"radiators": many, "start": now - 3600, "end": now})
        assert r.status_code == 422 and r.json()["detail"] == "Trop de radiateurs dans la demande."
    r = await c.get(
        "/api/energy/radiators", params={"radiators": "a/b", "start": now - 3600, "end": now}
    )
    assert r.status_code == 422 and r.json()["detail"] == "Radiateur inconnu."


async def test_hourly_radiator_energy_is_capped_at_two_months(ctx):
    c, _, _ = ctx
    now = time.time()
    p = {"start": now - 63 * 86400, "end": now, "group": "hour"}
    assert (await c.get("/api/energy/radiators", params=p)).status_code == 422
    p["group"] = "day"
    assert (await c.get("/api/energy/radiators", params=p)).status_code == 200


async def test_a_history_step_too_large_is_refused_not_a_crash(ctx):
    c, _, _ = ctx
    now = time.time()
    for step in (10**19, 2**63):
        p = {"radiators": "9312063", "start": now - 86400, "end": now, "step": step}
        assert (await c.get("/api/history", params=p)).status_code == 422


async def test_a_failing_energy_snapshot_never_suppresses_the_live_update(ctx, monkeypatch, caplog):
    c, rt, _ = ctx

    def broken(ids=None):
        raise RuntimeError("disk full")

    monkeypatch.setattr(rt.recorder, "snapshot_energy", broken)
    q = rt.broadcaster.subscribe()
    rt.pump.on_changed({"9312063"})
    assert q.get_nowait()["event"] == "house"
    assert "energy snapshot failed" in caplog.text
    rt.broadcaster.unsubscribe(q)


async def test_an_unexpected_quota_failure_is_a_french_503_not_a_500(ctx):
    c, rt, _ = ctx

    async def broken():
        raise ValueError("unexpected payload")

    rt.gateway.quotas = broken
    rt.quotas = type(rt.quotas)(broken)
    r = await c.get("/api/overkiz/quotas")
    assert r.status_code == 503 and r.json()["detail"] == "Quotas indisponibles."


async def test_validation_errors_carry_invalid_request_and_the_field(ctx):
    c, rt, _ = ctx
    r = await c.post(f"/api/rooms/{salon_id(rt)}/mode", json={"mode": "turbo"})
    assert r.status_code == 422
    body = r.json()
    assert (body["code"], body["params"]) == ("invalid_request", {"field": "mode"})
    assert body["detail"].startswith("Requête invalide : mode — ")


async def test_route_errors_answer_with_code_and_params(ctx):
    c, rt, _ = ctx
    r = await c.post("/api/rooms/nope/mode", json={"mode": "off"})
    assert r.status_code == 404 and r.json() == err("room_unknown")
    week = {"monday": [{"start": f"0{i}:00", "end": f"0{i}:30"} for i in range(4)]}
    r = await c.put(f"/api/rooms/{salon_id(rt)}/program", json=week)
    assert r.status_code == 422 and r.json() == err("program_too_many", day="monday")
    assert r.json()["detail"] == "lundi : 3 plages confort au maximum."
    r = await c.delete("/api/overrides/nope")
    assert r.status_code == 404 and r.json() == err("override_not_found")
    rt.quotas = None
    r = await c.get("/api/overkiz/quotas")
    assert r.status_code == 503 and r.json() == err("quotas_unavailable")


async def test_pending_views_carry_label_codes(ctx):
    c, rt, _ = ctx
    r = await c.post(f"/api/rooms/{salon_id(rt)}/mode", json={"mode": "manual"})
    p = r.json()["pending"]
    assert (p["label"], p["label_code"], p["label_params"]) == (
        "Salon : Manuel",
        "mode",
        {"name": "Salon", "mode": "manual"},
    )
    assert p["error_code"] is None and p["reason_code"] is None
    r = await c.post("/api/house/off")
    assert r.json()["pending"]["label_code"] == "all_off"


async def test_malformed_json_names_no_field(ctx):
    c, rt, _ = ctx
    r = await c.post(
        f"/api/rooms/{salon_id(rt)}/mode",
        content="{bad",
        headers={"Content-Type": "application/json"},
    )
    assert r.status_code == 422
    assert (r.json()["code"], r.json()["params"]) == ("invalid_request", {})


async def test_framework_404_and_405_answer_with_codes_without_the_spa(ctx):
    c, _, _ = ctx
    r = await c.get("/api/nope")
    assert r.status_code == 404 and r.json() == err("not_found")
    r = await c.post("/api/status")
    assert r.status_code == 405 and r.json() == err("method_not_allowed")
    assert "GET" in r.headers["allow"]


async def test_the_simulator_starts_with_chambre_2_unreachable(tmp_path):
    from kelvin.api.runtime import make_gateway

    settings = Settings(_env_file=None, kelvin_data=tmp_path, kelvin_fake=True)
    gw = make_gateway(settings, "demo@kelvin.local", "kelvin")
    url = next(u for u in gw.devices if u.endswith("/8370022#1"))
    assert gw.devices[url].states["core:StatusState"] == "unavailable"
    assert time.time() - gw.sim_status_since[url] >= 2700 - 5


async def test_the_demo_outage_ends_on_the_runtime_clock(tmp_path):
    from kelvin.api.runtime import DEMO_OUTAGE_AFTER_S, make_gateway
    from kelvin.overkiz.models import StateChange

    wall = ManualClock(1_760_000_000.0)
    settings = Settings(_env_file=None, kelvin_data=tmp_path, kelvin_fake=True)
    gw = make_gateway(settings, "demo@kelvin.local", "kelvin", wall=wall)
    url = next(u for u in gw.devices if u.endswith("/8370022#1"))
    assert gw.sim_status_since[url] == wall() - 2700
    wall.advance(DEMO_OUTAGE_AFTER_S)
    changes = [e for e in await gw.fetch_events() if isinstance(e, StateChange)]
    assert changes == [StateChange(url, "core:StatusState", "available")]


async def test_house_view_carries_signal_fields(ctx):
    c, _, _ = ctx
    body = (await c.get("/api/house")).json()["house"]
    r = body["radiators"][0]
    assert {"reachable", "unreachable_since", "last_event_at"} <= set(r)
    assert all("presence" in room for room in body["rooms"])


async def test_room_energy_route(ctx):
    c, rt, _ = ctx
    r = await c.get(f"/api/rooms/{salon_id(rt)}/energy", params={"days": 7})
    assert r.status_code == 200, r.text
    body = r.json()
    assert {
        "from",
        "to",
        "days",
        "kwh",
        "hc_kwh",
        "hp_kwh",
        "eur",
        "heating_hours",
        "coverage",
        "priced",
    } <= set(body)
    assert body["days"] == 7 and body["to"] == rt.linky.today().isoformat()
    assert body["kwh"] is not None and body["kwh"] >= 0  # the simulator seeded a week
    assert body["priced"] is True and body["eur"] is not None  # the simulator seeds a tariff
    assert (await c.get(f"/api/rooms/{salon_id(rt)}/energy")).json()["days"] == 1


async def test_room_energy_bounds(ctx):
    c, rt, _ = ctx
    room = salon_id(rt)
    for days in (0, 40, "x"):
        r = await c.get(f"/api/rooms/{room}/energy", params={"days": days})
        assert (r.status_code, r.json()["code"]) == (422, "invalid_request"), days
    r = await c.get("/api/rooms/nope/energy", params={"days": 7})
    assert (r.status_code, r.json()["code"]) == (404, "room_unknown")


async def test_room_activity_route_returns_runs_from_the_seeded_week(ctx):
    c, rt, _ = ctx
    ch1 = next(r.id for r in rt.house.rooms.values() if r.name == "Chambre 1")
    now = time.time()
    body = (
        await c.get(f"/api/rooms/{ch1}/activity", params={"start": now - 7 * 86400, "end": now})
    ).json()
    assert body["step"] == 300
    assert len(body["window"]) >= 6  # one 20-minute run a morning
    assert all(1200 - 300 <= w["end"] - w["start"] <= 1200 + 300 for w in body["window"][1:-1])
    r = await c.get(f"/api/rooms/{ch1}/activity", params={"start": now - 40 * 86400, "end": now})
    assert (r.status_code, r.json()["code"]) == (422, "period_invalid")


async def test_duty_route_gives_every_room_over_24h(ctx):
    c, rt, _ = ctx
    body = (await c.get("/api/rooms/duty")).json()
    assert body["to"] - body["from"] == 86400
    assert set(body["rooms"]) == set(rt.house.rooms)
    for v in body["rooms"].values():
        assert v["coverage"] >= 0.5 and 0.0 <= v["duty"] <= 1.0


async def test_activity_and_duty_read_the_runtime_clock(tmp_path):
    """Both routes read the injected wall clock (CLAUDE.md « Time in tests »), never the host's."""
    pinned = 1_760_000_000.0
    app = create_app(
        Settings(_env_file=None, kelvin_data=tmp_path, kelvin_fake=True),
        FakeGateway(clock=ManualClock()),
        start_tasks=False,
        wall=lambda: pinned,
    )
    async with LifespanManager(app):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://t", headers={"X-Kelvin": "1"}
        ) as c:
            await login(c)
            rt = app.state.ctx.rt
            body = (await c.get("/api/rooms/duty")).json()
            assert body["to"] == int(pinned)
            assert all(v["duty"] is not None for v in body["rooms"].values())
            ch1 = next(r.id for r in rt.house.rooms.values() if r.name == "Chambre 1")
            p = {"start": pinned - 7 * 86400, "end": pinned + 86400}  # end clamped to the clock
            win = (await c.get(f"/api/rooms/{ch1}/activity", params=p)).json()["window"]
            assert win and max(w["end"] for w in win) <= pinned


async def test_light_intensity_has_its_label_and_expected_value(ctx):
    c, rt, clock = ctx
    rid = "8370011"
    r = await c.post(f"/api/radiators/{rid}/light", json={"on": True, "intensity": 40})
    p = r.json()["pending"]
    assert (p["label_code"], p["label_params"]) == (
        "night_light_intensity",
        {"name": "Radiateur", "intensity": 40},
    )
    assert p["label"] == "Radiateur : veilleuse à 40 %"
    assert p["expected"][rid]["light_intensity"] == 40
    await settle(rt, clock)
    light = rt.house.radiators[rid].view()["light"]
    assert light == {"on": True, "intensity": 40}


async def test_intensity_with_the_light_off_is_refused(ctx):
    c, _, _ = ctx
    r = await c.post("/api/radiators/8370011/light", json={"on": False, "intensity": 40})
    assert (r.status_code, r.json()["code"]) == (422, "intensity_light_off")


async def test_an_intensity_out_of_range_reads_its_own_message(ctx):
    c, _, _ = ctx
    for value in (0, 101):
        r = await c.post("/api/radiators/8370011/light", json={"on": True, "intensity": value})
        assert (r.status_code, r.json()["code"]) == (422, "intensity_range"), value
