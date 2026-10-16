"""Agent-facing tool errors (spec MCP §4.4, ruling R1): a stable code and an English hint.
Machine text for an AI agent, not UI copy: it stays out of the web dictionaries."""

from mcp.server.mcpserver.exceptions import ToolError

TOOL_ERRORS: dict[str, str] = {
    "kelvin_not_running": (
        "Kelvin is not connected to Cozytouch right now (first setup, a refused password or an"
        " outage). Call get_data_status for the mode."
    ),
    "room_unknown": "Unknown room_id. Call get_overview for the room ids.",
    "radiator_unknown": "Unknown radiator id. Call get_overview or get_room for the ids.",
    "too_many_radiators": "At most 50 radiators per call.",
    "period_invalid": (
        "Invalid period: dates from 2000-01-01, the end after the start, at most 1464 days;"
        " history at most 2000 points per radiator and 20000 per call (use a larger"
        " step_minutes or fewer radiators)."
    ),
    "linky_unavailable": "Kelvin has no Linky data source configured.",
    "invalid_argument": "Invalid argument; see the tool's input schema.",
    "internal_error": "Kelvin could not answer; the failure was logged.",
}


def tool_error(code: str) -> ToolError:
    return ToolError(f"{code}: {TOOL_ERRORS[code]}")
