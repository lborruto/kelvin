"""The MCP server mounted at /mcp (spec MCP §2), through the gate, and its first tool."""

from tests.mcp_helpers import INIT, call, data, kelvin_app, rpc


async def _token(c) -> str:
    return (await c.post("/api/mcp/tokens", json={"name": "test"})).json()["secret"]


async def test_initialize_list_and_call_over_http(tmp_path):
    async with kelvin_app(tmp_path) as (c, app):
        token = await _token(c)
        r = await rpc(c, "initialize", INIT, token=token)
        assert r.status_code == 200, r.text
        assert r.headers["content-type"].startswith("application/json")
        info = r.json()["result"]
        assert info["serverInfo"]["name"] == "kelvin"
        assert "READ-ONLY" in info["instructions"]
        r = await rpc(c, "tools/list", token=token)
        assert "get_data_status" in {t["name"] for t in r.json()["result"]["tools"]}
        r = await rpc(c, "tools/call", {"name": "get_data_status", "arguments": {}}, token=token)
        body = r.json()["result"]
        assert body["isError"] is False
        assert body["structuredContent"]["data"]["kelvin_mode"] == "ok"


async def test_get_data_status_in_process(tmp_path):
    async with kelvin_app(tmp_path) as (c, app):
        env = data(await call(app, "get_data_status"))
        d, meta = env["data"], env["meta"]
        assert meta["tool"] == "get_data_status" and meta["simulator"] is True
        assert meta["generated_at"] == "2026-11-20T14:00:00+01:00"
        assert d["kelvin_mode"] == "ok" and d["timezone"] == "Europe/Paris"
        assert d["cozytouch"]["connected"] is True
        assert d["linky"]["state"] in ("ok", "never")
        assert "prm" not in str(d) and "token" not in d["linky"]
        assert {m["radiator_id"] for m in d["radiator_meters"]} <= set(
            app.state.ctx.rt.house.radiators
        )


async def test_without_a_runtime_tools_say_so(tmp_path):
    async with kelvin_app(tmp_path) as (c, app):
        ctx = app.state.ctx
        rt, ctx.rt = ctx.rt, None
        try:
            env = data(await call(app, "get_data_status"))
            assert env["data"]["kelvin_mode"] in ("setup", "reauth", "offline")
            assert env["data"]["cozytouch"] is None
        finally:
            ctx.rt = rt


async def test_spa_paths_under_mcp_are_json_404(tmp_path):
    async with kelvin_app(tmp_path, sync=False) as (c, app):
        for path in ("/mcp/x", "/.well-known/oauth-protected-resource"):
            r = await c.get(path)
            assert r.status_code == 404 and r.json()["code"] == "not_found"


async def test_disabled_means_no_endpoint(tmp_path):
    async with kelvin_app(tmp_path, sync=False, kelvin_mcp=False) as (c, app):
        assert app.state.mcp is None
        assert (await rpc(c, "initialize", INIT, token="kmcp_" + "a" * 43)).status_code == 404
