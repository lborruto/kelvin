import logging
import re
import stat

import pytest
from asgi_lifespan import LifespanManager
from fastapi.routing import APIRoute
from httpx import ASGITransport, AsyncClient

from kelvin.account import Account, AccountStore
from kelvin.api.app import create_app
from kelvin.api.sse import event_stream
from kelvin.config import Settings
from kelvin.overkiz.errors import GatewayError
from kelvin.overkiz.fake import DEMO_EMAIL, FakeGateway
from tests.conftest import DEMO, ManualClock, err, login

OPEN = {"/api/health", "/api/auth/login", "/api/auth/logout", "/api/auth/me"}


def _app(tmp_path, gw=None, **settings):
    gw = gw or FakeGateway(clock=ManualClock())
    app = create_app(
        Settings(_env_file=None, kelvin_data=tmp_path, kelvin_fake=True, **settings),
        gw,
        start_tasks=False,
    )
    return app, gw


@pytest.fixture
async def setup_mode(tmp_path):
    app, gw = _app(tmp_path)
    async with LifespanManager(app):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://t", headers={"X-Kelvin": "1"}
        ) as c:
            yield c, app, gw


def _api_routes(routes, prefix=""):
    """Every (full path, APIRoute): FastAPI keeps included routers nested, not flattened."""
    for route in routes:
        if isinstance(route, APIRoute):
            yield prefix + route.path, route
        elif hasattr(route, "original_router"):
            yield from _api_routes(
                route.original_router.routes, prefix + route.include_context.prefix
            )


async def _assert_every_guarded_route_is_401(c, app):
    seen = 0
    for full_path, route in _api_routes(app.routes):
        if not full_path.startswith("/api") or full_path in OPEN:
            continue
        path = re.sub(r"\{[^}]+\}", "x", full_path)
        for method in route.methods:
            r = await c.request(method, path)
            assert r.status_code == 401, (method, path, r.status_code)
            assert r.json() == err("login_required")
            seen += 1
    # The plan-1/2 API (18, /api/stream included), then plan 3's six new method-routes (four
    # paths): /api/energy, /api/linky/curve, /api/settings and /api/settings/linky.
    assert seen >= 24


async def test_setup_mode_guards_everything_but_health_and_auth(setup_mode):
    c, app, _ = setup_mode
    await _assert_every_guarded_route_is_401(c, app)
    assert (await c.get("/api/health")).json() == {"status": "setup"}
    me = (await c.get("/api/auth/me")).json()
    assert me == {
        "email": None,
        "logged_in": False,
        "setup": True,
        "reauth": False,
        "simulator": True,
    }


async def test_login_sets_a_strict_cookie_and_opens_the_api(setup_mode):
    c, _, _ = setup_mode
    r = await c.post("/api/auth/login", json=DEMO)
    assert r.status_code == 200
    assert r.json() == {"email": DEMO_EMAIL, "logged_in": True}
    cookie = r.headers["set-cookie"]
    assert cookie.startswith("kelvin_session=")
    for attr in ("HttpOnly", "Max-Age=31536000", "Path=/", "SameSite=lax"):
        assert attr.lower() in cookie.lower()
    assert "secure" not in cookie.lower()  # plain http
    assert (await c.get("/api/house")).status_code == 200
    me = await c.get("/api/auth/me")
    assert me.json()["logged_in"] is True and me.json()["email"] == DEMO_EMAIL
    assert "kelvin_session=" in me.headers["set-cookie"]  # sliding: renewed


async def test_cookie_is_secure_over_https(tmp_path):
    app, _ = _app(tmp_path)
    async with LifespanManager(app):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="https://t", headers={"X-Kelvin": "1"}
        ) as c:
            r = await c.post("/api/auth/login", json=DEMO)
            assert "secure" in r.headers["set-cookie"].lower()


async def test_bad_credentials_are_a_plain_401_without_the_login_required_code(setup_mode):
    c, _, _ = setup_mode
    r = await c.post("/api/auth/login", json={**DEMO, "password": "nope"})
    assert r.status_code == 401
    assert r.json() == err("bad_credentials")
    assert "set-cookie" not in r.headers


async def test_login_requires_the_kelvin_header(setup_mode):
    c, _, _ = setup_mode
    r = await c.post("/api/auth/login", json=DEMO, headers={"X-Kelvin": ""})
    assert r.status_code == 403


async def test_logout_closes_the_api_again(setup_mode):
    c, app, _ = setup_mode
    await login(c)
    r = await c.post("/api/auth/logout")
    assert r.json() == {"email": None, "logged_in": False}
    assert 'kelvin_session=""' in r.headers["set-cookie"] or "Max-Age=0" in r.headers["set-cookie"]
    await _assert_every_guarded_route_is_401(c, app)
    assert (await c.get("/api/auth/me")).json()["logged_in"] is False


async def test_secrets_never_leave_the_account_file(tmp_path, caplog):
    gw = FakeGateway(clock=ManualClock())
    gw.cloud_password = "Sup3r-Secret!"
    app, _ = _app(tmp_path, gw)
    with caplog.at_level(logging.DEBUG):
        async with LifespanManager(app):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://t", headers={"X-Kelvin": "1"}
            ) as c:
                r = await c.post(
                    "/api/auth/login", json={"email": DEMO_EMAIL, "password": "Sup3r-Secret!"}
                )
                texts = [r.text]
                for path in ("/api/auth/me", "/api/house", "/api/health"):
                    texts.append((await c.get(path)).text)
                ctx = app.state.ctx
                dump = "\n".join(ctx.db.conn.iterdump())
    assert all("Sup3r-Secret!" not in t for t in texts)
    assert "Sup3r-Secret!" not in dump
    assert "Sup3r-Secret!" not in caplog.text
    path = tmp_path / "account.json"
    assert stat.S_IMODE(path.stat().st_mode) == 0o600 and "Sup3r-Secret!" in path.read_text()


async def test_env_bootstrap_runs_but_still_asks_for_a_login(tmp_path):
    app, _ = _app(tmp_path, cozy_user=DEMO_EMAIL, cozy_pass="kelvin")
    async with LifespanManager(app):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://t", headers={"X-Kelvin": "1"}
        ) as c:
            assert (await c.get("/api/health")).json()["status"] == "ok"
            assert (await c.get("/api/house")).status_code == 401
            await login(c)
            assert (await c.get("/api/house")).status_code == 200


async def test_reauth_mode_after_a_rejected_stored_password(tmp_path):
    AccountStore(tmp_path).save(Account(DEMO_EMAIL, "old"))
    app, _ = _app(tmp_path)
    async with LifespanManager(app):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://t", headers={"X-Kelvin": "1"}
        ) as c:
            assert (await c.get("/api/health")).json()["status"] == "reauth"
            assert (await c.get("/api/auth/me")).json()["reauth"] is True
            await login(c)
            assert (await c.get("/api/health")).json()["status"] == "ok"


async def test_stream_ends_when_session_is_deleted(setup_mode):
    c, app, _ = setup_mode
    await login(c)
    ctx = app.state.ctx
    token = c.cookies.get("kelvin_session")
    gen = event_stream(
        ctx.rt, alive=lambda: ctx.sessions.validate(token), check_every_s=0, ping_s=0.01
    )
    assert (await anext(gen))["event"] == "snapshot"
    assert (await anext(gen))["event"] == "ping"  # still logged in
    await c.post("/api/auth/logout")
    with pytest.raises(StopAsyncIteration):
        await anext(gen)
    assert ctx.rt.broadcaster.subscriber_count == 0


async def test_health_says_only_the_status_and_the_details_need_a_session(setup_mode):
    c, _, _ = setup_mode
    assert (await c.get("/api/status")).status_code == 401
    await login(c)
    assert (await c.get("/api/health")).json() == {"status": "ok"}  # even logged in
    detail = (await c.get("/api/status")).json()
    assert detail["status"] == "ok" and detail["overkiz"]["connected"] is True
    assert detail["linky"] == "never"  # simulator Linky, not synced yet
    await c.post("/api/auth/logout")
    assert (await c.get("/api/status")).status_code == 401


@pytest.mark.parametrize("path", ["/docs", "/redoc", "/openapi.json"])
async def test_api_docs_are_off_unless_debug(tmp_path, path):
    for debug, expected in ((False, 404), (True, 200)):
        app, _ = _app(tmp_path / str(debug), kelvin_debug=debug)
        async with LifespanManager(app):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
                assert (await c.get(path)).status_code == expected, (path, debug)


async def test_api_docs_debug_flag_reads_kelvin_debug(monkeypatch):
    monkeypatch.setenv("KELVIN_DEBUG", "1")
    assert Settings(_env_file=None).kelvin_debug is True
    monkeypatch.delenv("KELVIN_DEBUG")
    assert Settings(_env_file=None).kelvin_debug is False


async def test_startup_while_cozytouch_is_down_waits_offline(tmp_path):
    AccountStore(tmp_path).save(Account(DEMO_EMAIL, "kelvin"))
    gw = FakeGateway(clock=ManualClock())
    gw.fail_login = GatewayError("down")
    app, _ = _app(tmp_path, gw)
    async with LifespanManager(app):  # used to fail the lifespan and exit
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://t", headers={"X-Kelvin": "1"}
        ) as c:
            assert (await c.get("/api/health")).json() == {"status": "offline"}
            me = (await c.get("/api/auth/me")).json()
            assert me["logged_in"] is False and me["reauth"] is False
            r = await c.post("/api/auth/login", json=DEMO)
            assert r.status_code == 503
            assert r.json() == err("cozytouch_unreachable")
            gw.fail_login = None
            await login(c)
            assert (await c.get("/api/health")).json() == {"status": "ok"}
            assert (await c.get("/api/house")).status_code == 200
