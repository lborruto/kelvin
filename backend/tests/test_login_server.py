"""Server choice at login (Plan 12): the first login claims the home with its server."""

import json

import pytest
from asgi_lifespan import LifespanManager
from httpx import ASGITransport, AsyncClient

from kelvin.account import Account, AccountStore
from kelvin.api.app import create_app
from kelvin.api.runtime import SERVER_KEY
from kelvin.config import Settings
from kelvin.overkiz.fake import FakeGateway
from kelvin.recorder.db import Database
from tests.conftest import ManualClock

DEMO = {"email": "demo@kelvin.local", "password": "kelvin"}


@pytest.fixture
def make_client(tmp_path):
    async def make(gw: FakeGateway | None = None):
        gw = gw or FakeGateway(clock=ManualClock())
        app = create_app(
            Settings(_env_file=None, kelvin_data=tmp_path, kelvin_fake=True), gw, start_tasks=False
        )
        manager = LifespanManager(app)
        await manager.__aenter__()
        client = AsyncClient(
            transport=ASGITransport(app=app), base_url="http://t", headers={"X-Kelvin": "1"}
        )
        return manager, client, app, gw

    return make


async def _close(manager, client):
    await client.aclose()
    await manager.__aexit__(None, None, None)


async def test_the_server_list_is_open_and_says_nothing_before_a_claim(make_client):
    manager, c, _, _ = await make_client()
    try:
        body = (await c.get("/api/auth/servers")).json()
        assert [s["id"] for s in body["servers"]][:3] == [
            "sauter_cozytouch",
            "atlantic_cozytouch",
            "thermor_cozytouch",
        ]
        assert body["servers"][0] == {
            "id": "sauter_cozytouch",
            "name": "Sauter Cozytouch",
            "tier": "cozytouch",
            "default": True,
        }
        assert body["current"] is None
    finally:
        await _close(manager, c)


async def test_a_first_login_claims_the_home_with_its_server(make_client, tmp_path):
    manager, c, app, gw = await make_client()
    try:
        r = await c.post("/api/auth/login", json={**DEMO, "server": "atlantic_cozytouch"})
        assert r.status_code == 200, r.text
        assert gw.server == "atlantic_cozytouch"
        stored = json.loads((tmp_path / "account.json").read_text(encoding="utf-8"))
        assert stored["server"] == "atlantic_cozytouch"
        assert app.state.ctx.db.get_setting(SERVER_KEY) == "atlantic_cozytouch"
        assert (await c.get("/api/auth/servers")).json()["current"] == "atlantic_cozytouch"
        assert (await c.get("/api/auth/me")).json()["server"] == {
            "id": "atlantic_cozytouch",
            "name": "Atlantic Cozytouch",
            "tier": "cozytouch",
            "default": False,
        }
    finally:
        await _close(manager, c)


async def test_no_server_means_sauter(make_client, tmp_path):
    manager, c, _, gw = await make_client()
    try:
        assert (await c.post("/api/auth/login", json=DEMO)).status_code == 200
        assert gw.server == "sauter_cozytouch"
    finally:
        await _close(manager, c)


async def test_a_claimed_home_logs_in_without_naming_its_server(make_client, tmp_path):
    AccountStore(tmp_path).save(
        Account(DEMO["email"], DEMO["password"], server="thermor_cozytouch")
    )
    manager, c, _, gw = await make_client()
    try:
        assert (await c.post("/api/auth/login", json=DEMO)).status_code == 200
        assert gw.server == "thermor_cozytouch"
    finally:
        await _close(manager, c)


async def test_an_unknown_server_is_refused_without_a_call(make_client):
    manager, c, _, gw = await make_client()
    try:
        r = await c.post("/api/auth/login", json={**DEMO, "server": "rexel"})
        assert r.status_code == 422 and r.json()["code"] == "server_unknown"
        assert gw.checks == 0 and gw.logins == 0
    finally:
        await _close(manager, c)


async def test_another_server_on_a_claimed_home_is_refused_without_a_call(make_client, tmp_path):
    AccountStore(tmp_path).save(Account(DEMO["email"], DEMO["password"]))  # a Sauter home
    manager, c, _, gw = await make_client()
    try:
        before = (gw.logins, gw.checks)
        r = await c.post("/api/auth/login", json={**DEMO, "server": "atlantic_cozytouch"})
        assert r.status_code == 409
        assert r.json()["code"] == "server_mismatch"
        assert r.json()["params"] == {"server": "Sauter Cozytouch"}
        assert (gw.logins, gw.checks) == before
        assert (await c.post("/api/auth/login", json=DEMO)).status_code == 200
    finally:
        await _close(manager, c)


async def test_a_fresh_account_on_another_homes_data_is_refused(make_client, tmp_path):
    db = Database(tmp_path / "kelvin.db")
    db.set_setting(SERVER_KEY, "thermor_cozytouch")
    db.close()
    manager, c, _, gw = await make_client()
    try:
        r = await c.post("/api/auth/login", json={**DEMO, "server": "sauter_cozytouch"})
        assert r.status_code == 409
        assert (r.json()["code"], r.json()["params"]) == (
            "data_other_server",
            {"server": "Thermor Cozytouch"},
        )
        assert gw.logins == 0
        assert not (tmp_path / "account.json").exists()
    finally:
        await _close(manager, c)


async def test_wrong_credentials_name_the_server_outside_cozytouch(make_client):
    manager, c, _, _ = await make_client()
    try:
        r = await c.post(
            "/api/auth/login", json={"email": "x@y.fr", "password": "no", "server": "flexom"}
        )
        assert r.status_code == 401
        assert (r.json()["code"], r.json()["params"]) == (
            "bad_credentials_server",
            {"server": "Flexom"},
        )
        r = await c.post(
            "/api/auth/login",
            json={"email": "x@y.fr", "password": "no", "server": "thermor_cozytouch"},
        )
        assert r.json()["code"] == "bad_credentials"
    finally:
        await _close(manager, c)
