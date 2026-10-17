"""Réglages › Compte › Accès MCP (spec MCP §5.4)."""

import pytest
from asgi_lifespan import LifespanManager
from httpx import ASGITransport, AsyncClient

from kelvin.api.app import create_app
from kelvin.config import Settings
from kelvin.overkiz.fake import FakeGateway
from tests.conftest import ManualClock, err, login


@pytest.fixture
async def client(tmp_path):
    app = create_app(
        Settings(_env_file=None, kelvin_data=tmp_path, kelvin_fake=True),
        FakeGateway(clock=ManualClock()),
        start_tasks=False,
    )
    async with LifespanManager(app):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://t", headers={"X-Kelvin": "1"}
        ) as c:
            await login(c)
            yield c, app


async def test_create_list_revoke(client):
    c, app = client
    r = await c.get("/api/mcp/tokens")
    assert r.json() == {"enabled": True, "endpoint_path": "/mcp", "tokens": []}
    r = await c.post("/api/mcp/tokens", json={"name": "Claude Desktop"})
    assert r.status_code == 201 and r.headers["cache-control"] == "no-store"
    body = r.json()
    assert body["secret"].startswith("kmcp_") and body["token"]["name"] == "Claude Desktop"
    listed = (await c.get("/api/mcp/tokens")).json()["tokens"]
    assert listed == [body["token"]] and body["secret"] not in str(listed)
    r = await c.delete(f"/api/mcp/tokens/{body['token']['id']}")
    assert r.status_code == 204
    r = await c.delete(f"/api/mcp/tokens/{body['token']['id']}")
    assert r.status_code == 404 and r.json() == err("mcp_token_unknown")
    assert (await c.get("/api/mcp/tokens")).json()["tokens"][0]["revoked_at"] is not None


async def test_bad_names_and_header_and_session(client):
    c, _ = client
    r = await c.post("/api/mcp/tokens", json={"name": " "})
    assert r.status_code == 422 and r.json() == err("mcp_token_name_invalid", max=40)
    r = await c.post("/api/mcp/tokens", json={"name": "x"}, headers={"X-Kelvin": ""})
    assert r.status_code == 403
    r = await c.post("/api/mcp/tokens", json={"name": "x", "scope": "write"})
    assert r.status_code == 422  # unknown keys are refused: there is no write scope
    c.cookies.clear()
    assert (await c.get("/api/mcp/tokens")).status_code == 401
    assert (await c.get("/api/mcp/audit")).status_code == 401


async def test_audit_lists_newest_with_token_names(client):
    c, app = client
    tok = (await c.post("/api/mcp/tokens", json={"name": "Claude"})).json()["token"]
    app.state.ctx.mcp_audit.record(
        token_id=tok["id"], kind="tool", name="get_overview", args={}, outcome="ok", duration_ms=3
    )
    rows = (await c.get("/api/mcp/audit?limit=5")).json()
    assert rows[0]["token_name"] == "Claude" and rows[0]["name"] == "get_overview"
    assert (await c.get("/api/mcp/audit?limit=0")).status_code == 422
    assert (await c.get("/api/mcp/audit?limit=201")).status_code == 422


async def test_disabled(tmp_path):
    app = create_app(
        Settings(_env_file=None, kelvin_data=tmp_path, kelvin_fake=True, kelvin_mcp=False),
        FakeGateway(clock=ManualClock()),
        start_tasks=False,
    )
    async with LifespanManager(app):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://t", headers={"X-Kelvin": "1"}
        ) as c:
            await login(c)
            assert (await c.get("/api/mcp/tokens")).json()["enabled"] is False
            r = await c.post("/api/mcp/tokens", json={"name": "x"})
            assert r.status_code == 409 and r.json() == err("mcp_disabled")
