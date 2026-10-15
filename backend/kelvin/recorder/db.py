import json
import logging
import secrets
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any

log = logging.getLogger(__name__)

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
CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, key TEXT NOT NULL UNIQUE,
  severity TEXT NOT NULL, params TEXT NOT NULL, first_seen REAL NOT NULL,
  last_seen REAL NOT NULL, resolved_at REAL, dismissed_at REAL);
CREATE TABLE IF NOT EXISTS tempo_days (
  day TEXT PRIMARY KEY, colour TEXT NOT NULL, source TEXT NOT NULL, fetched_at REAL NOT NULL);
CREATE TABLE IF NOT EXISTS ecowatt_days (
  day TEXT PRIMARY KEY, level INTEGER NOT NULL, hours TEXT, source TEXT NOT NULL,
  fetched_at REAL NOT NULL);
"""

SCHEMA_VERSION_KEY = "schema_version"


MIGRATION_BATCH = 5000  # rows per transaction: the write lock is never held for long


def _in_transaction(conn: sqlite3.Connection, sql: str, params: tuple = ()) -> int:
    conn.execute("BEGIN IMMEDIATE")
    try:
        n = conn.execute(sql, params).rowcount
        conn.execute("COMMIT")
    except BaseException:
        conn.execute("ROLLBACK")
        raise
    return n


def _v1_energy_counters(conn: sqlite3.Connection) -> None:
    """v1 (Plan 5): readings no longer store an absent T1/T2 register as 0.

    Before v1, `House` wrote 0.0 when a register state was absent, and the energy pipeline read
    that 0 as a counter reset (audit H1 case E). A legacy 0 becomes NULL (absent) when that
    radiator's register read above 0 earlier: the register is in use, so 0 is not a real
    reading of it, and a true reset is still counted from the next reading. Zeros before the
    register's first positive reading are real (the tariff was not used yet) and stay, as do the
    zeros of a register that was always 0; the total counter (never coerced) is untouched.

    Every step works in batches of MIGRATION_BATCH rows, one transaction each, and is
    idempotent, so a crash part-way is finished by the next start: first an untouched copy of
    the table in `energy_v0` (INSERT OR IGNORE), then the NULLs.
    """
    top = conn.execute("SELECT MAX(rowid) FROM energy").fetchone()[0]
    if top is None:
        return
    started = time.monotonic()
    total = conn.execute("SELECT COUNT(*) FROM energy").fetchone()[0]
    log.info("schema v1: %d energy rows; copying them to energy_v0, then nulling", total)
    nulled = 0
    conn.execute(
        "CREATE TABLE IF NOT EXISTS energy_v0 ("
        " ts INTEGER NOT NULL, radiator_id TEXT NOT NULL, total_wh REAL, t1_wh REAL, t2_wh REAL,"
        " PRIMARY KEY (radiator_id, ts))"
    )
    for lo in range(0, top, MIGRATION_BATCH):
        _in_transaction(
            conn,
            "INSERT OR IGNORE INTO energy_v0 SELECT ts, radiator_id, total_wh, t1_wh, t2_wh"
            " FROM energy WHERE rowid > ? AND rowid <= ?",
            (lo, lo + MIGRATION_BATCH),
        )
    for col in ("t1_wh", "t2_wh"):
        # A register reads 0 until its tariff is first used: only later zeros are coerced.
        first_use = conn.execute(
            f"SELECT radiator_id, MIN(ts) FROM energy WHERE {col} > 0 GROUP BY radiator_id"
        ).fetchall()
        for rid, first_ts in first_use:
            while True:
                n = _in_transaction(
                    conn,
                    f"UPDATE energy SET {col} = NULL WHERE rowid IN (SELECT rowid FROM energy"
                    f" WHERE radiator_id = ? AND ts > ? AND {col} = 0 LIMIT ?)",
                    (rid, first_ts, MIGRATION_BATCH),
                )
                nulled += n
                if n < MIGRATION_BATCH:
                    break
    log.info(
        "schema v1 done: %d register readings set to NULL in %.1f s",
        nulled,
        time.monotonic() - started,
    )


def _v2_session_ids(conn: sqlite3.Connection) -> None:
    """v2 (Plan 8): sessions get an opaque id the API can name (spec §2.5). Random, never
    derived from the token or its hash. Idempotent: an interrupted run is finished next start."""
    cols = {r[1] for r in conn.execute("PRAGMA table_info(sessions)")}
    if "id" not in cols:
        conn.execute("ALTER TABLE sessions ADD COLUMN id TEXT")
    for (h,) in conn.execute("SELECT hash FROM sessions WHERE id IS NULL").fetchall():
        _in_transaction(
            conn, "UPDATE sessions SET id = ? WHERE hash = ?", (secrets.token_hex(8), h)
        )
    conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS sessions_id ON sessions(id)")


def _v3_command_log_codes(conn: sqlite3.Connection) -> None:
    """v3 (Plan 8): the command log keeps the label and error codes and the reason code, so the
    `command_failed` alert can be worded in either language after a restart (ruling R10)."""
    cols = {r[1] for r in conn.execute("PRAGMA table_info(command_log)")}
    for col in ("label_code", "label_params", "error_code", "error_params", "reason_code"):
        if col not in cols:
            conn.execute(f"ALTER TABLE command_log ADD COLUMN {col} TEXT")


MIGRATIONS = {1: _v1_energy_counters, 2: _v2_session_ids, 3: _v3_command_log_codes}
SCHEMA_VERSION = max(MIGRATIONS)  # a new migration is the new version


def migrate(conn: sqlite3.Connection) -> int:
    """Run the pending migrations in order; returns the schema version.

    Each migration is idempotent and commits its own batches; the version is recorded only once
    it finished, so an interrupted migration runs again, whole, at the next start."""
    row = conn.execute("SELECT value FROM settings WHERE key = ?", (SCHEMA_VERSION_KEY,)).fetchone()
    version = json.loads(row[0]) if row else 0
    for target in sorted(v for v in MIGRATIONS if v > version):
        MIGRATIONS[target](conn)
        _in_transaction(
            conn,
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
            (SCHEMA_VERSION_KEY, json.dumps(target)),
        )
        version = target
    return version


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
        try:
            migrate(self.conn)
            # Every start, not only at v2: a session an older build wrote has no id (downgrade).
            _v2_session_ids(self.conn)
        except BaseException:
            self.conn.close()  # an interrupted migration is finished by the next start
            raise
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

    def rows(self, sql: str, params: tuple | list = ()) -> list[tuple]:
        """Like `query`, as plain tuples: for the hot paths that read many rows."""
        with self._lock:
            cur = self._open_conn().cursor()
            cur.row_factory = None
            return cur.execute(sql, params).fetchall()

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
            "INSERT OR REPLACE INTO command_log (id, ts, label, radiator_ids, commands, status,"
            " error, label_code, label_params, error_code, error_params, reason_code)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                view["id"],
                view["created_at"],
                view["label"],
                json.dumps(view["radiator_ids"]),
                json.dumps(commands, ensure_ascii=False, default=str),
                view["status"],
                view["error"],
                view.get("label_code"),
                json.dumps(view.get("label_params") or {}, ensure_ascii=False),
                view.get("error_code"),
                json.dumps(view.get("error_params") or {}, ensure_ascii=False),
                view.get("reason_code"),
            ),
        )

    def close(self) -> None:
        """Close once any statement in progress (a prune chunk in its thread) has finished."""
        with self._lock:
            if not self.closed:
                self.closed = True
                self.conn.close()
