import asyncio

from asgi_lifespan import LifespanManager
from httpx import ASGITransport, AsyncClient

from kelvin.api.app import create_app
from kelvin.api.headers import SECURITY_HEADERS
from kelvin.config import Settings
from kelvin.overkiz.fake import FakeGateway
from tests.conftest import err, login


def _app(tmp_path, with_web: bool):
    web = tmp_path / "web"
    (web / "_app" / "immutable").mkdir(parents=True)
    (web / "index.html").write_text("<html>kelvin-index</html>")
    (web / "_app" / "immutable" / "app.js").write_text("console.log(1)")
    (tmp_path / "secret.txt").write_text("secret")
    settings = Settings(
        _env_file=None,
        kelvin_data=tmp_path / "data",
        kelvin_fake=True,
        kelvin_web=web if with_web else None,
    )
    return create_app(settings, FakeGateway(), start_tasks=False)


async def test_spa_serves_index_assets_and_keeps_api(tmp_path):
    app = _app(tmp_path, with_web=True)
    async with LifespanManager(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
            assert "kelvin-index" in (await c.get("/")).text
            assert "kelvin-index" in (await c.get("/rooms/p-salon")).text
            # Old French bookmarks get the shell too: its pre-boot script rewrites them.
            for legacy in ("/maison", "/pieces/p-salon", "/energie"):  # legacy-path-test
                assert "kelvin-index" in (await c.get(legacy)).text, legacy
            asset = await c.get("/_app/immutable/app.js")
            assert asset.text == "console.log(1)"
            assert "immutable" in asset.headers["cache-control"]
            traversal = await c.get("/%2e%2e/secret.txt")
            assert "secret" not in traversal.text
            assert (await c.get("/api/nope")).status_code == 404
            assert (await c.get("/api/health")).json()["status"] == "setup"
            for path in ("/mcp/x", "/.well-known/x"):  # never the SPA shell (Plan 13)
                r = await c.get(path)
                assert r.status_code == 404 and r.json() == err("not_found"), path


async def test_no_web_dir_means_no_catch_all(tmp_path):
    app = _app(tmp_path, with_web=False)
    async with LifespanManager(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
            assert (await c.get("/")).status_code == 404


async def test_spa_catch_all_edges(tmp_path):
    app = _app(tmp_path, with_web=True)
    (tmp_path / "web" / "leak").symlink_to(tmp_path / "secret.txt")
    async with LifespanManager(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
            for method in ("POST", "PUT", "PATCH", "DELETE"):
                r = await c.request(method, "/api/unknown", headers={"X-Kelvin": "1"})
                assert r.status_code == 404, method
                assert r.json() == err("not_found")
            assert (await c.post("/rooms/p-salon")).status_code == 405
            assert (await c.get("/a%00b")).status_code == 404
            leak = await c.get("/leak")  # a symlink out of the build serves the index instead
            assert leak.status_code == 200 and "kelvin-index" in leak.text
            assert "secret" not in leak.text
            traversal = await c.get("/%2e%2e/secret.txt")
            assert "kelvin-index" in traversal.text and "secret" not in traversal.text
            head = await c.head("/_app/immutable/app.js")
            assert head.status_code == 200 and head.content == b""
            assert "immutable" in head.headers["cache-control"]
            assert (await c.head("/")).status_code == 200


async def test_every_response_carries_the_security_headers(tmp_path):
    app = _app(tmp_path, with_web=True)
    async with LifespanManager(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
            for path in ("/", "/_app/immutable/app.js", "/api/health", "/api/house", "/api/nope"):
                r = await c.get(path)
                for name, value in SECURITY_HEADERS:
                    assert r.headers[name.decode()] == value.decode(), (path, name)


async def test_allowed_hosts_refuse_other_host_headers_but_keep_localhost(tmp_path):
    settings = Settings(
        _env_file=None,
        kelvin_data=tmp_path / "data",
        kelvin_fake=True,
        kelvin_allowed_hosts="kelvin.lan, 192.168.1.10",
    )
    app = create_app(settings, FakeGateway(), start_tasks=False)
    async with LifespanManager(app):
        for host, code in (
            ("kelvin.lan", 200),
            ("192.168.1.10:8070", 200),
            ("127.0.0.1:8080", 200),
            ("localhost", 200),
            ("evil.example", 400),
        ):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url=f"http://{host}"
            ) as c:
                r = await c.get("/api/health")
                assert r.status_code == code, host
                if code == 400:  # the refusal carries the security headers too
                    for name, value in SECURITY_HEADERS:
                        assert r.headers[name.decode()] == value.decode(), name


async def test_without_allowed_hosts_any_host_is_served(tmp_path):
    app = _app(tmp_path, with_web=False)
    async with LifespanManager(app):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://whatever.example"
        ) as c:
            assert (await c.get("/api/health")).status_code == 200


async def test_a_non_loopback_host_without_an_allowlist_warns_once(tmp_path, caplog):
    app = _app(tmp_path, with_web=False)
    async with LifespanManager(app):
        for host in ("localhost:8070", "127.0.0.1", "[::1]:8070"):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url=f"http://{host}"
            ) as c:
                await c.get("/api/health")
        assert "KELVIN_ALLOWED_HOSTS" not in caplog.text
        for host in ("kelvin.lan:8070", "192.168.1.10"):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url=f"http://{host}"
            ) as c:
                assert (await c.get("/api/health")).status_code == 200
    warnings = [r for r in caplog.records if "KELVIN_ALLOWED_HOSTS" in r.getMessage()]
    assert len(warnings) == 1 and warnings[0].levelname == "WARNING"
    assert "claim the home" in warnings[0].getMessage()


async def test_an_allowlist_never_warns_about_exposure(tmp_path, caplog):
    settings = Settings(
        _env_file=None,
        kelvin_data=tmp_path / "data",
        kelvin_fake=True,
        kelvin_allowed_hosts="kelvin.lan",
    )
    app = create_app(settings, FakeGateway(), start_tasks=False)
    async with LifespanManager(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://kelvin.lan") as c:
            await c.get("/api/health")
    assert "claim the home" not in caplog.text


def _assert_headers(r, label):
    for name, value in SECURITY_HEADERS:
        assert r.headers[name.decode()] == value.decode(), (label, name)


async def test_security_headers_on_errors_and_authenticated_answers(tmp_path):
    app = _app(tmp_path, with_web=True)
    async with LifespanManager(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
            r = await c.post("/api/auth/login", json={"email": "x@y.z", "password": "p"})
            assert r.status_code == 403  # no X-Kelvin
            _assert_headers(r, "403")
            r = await c.post("/rooms/p-salon")
            assert r.status_code == 405
            _assert_headers(r, "405")
            r = await c.post("/api/auth/login", json={}, headers={"X-Kelvin": "1"})
            assert r.status_code == 422
            _assert_headers(r, "422")
            await login(c)
            r = await c.get("/api/house")
            assert r.status_code == 200
            _assert_headers(r, "house")


async def test_security_headers_on_the_sse_response_start(tmp_path):
    app = _app(tmp_path, with_web=False)
    async with LifespanManager(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
            await login(c)
            cookie = "; ".join(f"{k}={v}" for k, v in c.cookies.items())
        started: list[dict] = []
        got_start = asyncio.Event()

        async def receive():
            await got_start.wait()
            return {"type": "http.disconnect"}

        async def send(message):
            if message["type"] == "http.response.start":
                started.append(message)
                got_start.set()

        scope = {
            "type": "http",
            "asgi": {"version": "3.0"},
            "http_version": "1.1",
            "method": "GET",
            "scheme": "http",
            "path": "/api/stream",
            "raw_path": b"/api/stream",
            "query_string": b"",
            "root_path": "",
            "headers": [(b"host", b"t"), (b"cookie", cookie.encode())],
            "client": ("127.0.0.1", 1),
            "server": ("t", 80),
        }
        await asyncio.wait_for(app(scope, receive, send), 5)
        assert started and started[0]["status"] == 200
        names = {n: v for n, v in started[0]["headers"]}
        for name, value in SECURITY_HEADERS:
            assert names[name] == value


async def test_unhandled_exception_500_carries_the_security_headers(tmp_path):
    app = _app(tmp_path, with_web=False)

    @app.get("/boom")
    async def boom():
        raise RuntimeError("boom")

    async with LifespanManager(app):
        transport = ASGITransport(app=app, raise_app_exceptions=False)
        async with AsyncClient(transport=transport, base_url="http://t") as c:
            r = await c.get("/boom")
            assert r.status_code == 500
            _assert_headers(r, "500")


async def test_more_traversal_variants_and_a_wrong_method_on_a_real_api_route(tmp_path):
    app = _app(tmp_path, with_web=True)
    (tmp_path / "web" / "dirleak").symlink_to(tmp_path)  # a directory link out of the build
    async with LifespanManager(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
            for path in ("/..%2fsecret.txt", "/%2e%2e%2fsecret.txt", "/dirleak/secret.txt"):
                r = await c.get(path)
                assert "kelvin-index" in r.text and "secret" not in r.text, path
            # The catch-all owns every method, so a wrong method on a real route is a 404.
            r = await c.delete("/api/health", headers={"X-Kelvin": "1"})
            assert r.status_code == 404
            assert r.json() == err("not_found")


async def test_precompressed_assets_follow_accept_encoding(tmp_path):
    app = _app(tmp_path, with_web=True)
    imm = tmp_path / "web" / "_app" / "immutable"
    (imm / "app.js.br").write_bytes(b"BR")
    (imm / "app.js.gz").write_bytes(b"GZ")
    async with LifespanManager(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
            # Raw bodies: the stand-in files are not real archives, so nothing may decode them.
            async def raw(accept: str):
                url = "/_app/immutable/app.js"
                req = c.build_request("GET", url, headers={"Accept-Encoding": accept})
                res = await c.send(req, stream=True)
                body = b"".join([chunk async for chunk in res.aiter_raw()])
                await res.aclose()
                return res, body

            br, body = await raw("gzip, br")
            assert (br.headers["content-encoding"], body) == ("br", b"BR")
            assert br.headers["content-type"].startswith("text/javascript")
            assert br.headers["vary"] == "Accept-Encoding"
            assert "immutable" in br.headers["cache-control"]
            gz, body = await raw("gzip, br;q=0")
            assert (gz.headers["content-encoding"], body) == ("gzip", b"GZ")
            plain = await c.get("/_app/immutable/app.js", headers={"Accept-Encoding": "identity"})
            assert "content-encoding" not in plain.headers
            assert plain.text == "console.log(1)"
            # Without a compressed copy the file itself is sent.
            index = await c.get("/", headers={"Accept-Encoding": "br"})
            assert index.text == "<html>kelvin-index</html>"


async def test_accept_encoding_q_values_and_packed_files(tmp_path):
    app = _app(tmp_path, with_web=True)
    imm = tmp_path / "web" / "_app" / "immutable"
    (imm / "app.js.br").write_bytes(b"BR")
    async with LifespanManager(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
            for refused in ("BR;Q=0", "br;q=0.000", "br; q=0"):
                r = await c.get("/_app/immutable/app.js", headers={"Accept-Encoding": refused})
                assert "content-encoding" not in r.headers, refused
            assert (await c.get("/_app/immutable/app.js.br")).status_code == 404
