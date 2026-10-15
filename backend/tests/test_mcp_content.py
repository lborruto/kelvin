"""Resources and prompts (spec MCP §8)."""

import json

from mcp import Client

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
