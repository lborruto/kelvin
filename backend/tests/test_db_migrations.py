"""Schema migrations (spec §2: idempotent, recorded in the `schema_version` setting)."""

import sqlite3

import pytest

from kelvin.recorder.db import (
    SCHEMA,
    SCHEMA_VERSION,
    SCHEMA_VERSION_KEY,
    Database,
    SchemaTooNew,
)


def legacy_db(path) -> None:
    """A database as Plans 1–4 left it: no schema_version, absent registers stored as 0."""
    conn = sqlite3.connect(path)
    conn.executescript(SCHEMA)
    conn.executemany(
        "INSERT INTO energy VALUES (?,?,?,?,?)",
        [
            # radiator a: T1 in use; one reading had T1 absent (stored 0); T2 never used
            (0, "a", 1_500_000.0, 900_000.0, 0.0),
            (3600, "a", 1_501_000.0, 0.0, 0.0),
            (7200, "a", 1_502_000.0, 901_000.0, 0.0),
            # radiator b: the total counter really reset to 0: totals are never touched
            (0, "b", 5000.0, 0.0, 0.0),
            (3600, "b", 0.0, 0.0, 0.0),
        ],
    )
    conn.commit()
    conn.close()


def rows(db):
    return [
        (r["radiator_id"], r["ts"], r["total_wh"], r["t1_wh"], r["t2_wh"])
        for r in db.query("SELECT * FROM energy ORDER BY radiator_id, ts")
    ]


def test_a_new_database_starts_at_the_current_version(tmp_path):
    db = Database(tmp_path / "k.db")
    assert db.get_setting(SCHEMA_VERSION_KEY) == SCHEMA_VERSION
    assert db.query("SELECT name FROM sqlite_master WHERE name = 'energy_v0'") == []


def test_v1_nulls_legacy_zeros_of_registers_in_use_and_keeps_a_copy(tmp_path):
    path = tmp_path / "k.db"
    legacy_db(path)
    db = Database(path)
    assert db.get_setting(SCHEMA_VERSION_KEY) == SCHEMA_VERSION
    assert rows(db) == [
        ("a", 0, 1_500_000.0, 900_000.0, 0.0),
        ("a", 3600, 1_501_000.0, None, 0.0),
        ("a", 7200, 1_502_000.0, 901_000.0, 0.0),
        ("b", 0, 5000.0, 0.0, 0.0),
        ("b", 3600, 0.0, 0.0, 0.0),
    ]
    backup = db.query("SELECT * FROM energy_v0 ORDER BY radiator_id, ts")
    assert len(backup) == 5 and backup[1]["t1_wh"] == 0.0  # nothing is lost
    db.close()


def test_migrations_run_once(tmp_path):
    path = tmp_path / "k.db"
    legacy_db(path)
    Database(path).close()
    db = Database(path)
    db.execute("INSERT INTO energy VALUES (10800, 'a', 1503000.0, 0.0, 0.0)")  # after v1
    db.close()
    db = Database(path)
    assert db.query("SELECT t1_wh FROM energy WHERE ts = 10800")[0]["t1_wh"] == 0.0
    assert len(db.query("SELECT * FROM energy_v0")) == 5


def test_v1_in_small_batches_and_run_twice_gives_the_same_table(tmp_path, monkeypatch):
    """A crash part-way is finished by the next start: every step is idempotent, and the
    batches are small enough that the write lock is never held for the whole table."""
    import kelvin.recorder.db as db_module

    big, small = tmp_path / "big.db", tmp_path / "small.db"
    for p in (big, small):
        legacy_db(p)
    expected = rows(Database(big))
    monkeypatch.setattr(db_module, "MIGRATION_BATCH", 2)
    conn = sqlite3.connect(small, isolation_level=None)
    db_module._v1_energy_counters(conn)  # interrupted before the version was written...
    conn.close()
    db = Database(small)  # ...so the next start runs v1 again, whole
    assert rows(db) == expected
    assert len(db.query("SELECT * FROM energy_v0")) == 5


def test_v1_keeps_the_zeros_before_a_register_first_counted(tmp_path):
    """A register reads 0 until its tariff is first used: those leading zeros are real."""
    path = tmp_path / "k.db"
    conn = sqlite3.connect(path)
    conn.executescript(SCHEMA)
    conn.executemany(
        "INSERT INTO energy VALUES (?,?,?,?,?)",
        [
            (0, "c", 100.0, 0.0, 100.0),
            (3600, "c", 150.0, 0.0, 150.0),
            (7200, "c", 200.0, 50.0, 150.0),
            (10800, "c", 250.0, 0.0, 200.0),  # absent after first use: coerced
        ],
    )
    conn.commit()
    conn.close()
    db = Database(path)
    assert [r[3] for r in rows(db)] == [0.0, 0.0, 50.0, None]


def test_an_interrupted_v1_is_finished_by_the_next_start(tmp_path, monkeypatch):
    import pytest

    import kelvin.recorder.db as db_module

    path = tmp_path / "k.db"
    legacy_db(path)
    monkeypatch.setattr(db_module, "MIGRATION_BATCH", 1)
    real = db_module._in_transaction
    nulled = 0

    def crash_after_the_first_null_batch(conn, sql, params=()):
        nonlocal nulled
        n = real(conn, sql, params)
        if sql.startswith("UPDATE"):
            nulled += 1
            if nulled == 1:
                raise RuntimeError("power cut")
        return n

    monkeypatch.setattr(db_module, "_in_transaction", crash_after_the_first_null_batch)
    with pytest.raises(RuntimeError):
        Database(path)
    monkeypatch.setattr(db_module, "_in_transaction", real)
    conn = sqlite3.connect(path)
    assert (
        conn.execute("SELECT value FROM settings WHERE key = 'schema_version'").fetchone() is None
    )
    conn.close()
    db = Database(path)  # the next start
    assert db.get_setting(SCHEMA_VERSION_KEY) == SCHEMA_VERSION
    assert rows(db)[1] == ("a", 3600, 1_501_000.0, None, 0.0)
    assert len(db.query("SELECT * FROM energy_v0")) == 5
    assert db.query("SELECT t1_wh FROM energy_v0 WHERE radiator_id = 'a' AND ts = 3600") == [
        {"t1_wh": 0.0}
    ]


def test_v1_logs_its_start_and_finish_without_ids(tmp_path, caplog):
    path = tmp_path / "k.db"
    legacy_db(path)
    with caplog.at_level("INFO", logger="kelvin.recorder.db"):
        Database(path).close()
    text = caplog.text
    assert "schema v1: 5 energy rows" in text and "schema v1 done" in text
    assert "'a'" not in text and " a " not in text


def test_v2_backfills_session_ids_for_existing_rows(tmp_path):
    path = tmp_path / "old.db"
    conn = sqlite3.connect(path)
    conn.executescript(
        "CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);"
        "INSERT INTO settings VALUES ('schema_version', '1');"
        "CREATE TABLE sessions (hash TEXT PRIMARY KEY, created REAL NOT NULL,"
        " last_seen REAL NOT NULL, user_agent TEXT);"
        "INSERT INTO sessions VALUES ('h1', 1, 1, 'ua'), ('h2', 2, 2, NULL);"
    )
    conn.commit()
    conn.close()
    db = Database(path)
    ids = [r["id"] for r in db.query("SELECT id FROM sessions ORDER BY hash")]
    assert len(set(ids)) == 2 and all(len(i) == 16 for i in ids)
    assert db.get_setting("schema_version") >= 2
    db.close()
    again = Database(path)  # idempotent
    assert [r["id"] for r in again.query("SELECT id FROM sessions ORDER BY hash")] == ids
    again.close()


def test_v3_adds_command_log_codes(tmp_path):
    db = Database(tmp_path / "k.db")  # the module imports Database and SCHEMA_VERSION already
    cols = {r["name"] for r in db.query("PRAGMA table_info(command_log)")}
    assert {"label_code", "label_params", "error_code", "error_params", "reason_code"} <= cols
    assert db.get_setting(SCHEMA_VERSION_KEY) == SCHEMA_VERSION >= 3
    db.close()


def test_a_session_without_id_gets_one_at_every_start(tmp_path):
    """A session written by an older build after v2 ran (a downgrade) is backfilled too."""
    db = Database(tmp_path / "k.db")
    db.execute(
        "INSERT INTO sessions (hash, created, last_seen, user_agent) VALUES ('h', 1, 1, NULL)"
    )
    db.close()
    again = Database(tmp_path / "k.db")
    [row] = again.query("SELECT id FROM sessions")
    assert row["id"] is not None and len(row["id"]) == 16
    again.close()


def test_v5_adds_the_weather_tables(tmp_path):
    db = Database(tmp_path / "k.db")
    names = {r["name"] for r in db.query("SELECT name FROM sqlite_master WHERE type = 'table'")}
    assert {"weather_hourly", "weather_daily"} <= names
    assert db.get_setting(SCHEMA_VERSION_KEY) == SCHEMA_VERSION >= 5


def test_v6_creates_outlook_and_away_tables(tmp_path):
    import sqlite3

    from kelvin.recorder.db import MIGRATIONS

    db = Database(tmp_path / "k.db")
    names = {r[0] for r in db.rows("SELECT name FROM sqlite_master WHERE type = 'table'")}
    assert {"weather_outlook", "away_log"} <= names
    assert db.get_setting(SCHEMA_VERSION_KEY) == SCHEMA_VERSION >= 6
    db.close()
    conn = sqlite3.connect(tmp_path / "k.db")
    MIGRATIONS[6](conn)  # running it again is harmless
    conn.close()


def test_v7_creates_the_kept_half_hours_table(tmp_path):
    from kelvin.recorder.db import MIGRATIONS

    db = Database(tmp_path / "k.db")
    cols = [r["name"] for r in db.query("PRAGMA table_info(radiator_halfhours)")]
    assert cols == ["radiator_id", "start", "day", "wh", "interpolated", "apportioned"]
    assert db.get_setting(SCHEMA_VERSION_KEY) == SCHEMA_VERSION >= 7
    db.close()
    conn = sqlite3.connect(tmp_path / "k.db")
    MIGRATIONS[7](conn)  # running it again is harmless
    conn.close()


def test_executemany_writes_the_whole_batch_or_nothing(tmp_path):
    """One transaction: a failing row leaves nothing of its batch behind (and the rows are
    not committed one by one on the event loop)."""
    db = Database(tmp_path / "k.db")
    good = [(day, 1000) for day in ("2026-01-01", "2026-01-02")]
    with pytest.raises(sqlite3.IntegrityError):
        db.executemany("INSERT INTO linky_daily VALUES (?, ?)", [*good, ("2026-01-03", None)])
    assert db.query("SELECT * FROM linky_daily") == []
    assert not db.conn.in_transaction  # rolled back: the next statement is not stuck in it
    db.executemany("INSERT INTO linky_daily VALUES (?, ?)", good)
    assert len(db.query("SELECT * FROM linky_daily")) == 2
    assert not db.conn.in_transaction
    db.close()


def test_a_database_from_a_newer_kelvin_is_refused(tmp_path):
    """An older image must not open (and write into) a schema it does not know."""
    path = tmp_path / "k.db"
    db = Database(path)
    db.set_setting(SCHEMA_VERSION_KEY, SCHEMA_VERSION + 1)
    db.close()
    with pytest.raises(SchemaTooNew) as e:
        Database(path)
    assert str(SCHEMA_VERSION + 1) in str(e.value) and str(SCHEMA_VERSION) in str(e.value)
    conn = sqlite3.connect(path)  # untouched: the newer build still finds its version
    stored = conn.execute("SELECT value FROM settings WHERE key = ?", (SCHEMA_VERSION_KEY,))
    assert stored.fetchone()[0] == str(SCHEMA_VERSION + 1)
    conn.close()
