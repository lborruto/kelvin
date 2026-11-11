"""The /api request-body limit: refused before the framework buffers anything, login or not."""

import json

from asgi_lifespan import LifespanManager
from httpx import ASGITransport, AsyncClient

from kelvin.api.app import create_app
from kelvin.api.bodylimit import MAX_API_BODY, BodyLimit
from kelvin.config import Settings
from kelvin.overkiz.fake import FakeGateway
from tests.conftest import DEMO, ManualClock, err, login
from tests.mcp_helpers import INIT, kelvin_app, rpc

TOO_LARGE = err("invalid_request")
SLOTS = [{"start": "06:00", "end": "08:30"}, {"start": "11:30", "end": "13:30"}] + [
    {"start": "17:00", "end": "23:30"}
]
JSON = {"Content-Type": "application/json"}
DAYS = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")


def _app(tmp_path):
    return create_app(
        Settings(_env_file=None, kelvin_data=tmp_path, kelvin_fake=True),
        FakeGateway(clock=ManualClock()),
        start_tasks=False,
    )


async def _chunks(total: int, size: int = 16 * 1024):
    for _ in range(0, total, size):
        yield b"x" * size


async def test_an_oversized_content_length_is_refused_before_login_and_header(tmp_path):
    app = _app(tmp_path)
    async with LifespanManager(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
            big = b"x" * (MAX_API_BODY + 1)
            for method, path in (
                ("POST", "/api/auth/login"),  # open route, no X-Kelvin: 403 without the limit
                ("POST", "/api/rooms/x/mode"),  # needs a session: 401/403 without the limit
                ("PUT", "/api/settings"),
            ):
                r = await c.request(method, path, content=big)
                assert r.status_code == 413, path
                assert r.json() == TOO_LARGE
                assert r.headers["connection"] == "close"
                assert r.headers["x-content-type-options"] == "nosniff"  # the security headers


async def test_an_oversized_content_length_is_refused_without_reading_anything():
    reads = 0

    async def inner(scope, receive, send):  # an app that would buffer the body
        raise AssertionError("the app must not run")

    async def receive():
        nonlocal reads
        reads += 1
        return {"type": "http.request", "body": b"x", "more_body": True}

    sent = []

    async def send(message):
        sent.append(message)

    scope = {
        "type": "http",
        "method": "POST",
        "path": "/api/auth/login",
        "headers": [(b"content-length", b"300000000")],
    }
    await BodyLimit(inner)(scope, receive, send)
    assert reads == 0
    assert sent[0]["status"] == 413 and json.loads(sent[1]["body"]) == TOO_LARGE


async def test_a_chunked_body_is_cut_off_at_the_limit(tmp_path):
    app = _app(tmp_path)
    async with LifespanManager(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
            r = await c.post(
                "/api/auth/login", content=_chunks(4 * MAX_API_BODY), headers={"X-Kelvin": "1"}
            )
            assert "content-length" not in r.request.headers  # chunked: no length to refuse on
            assert r.status_code == 413
            assert r.json() == TOO_LARGE


async def test_a_chunked_body_stops_being_read_at_the_limit():
    seen = 0

    async def inner(scope, receive, send):  # reads the whole body, as FastAPI does
        nonlocal seen
        while True:
            message = await receive()
            if message["type"] != "http.request":
                break
            seen += len(message.get("body", b""))
            if not message.get("more_body"):
                break
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"late"})

    async def receive():  # an endless chunked upload
        return {"type": "http.request", "body": b"x" * 65536, "more_body": True}

    sent = []

    async def send(message):
        sent.append(message)

    scope = {"type": "http", "method": "POST", "path": "/api/auth/login", "headers": []}
    await BodyLimit(inner)(scope, receive, send)
    assert seen <= MAX_API_BODY
    assert [m["type"] for m in sent] == ["http.response.start", "http.response.body"]
    assert sent[0]["status"] == 413  # and the app's own late answer is dropped


async def test_a_body_at_the_limit_and_ordinary_requests_pass(tmp_path):
    app = _app(tmp_path)
    async with LifespanManager(app):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://t", headers={"X-Kelvin": "1"}
        ) as c:
            r = await c.post("/api/auth/login", content=b" " * MAX_API_BODY)
            assert r.status_code == 422  # read whole, then refused as JSON
            r = await c.post("/api/auth/login", content=_chunks(MAX_API_BODY))
            assert r.status_code == 422
            await login(c)
            assert (await c.get("/api/health")).json() == {"status": "ok"}
            assert (await c.get("/api/house")).status_code == 200
            # a chunked JSON body below the limit is served like any other
            body = json.dumps(DEMO).encode()

            async def parts():
                yield body[:10]
                yield body[10:]

            r = await c.post("/api/auth/login", content=parts(), headers=JSON)
            assert r.status_code == 200


async def test_the_largest_programme_send_fits_well_inside_the_limit(tmp_path):
    """The biggest body the schemas allow: a week of three slots with the `base` of 50
    radiators. The limit leaves it a wide margin."""
    week = {day: SLOTS for day in DAYS}
    body = {**week, "keep": list(DAYS), "force": False}
    body["base"] = {f"radiator-with-a-long-id-{n:04d}": week for n in range(50)}
    raw = json.dumps(body).encode()
    assert len(raw) < MAX_API_BODY // 2
    app = _app(tmp_path)
    async with LifespanManager(app):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://t", headers={"X-Kelvin": "1"}
        ) as c:
            await login(c)
            r = await c.put("/api/rooms/nope/program", content=raw, headers=JSON)
            assert r.status_code == 404 and r.json()["code"] == "room_unknown"  # parsed whole


async def test_other_paths_are_left_alone(tmp_path):
    """/mcp keeps its own, smaller limit and its own answer; a page is not an API call."""
    async with kelvin_app(tmp_path, sync=False) as (c, app):
        token = (await c.post("/api/mcp/tokens", json={"name": "t"})).json()["secret"]
        assert (await rpc(c, "initialize", INIT, token=token)).status_code == 200
        r = await c.post("/apiary", content=b"x" * (MAX_API_BODY + 1))
        assert r.status_code != 413
