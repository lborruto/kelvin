"""Login sessions (spec §3.7): a random token in a cookie, only its SHA-256 in SQLite."""

from __future__ import annotations

import hashlib
import re
import secrets
import time
from collections.abc import Callable
from typing import Any

from kelvin.recorder.db import Database

COOKIE_NAME = "kelvin_session"
SESSION_TTL_S = 365 * 86400  # one year, sliding
TOUCH_EVERY_S = 600  # last_seen is written at most this often
SESSION_ID = re.compile(r"^[0-9a-f]{16}$")

# (marker in the user agent, name), first match wins: Edge and Opera also say Chrome, Chrome
# also says Safari. Names are brands, shown as they are in every language.
_BROWSERS = (
    ("Edg/", "Edge"),
    ("OPR/", "Opera"),
    ("SamsungBrowser/", "Samsung Internet"),
    ("FxiOS/", "Firefox"),
    ("Firefox/", "Firefox"),
    ("CriOS/", "Chrome"),
    ("Chrome/", "Chrome"),
    ("Safari/", "Safari"),
)
_SYSTEMS = (
    ("iPhone", "iPhone"),
    ("iPad", "iPad"),
    ("Android", "Android"),
    ("Windows", "Windows"),
    ("CrOS", "ChromeOS"),
    ("Macintosh", "macOS"),
    ("Linux", "Linux"),
)


class SessionIsCurrent(Exception):
    """The current session is ended by logging out, not by revoking it."""


def ua_summary(ua: str | None) -> tuple[str | None, str | None]:
    """The browser and system named by a user agent, or None; the raw string never leaves."""
    ua = ua or ""
    browser = next((name for mark, name in _BROWSERS if mark in ua), None)
    system = next((name for mark, name in _SYSTEMS if mark in ua), None)
    return browser, system


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
            "INSERT INTO sessions (hash, created, last_seen, user_agent, id)"
            " VALUES (?, ?, ?, ?, ?)",
            (_hash(token), now, now, (user_agent or "")[:200], secrets.token_hex(8)),
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

    def listing(self, token: str | None) -> list[dict[str, Any]]:
        self.prune()
        mine = _hash(token) if token else None
        rows = self.db.query(
            "SELECT id, hash, created, last_seen, user_agent FROM sessions ORDER BY last_seen DESC"
        )
        out = []
        for r in rows:
            browser, system = ua_summary(r["user_agent"])
            out.append(
                {
                    "id": r["id"],
                    "created": r["created"],
                    "last_seen": r["last_seen"],
                    "browser": browser,
                    "os": system,
                    "current": r["hash"] == mine,
                }
            )
        return out

    def revoke(self, sid: str, token: str | None) -> bool:
        """End another device's session. False when no such session (gone, or never was)."""
        if not SESSION_ID.fullmatch(sid):
            return False
        rows = self.db.query("SELECT hash FROM sessions WHERE id = ?", (sid,))
        if not rows:
            return False
        if token and rows[0]["hash"] == _hash(token):
            raise SessionIsCurrent()
        return self.db.execute("DELETE FROM sessions WHERE id = ?", (sid,)) == 1

    def revoke_others(self, token: str | None) -> int:
        """Sign out every other device. Without a session of its own, nothing is revoked (a
        missing cookie must never read as « everyone but nobody »)."""
        if not token:
            return 0
        return self.db.execute("DELETE FROM sessions WHERE hash != ?", (_hash(token),))

    def prune(self) -> int:
        return self.db.execute(
            "DELETE FROM sessions WHERE last_seen < ?", (self.wall() - SESSION_TTL_S,)
        )

    def count(self) -> int:
        return self.db.query("SELECT COUNT(*) AS n FROM sessions")[0]["n"]
