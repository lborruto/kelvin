import os
import stat

import pytest
import uvicorn
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

from kelvin import serve
from kelvin.account import Account, AccountStore
from kelvin.api.runtime import SERVER_KEY
from kelvin.config import Settings
from kelvin.overkiz.simhistory import SIM_DB_KEY
from kelvin.recorder.db import Database


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


# Plan 12: a data folder bound to another Overkiz server stops the start with one clean line.


def _held_by(data, server):
    data.mkdir(exist_ok=True)
    db = Database(data / "kelvin.db")
    db.set_setting(SERVER_KEY, server)
    db.close()


def test_preflight_refuses_a_data_folder_of_another_server_with_a_clean_message(tmp_path):
    data = tmp_path / "data"
    _held_by(data, "sauter_cozytouch")
    AccountStore(data).save(Account("me@example.fr", "Sup3r-1", server="thermor_cozytouch"))
    with pytest.raises(serve.ConfigError) as e:
        serve.preflight(_settings(tmp_path))
    message = str(e.value)
    assert "Sauter Cozytouch" in message and "Thermor Cozytouch" in message
    assert "KELVIN_DATA" in message
    assert "me@example.fr" not in message and "Sup3r" not in message


def test_preflight_refuses_an_env_bootstrap_on_another_servers_data(tmp_path):
    """Without this check the env would create account.json on the other server and every boot
    would then stop on it (batch 2 review, minor 2)."""
    data = tmp_path / "data"
    _held_by(data, "thermor_cozytouch")
    s = _settings(tmp_path, cozy_user="me@example.fr", cozy_pass="Sup3r-1", cozy_server="flexom")
    with pytest.raises(serve.ConfigError) as e:
        serve.preflight(s)
    assert "Thermor Cozytouch" in str(e.value) and "Flexom" in str(e.value)
    assert not (data / "account.json").exists()


def test_preflight_accepts_a_matching_server_and_a_home_not_claimed_yet(tmp_path):
    data = tmp_path / "data"
    _held_by(data, "thermor_cozytouch")
    serve.preflight(_settings(tmp_path))  # no account yet: the login decides (data_other_server)
    AccountStore(data).save(Account("me@example.fr", "Sup3r-1", server="thermor_cozytouch"))
    serve.preflight(_settings(tmp_path))


@pytest.mark.parametrize("host", ["127.0.0.1", "localhost", "::1", "127.0.0.2"])
def test_no_exposure_warning_on_loopback(tmp_path, host):
    assert serve.exposure_warning(_settings(tmp_path, kelvin_host=host)) is None


def test_listening_beyond_loopback_without_allowed_hosts_warns(tmp_path):
    warning = serve.exposure_warning(_settings(tmp_path, kelvin_host="0.0.0.0"))
    assert warning and warning.startswith("WARNING:")
    assert "claim the home" in warning and "KELVIN_ALLOWED_HOSTS" in warning
    assert (
        serve.exposure_warning(
            _settings(tmp_path, kelvin_host="0.0.0.0", kelvin_allowed_hosts="kelvin.lan")
        )
        is None
    )


def test_main_prints_the_exposure_warning_and_still_starts(app_env, monkeypatch, capsys):
    monkeypatch.setenv("KELVIN_HOST", "0.0.0.0")
    called = []
    monkeypatch.setattr(serve.uvicorn, "run", lambda **kw: called.append(kw))
    assert serve.main() == 0
    assert called and called[0]["host"] == "0.0.0.0"
    err = capsys.readouterr().err
    assert err.startswith("kelvin: WARNING:") and "KELVIN_ALLOWED_HOSTS" in err


def test_preflight_refuses_the_simulator_on_a_real_homes_data(tmp_path):
    data = tmp_path / "data"
    data.mkdir()
    db = Database(data / "kelvin.db")
    db.conn.execute("INSERT INTO energy VALUES (?,?,?,?,?)", (1_700_000_000, "r1", 1.0, None, None))
    db.conn.commit()
    db.close()
    with pytest.raises(serve.ConfigError) as e:
        serve.preflight(_settings(tmp_path))
    assert "simulator" in str(e.value) and "KELVIN_VOLUME" in str(e.value)
    serve.preflight(Settings(_env_file=None, kelvin_data=data))  # a real start: fine
    db = Database(data / "kelvin.db")
    db.set_setting(SIM_DB_KEY, True)
    db.close()
    serve.preflight(_settings(tmp_path))  # the simulator's own data: fine
