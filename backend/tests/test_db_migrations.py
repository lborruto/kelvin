"""Schema migrations (spec §2: idempotent, recorded in the `schema_version` setting)."""

import sqlite3

from kelvin.recorder.db import SCHEMA, SCHEMA_VERSION, SCHEMA_VERSION_KEY, Database


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
    assert db.get_setting(SCHEMA_VERSION_KEY) == 1
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
