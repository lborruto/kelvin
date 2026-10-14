from pathlib import Path

from kelvin.config import Settings, split_list


def test_settings_read_env(monkeypatch, tmp_path):
    monkeypatch.setenv("COZY_USER", "me@example.fr")
    monkeypatch.setenv("KELVIN_DATA", str(tmp_path))
    monkeypatch.setenv("KELVIN_FAKE", "1")
    s = Settings(_env_file=None)
    assert s.cozy_user == "me@example.fr"
    assert s.kelvin_data == Path(tmp_path)
    assert s.kelvin_fake is True
    assert s.tz == "Europe/Paris"


def test_settings_read_secrets_and_linky_env(monkeypatch, tmp_path):
    monkeypatch.setenv("COZY_PASS", "pw")
    monkeypatch.setenv("MED_PRM", "12345678901234")
    monkeypatch.setenv("MED_TOKEN", "tok-secret-9")
    monkeypatch.setenv("KELVIN_FAKE", "0")
    s = Settings(_env_file=None)
    assert s.cozy_pass.get_secret_value() == "pw" and "pw" not in repr(s)
    assert s.med_prm == "12345678901234"
    assert s.med_token.get_secret_value() == "tok-secret-9" and "tok-secret-9" not in repr(s)
    assert s.med_base_url == "https://www.myelectricaldata.fr"
    assert s.kelvin_fake is False


def test_settings_ignore_a_dotenv_file_in_the_working_directory(monkeypatch, tmp_path):
    """Only the environment configures Kelvin: a stray .env in the CWD must change nothing."""
    (tmp_path / ".env").write_text(
        "KELVIN_FAKE=1\nCOZY_USER=from-file@example.fr\nKELVIN_PORT=9999\n"
    )
    monkeypatch.chdir(tmp_path)
    for name in ("KELVIN_FAKE", "KELVIN_PORT", "COZY_USER", "COZY_PASS", "MED_PRM", "MED_TOKEN"):
        monkeypatch.delenv(name, raising=False)
    s = Settings()
    assert s.kelvin_fake is False
    assert s.cozy_user == ""
    assert s.kelvin_port == 8000


def test_network_settings_default_to_loopback_and_no_proxy(monkeypatch):
    for name in ("KELVIN_HOST", "KELVIN_PORT", "KELVIN_TRUSTED_PROXIES", "KELVIN_ALLOWED_HOSTS"):
        monkeypatch.delenv(name, raising=False)
    s = Settings()
    assert (s.kelvin_host, s.kelvin_port) == ("127.0.0.1", 8000)
    assert s.kelvin_trusted_proxies == ""
    assert s.kelvin_allowed_hosts == ""


def test_network_settings_read_env(monkeypatch):
    monkeypatch.setenv("KELVIN_HOST", "0.0.0.0")
    monkeypatch.setenv("KELVIN_PORT", "8080")
    monkeypatch.setenv("KELVIN_TRUSTED_PROXIES", "172.18.0.2")
    monkeypatch.setenv("KELVIN_ALLOWED_HOSTS", "kelvin.lan")
    s = Settings()
    assert (s.kelvin_host, s.kelvin_port) == ("0.0.0.0", 8080)
    assert s.kelvin_trusted_proxies == "172.18.0.2"
    assert s.kelvin_allowed_hosts == "kelvin.lan"


def test_split_list_drops_blanks():
    assert split_list(" a, b,,c ,") == ["a", "b", "c"]
    assert split_list("") == []
