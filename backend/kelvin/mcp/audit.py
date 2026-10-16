"""The MCP audit log (spec MCP §5.3): who called what, when, with which (sanitised) arguments
and how it ended. Never a secret, never the result. Kept 90 days, at most 20 000 rows."""

from __future__ import annotations

import json
import re
import time
from collections.abc import Callable
from typing import Any

from kelvin.recorder.db import Database

KEEP_S = 90 * 86400
MAX_ROWS = 20_000
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


class McpAudit:
    def __init__(self, db: Database, *, wall: Callable[[], float] = time.time) -> None:
        self.db = db
        self.wall = wall
        self._pruned_at: float | None = None

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

    def recent(self, limit: int, names: dict[str, str]) -> list[dict[str, Any]]:
        rows = self.db.query(
            "SELECT ts, token_id, kind, name, outcome, error_code, duration_ms FROM mcp_audit"
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
