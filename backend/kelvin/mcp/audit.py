"""The MCP audit log (spec MCP §5.3): who called what, when, with which (sanitised) arguments
and how it ended. Never a secret, never the result. Kept 90 days, at most 20 000 rows."""

from __future__ import annotations

import json
import re
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from kelvin.recorder.db import Database

KEEP_S = 90 * 86400
MAX_ROWS = 20_000
AGG_WINDOW_S = 60  # refusals: one counted row per (token or unknown, reason) and minute
MAX_SOURCES = 10_000  # distinct client keys remembered per window (beyond: counted as one more)
KEEP_PER_TOKEN = 200  # the cap never takes a token (or the refused authentications) below this
PRUNE_BATCH = 5000
PRUNE_EVERY_S = 3600
ARGS_MAX = 500
STR_MAX = 64
LIST_MAX = 20
_SECRET_KEY = re.compile(r"token|secret|password|authorization|cookie|prm|pdl|email", re.I)


def _clean(value: Any, depth: int = 0) -> Any:
    if depth > 4:
        return "…"
    if isinstance(value, dict):
        return {
            str(k)[:STR_MAX]: _clean(v, depth + 1)
            for k, v in value.items()
            if not _SECRET_KEY.search(str(k))
        }
    if isinstance(value, (list, tuple)):
        return [_clean(v, depth + 1) for v in list(value)[:LIST_MAX]]
    if isinstance(value, str):
        return value[:STR_MAX]
    if value is None or isinstance(value, (bool, int, float)):
        return value
    return str(value)[:STR_MAX]


def sanitise(args: dict[str, Any]) -> str:
    text = json.dumps(_clean(args), ensure_ascii=False, separators=(",", ":"))
    return text if len(text) <= ARGS_MAX else text[: ARGS_MAX - 1] + "…"


@dataclass
class _Window:
    """An open refusal window: its row, written at the first refusal, holds the counts once
    flushed (when the window closes, at the next write, or on shutdown)."""

    row_id: int
    opened: float
    last: float
    count: int = 1
    sources: set[str] = field(default_factory=set)
    dirty: bool = False

    def args(self) -> dict[str, Any]:
        return {
            "count": self.count,
            "first_seen_at": self.opened,
            "last_seen_at": self.last,
            "sources": len(self.sources),
        }


def _count(row: dict[str, Any]) -> int:
    """How many attempts a row stands for: a refusal window's count, else 1."""
    if row["kind"] != "auth":
        return 1
    try:
        return int(json.loads(row["args"]).get("count", 1))
    except (ValueError, TypeError, AttributeError):
        return 1


class McpAudit:
    def __init__(self, db: Database, *, wall: Callable[[], float] = time.time) -> None:
        self.db = db
        self.wall = wall
        self._pruned_at: float | None = None
        self._windows: dict[tuple[str | None, str], _Window] = {}

    def record(
        self,
        *,
        token_id: str | None,
        kind: str,
        name: str,
        args: dict[str, Any],
        outcome: str,
        error_code: str | None = None,
        duration_ms: int = 0,
    ) -> None:
        self._flush_closed()
        self.db.execute(
            "INSERT INTO mcp_audit (ts, token_id, kind, name, args, outcome, error_code,"
            " duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                self.wall(),
                token_id,
                kind,
                name[:STR_MAX],
                sanitise(args),
                outcome,
                error_code,
                int(duration_ms),
            ),
        )
        now = self.wall()
        if self._pruned_at is None or now - self._pruned_at >= PRUNE_EVERY_S:
            self._pruned_at = now
            self.prune()

    def refusal(
        self,
        *,
        token_id: str | None,
        name: str,
        outcome: str,
        error_code: str,
        source: str | None,
    ) -> None:
        """A refused authentication or a throttled call, aggregated rather than dropped (security
        review): one row per (token or unknown, reason) and AGG_WINDOW_S, written at the first
        refusal, its `args` holding count, first and last seen and distinct sources. Every refusal
        is counted; however many arrive, a window is one row."""
        now = self.wall()
        key = (token_id, error_code)
        w = self._windows.get(key)
        if w is not None and now - w.opened < AGG_WINDOW_S:
            w.count += 1
            w.last = now
            if source is not None and len(w.sources) < MAX_SOURCES:
                w.sources.add(source)
            w.dirty = True
            return
        if w is not None:
            self._write(w)
        opened = _Window(row_id=0, opened=now, last=now, sources={source} if source else set())
        rows = self.db.query(
            "INSERT INTO mcp_audit (ts, token_id, kind, name, args, outcome, error_code,"
            " duration_ms) VALUES (?, ?, 'auth', ?, ?, ?, ?, 0) RETURNING id",
            (now, token_id, name[:STR_MAX], sanitise(opened.args()), outcome, error_code),
        )
        opened.row_id = rows[0]["id"]
        self._windows[key] = opened

    def _write(self, w: _Window) -> None:
        if w.dirty:
            self.db.execute(
                "UPDATE mcp_audit SET args = ? WHERE id = ?", (sanitise(w.args()), w.row_id)
            )
            w.dirty = False

    def _flush_closed(self) -> None:
        now = self.wall()
        for key, w in list(self._windows.items()):
            if now - w.opened >= AGG_WINDOW_S:
                self._write(w)
                del self._windows[key]

    def flush(self) -> None:
        """Every open window's counts to its row: at shutdown (AppContext.close) and before a
        listing, so what the owner reads is complete."""
        for w in self._windows.values():
            self._write(w)

    def recent(self, limit: int, names: dict[str, str]) -> list[dict[str, Any]]:
        self.flush()
        rows = self.db.query(
            "SELECT ts, token_id, kind, name, args, outcome, error_code, duration_ms FROM mcp_audit"
            " ORDER BY ts DESC, id DESC LIMIT ?",
            (limit,),
        )
        return [
            {
                "at": r["ts"],
                "token_name": names.get(r["token_id"]) if r["token_id"] else None,
                "kind": r["kind"],
                "name": r["name"],
                "outcome": r["outcome"],
                "error_code": r["error_code"],
                "duration_ms": r["duration_ms"],
                "count": _count(r),
            }
            for r in rows
        ]

    def prune(self) -> int:
        """Older than 90 days; then, above MAX_ROWS, the oldest rows of the heaviest source (a token
        id, or NULL for refused authentications) first, never taking a source below its newest
        KEEP_PER_TOKEN rows. One token flooding at its rate limit evicts only its own history,
        never another token's recent calls. In batches (CLAUDE.md); the table holds MCP rows
        only, so MCP traffic never evicts any other record."""
        removed = 0
        cutoff = self.wall() - KEEP_S
        while True:
            n = self.db.execute(
                "DELETE FROM mcp_audit WHERE id IN (SELECT id FROM mcp_audit WHERE ts < ? LIMIT ?)",
                (cutoff, PRUNE_BATCH),
            )
            removed += n
            if n < PRUNE_BATCH:
                break
        while True:
            total = self.db.query("SELECT COUNT(*) AS n FROM mcp_audit")[0]["n"]
            if total <= MAX_ROWS:
                break
            heavy = self.db.query(
                "SELECT token_id, COUNT(*) AS n FROM mcp_audit GROUP BY token_id"
                " ORDER BY n DESC LIMIT 1"
            )[0]
            excess = min(total - MAX_ROWS, heavy["n"] - KEEP_PER_TOKEN, PRUNE_BATCH)
            if excess <= 0:
                break  # every source is at its floor: the cap yields to fairness
            n = self.db.execute(
                "DELETE FROM mcp_audit WHERE id IN (SELECT id FROM mcp_audit"
                " WHERE token_id IS ? ORDER BY id LIMIT ?)",
                (heavy["token_id"], excess),
            )
            removed += n
            if n == 0:
                break
        return removed
