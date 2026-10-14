import json
import logging
import os
import stat

import pytest

from kelvin.account import (
    Account,
    AccountFileError,
    AccountStore,
    bootstrap_account,
    linky_credentials,
)
from kelvin.config import Settings


def _settings(tmp_path, **kw):
    return Settings(_env_file=None, kelvin_data=tmp_path, **kw)


def _mode(path):
    return stat.S_IMODE(path.stat().st_mode)


def test_save_and_load_round_trip_with_mode_600(tmp_path):
    store = AccountStore(tmp_path)
    acc = Account("me@example.fr", "pw-1", med_prm="12345678901234", med_token="tok-abcdefgh")
    store.save(acc)
    assert store.path == tmp_path / "account.json"
    assert _mode(store.path) == 0o600
    assert store.load() == acc
    assert json.loads(store.path.read_text())["linky"] == {
        "prm": "12345678901234",
        "token": "tok-abcdefgh",
    }
    assert [p.name for p in tmp_path.iterdir()] == ["account.json"]  # no temp file left


def test_load_resets_a_too_open_mode(tmp_path, caplog):
    store = AccountStore(tmp_path)
    store.save(Account("me@example.fr", "pw-1"))
    os.chmod(store.path, 0o644)
    with caplog.at_level(logging.WARNING):
        assert store.load() == Account("me@example.fr", "pw-1")
    assert _mode(store.path) == 0o600
    assert "pw-1" not in caplog.text


def test_repr_hides_secrets():
    acc = Account("me@example.fr", "pw-1", med_prm="12345678901234", med_token="tok-abcdefgh")
    for text in (repr(acc), str(acc), f"{acc}"):
        assert "pw-1" not in text and "tok-abcdefgh" not in text and "me@example.fr" not in text


def test_same_email_is_case_insensitive():
    acc = Account("Me@Example.fr", "x")
    assert acc.same_email(" me@example.FR ")
    assert not acc.same_email("other@example.fr")


def test_bootstrap_setup_mode_without_file_or_env(tmp_path):
    store = AccountStore(tmp_path)
    assert bootstrap_account(_settings(tmp_path), store) is None
    assert not store.path.exists()


def test_bootstrap_creates_the_file_from_env(tmp_path):
    store = AccountStore(tmp_path)
    s = _settings(tmp_path, cozy_user=" me@example.fr ", cozy_pass="pw-env")
    acc = bootstrap_account(s, store)
    assert acc == Account("me@example.fr", "pw-env")
    assert store.load() == acc and _mode(store.path) == 0o600


def test_bootstrap_file_wins_over_env(tmp_path):
    store = AccountStore(tmp_path)
    store.save(Account("file@example.fr", "pw-file"))
    s = _settings(tmp_path, cozy_user="env@example.fr", cozy_pass="pw-env")
    assert bootstrap_account(s, store) == Account("file@example.fr", "pw-file")


def test_linky_credentials_prefer_the_account_then_env(tmp_path):
    s = _settings(tmp_path, med_prm="11111111111111", med_token="env-token-123")
    acc = Account("me@example.fr", "x", med_prm="22222222222222", med_token="file-token-1")
    assert linky_credentials(acc, s) == ("22222222222222", "file-token-1")
    assert linky_credentials(Account("me@example.fr", "x"), s) == (
        "11111111111111",
        "env-token-123",
    )
    assert linky_credentials(None, _settings(tmp_path)) is None


@pytest.mark.parametrize(
    "raw",
    [
        b'{"email": "me@example.fr", "password": "Sup3r',  # truncated by a full disk
        b"[]",
        b'{"email": "me@example.fr"}',
        b'{"email": "me@example.fr", "password": "Sup3r-1", "linky": "tok"}',
        b"\xff\xfe\x00Sup3r",
    ],
)
def test_an_unreadable_account_file_is_a_clear_error_without_its_content(tmp_path, raw):
    store = AccountStore(tmp_path)
    store.path.write_bytes(raw)
    os.chmod(store.path, 0o600)
    with pytest.raises(AccountFileError) as e:
        store.load()
    message = str(e.value)
    assert str(store.path) in message and "delete it" in message
    assert "Sup3r" not in message and "me@example.fr" not in message
    # No chained parser error: its text could quote the file in a traceback.
    assert e.value.__cause__ is None and e.value.__suppress_context__
