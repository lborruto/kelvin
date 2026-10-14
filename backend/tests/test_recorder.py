import threading
from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

from kelvin.house.model import build_house
from kelvin.overkiz.models import StateChange
from kelvin.overkiz.sample import SAMPLE_GATEWAY, sample_house
from kelvin.recorder.db import Database, DatabaseClosed
from kelvin.recorder.recorder import COMMAND_LOG_RETENTION_S, SAMPLE_RETENTION_S, Recorder
from tests.conftest import ManualClock

PARIS = ZoneInfo("Europe/Paris")
ENERGY = f"{SAMPLE_GATEWAY}/9312063#5"


def ts(y, mo, d, h=0, mi=0):
    return datetime(y, mo, d, h, mi, tzinfo=PARIS).timestamp()


@pytest.fixture
def env():
    db = Database(":memory:")
    house = build_house(*sample_house())
    clock = ManualClock(ts(2026, 10, 13, 12))
    return db, house, clock, Recorder(db, house, wall=clock)


def test_sample_writes_one_row_per_radiator(env):
    db, _, _, rec = env
    assert rec.sample() == 4
    assert len(db.query("SELECT * FROM samples")) == 4


def test_sample_skipped_when_stale(env):
    db, house, clock, _ = env
    rec = Recorder(db, house, wall=clock, is_fresh=lambda: False)
    assert rec.sample() == 0


def test_history_averages_buckets(env):
    _, house, clock, rec = env
    rec.sample()
    clock.advance(300)
    house.apply(StateChange(f"{SAMPLE_GATEWAY}/9312063#2", "core:TemperatureState", 19.8))
    rec.sample()
    rows = rec.history(["9312063"], clock() - 3600, clock(), 3600)
    assert len(rows) == 1
    assert rows[0]["temperature"] == pytest.approx(20.0)
    assert rows[0]["setpoint"] == pytest.approx(17.0)


def test_energy_deltas_by_day_with_reset(env):
    db, house, clock, rec = env
    readings = [
        (ts(2026, 10, 12, 23), 1000),
        (ts(2026, 10, 13, 1), 1500),
        (ts(2026, 10, 13, 2), 200),  # meter reset → counts 200
        (ts(2026, 10, 14, 1), 1200),
    ]
    for t, total in readings:
        clock.t = t
        house.apply(StateChange(ENERGY, "core:ElectricEnergyConsumptionState", total))
        rec.snapshot_energy()
    rows = rec.energy(["9312063"], ts(2026, 10, 13), ts(2026, 10, 15), "day")
    assert [(r["bucket"], r["kwh"]) for r in rows] == [("2026-10-13", 0.7), ("2026-10-14", 1.0)]


def test_energy_month_bucket_across_dst_change(env):
    _, house, clock, rec = env
    for t, total in [
        (ts(2026, 10, 24, 12), 0),
        (ts(2026, 10, 25, 12), 3000),
        (ts(2026, 11, 1, 0, 30), 5000),
    ]:
        clock.t = t
        house.apply(StateChange(ENERGY, "core:ElectricEnergyConsumptionState", total))
        rec.snapshot_energy()
    rows = rec.energy(["9312063"], ts(2026, 10, 1), ts(2026, 12, 1), "month")
    assert [(r["bucket"], r["kwh"]) for r in rows] == [("2026-10", 3.0), ("2026-11", 2.0)]


def test_settings_and_command_log(env):
    db, _, _, _ = env
    assert db.get_setting("tariff", {"x": 1}) == {"x": 1}
    db.set_setting("tariff", {"hc": 0.2})
    assert db.get_setting("tariff") == {"hc": 0.2}
    db.log_command(
        {
            "id": "a",
            "label": "L",
            "radiator_ids": ["1"],
            "status": "confirmed",
            "error": None,
            "created_at": 1.0,
        },
        [{"name": "on"}],
    )
    assert db.query("SELECT status FROM command_log")[0]["status"] == "confirmed"


def _log(db, cid, at):
    db.log_command(
        {
            "id": cid,
            "label": "L",
            "radiator_ids": [],
            "status": "confirmed",
            "error": None,
            "created_at": at,
        },
        [],
    )


def test_prune_drops_old_samples_and_command_log_but_keeps_energy(env):
    db, _, clock, rec = env
    old_samples = rec.sample()
    _log(db, "old", clock())
    energy = rec.snapshot_energy()
    clock.advance(SAMPLE_RETENTION_S + 1)
    new_samples = rec.sample()
    _log(db, "new", clock())
    assert rec.prune() == old_samples + 1
    assert {r["ts"] for r in db.query("SELECT ts FROM samples")} == {int(clock())}
    assert len(db.query("SELECT * FROM samples")) == new_samples
    assert [r["id"] for r in db.query("SELECT id FROM command_log")] == ["new"]
    assert len(db.query("SELECT * FROM energy")) == energy  # the bill needs every reading


def test_prune_keeps_recent_rows(env):
    db, _, clock, rec = env
    rec.sample()
    _log(db, "recent", clock())
    clock.advance(COMMAND_LOG_RETENTION_S - 1)
    assert rec.prune() == 0


def test_timestamp_indexes_exist_and_serve_the_prune(env):
    db, *_ = env
    names = {r["name"] for r in db.query("SELECT name FROM sqlite_master WHERE type = 'index'")}
    assert {"samples_ts", "command_log_ts"} <= names
    plan = db.query("EXPLAIN QUERY PLAN DELETE FROM samples WHERE ts < 5")
    assert "samples_ts" in " ".join(r["detail"] for r in plan)


def test_prune_deletes_in_chunks_and_removes_more_than_one_chunk(env):
    db, house, clock, rec = env
    old = int(clock()) - SAMPLE_RETENTION_S - 10
    db.executemany(
        "INSERT INTO samples (ts, radiator_id) VALUES (?, ?)",
        [(old - i, "r1") for i in range(25)],
    )
    db.executemany("INSERT INTO linky_daily VALUES (?, ?)", [("2020-01-01", 5)])
    db.executemany("INSERT INTO energy VALUES (?,?,?,?,?)", [(old, "r1", 1, 1, 0)])
    assert rec.prune(chunk=10) == 25
    assert db.query("SELECT * FROM samples") == []
    assert len(db.query("SELECT * FROM linky_daily")) == 1
    assert len(db.query("SELECT * FROM energy")) == 1


def test_prune_if_due_runs_at_most_once_a_day_and_survives_restart(env):
    db, house, clock, rec = env
    rec.sample()
    clock.advance(SAMPLE_RETENTION_S + 1)
    assert rec.prune_if_due() == 4
    rec.sample()
    clock.advance(SAMPLE_RETENTION_S)  # even with more old rows, within 24 h: nothing
    clock.advance(-SAMPLE_RETENTION_S + 3600)
    assert rec.prune_if_due() == 0
    # a fresh Recorder (restart) reads the stored time, not zero
    assert Recorder(db, house, wall=clock).prune_if_due() == 0
    clock.advance(86400)
    assert rec.prune_if_due() == 0  # due again, nothing old enough: runs without error
    assert db.get_setting("last_prune") == int(clock())


def test_close_waits_for_a_statement_in_progress():
    db = Database(":memory:")
    db._lock.acquire()  # a statement running on another thread (a prune chunk, say)
    closer = threading.Thread(target=db.close)
    closer.start()
    closer.join(0.2)
    assert closer.is_alive(), "close() must not pull the connection from under a statement"
    assert not db.closed
    db._lock.release()
    closer.join(2)
    assert not closer.is_alive() and db.closed
    db.close()  # closing twice is harmless


def test_a_closed_database_refuses_statements_with_its_own_error():
    db = Database(":memory:")
    db.close()
    with pytest.raises(DatabaseClosed):
        db.execute("SELECT 1")
    with pytest.raises(DatabaseClosed):
        db.query("SELECT 1")
    with pytest.raises(DatabaseClosed):
        db.executemany("INSERT INTO settings VALUES (?, ?)", [("a", "1")])


def test_prune_stops_quietly_when_the_database_closes_under_it(env):
    db, house, clock, rec = env
    old = int(clock()) - SAMPLE_RETENTION_S - 10
    db.executemany(
        "INSERT INTO samples (ts, radiator_id) VALUES (?, ?)",
        [(old - i, "r1") for i in range(25)],
    )
    db.set_setting("last_prune", 0)
    execute = db.execute

    def execute_then_shut_down(sql, params=()):
        n = execute(sql, params)
        db.close()  # shutdown lands between two chunks
        return n

    db.execute = execute_then_shut_down
    assert rec.prune(chunk=10) == 10
    db.execute = execute
    assert rec.prune_if_due() == 0  # closed: nothing to do, no error
