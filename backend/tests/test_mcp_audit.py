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
            "count": 1,
        },
        {
            "at": 2_000_000.0,
            "token_name": "Claude",
            "kind": "tool",
            "name": "get_energy",
            "outcome": "ok",
            "error_code": None,
            "duration_ms": 12,
            "count": 1,
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


def _args(db, where: str = "kind = 'auth'") -> list[dict]:
    return [
        json.loads(r["args"])
        for r in db.query(f"SELECT args FROM mcp_audit WHERE {where} ORDER BY id")
    ]


def test_refusals_aggregate_into_one_counted_row_per_window(audit):
    """Security review (suppression): nothing is dropped and nothing floods. 300 throttled calls in
    a minute are one row with count 300, first and last seen; the next window opens a new row."""
    a, db = audit
    for _ in range(300):
        a.refusal(
            token_id="t1",
            name="rate_limit",
            outcome="rate_limited",
            error_code="rate_limited",
            source="10.0.0.2",
        )
        a.wall.advance(0.1)
    a.flush()
    (row,) = _args(db)
    assert row["count"] == 300 and row["sources"] == 1
    assert row["first_seen_at"] == 2_000_000.0 and row["last_seen_at"] == pytest.approx(2_000_029.9)
    a.wall.advance(60)
    a.refusal(
        token_id="t1",
        name="rate_limit",
        outcome="rate_limited",
        error_code="rate_limited",
        source="10.0.0.2",
    )
    assert [r["count"] for r in _args(db)] == [300, 1]
    assert a.recent(5, {"t1": "Claude"})[0]["count"] == 1 and a.recent(5, {})[1]["count"] == 300


def test_bad_tokens_from_many_sources_count_every_attempt(audit):
    a, db = audit
    for i in range(1000):
        a.refusal(
            token_id=None,
            name="authenticate",
            outcome="denied",
            error_code="invalid_token",
            source=f"10.1.{i // 250}.{i % 250}",
        )
        a.wall.advance(0.15)  # 150 s in all: three windows
    a.flush()
    rows = _args(db)
    assert len(rows) <= 3 and sum(r["count"] for r in rows) == 1000
    assert sum(r["sources"] for r in rows) == 1000


def test_a_restart_flushes_the_open_window(tmp_path):
    db = Database(tmp_path / "k.db")
    a = McpAudit(db, wall=ManualClock(2_000_000.0))
    for _ in range(7):
        a.refusal(
            token_id=None,
            name="authenticate",
            outcome="denied",
            error_code="invalid_token",
            source="10.0.0.9",
        )
    a.flush()  # what AppContext.close does before the database closes
    db.close()
    again = Database(tmp_path / "k.db")
    assert [r["count"] for r in _args(again)] == [7]
    again.close()


def test_refusals_alone_are_pruned_past_the_cap(audit, monkeypatch):
    """Re-review: with no accepted call at all, refusals still run the hourly prune."""
    a, db = audit
    monkeypatch.setattr(audit_mod, "MAX_ROWS", 100)
    monkeypatch.setattr(audit_mod, "KEEP_PER_TOKEN", 10)
    for _ in range(3 * 60 + 1):  # a new window every minute for 3 hours, one throttled token
        a.refusal(
            token_id="t1",
            name="rate_limit",
            outcome="rate_limited",
            error_code="rate_limited",
            source="10.0.0.2",
        )
        a.wall.advance(60)
    assert db.query("SELECT COUNT(*) AS n FROM mcp_audit")[0]["n"] <= 100 + 60


def test_a_table_over_the_cap_is_pruned_at_startup(tmp_path, monkeypatch):
    monkeypatch.setattr(audit_mod, "MAX_ROWS", 50)
    monkeypatch.setattr(audit_mod, "KEEP_PER_TOKEN", 10)
    db = Database(tmp_path / "k.db")
    db.executemany(
        "INSERT INTO mcp_audit (ts, token_id, kind, name, args, outcome, error_code, duration_ms)"
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [(2_000_000.0, "t", "tool", "x", "{}", "ok", None, 0)] * 80,
    )
    McpAudit(db, wall=ManualClock(2_000_000.0))
    assert db.query("SELECT COUNT(*) AS n FROM mcp_audit")[0]["n"] == 50
    db.close()


def test_an_expired_window_is_written_by_the_next_refusal(audit):
    a, db = audit
    for _ in range(4):
        a.refusal(
            token_id=None,
            name="authenticate",
            outcome="denied",
            error_code="invalid_token",
            source="10.0.0.9",
        )
    a.wall.advance(61)
    a.refusal(
        token_id="t9",
        name="rate_limit",
        outcome="rate_limited",
        error_code="rate_limited",
        source="10.0.0.9",
    )  # another key: still flushes
    assert _args(db)[0]["count"] == 4
