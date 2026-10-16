"""The MCP audit log (spec MCP §5.3)."""

import json

import pytest

from kelvin.mcp import audit as audit_mod
from kelvin.mcp.audit import MAX_ROWS, McpAudit, sanitise
from kelvin.recorder.db import Database
from tests.conftest import ManualClock


@pytest.fixture
def audit(tmp_path):
    db = Database(tmp_path / "k.db")
    yield McpAudit(db, wall=ManualClock(2_000_000.0)), db
    db.close()


def test_args_are_sanitised():
    out = json.loads(
        sanitise(
            {
                "room_id": "p-salon",
                "token": "kmcp_x",
                "Authorization": "Bearer x",
                "prm": "12345678901234",
                "email": "a@b.fr",
                "note": "x" * 200,
                "week": {"monday": ["06:00-08:00"] * 30},
            }
        )
    )
    assert "token" not in out and "Authorization" not in out and "prm" not in out
    assert "email" not in out
    assert out["room_id"] == "p-salon"
    assert len(out["note"]) == 64
    assert len(out["week"]["monday"]) == 20
    assert len(sanitise({"a": "y" * 64, "b": ["z" * 64] * 20})) <= 500


def test_record_and_recent_with_token_names(audit):
    a, _ = audit
    a.record(
        token_id="t1",
        kind="tool",
        name="get_energy",
        args={"group": "month"},
        outcome="ok",
        duration_ms=12,
    )
    a.wall.advance(1)
    a.record(
        token_id=None,
        kind="auth",
        name="authenticate",
        args={},
        outcome="denied",
        error_code="invalid_token",
    )
    rows = a.recent(10, {"t1": "Claude"})
    assert rows == [
        {
            "at": 2_000_001.0,
            "token_name": None,
            "kind": "auth",
            "name": "authenticate",
            "outcome": "denied",
            "error_code": "invalid_token",
            "duration_ms": 0,
        },
        {
            "at": 2_000_000.0,
            "token_name": "Claude",
            "kind": "tool",
            "name": "get_energy",
            "outcome": "ok",
            "error_code": None,
            "duration_ms": 12,
        },
    ]
    assert len(a.recent(1, {})) == 1


def test_retention_and_cap(audit):
    a, db = audit
    a.record(token_id="t", kind="tool", name="old", args={}, outcome="ok")
    a.wall.advance(91 * 86400)
    rows = [(a.wall(), "t", "tool", "x", "{}", "ok", None, 0)] * (MAX_ROWS + 10)
    db.executemany(
        "INSERT INTO mcp_audit (ts, token_id, kind, name, args, outcome, error_code, duration_ms)"
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        rows,
    )
    a.prune()
    names = {r["name"] for r in db.query("SELECT DISTINCT name FROM mcp_audit")}
    assert "old" not in names
    assert db.query("SELECT COUNT(*) AS n FROM mcp_audit")[0]["n"] == MAX_ROWS


def test_a_flooding_token_never_evicts_the_others(audit, monkeypatch):
    """Security review: a valid token at its rate limit for hours fills the cap with its own rows;
    pruning takes the heaviest token's oldest rows first and keeps every token (and the refused
    authentications) at least KEEP_PER_TOKEN recent rows."""
    a, db = audit
    monkeypatch.setattr(audit_mod, "MAX_ROWS", 300)
    monkeypatch.setattr(audit_mod, "KEEP_PER_TOKEN", 50)
    for i in range(20):
        a.record(token_id="quiet", kind="tool", name=f"q{i}", args={}, outcome="ok")
    for i in range(80):
        a.record(token_id="busy", kind="tool", name=f"b{i}", args={}, outcome="ok")
    for _ in range(5):
        a.record(token_id=None, kind="auth", name="authenticate", args={}, outcome="denied")
    for _ in range(3 * 1000):  # 1 000 calls an hour (the hour limit) for 3 hours
        a.wall.advance(3.6)
        a.record(token_id="flood", kind="tool", name="get_energy", args={}, outcome="ok")
    a.prune()

    def count(where: str, *args) -> int:
        return db.query(f"SELECT COUNT(*) AS n FROM mcp_audit WHERE {where}", args)[0]["n"]

    assert count("1") <= 300
    assert count("token_id = ?", "quiet") == 20  # under the floor: untouched
    assert count("token_id = ?", "busy") >= 50
    assert {r["name"] for r in db.query("SELECT name FROM mcp_audit WHERE token_id = 'busy'")} >= {
        f"b{i}" for i in range(30, 80)
    }  # its newest rows are the ones kept
    assert count("token_id IS NULL") == 5
    assert count("token_id = ?", "flood") > 0  # the flood keeps its newest rows too
