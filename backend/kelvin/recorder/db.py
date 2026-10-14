import json
import sqlite3
import threading
from pathlib import Path
from typing import Any

SCHEMA = """
CREATE TABLE IF NOT EXISTS samples (
  ts INTEGER NOT NULL, radiator_id TEXT NOT NULL, temperature REAL, target REAL,
  effective_setpoint REAL, mode TEXT, heating_level TEXT, working_rate REAL,
  window_open INTEGER, occupied INTEGER, PRIMARY KEY (radiator_id, ts));
CREATE TABLE IF NOT EXISTS energy (
  ts INTEGER NOT NULL, radiator_id TEXT NOT NULL, total_wh REAL, t1_wh REAL, t2_wh REAL,
  PRIMARY KEY (radiator_id, ts));
CREATE TABLE IF NOT EXISTS overrides (
  id TEXT PRIMARY KEY, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS command_log (
  id TEXT PRIMARY KEY, ts REAL, label TEXT, radiator_ids TEXT, commands TEXT,
  status TEXT, error TEXT);
CREATE INDEX IF NOT EXISTS samples_ts ON samples(ts);
CREATE INDEX IF NOT EXISTS command_log_ts ON command_log(ts);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (
  hash TEXT PRIMARY KEY, created REAL NOT NULL, last_seen REAL NOT NULL, user_agent TEXT);
CREATE TABLE IF NOT EXISTS linky_daily (day TEXT PRIMARY KEY, wh INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS linky_curve (
  ts INTEGER PRIMARY KEY, minutes INTEGER NOT NULL, wh REAL NOT NULL);
"""


class DatabaseClosed(sqlite3.ProgrammingError):
    """A statement reached the database after close() (a background task during shutdown)."""


class Database:
    def __init__(self, path: str | Path) -> None:
        if str(path) != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(str(path), check_same_thread=False, isolation_level=None)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.executescript(SCHEMA)
        self._lock = threading.Lock()
        self.closed = False

    def _open_conn(self) -> sqlite3.Connection:
        """The connection, for a caller holding the lock."""
        if self.closed:
            raise DatabaseClosed("the database is closed")
        return self.conn

    def execute(self, sql: str, params: tuple | list = ()) -> int:
        with self._lock:
            return self._open_conn().execute(sql, params).rowcount

    def executemany(self, sql: str, rows: list[tuple]) -> None:
        with self._lock:
            self._open_conn().executemany(sql, rows)

    def query(self, sql: str, params: tuple | list = ()) -> list[dict[str, Any]]:
        with self._lock:
            return [dict(r) for r in self._open_conn().execute(sql, params).fetchall()]

    def get_setting(self, key: str, default: Any = None) -> Any:
        rows = self.query("SELECT value FROM settings WHERE key = ?", (key,))
        return json.loads(rows[0]["value"]) if rows else default

    def set_setting(self, key: str, value: Any) -> None:
        self.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
            (key, json.dumps(value, ensure_ascii=False)),
        )

    def log_command(self, view: dict[str, Any], commands: list[dict[str, Any]]) -> None:
        self.execute(
            "INSERT OR REPLACE INTO command_log"
            " (id, ts, label, radiator_ids, commands, status, error) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                view["id"],
                view["created_at"],
                view["label"],
                json.dumps(view["radiator_ids"]),
                json.dumps(commands, ensure_ascii=False, default=str),
                view["status"],
                view["error"],
            ),
        )

    def close(self) -> None:
        """Close once any statement in progress (a prune chunk in its thread) has finished."""
        with self._lock:
            if not self.closed:
                self.closed = True
                self.conn.close()
