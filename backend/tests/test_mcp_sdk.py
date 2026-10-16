"""The MCP SDK names Plan 13 builds on (mcp 2.3.0). A failure here means the pinned SDK moved:
re-read its API before changing anything else."""

import inspect
from importlib.metadata import version
from typing import Any


def test_the_sdk_is_pinned():
    assert version("mcp") == "2.3.0"


def test_the_server_api_used_by_kelvin():
    from mcp.server.mcpserver import MCPServer
    from mcp.server.mcpserver.exceptions import ToolError
    from mcp.server.transport_security import TransportSecuritySettings
    from mcp.types import ToolAnnotations

    params = inspect.signature(MCPServer.streamable_http_app).parameters
    for name in (
        "streamable_http_path",
        "stateless_http",
        "json_response",
        "max_request_body_size",
        "transport_security",
    ):
        assert name in params, name
    for name in ("name", "title", "instructions"):
        assert name in inspect.signature(MCPServer.__init__).parameters, name
    assert "annotations" in inspect.signature(MCPServer.tool).parameters
    assert {"uri", "name", "title", "mime_type"} <= set(
        inspect.signature(MCPServer.resource).parameters
    )
    assert {"name", "title", "description"} <= set(inspect.signature(MCPServer.prompt).parameters)
    a = ToolAnnotations(
        read_only_hint=True, destructive_hint=False, idempotent_hint=True, open_world_hint=False
    )
    assert a.read_only_hint is True and a.open_world_hint is False
    assert TransportSecuritySettings(enable_dns_rebinding_protection=False)
    assert issubclass(ToolError, Exception)


async def test_an_in_process_client_reads_structured_output():
    from mcp import Client
    from mcp.server.mcpserver import MCPServer

    server = MCPServer("probe")

    @server.tool()
    async def figures() -> dict[str, Any]:
        return {"energy_kwh": 1.5}

    async with Client(server) as client:
        result = await client.call_tool("figures", {})
    assert result.is_error is False
    assert result.structured_content == {"energy_kwh": 1.5}
