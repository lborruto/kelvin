"""Spec MCP §5.2: who gets through /mcp, and what is written about who did not."""

from httpx import ASGITransport, AsyncClient

from kelvin.mcp.limits import FAIL_LIMIT, MINUTE_LIMIT
from tests.mcp_helpers import INIT, kelvin_app, rpc


async def _token(c, name="test") -> dict:
    return (await c.post("/api/mcp/tokens", json={"name": name})).json()


def _denials(app) -> list[dict]:
    return app.state.ctx.db.query(
        "SELECT token_id, kind, name, args, outcome, error_code FROM mcp_audit WHERE kind = 'auth'"
    )


async def test_missing_malformed_wrong_and_cookie_only_are_401(tmp_path):
    async with kelvin_app(tmp_path, sync=False) as (c, app):
        good = (await _token(c))["secret"]
        wrong = good[:-1] + ("A" if good[-1] != "A" else "B")
        cases = [
            {},
            {"Authorization": "Bearer "},
            {"Authorization": f"Basic {good}"},
            {"Authorization": f"Bearer {wrong}"},
        ]
        for headers in cases:
            r = await rpc(c, "initialize", INIT, headers=headers)
            assert r.status_code == 401, headers
            assert r.json() == {"error": "invalid_token"}
            assert r.headers["www-authenticate"] == 'Bearer realm="kelvin"'
        r = await rpc(c, "initialize", INIT, cookies=True)  # a session cookie is not a token
        assert r.status_code == 401
        rows = _denials(app)
        assert len(rows) == 1 and {x["outcome"] for x in rows} == {"denied"}  # folded a minute
        assert all(x["token_id"] is None and good not in str(x) for x in rows)
        assert app.state.ctx.mcp_tokens.listing()[0]["last_used"] is None


async def test_revoked_token_is_refused_at_once(tmp_path):
    async with kelvin_app(tmp_path, sync=False) as (c, app):
        made = await _token(c)
        assert (await rpc(c, "initialize", INIT, token=made["secret"])).status_code == 200
        assert app.state.ctx.mcp_tokens.listing()[0]["last_used"] is not None
        await c.delete(f"/api/mcp/tokens/{made['token']['id']}")
        assert (await rpc(c, "initialize", INIT, token=made["secret"])).status_code == 401


async def test_failures_lock_out_a_client(tmp_path):
    async with kelvin_app(tmp_path, sync=False) as (c, app):
        good = (await _token(c))["secret"]
        for _ in range(FAIL_LIMIT):
            await rpc(c, "initialize", INIT, token="kmcp_" + "x" * 43)
        r = await rpc(c, "initialize", INIT, token=good)  # even the right token waits
        assert r.status_code == 429 and int(r.headers["retry-after"]) > 0
        assert r.json() == {"error": "too_many_attempts"}


async def test_per_token_rate_limit(tmp_path):
    async with kelvin_app(tmp_path, sync=False) as (c, app):
        good = (await _token(c))["secret"]
        other = (await _token(c, "other"))["secret"]
        for _ in range(MINUTE_LIMIT):
            assert (await rpc(c, "tools/list", token=good)).status_code == 200
        for _ in range(5):  # a client looping above the limit: one audit row, not one each
            r = await rpc(c, "tools/list", token=good)
            assert r.status_code == 429 and r.json() == {"error": "rate_limited"}
        assert (await rpc(c, "tools/list", token=other)).status_code == 200
        limited = [x for x in _denials(app) if x["outcome"] == "rate_limited"]
        assert len(limited) == 1 and limited[0]["token_id"] is not None


async def test_origin_is_refused(tmp_path):
    async with kelvin_app(tmp_path, sync=False) as (c, app):
        good = (await _token(c))["secret"]
        r = await rpc(c, "initialize", INIT, token=good, headers={"Origin": "http://evil.lan"})
        assert r.status_code == 403 and r.json() == {"error": "origin_refused"}


async def test_api_refuses_the_mcp_token(tmp_path):
    async with kelvin_app(tmp_path, sync=False) as (c, app):
        good = (await _token(c))["secret"]
        c.cookies.clear()
        r = await c.get("/api/house", headers={"Authorization": f"Bearer {good}"})
        assert r.status_code == 401 and r.json()["code"] == "login_required"


async def test_the_audit_names_the_token_of_each_call(tmp_path):
    async with kelvin_app(tmp_path, sync=False) as (c, app):
        made = await _token(c, "Claude Code")
        r = await rpc(
            c, "tools/call", {"name": "get_data_status", "arguments": {}}, token=made["secret"]
        )
        assert r.status_code == 200
        rows = (await c.get("/api/mcp/audit")).json()
        call = next(x for x in rows if x["name"] == "get_data_status")
        assert call["token_name"] == "Claude Code" and call["outcome"] == "ok"


async def test_oversized_bodies_are_refused(tmp_path):
    async with kelvin_app(tmp_path, sync=False) as (c, app):
        good = (await _token(c))["secret"]
        big = {"name": "get_data_status", "arguments": {}, "pad": "x" * (70 * 1024)}
        r = await rpc(c, "tools/call", big, token=good)
        assert r.status_code == 413


async def test_a_bad_token_flood_from_many_addresses_writes_one_row(tmp_path):
    """Security review: 1 000 distinct bad tokens from 200 addresses (5 each, under the per-address
    lockout) are one audit row; a real token's calls stay in the log."""
    async with kelvin_app(tmp_path, sync=False) as (c, app):
        good = (await _token(c))["secret"]
        assert (
            await rpc(c, "tools/call", {"name": "get_data_status", "arguments": {}}, token=good)
        ).status_code == 200
        for ip in range(200):
            transport = ASGITransport(app=app, client=(f"10.1.{ip // 250}.{ip % 250}", 1234))
            async with AsyncClient(transport=transport, base_url="http://t") as other:
                for k in range(5):
                    bad = "kmcp_" + f"{ip:03d}{k}".ljust(43, "z")
                    r = await rpc(other, "initialize", INIT, token=bad)
                    assert r.status_code == 401
        rows = _denials(app)
        assert len(rows) == 1 and rows[0]["outcome"] == "denied"
        kept = app.state.ctx.db.query("SELECT name FROM mcp_audit WHERE token_id IS NOT NULL")
        assert "get_data_status" in {r["name"] for r in kept}
