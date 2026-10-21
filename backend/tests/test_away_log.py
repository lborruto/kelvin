import json
import sqlite3
from datetime import date, datetime
from zoneinfo import ZoneInfo

from kelvin.recorder import away
from kelvin.recorder.db import Database, _v6_outlook_and_away

TZ = ZoneInfo("Europe/Paris")


def ts(y, mo, d, h=0):
    return datetime(y, mo, d, h, tzinfo=TZ).timestamp()


def test_days_touched_by_a_span(tmp_path):
    db = Database(tmp_path / "k.db")
    away.record_start(db, "o1", ts(2026, 1, 10, 18), ts(2026, 1, 14, 9))
    away.record_end(db, "o1", ts(2026, 1, 13, 20))  # came back early
    got = away.away_days(db, date(2026, 1, 1), date(2026, 2, 1), TZ, now=ts(2026, 1, 20))
    assert got == {date(2026, 1, d) for d in (10, 11, 12, 13)}


def test_a_running_away_counts_up_to_now(tmp_path):
    db = Database(tmp_path / "k.db")
    away.record_start(db, "o1", ts(2026, 1, 10, 18), ts(2026, 1, 30))
    got = away.away_days(db, date(2026, 1, 1), date(2026, 2, 1), TZ, now=ts(2026, 1, 12, 8))
    assert got == {date(2026, 1, 10), date(2026, 1, 11), date(2026, 1, 12)}


def test_an_open_ended_away_counts_up_to_now_then_to_its_real_end(tmp_path):
    db = Database(tmp_path / "k.db")
    away.record_start(db, "o1", ts(2026, 1, 10, 18), None)  # « Jusqu’à mon retour »
    assert db.rows("SELECT end, ended FROM away_log") == [(away.OPEN_END, 0)]
    got = away.away_days(db, date(2026, 1, 1), date(2026, 2, 1), TZ, now=ts(2026, 1, 12, 8))
    assert got == {date(2026, 1, 10), date(2026, 1, 11), date(2026, 1, 12)}
    away.record_end(db, "o1", ts(2026, 1, 14, 9))
    got = away.away_days(db, date(2026, 1, 1), date(2026, 2, 1), TZ, now=ts(2026, 1, 30))
    assert got == {date(2026, 1, d) for d in (10, 11, 12, 13, 14)}


def test_end_is_recorded_once(tmp_path):
    db = Database(tmp_path / "k.db")
    away.record_start(db, "o1", ts(2026, 1, 10), ts(2026, 1, 14))
    away.record_end(db, "o1", ts(2026, 1, 12))
    away.record_end(db, "o1", ts(2026, 1, 13))  # a later restore retry changes nothing
    assert away.away_days(db, date(2026, 1, 1), date(2026, 2, 1), TZ, now=ts(2026, 2, 1)) == {
        date(2026, 1, 10),
        date(2026, 1, 11),
        date(2026, 1, 12),
    }


def test_signature_moves(tmp_path):
    db = Database(tmp_path / "k.db")
    s0 = away.signature(db)
    away.record_start(db, "o1", ts(2026, 1, 10), ts(2026, 1, 14))
    assert away.signature(db) != s0


def test_migration_seeds_from_the_command_log(tmp_path):
    conn = sqlite3.connect(tmp_path / "raw.db")
    conn.executescript(
        "CREATE TABLE command_log (id TEXT PRIMARY KEY, ts REAL, label TEXT, radiator_ids TEXT,"
        " commands TEXT, status TEXT, error TEXT, label_code TEXT, label_params TEXT,"
        " error_code TEXT, error_params TEXT, reason_code TEXT);"
    )
    rows = [
        ("a", ts(2026, 1, 10, 18), "away", "confirmed"),
        ("b", ts(2026, 1, 13, 20), "away_end", "confirmed"),
        ("c", ts(2026, 1, 20, 8), "away", "failed"),  # never applied: no span
        ("d", ts(2026, 1, 25, 8), "away", "confirmed"),  # no end in the log: skipped
    ]
    for i, t, code, status in rows:
        conn.execute(
            "INSERT INTO command_log (id, ts, label, radiator_ids, commands, status, label_code,"
            " label_params) VALUES (?, ?, '', '[]', '[]', ?, ?, ?)",
            (i, t, status, code, json.dumps({})),
        )
    conn.commit()  # the migration runs its own transactions
    _v6_outlook_and_away(conn)
    _v6_outlook_and_away(conn)  # idempotent
    got = conn.execute("SELECT id, start, end, ended FROM away_log").fetchall()
    assert got == [("log-a", ts(2026, 1, 10, 18), ts(2026, 1, 13, 20), 1)]
