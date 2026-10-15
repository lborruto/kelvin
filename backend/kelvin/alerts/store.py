"""The alerts table (spec §2.4). Keys embed the occurrence: a dismissed alert stays hidden until
its key changes, and a new occurrence shows again. The backend stores kinds and params, no text."""

from __future__ import annotations

import json
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Literal

from kelvin.recorder.db import Database

SEVERITIES = ("info", "warn", "bad")
RETENTION_S = 90 * 86400


@dataclass(frozen=True)
class Candidate:
    kind: str
    key: str
    severity: str
    params: dict[str, Any]


class AlertStore:
    def __init__(self, db: Database, *, wall: Callable[[], float] = time.time) -> None:
        self.db = db
        self.wall = wall

    def sync(self, candidates: list[Candidate], kinds: set[str]) -> None:
        now = self.wall()
        for c in candidates:
            if c.severity not in SEVERITIES:
                raise ValueError(f"unknown severity {c.severity!r}")
            self.db.execute(
                "INSERT INTO alerts (kind, key, severity, params, first_seen, last_seen)"
                " VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET"
                " severity = excluded.severity, params = excluded.params,"
                " last_seen = excluded.last_seen, resolved_at = NULL",
                (c.kind, c.key, c.severity, json.dumps(c.params, sort_keys=True), now, now),
            )
        keep = {c.key for c in candidates}
        for kind in kinds:
            for row in self.db.query(
                "SELECT key FROM alerts WHERE kind = ? AND resolved_at IS NULL", (kind,)
            ):
                if row["key"] not in keep:
                    self.db.execute(
                        "UPDATE alerts SET resolved_at = ? WHERE key = ?", (now, row["key"])
                    )

    def prune(self) -> int:
        return self.db.execute(
            "DELETE FROM alerts WHERE resolved_at IS NOT NULL AND resolved_at < ?",
            (self.wall() - RETENTION_S,),
        )

    def listing(self, state: Literal["active", "all"]) -> list[dict[str, Any]]:
        where = "WHERE resolved_at IS NULL AND dismissed_at IS NULL" if state == "active" else ""
        rank = "CASE severity WHEN 'bad' THEN 3 WHEN 'warn' THEN 2 ELSE 1 END"
        rows = self.db.query(
            f"SELECT id, kind, severity, params, first_seen, last_seen, resolved_at, dismissed_at"
            f" FROM alerts {where} ORDER BY {rank} DESC, first_seen DESC, id DESC"
        )
        return [
            {
                "id": r["id"],
                "kind": r["kind"],
                "severity": r["severity"],
                "params": json.loads(r["params"]),
                "first_seen": r["first_seen"],
                "last_seen": r["last_seen"],
                "resolved_at": r["resolved_at"],
                "dismissed": r["dismissed_at"] is not None,
            }
            for r in rows
        ]

    def dismiss(self, alert_id: int) -> bool:
        return (
            self.db.execute(
                "UPDATE alerts SET dismissed_at = ? WHERE id = ? AND dismissed_at IS NULL",
                (self.wall(), alert_id),
            )
            == 1
        )

    def summary(self) -> dict[str, Any]:
        active = self.listing("active")
        return {"active": len(active), "highest": active[0]["severity"] if active else None}
