"""Login sessions (spec §3.7): a random token in a cookie, only its SHA-256 in SQLite."""

from __future__ import annotations

import hashlib
import secrets
import time
from collections.abc import Callable

from kelvin.recorder.db import Database

COOKIE_NAME = "kelvin_session"
SESSION_TTL_S = 365 * 86400  # one year, sliding
TOUCH_EVERY_S = 600  # last_seen is written at most this often


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


class SessionStore:
    def __init__(self, db: Database, *, wall: Callable[[], float] = time.time) -> None:
        self.db = db
        self.wall = wall

    def create(self, user_agent: str | None) -> str:
        self.prune()
        token = secrets.token_urlsafe(32)
        now = self.wall()
        self.db.execute(
            "INSERT INTO sessions (hash, created, last_seen, user_agent) VALUES (?, ?, ?, ?)",
            (_hash(token), now, now, (user_agent or "")[:200]),
        )
        return token

    def validate(self, token: str | None) -> bool:
        if not token:
            return False
        h = _hash(token)
        rows = self.db.query("SELECT last_seen FROM sessions WHERE hash = ?", (h,))
        if not rows:
            return False
        now = self.wall()
        idle = now - rows[0]["last_seen"]
        if idle > SESSION_TTL_S:
            self.db.execute("DELETE FROM sessions WHERE hash = ?", (h,))
            return False
        if idle >= TOUCH_EVERY_S:
            self.db.execute("UPDATE sessions SET last_seen = ? WHERE hash = ?", (now, h))
        return True

    def delete(self, token: str | None) -> None:
        if token:
            self.db.execute("DELETE FROM sessions WHERE hash = ?", (_hash(token),))

    def prune(self) -> int:
        return self.db.execute(
            "DELETE FROM sessions WHERE last_seen < ?", (self.wall() - SESSION_TTL_S,)
        )

    def count(self) -> int:
        return self.db.query("SELECT COUNT(*) AS n FROM sessions")[0]["n"]
