"""Helpers for the MCP tests (Plan 13): a simulator app, its MCP server in process, and raw
JSON-RPC over HTTP for the gate."""

from contextlib import asynccontextmanager
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from asgi_lifespan import LifespanManager
from httpx import ASGITransport, AsyncClient

from kelvin.api.app import create_app
from kelvin.config import Settings
from kelvin.overkiz.fake import FakeGateway
from kelvin.overkiz.houses import HOUSES
from tests.conftest import DEMO, ManualClock

PARIS = ZoneInfo("Europe/Paris")
NOW = datetime(2026, 11, 20, 14, 0, tzinfo=PARIS).timestamp()  # a Friday afternoon
PROTOCOL = "2025-11-25"
SERVER = {
    "sauter": "sauter_cozytouch",
    "atlantic": "atlantic_cozytouch",
    "thermor": "thermor_cozytouch",
    "experimental": "somfy_europe",
}


@asynccontextmanager
async def kelvin_app(
    tmp_path, *, house: str = "sauter", sync: bool = True, now: float = NOW, **settings: Any
):
    """A logged-in simulator Kelvin at `now` (a fixed wall clock, NOW by default), Linky synced
    once."""
    root, devices = HOUSES[house]()
    gw = FakeGateway(root, devices, clock=ManualClock(), server=SERVER[house])
    app = create_app(
        Settings(_env_file=None, kelvin_data=tmp_path, kelvin_fake=True, **settings),
        gw,
        start_tasks=False,
        wall=lambda: now,
    )
    async with LifespanManager(app):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://t", headers={"X-Kelvin": "1"}
        ) as c:
            r = await c.post("/api/auth/login", json={**DEMO, "server": SERVER[house]})
            assert r.status_code == 200, r.text
            rt = app.state.ctx.rt
            if sync and rt.linky is not None:
                await rt.linky.sync.run_once()
            yield c, app


async def call(app, name: str, args: dict[str, Any] | None = None):
    """A tool call through the SDK's in-process client (no HTTP, no gate)."""
    from mcp import Client

    async with Client(app.state.mcp) as client:
        return await client.call_tool(name, args or {})


def data(result) -> dict[str, Any]:
    assert result.is_error is False, result.content
    return result.structured_content


def error_code(result) -> str:
    assert result.is_error is True, result.structured_content
    text = result.content[0].text
    # mcp 2.3.0 prefixes a ToolError's text with « Error executing tool <name>: ».
    if text.startswith("Error executing tool "):
        text = text.split(": ", 1)[1]
    return text.split(":", 1)[0]


async def rpc(
    c: AsyncClient,
    method: str,
    params: dict | None = None,
    *,
    token: str | None = None,
    headers: dict[str, str] | None = None,
    cookies: bool = False,
):
    """One JSON-RPC POST to /mcp as an MCP client sends it (handshake-era protocol)."""
    h = {
        "Accept": "application/json, text/event-stream",
        "Content-Type": "application/json",
        "MCP-Protocol-Version": PROTOCOL,
    }
    if token is not None:
        h["Authorization"] = f"Bearer {token}"
    h.update(headers or {})
    saved = dict(c.cookies)
    if not cookies:
        c.cookies.clear()
    try:
        return await c.post(
            "/mcp",
            json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}},
            headers=h,
        )
    finally:
        c.cookies.update(saved)


INIT = {
    "protocolVersion": PROTOCOL,
    "capabilities": {},
    "clientInfo": {"name": "t", "version": "0"},
}
