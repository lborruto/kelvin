"""MCP tokens (spec MCP §5.1): a secret shown once, only its SHA-256 stored."""

import hashlib
import re

import pytest

from kelvin.errors import UserError
from kelvin.mcp.tokens import MAX_LIVE, McpTokenStore
from kelvin.recorder.db import SCHEMA_VERSION, SCHEMA_VERSION_KEY, Database
from tests.conftest import ManualClock


def test_v4_creates_the_mcp_tables(tmp_path):
    db = Database(tmp_path / "k.db")
    tokens = {r["name"] for r in db.query("PRAGMA table_info(mcp_tokens)")}
    audit = {r["name"] for r in db.query("PRAGMA table_info(mcp_audit)")}
    assert tokens == {"id", "name", "hash", "hint", "scope", "created", "last_used", "revoked_at"}
    assert audit == {
        "id",
        "ts",
        "token_id",
        "kind",
        "name",
        "args",
        "outcome",
        "error_code",
        "duration_ms",
    }
    assert db.get_setting(SCHEMA_VERSION_KEY) == SCHEMA_VERSION >= 4
    db.close()
    again = Database(tmp_path / "k.db")  # idempotent
    assert again.get_setting(SCHEMA_VERSION_KEY) == SCHEMA_VERSION
    again.close()


@pytest.fixture
def store(tmp_path):
    db = Database(tmp_path / "k.db")
    yield McpTokenStore(db, wall=ManualClock(1_000_000.0)), db
    db.close()


def test_a_token_is_shown_once_and_only_its_hash_is_stored(store):
    s, db = store
    view, secret = s.create("  Claude Desktop ")
    assert re.fullmatch(r"kmcp_[A-Za-z0-9_-]{43}", secret)
    assert view == {
        "id": view["id"],
        "name": "Claude Desktop",
        "hint": secret[-4:],
        "scope": "read",
        "created": 1_000_000.0,
        "last_used": None,
        "revoked_at": None,
    }
    assert re.fullmatch(r"[0-9a-f]{16}", view["id"])
    row = db.query("SELECT * FROM mcp_tokens")[0]
    assert row["hash"] == hashlib.sha256(secret.encode()).hexdigest()
    assert secret not in str(row) and secret not in str(s.listing())
    assert view["id"] not in row["hash"]  # the id is random, never derived from the secret


def test_verify_accepts_the_secret_and_nothing_else(store):
    s, _ = store
    view, secret = s.create("Claude")
    assert s.verify(secret).id == view["id"]
    flipped = secret[:-1] + ("A" if secret[-1] != "A" else "B")
    for bad in (None, "", "kmcp_", flipped, secret + "x", "Bearer " + secret, secret.upper()):
        assert s.verify(bad) is None, bad


def test_revocation_is_immediate_and_kept_for_90_days(store):
    s, db = store
    view, secret = s.create("Claude")
    assert s.revoke(view["id"]) is True
    assert s.verify(secret) is None
    assert s.revoke(view["id"]) is False  # already revoked
    assert s.revoke("nope") is False and s.revoke("0" * 16) is False
    assert s.listing()[0]["revoked_at"] == 1_000_000.0
    s.wall.advance(90 * 86400 + 1)
    assert s.prune() == 1 and s.listing() == []


def test_names_and_limits(store):
    s, _ = store
    for bad in ("", "   ", "x" * 41, "a\nb", "zero​width"):
        with pytest.raises(UserError) as e:
            s.create(bad)
        assert e.value.code == "mcp_token_name_invalid" and e.value.params == {"max": 40}
    views = [s.create(f"t{i}")[0] for i in range(MAX_LIVE)]
    with pytest.raises(UserError) as e:
        s.create("one more")
    assert (e.value.code, e.value.status, e.value.params) == ("mcp_token_limit", 409, {"max": 10})
    s.revoke(views[0]["id"])
    assert s.create("one more")[0]["name"] == "one more"  # a revoked token frees a place


def test_last_used_is_written_at_most_once_a_minute(store):
    s, _ = store
    view, _ = s.create("Claude")
    s.touch(view["id"])
    assert s.listing()[0]["last_used"] == 1_000_000.0
    s.wall.advance(30)
    s.touch(view["id"])
    assert s.listing()[0]["last_used"] == 1_000_000.0
    s.wall.advance(31)
    s.touch(view["id"])
    assert s.listing()[0]["last_used"] == 1_000_061.0


def test_listing_is_newest_first_and_names_map_ids(store):
    s, _ = store
    a, _ = s.create("A")
    s.wall.advance(1)
    b, _ = s.create("B")
    assert [t["name"] for t in s.listing()] == ["B", "A"]
    assert s.names() == {a["id"]: "A", b["id"]: "B"}
