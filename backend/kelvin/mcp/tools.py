"""The MCP tools (spec MCP §3): read-only views over Kelvin's services, in the §4 envelope.
Builders take the AppContext and return an envelope; the Runner wraps every call."""

from __future__ import annotations

import asyncio
from typing import Any

from mcp.server.mcpserver import MCPServer
from mcp.types import ToolAnnotations

from kelvin.api.auth_routes import status_word
from kelvin.api.runtime import sources
from kelvin.mcp import shape
from kelvin.mcp.runner import Runner

READ_ONLY = ToolAnnotations(
    read_only_hint=True, destructive_hint=False, idempotent_hint=True, open_world_hint=False
)
_SOURCE_TIMES = {"last_ok": "last_ok_at", "error_since": "error_since_at", "next": "next_at"}


def _source(view: dict[str, Any], tz: str) -> dict[str, Any]:
    return {
        _SOURCE_TIMES.get(k, k): shape.iso(v, tz) if k in _SOURCE_TIMES else v
        for k, v in view.items()
    }


async def data_status(ctx: Any) -> dict[str, Any]:
    rt, tz = ctx.rt, ctx.settings.tz
    data: dict[str, Any] = {
        "kelvin_mode": status_word(ctx),
        "timezone": tz,
        "cozytouch": None,
        "linky": None,
        "grid_sources": None,
        "radiator_meters": [],
    }
    if rt is not None:
        p = rt.pump.status()
        data["cozytouch"] = {
            "connected": p["connected"],
            "last_ok_at": shape.iso(p["last_ok_at"], tz),
            "last_error_code": p["last_error_code"],
            "setup_reads_24h": p["setup_reads_24h"],
        }
        if rt.linky is not None:
            s = rt.linky.status()
            data["linky"] = {
                "state": s["state"],
                "configured": s["configured"],
                "last_day_date": s["last_day"],
                "last_ok_at": shape.iso(s["last_ok_at"], tz),
                "consent_expires_date": s["consent_expires"],
                "med_calls_today": s["calls_today"],
                "med_grid_calls_today": s["grid_calls_today"],
                "med_budget": s["budget"],
            }
        src = sources(rt)
        if src is not None:
            data["grid_sources"] = {k: _source(v, tz) for k, v in src.items() if k != "med"}
        extent = await asyncio.to_thread(rt.recorder.energy_extent)
        data["radiator_meters"] = [
            {
                "radiator_id": rid,
                "first_reading_at": shape.iso(a, tz),
                "last_reading_at": shape.iso(b, tz),
            }
            for rid, (a, b) in sorted(extent.items())
        ]
    return shape.envelope(
        "get_data_status",
        data,
        ctx=ctx,
        sources=["cozytouch", "linky", "grid", "recorder"],
        basis="measured",
    )


def register_tools(server: MCPServer, run: Runner) -> None:
    @server.tool(
        annotations=READ_ONLY,
        description=(
            "How fresh and complete Kelvin's data is: Kelvin's mode, Cozytouch connection, Linky"
            " sync state and last day, MyElectricalData calls, Tempo/EcoWatt fetches, and each"
            " radiator meter's first and last reading. Call it first."
        ),
    )
    async def get_data_status() -> dict[str, Any]:
        return await run("tool", "get_data_status", {}, data_status, needs_runtime=False)
