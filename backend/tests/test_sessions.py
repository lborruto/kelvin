import hashlib

import pytest

from kelvin.auth.sessions import (
    SESSION_ID,
    SESSION_TTL_S,
    TOUCH_EVERY_S,
    SessionIsCurrent,
    SessionStore,
    ua_summary,
)
from kelvin.recorder.db import Database
from tests.conftest import ManualClock


def _store():
    clock = ManualClock(1_700_000_000.0)
    return SessionStore(Database(":memory:"), wall=clock), clock


def test_create_stores_only_a_hash():
    store, _ = _store()
    token = store.create("Mozilla/5.0")
    assert len(token) >= 43  # 32 random bytes, url-safe base64
    rows = store.db.query("SELECT hash, user_agent FROM sessions")
    assert rows == [
        {"hash": hashlib.sha256(token.encode()).hexdigest(), "user_agent": "Mozilla/5.0"}
    ]
    dump = "\n".join(store.db.conn.iterdump())
    assert token not in dump


def test_validate_and_delete():
    store, _ = _store()
    token = store.create(None)
    assert store.validate(token) is True
    assert store.validate("nope") is False
    assert store.validate(None) is False and store.validate("") is False
    store.delete(token)
    assert store.validate(token) is False
    store.delete(None)  # no-op


def test_sliding_expiry_after_a_year_of_silence():
    store, clock = _store()
    token = store.create(None)
    clock.advance(SESSION_TTL_S - 10)
    assert store.validate(token) is True  # used: last_seen slides
    clock.advance(SESSION_TTL_S - 10)
    assert store.validate(token) is True
    clock.advance(SESSION_TTL_S + 1)
    assert store.validate(token) is False
    assert store.count() == 0  # the expired row is gone


def test_last_seen_is_written_at_most_every_ten_minutes():
    store, clock = _store()
    token = store.create(None)
    first = store.db.query("SELECT last_seen FROM sessions")[0]["last_seen"]
    clock.advance(TOUCH_EVERY_S - 1)
    store.validate(token)
    assert store.db.query("SELECT last_seen FROM sessions")[0]["last_seen"] == first
    clock.advance(2)
    store.validate(token)
    assert store.db.query("SELECT last_seen FROM sessions")[0]["last_seen"] == clock()


def test_user_agent_is_truncated_and_prune_removes_old_rows():
    store, clock = _store()
    store.create("x" * 1000)
    assert len(store.db.query("SELECT user_agent FROM sessions")[0]["user_agent"]) == 200
    clock.advance(SESSION_TTL_S + 1)
    assert store.prune() == 1


IPHONE = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15"
    " (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
)
LINUX_FF = "Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0"
WIN_EDGE = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)"
    " Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0"
)
ANDROID_CHROME = (
    "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko)"
    " Chrome/129.0.0.0 Mobile Safari/537.36"
)


@pytest.mark.parametrize(
    ("ua", "expected"),
    [
        (IPHONE, ("Safari", "iPhone")),
        (LINUX_FF, ("Firefox", "Linux")),
        (WIN_EDGE, ("Edge", "Windows")),
        (ANDROID_CHROME, ("Chrome", "Android")),
        ("curl/8.0", (None, None)),
        ("", (None, None)),
        (None, (None, None)),
    ],
)
def test_ua_summary(ua, expected):
    assert ua_summary(ua) == expected


def test_list_marks_the_current_session_and_never_returns_hash_or_ua():
    store, clock = _store()
    a = store.create(IPHONE)
    clock.advance(60)
    b = store.create(LINUX_FF)
    rows = store.listing(b)
    assert [(r["browser"], r["os"], r["current"]) for r in rows] == [
        ("Firefox", "Linux", True),
        ("Safari", "iPhone", False),
    ]
    assert set(rows[0]) == {"id", "created", "last_seen", "browser", "os", "current"}
    assert all(SESSION_ID.fullmatch(r["id"]) for r in rows)
    assert store.validate(a)


def test_revoke_and_revoke_others():
    store, _ = _store()
    a, b, c = store.create(IPHONE), store.create(LINUX_FF), store.create(WIN_EDGE)
    me = next(r["id"] for r in store.listing(a) if r["current"])
    with pytest.raises(SessionIsCurrent):
        store.revoke(me, a)
    other = next(r["id"] for r in store.listing(a) if r["os"] == "Linux")
    assert store.revoke(other, a) is True
    assert store.validate(b) is False
    assert store.revoke(other, a) is False  # already gone
    assert store.revoke_others(a) == 1
    assert store.validate(c) is False and store.validate(a) is True


def test_ids_are_opaque_and_unrelated_to_the_token():
    store, _ = _store()
    token = store.create(None)
    sid = store.listing(token)[0]["id"]
    assert sid not in token and sid not in hashlib.sha256(token.encode()).hexdigest()


def test_revoke_others_without_a_session_revokes_nothing():
    store, _ = _store()
    store.create(IPHONE)
    assert store.revoke_others(None) == 0 and store.revoke_others("") == 0
    assert store.count() == 1
