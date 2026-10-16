"""MCP resources and prompts (spec MCP §8). Agent-facing English (ruling R1); prompts ask the
agent to answer in the owner's language."""

from __future__ import annotations

import json
from typing import Any, Literal

from mcp.server.mcpserver import MCPServer

from kelvin.mcp import tools
from kelvin.mcp.runner import Runner

Language = Literal["fr", "en"]
_LANG = {"fr": "French", "en": "English"}

GUIDE = """# Reading Kelvin's data

Kelvin applies nothing through MCP: every tool reads; proposals are for the owner to apply in
the app (each proposal's `apply_in_app` names the screen).

## Results
Every tool returns `{data, meta}`. `meta.units` maps field suffixes to units (`_kwh`, `_eur`
incl. VAT as entered in the tariff, `_c` °C, `_w`, `_share` 0-1, `_at` local date-time).
`meta.basis`: `measured` (meter or sensor), `computed` (measured × tariff), `estimated`
(fallback split, interpolated or apportioned spans, projections, proposal estimates), `mixed`,
`static` (configuration), `unknown`. `meta.notes` lists caveats: repeat them with any figure.
`null` means unknown, never zero.

## Two sources of energy
- The Linky meter (whole home, via MyElectricalData): daily kWh and a half-hour curve. Days
  without a complete curve are split into off-peak/peak by a fallback profile (estimated).
- The radiators' own meters: radiator kWh, per room. `coverage` is the share of radiator-days
  fully measured; a partial figure counts those days only. `rest_kwh` is the meter minus the
  radiators, only at full coverage.

## Tariffs
Options: `base`, `hchp` (keys `offpeak`/`peak`), `tempo` (keys `blue_offpeak` … `red_peak`).
A Tempo day runs from 06:00 to 06:00 the next day; an unknown colour prices nothing
(`missing_colour_days`). Each price row applies from its `valid_from`.

## Programmes
A programme lists comfort periods per day (up to 3); outside them a radiator heats to eco. A
slot ending 24:00 runs to midnight. Locked days are kept as the radiator holds them. Check any
draft with `evaluate_programme` before suggesting it.

## Proposals
Estimates are upper bounds or proportional estimates with the consumption held equal; they are
not outcomes. Kelvin has no thermal model: no figure for a lower setpoint.
"""

_COMMON = (
    "Answer in {lang}. Kelvin's MCP tools are read-only; the owner applies changes in Kelvin's app."
    " Quote figures with their unit and basis, repeat meta.notes caveats, never present an"
    " estimate as a saving the owner will get, and never invent a number a tool did not give."
)

PROMPTS: dict[str, str] = {
    "analyse_last_month": (
        "Analyse my heating over the last full month. Call get_data_status, then get_energy for"
        " that month by day, get_tariff, get_overview and propose_savings. Explain where the"
        " energy and the money went (by rate and by room), compare with the previous month and"
        " last year when get_energy gives a comparison, then list the proposals with their"
        " figures, basis and assumptions. " + _COMMON
    ),
    "explain_bill": (
        "Explain my electricity cost for {month}. Call get_energy for that month by day and by"
        " month (with the previous month and the same month last year), get_tariff and"
        " get_data_status. Separate energy and subscription, show the split by rate and by room,"
        " say what is estimated or partial. " + _COMMON
    ),
    "plan_tempo_red_day": (
        "Plan a Tempo red day ({date}). Call get_grid_signals, get_tariff, get_overview and"
        " get_programmes. Propose, room by room, what to lower between 06:00 and 22:00 and when"
        " to pre-heat before 06:00, as steps the owner applies in the app. " + _COMMON
    ),
    "review_programme": (
        "Review the weekly programme of room {room_id}. Call get_programmes for that room,"
        " get_room_energy for 30 days and get_tariff. Draft a week with less comfort time in peak"
        " hours, check it with evaluate_programme, fix what it reports, and present the before"
        " and after. " + _COMMON
    ),
}


def _dump(env: dict[str, Any]) -> str:
    return json.dumps(env, ensure_ascii=False)


def register_content(server: MCPServer, run: Runner) -> None:
    @server.resource(
        "kelvin://house", name="house", title="House overview", mime_type="application/json"
    )
    async def house_resource() -> str:
        return _dump(await run("resource", "kelvin://house", {}, tools.overview))

    @server.resource("kelvin://tariff", name="tariff", title="Tariff", mime_type="application/json")
    async def tariff_resource() -> str:
        return _dump(await run("resource", "kelvin://tariff", {}, tools.tariff_view))

    @server.resource(
        "kelvin://rooms/{room_id}", name="room", title="One room", mime_type="application/json"
    )
    async def room_resource(room_id: str) -> str:
        return _dump(
            await run(
                "resource", "kelvin://rooms", {"room_id": room_id}, lambda c: tools.room(c, room_id)
            )
        )

    @server.resource(
        "kelvin://guide", name="guide", title="How to read Kelvin's data", mime_type="text/markdown"
    )
    async def guide_resource() -> str:
        async def text(_: Any) -> str:
            return GUIDE

        return await run("resource", "kelvin://guide", {}, text, needs_runtime=False)

    async def _prompt(name: str, args: dict[str, Any], language: Language) -> str:
        async def text(_: Any) -> str:
            return PROMPTS[name].format(lang=_LANG[language], **args)

        return await run("prompt", name, {**args, "language": language}, text, needs_runtime=False)

    @server.prompt(
        name="analyse_last_month",
        title="Analyse last month",
        description="Where last month's heating money went, and proposals.",
    )
    async def analyse_last_month(language: Language = "fr") -> str:
        return await _prompt("analyse_last_month", {}, language)

    @server.prompt(
        name="explain_bill",
        title="Explain a month's cost",
        description="A month's electricity cost by rate, room and comparison.",
    )
    async def explain_bill(month: str, language: Language = "fr") -> str:
        return await _prompt("explain_bill", {"month": month}, language)

    @server.prompt(
        name="plan_tempo_red_day",
        title="Plan a Tempo red day",
        description="What to lower and when to pre-heat on a red day.",
    )
    async def plan_tempo_red_day(date: str = "tomorrow", language: Language = "fr") -> str:
        return await _prompt("plan_tempo_red_day", {"date": date}, language)

    @server.prompt(
        name="review_programme",
        title="Review a room's programme",
        description="Draft a cheaper week and check it with evaluate_programme.",
    )
    async def review_programme(room_id: str, language: Language = "fr") -> str:
        return await _prompt("review_programme", {"room_id": room_id}, language)
