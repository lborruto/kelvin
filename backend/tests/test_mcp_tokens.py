"""MCP tokens (spec MCP §5.1): a secret shown once, only its SHA-256 stored."""

from kelvin.recorder.db import SCHEMA_VERSION, SCHEMA_VERSION_KEY, Database


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
    assert db.get_setting(SCHEMA_VERSION_KEY) == SCHEMA_VERSION == 4
    db.close()
    again = Database(tmp_path / "k.db")  # idempotent
    assert again.get_setting(SCHEMA_VERSION_KEY) == 4
    again.close()
