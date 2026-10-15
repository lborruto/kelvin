"""MCP tokens (spec MCP §5.1): a random `kmcp_…` secret shown once; only its SHA-256 is stored.

A 256-bit random secret needs no slow hash (the same rule as login sessions). The id is random,
never derived from the secret, so the UI and the audit can name a token without exposing it."""

from __future__ import annotations

import hashlib
import re
import secrets
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from kelvin.errors import UserError
from kelvin.recorder.db import Database

PREFIX = "kmcp_"
MAX_LIVE = 10
NAME_MAX = 40
TOUCH_EVERY_S = 60
KEEP_REVOKED_S = 90 * 86400
TOKEN_ID = re.compile(r"^[0-9a-f]{16}$")
_SHAPE = re.compile(r"^kmcp_[A-Za-z0-9_-]{43}$")
# Control characters and the invisible ones a pasted name can carry.
_INVISIBLE = re.compile(r"[\x00-\x1f\x7f​-‏ -‮⁠-⁤﻿]")
_COLUMNS = "id, name, hint, scope, created, last_used, revoked_at"


@dataclass(frozen=True)
class TokenRecord:
    id: str
    name: str
    scope: str


def _hash(secret: str) -> str:
    return hashlib.sha256(secret.encode()).hexdigest()


class McpTokenStore:
    def __init__(self, db: Database, *, wall: Callable[[], float] = time.time) -> None:
        self.db = db
        self.wall = wall

    def create(self, name: str) -> tuple[dict[str, Any], str]:
        """A new read-only token: its view and the secret, which is never available again."""
        clean = name.strip()
        if not 1 <= len(clean) <= NAME_MAX or _INVISIBLE.search(clean):
            raise UserError("mcp_token_name_invalid", max=NAME_MAX)
        self.prune()
        live = self.db.query("SELECT COUNT(*) AS n FROM mcp_tokens WHERE revoked_at IS NULL")
        if live[0]["n"] >= MAX_LIVE:
            raise UserError("mcp_token_limit", 409, max=MAX_LIVE)
        secret = PREFIX + secrets.token_urlsafe(32)
        tid = secrets.token_hex(8)
        self.db.execute(
            "INSERT INTO mcp_tokens (id, name, hash, hint, scope, created)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            (tid, clean, _hash(secret), secret[-4:], "read", self.wall()),
        )
        return self.db.query(f"SELECT {_COLUMNS} FROM mcp_tokens WHERE id = ?", (tid,))[0], secret

    def listing(self) -> list[dict[str, Any]]:
        return self.db.query(f"SELECT {_COLUMNS} FROM mcp_tokens ORDER BY created DESC, id")

    def names(self) -> dict[str, str]:
        return {r["id"]: r["name"] for r in self.db.query("SELECT id, name FROM mcp_tokens")}

    def revoke(self, token_id: str) -> bool:
        if not TOKEN_ID.fullmatch(token_id):
            return False
        return (
            self.db.execute(
                "UPDATE mcp_tokens SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL",
                (self.wall(), token_id),
            )
            == 1
        )

    def verify(self, secret: str | None) -> TokenRecord | None:
        """The live token this secret is, or None. A malformed value never reaches the DB."""
        if not secret or not _SHAPE.fullmatch(secret):
            return None
        rows = self.db.query(
            "SELECT id, name, scope FROM mcp_tokens WHERE hash = ? AND revoked_at IS NULL",
            (_hash(secret),),
        )
        return TokenRecord(**rows[0]) if rows else None

    def touch(self, token_id: str) -> None:
        now = self.wall()
        self.db.execute(
            "UPDATE mcp_tokens SET last_used = ? WHERE id = ?"
            " AND (last_used IS NULL OR last_used <= ?)",
            (now, token_id, now - TOUCH_EVERY_S),
        )

    def prune(self) -> int:
        return self.db.execute(
            "DELETE FROM mcp_tokens WHERE revoked_at IS NOT NULL AND revoked_at < ?",
            (self.wall() - KEEP_REVOKED_S,),
        )
