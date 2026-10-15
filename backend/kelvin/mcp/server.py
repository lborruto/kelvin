"""Kelvin's MCP server (spec MCP §2): the SDK's MCPServer; its stateless JSON endpoint is added
to Kelvin's router at /mcp behind McpGate (ruling R2, R3)."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from fastapi import FastAPI
from mcp.server.mcpserver import MCPServer
from mcp.server.transport_security import TransportSecuritySettings
from starlette.routing import Route

from kelvin.mcp.content import register_content
from kelvin.mcp.gate import McpGate
from kelvin.mcp.runner import Runner
from kelvin.mcp.tools import register_tools

MAX_BODY = 64 * 1024
INSTRUCTIONS = """Kelvin is the owner's self-hosted heating app: electric radiators on Cozytouch,
the home's Linky meter, French tariffs (Base, off-peak/peak, Tempo) and grid signals.
This server is READ-ONLY. No tool changes a radiator, a programme or a setting; proposals are
for the owner to apply in Kelvin's app.
Start with get_data_status (freshness, coverage) and get_overview (room ids).
Every result is {data, meta}: meta.units gives the unit of each field suffix (_kwh, _eur, _c…),
meta.basis says whether figures are measured, computed from the tariff, or estimated, and
meta.notes lists caveats. null means unknown, never zero. Read kelvin://guide once.
Never present an estimate as a saving the owner will get."""


def build_server(get_ctx: Callable[[], Any]) -> MCPServer:
    server = MCPServer("kelvin", title="Kelvin", instructions=INSTRUCTIONS)
    run = Runner(get_ctx)
    register_tools(server, run)
    register_content(server, run)
    return server


def mount_mcp(app: FastAPI, server: MCPServer) -> None:
    """Stateless JSON exchanges (no session id, no SSE); the SDK's DNS-rebinding check is off
    because it only knows localhost (a reverse proxy's Host would get 421): Kelvin's
    TrustedHostMiddleware and the gate's Origin refusal replace it."""
    sdk = server.streamable_http_app(
        streamable_http_path="/mcp",
        stateless_http=True,
        json_response=True,
        max_request_body_size=MAX_BODY,
        transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False),
    )
    endpoint = next(r.endpoint for r in sdk.routes if isinstance(r, Route) and r.path == "/mcp")
    app.router.routes.append(Route("/mcp", endpoint=McpGate(endpoint)))
