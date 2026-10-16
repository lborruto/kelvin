"""Resources and prompts (spec MCP §8)."""

import json

import pytest
from mcp import Client
from mcp.shared.exceptions import MCPError

from tests.mcp_helpers import kelvin_app


async def test_resources(tmp_path):
    async with kelvin_app(tmp_path, sync=False) as (c, app):
        async with Client(app.state.mcp) as client:
            uris = {str(r.uri) for r in (await client.list_resources()).resources}
            assert {"kelvin://house", "kelvin://tariff", "kelvin://guide"} <= uris
            house = json.loads((await client.read_resource("kelvin://house")).contents[0].text)
            assert house["meta"]["tool"] == "get_overview"
            room = json.loads(
                (await client.read_resource("kelvin://rooms/p-salon")).contents[0].text
            )
            assert room["data"]["room_id"] == "p-salon"
            guide = (await client.read_resource("kelvin://guide")).contents[0].text
            for word in ("offpeak", "basis", "null", "06:00", "applies nothing"):
                assert word in guide


async def test_prompts(tmp_path):
    async with kelvin_app(tmp_path, sync=False) as (c, app):
        async with Client(app.state.mcp) as client:
            names = {p.name for p in (await client.list_prompts()).prompts}
            assert names == {
                "analyse_last_month",
                "explain_bill",
                "plan_tempo_red_day",
                "review_programme",
            }
            text = (
                (await client.get_prompt("analyse_last_month", {"language": "en"}))
                .messages[0]
                .content.text
            )
            assert "propose_savings" in text and "English" in text and "never" in text.lower()
            fr = (
                (await client.get_prompt("review_programme", {"room_id": "p-salon"}))
                .messages[0]
                .content.text
            )
            assert "French" in fr and "evaluate_programme" in fr and "p-salon" in fr
            rows = app.state.ctx.db.query("SELECT kind FROM mcp_audit WHERE kind = 'prompt'")
            assert len(rows) == 2


async def _prompt_text(client, name, args):
    return (await client.get_prompt(name, args)).messages[0].content.text


async def test_prompts_take_natural_arguments(tmp_path):
    # the fixed clock is Friday 2026-11-20 14:00 Paris
    async with kelvin_app(tmp_path, sync=False) as (c, app):
        async with Client(app.state.mcp) as client:
            t = await _prompt_text(
                client, "explain_bill", {"month": "september", "language": "english"}
            )
            assert "2026-09" in t and "September 2026" in t and "Answer in English" in t
            t = await _prompt_text(client, "explain_bill", {"month": "Décembre"})
            assert "2025-12" in t and "Answer in French" in t
            assert "2026-11" in await _prompt_text(client, "explain_bill", {"month": "novembre"})
            assert "2026-10" in await _prompt_text(client, "explain_bill", {"month": "last month"})
            assert "2024-03" in await _prompt_text(client, "explain_bill", {"month": "mars 2024"})
            assert "2026-02" in await _prompt_text(client, "explain_bill", {"month": "2026-02"})
            t = await _prompt_text(client, "analyse_last_month", {"language": " Anglais "})
            assert "Answer in English" in t
            assert "2026-11-21" in await _prompt_text(
                client, "plan_tempo_red_day", {"date": "demain"}
            )
            assert "2026-11-20" in await _prompt_text(
                client, "plan_tempo_red_day", {"date": "Aujourd'hui"}
            )
            assert "2026-12-01" in await _prompt_text(
                client, "plan_tempo_red_day", {"date": "2026-12-01"}
            )
            rooms = (await client.call_tool("get_overview", {})).structured_content["data"]["rooms"]
            room = next(r for r in rooms if not r["is_whole_house"])
            t = await _prompt_text(client, "review_programme", {"room_id": room["name"].upper()})
            assert room["room_id"] in t


async def test_prompt_refusals_reach_the_client(tmp_path):
    async with kelvin_app(tmp_path, sync=False) as (c, app):
        async with Client(app.state.mcp) as client:
            for name, args, words in [
                ("analyse_last_month", {"language": "klingon"}, ["fr", "english", "anglais"]),
                ("explain_bill", {"month": "smarch"}, ["Examples", "september"]),
                ("plan_tempo_red_day", {"date": "someday"}, ["tomorrow", "demain"]),
                ("review_programme", {"room_id": "nowhere"}, ["Room names", "Salon"]),
            ]:
                with pytest.raises(MCPError) as e:
                    await client.get_prompt(name, args)
                assert "Internal server error" not in str(e.value)
                assert all(w in str(e.value) for w in words), str(e.value)
            rows = app.state.ctx.db.query(
                "SELECT error_code FROM mcp_audit WHERE kind = 'prompt' AND outcome = 'error'"
            )
            assert len(rows) == 4
