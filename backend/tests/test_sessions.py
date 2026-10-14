import hashlib

from kelvin.auth.sessions import SESSION_TTL_S, TOUCH_EVERY_S, SessionStore
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
