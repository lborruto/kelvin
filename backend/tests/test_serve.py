import os
import stat

import pytest
import uvicorn
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

from kelvin import serve
from kelvin.config import Settings


def _settings(tmp_path, **kw):
    return Settings(_env_file=None, kelvin_data=tmp_path / "data", kelvin_fake=True, **kw)


@pytest.fixture
def app_env(monkeypatch, tmp_path):
    """What uvicorn's factory call (create_app() → Settings()) reads."""
    monkeypatch.setenv("KELVIN_DATA", str(tmp_path / "data"))
    monkeypatch.setenv("KELVIN_FAKE", "1")
    for name in ("KELVIN_TRUSTED_PROXIES", "KELVIN_ALLOWED_HOSTS", "KELVIN_HOST", "KELVIN_PORT"):
        monkeypatch.delenv(name, raising=False)


def test_defaults_bind_loopback_and_never_trust_forwarded_headers(tmp_path):
    opts = serve.uvicorn_options(_settings(tmp_path))
    assert opts["app"] == "kelvin.api.app:create_app" and opts["factory"] is True
    assert (opts["host"], opts["port"]) == ("127.0.0.1", 8000)
    assert opts["proxy_headers"] is False
    assert "forwarded_allow_ips" not in opts
    assert opts["server_header"] is False


def test_the_loaded_app_has_no_proxy_middleware_even_with_forwarded_allow_ips_star(
    app_env, monkeypatch
):
    monkeypatch.setenv("FORWARDED_ALLOW_IPS", "*")  # uvicorn's own env knob must not matter
    config = uvicorn.Config(**serve.uvicorn_options(Settings()))
    config.load()
    assert not isinstance(config.loaded_app, ProxyHeadersMiddleware)


def test_trusted_proxies_turn_proxy_headers_on_for_those_addresses_only(app_env, tmp_path):
    opts = serve.uvicorn_options(
        _settings(tmp_path, kelvin_trusted_proxies="172.18.0.2, 10.0.0.0/24")
    )
    assert opts["proxy_headers"] is True
    assert opts["forwarded_allow_ips"] == "172.18.0.2,10.0.0.0/24"
    config = uvicorn.Config(**opts)
    config.load()
    assert isinstance(config.loaded_app, ProxyHeadersMiddleware)


@pytest.mark.parametrize(
    "value",
    [
        "*",
        "0.0.0.0/0",
        "::/0",
        "172.18.0.2,*",
        "not-an-ip",
        "0.0.0.0/0 ",
        "::0/0",
        "1.2.3.4/0",
        " * ",
        "a,*",
        "10.0.0.1/24",
        "0.0.0.0/1,128.0.0.0/1",
        "::ffff:0:0/96",
        "::/8",
        "::/1",
    ],
)
def test_wildcard_or_invalid_trusted_proxies_are_refused(tmp_path, value):
    with pytest.raises(serve.ConfigError, match="KELVIN_TRUSTED_PROXIES"):
        serve.uvicorn_options(_settings(tmp_path, kelvin_trusted_proxies=value))


def test_preflight_creates_the_data_dir(tmp_path):
    s = _settings(tmp_path)
    serve.preflight(s)
    assert s.kelvin_data.is_dir()
    assert list(s.kelvin_data.iterdir()) == []  # the write probe leaves nothing behind


@pytest.mark.skipif(os.geteuid() == 0, reason="root writes through any mode")
def test_preflight_refuses_a_read_only_data_dir(tmp_path):
    data = tmp_path / "data"
    data.mkdir()
    data.chmod(0o500)
    try:
        with pytest.raises(serve.ConfigError, match="not writable") as e:
            serve.preflight(_settings(tmp_path))
        # The fix for a volume or bind mount created by someone else: hand it to uid 10001.
        assert "chown -R 10001:10001 /data" in str(e.value)
        assert "named Docker volume" not in str(e.value)
    finally:
        data.chmod(0o700)


def test_preflight_reports_an_unreadable_account_file_without_its_content(tmp_path):
    data = tmp_path / "data"
    data.mkdir()
    (data / "account.json").write_text('{"email": "me@example.fr", "password": "Sup3r')
    with pytest.raises(serve.ConfigError) as e:
        serve.preflight(_settings(tmp_path))
    assert "account.json" in str(e.value)
    assert "Sup3r" not in str(e.value) and "me@example.fr" not in str(e.value)


def test_main_prints_the_problem_and_exits_2(app_env, monkeypatch, capsys):
    monkeypatch.setenv("KELVIN_TRUSTED_PROXIES", "*")
    called = []
    monkeypatch.setattr(serve.uvicorn, "run", lambda **kw: called.append(kw))
    old = os.umask(0o022)
    try:
        assert serve.main() == 2
    finally:
        os.umask(old)
    assert called == []
    err = capsys.readouterr().err
    assert err.startswith("kelvin: ") and "KELVIN_TRUSTED_PROXIES" in err


def test_main_runs_uvicorn_with_a_private_umask(app_env, monkeypatch, tmp_path):
    seen = {}

    def fake_run(**kw):
        seen.update(kw)
        probe = tmp_path / "data" / "probe"
        probe.write_text("x")
        seen["mode"] = stat.S_IMODE(probe.stat().st_mode)

    monkeypatch.setattr(serve.uvicorn, "run", fake_run)
    old = os.umask(0o022)
    try:
        assert serve.main() == 0
    finally:
        os.umask(old)
    assert seen["mode"] == 0o600
    assert seen["proxy_headers"] is False and seen["factory"] is True


@pytest.mark.skipif(os.geteuid() == 0, reason="root reads through any mode")
def test_preflight_reports_an_unreadable_account_file_by_name_and_error_type(tmp_path):
    data = tmp_path / "data"
    data.mkdir()
    account = data / "account.json"
    account.write_text('{"email": "me@example.fr"}')
    account.chmod(0o000)
    try:
        with pytest.raises(serve.ConfigError) as e:
            serve.preflight(_settings(tmp_path))
    finally:
        account.chmod(0o600)
    assert "account.json" in str(e.value) and "PermissionError" in str(e.value)
    assert "me@example.fr" not in str(e.value)


def test_a_network_is_trusted_by_uvicorn_exactly_as_kelvin_accepted_it(tmp_path):
    from uvicorn.middleware.proxy_headers import _TrustedHosts

    opts = serve.uvicorn_options(_settings(tmp_path, kelvin_trusted_proxies="10.0.0.0/24"))
    trusted = _TrustedHosts(opts["forwarded_allow_ips"])
    assert trusted.__contains__("10.0.0.5") and not trusted.__contains__("10.0.1.5")
