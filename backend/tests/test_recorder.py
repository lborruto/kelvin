import threading
from datetime import date, datetime
from zoneinfo import ZoneInfo

import pytest

from kelvin.house.model import build_house
from kelvin.overkiz.models import StateChange
from kelvin.overkiz.sample import SAMPLE_GATEWAY, sample_house
from kelvin.recorder.db import Database, DatabaseClosed
from kelvin.recorder.energy import local_edges
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


def record(house, clock, rec, readings, url=ENERGY):
    for t, total in readings:
        clock.t = t
        house.apply(StateChange(url, "core:ElectricEnergyConsumptionState", total))
        rec.snapshot_energy()


def day_kwh(rec, ids, first, last):
    edges = local_edges(first, last, "day", PARIS)
    return {
        rid: [None if b.wh is None else round(b.wh / 1000, 3) for b in row]
        for rid, row in rec.energy_buckets(edges, ids).items()
    }


def test_counters_are_written_when_they_change_at_the_time_kelvin_learns_them(env):
    db, house, clock, rec = env
    assert rec.snapshot_energy() == 4  # first sight of every meter
    clock.advance(300)
    assert rec.snapshot_energy() == 0  # nothing moved: no reading
    clock.advance(17)
    house.apply(StateChange(ENERGY, "core:ElectricEnergyConsumptionState", 2_400_500))
    assert rec.snapshot_energy({"9312063"}) == 1
    rows = db.query("SELECT ts, total_wh FROM energy WHERE radiator_id = '9312063' ORDER BY ts")
    assert [(r["ts"], r["total_wh"]) for r in rows] == [
        (int(ts(2026, 10, 13, 12)), 2_400_000),
        (int(ts(2026, 10, 13, 12)) + 317, 2_400_500),
    ]
    # A restart reads the last row back: the unchanged value is not written again.
    assert Recorder(db, house, wall=clock).snapshot_energy() == 0


def test_an_absent_register_is_stored_as_null(env):
    db, house, _, rec = env
    del house.radiators["9312063"].states[ENERGY]["core:ConsumptionTariff1State"]
    rec.snapshot_energy({"9312063"})
    assert db.query("SELECT t1_wh FROM energy")[0]["t1_wh"] is None


def test_energy_is_spread_over_the_time_between_readings_and_a_reset_counts(env):
    _, house, clock, rec = env
    record(
        house,
        clock,
        rec,
        [
            (ts(2026, 10, 12, 23), 1000),
            (ts(2026, 10, 13, 1), 1500),  # 500 Wh over 23:00–01:00: half on each day
            (ts(2026, 10, 13, 2), 200),  # meter reset: 200 Wh
            (ts(2026, 10, 14, 2), 1400),  # 1200 Wh over 24 h: 22/24 on the 13th
        ],
    )
    got = day_kwh(rec, ["9312063"], date(2026, 10, 12), date(2026, 10, 15))["9312063"]
    assert got == [0.25, round(0.25 + 0.2 + 1.2 * 22 / 24, 3), 0.1]


def test_month_buckets_split_a_span_at_the_month_edge(env):
    _, house, clock, rec = env
    record(
        house,
        clock,
        rec,
        [(ts(2026, 10, 31, 12), 0), (ts(2026, 11, 1, 12), 2500)],  # 12 h on each side
    )
    edges = local_edges(date(2026, 10, 1), date(2026, 12, 1), "month", PARIS)
    [oct_, nov] = rec.energy_buckets(edges, ["9312063"])["9312063"]
    assert (oct_.wh, nov.wh) == (pytest.approx(1250.0), pytest.approx(1250.0))
    assert oct_.apportioned and nov.apportioned


def test_the_time_after_the_last_reading_is_unknown(env):
    _, house, clock, rec = env
    record(house, clock, rec, [(ts(2026, 10, 13, 6), 1000), (ts(2026, 10, 13, 18), 2000)])
    got = day_kwh(rec, ["9312063"], date(2026, 10, 13), date(2026, 10, 15))["9312063"]
    assert got == [1.0, None]  # nothing is known after 18:00 on the 13th until the next change


def test_working_rate_samples_decide_where_a_gap_s_energy_goes(env):
    _, house, clock, rec = env
    heater = f"{SAMPLE_GATEWAY}/9312063#1"
    clock.t = ts(2026, 10, 13, 0)
    house.apply(StateChange(ENERGY, "core:ElectricEnergyConsumptionState", 10_000))
    rec.snapshot_energy()
    for i in range(12 * 10):  # 10 h of 5-min samples; heating only from 09:00
        clock.t = ts(2026, 10, 13, 0) + i * 300
        rate = 100.0 if i >= 108 else 0.0
        house.apply(StateChange(heater, "io:CurrentWorkingRateState", rate))
        rec.sample()
    clock.t = ts(2026, 10, 13, 10)
    house.apply(StateChange(ENERGY, "core:ElectricEnergyConsumptionState", 11_000))
    rec.snapshot_energy()
    edges = [int(ts(2026, 10, 13, h)) for h in range(11)]
    hours = rec.energy_buckets(edges, ["9312063"])["9312063"]
    assert [round(b.wh, 3) for b in hours] == [0.0] * 9 + [1000.0]
    assert hours[9].interpolated and hours[9].apportioned


def test_a_radiator_no_longer_in_the_house_still_counts(env):
    db, _, _, rec = env
    db.executemany(
        "INSERT INTO energy VALUES (?,?,?,?,?)",
        [
            (int(ts(2026, 10, 13)), "gone", 0.0, None, None),
            (int(ts(2026, 10, 14)), "gone", 24.0, None, None),
        ],
    )
    got = day_kwh(rec, None, date(2026, 10, 13), date(2026, 10, 14))
    assert got == {"gone": [0.024]}


def test_legacy_hourly_rows_then_change_only_rows_give_the_true_days(env):
    """Rows recorded hourly before Plan 5 (with repeats) and change-only rows after it feed
    the same pipeline: 1 kWh/h for two days reads 24.0 and 24.0."""
    db, house, clock, rec = env
    legacy = [
        (int(ts(2026, 10, 12)) + h * 3600, "9312063", 10_000.0 + 1000 * h, None, None)
        for h in range(25)
    ]
    db.executemany("INSERT INTO energy VALUES (?,?,?,?,?)", legacy)
    db.execute(  # the same value re-read an hour later, as the old hourly snapshot did
        "INSERT INTO energy VALUES (?,?,?,?,?)",
        (int(ts(2026, 10, 13, 0, 30)), "9312063", 34_000.0, None, None),
    )
    rec = Recorder(db, house, wall=clock)
    record(house, clock, rec, [(ts(2026, 10, 13, 6), 40_000), (ts(2026, 10, 14), 58_000)])
    got = day_kwh(rec, ["9312063"], date(2026, 10, 12), date(2026, 10, 14))["9312063"]
    assert got == [24.0, 24.0]


def test_a_year_of_five_minute_readings_stays_fast(env):
    import time as _time

    db, _, _, rec = env
    a = int(ts(2025, 10, 1))
    db.executemany(
        "INSERT INTO energy VALUES (?,?,?,?,?)",
        [(a + i * 300, "9312063", 1_000_000.0 + i * 50, None, None) for i in range(366 * 288)],
    )
    edges = local_edges(date(2025, 10, 1), date(2026, 10, 1), "day", PARIS)
    t0 = _time.perf_counter()
    days = rec.energy_buckets(edges, ["9312063"])["9312063"]
    assert _time.perf_counter() - t0 < 5.0
    assert sum(b.wh for b in days) == pytest.approx(50 * 365 * 288)


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


def test_prune_rejects_a_non_positive_chunk(env):
    _, _, _, rec = env
    for chunk in (0, -5):
        with pytest.raises(ValueError):
            rec.prune(chunk)


def test_readings_and_samples_stream_in_pages_with_the_same_result(env, monkeypatch):
    import kelvin.recorder.recorder as recorder_module

    db, _, _, rec = env
    a = int(ts(2026, 10, 13))
    db.executemany(
        "INSERT INTO energy VALUES (?,?,?,?,?)",
        [(a + i * 600, "9312063", 1000.0 + i * 37, None, None) for i in range(100)],
    )
    db.executemany(
        "INSERT INTO samples (ts, radiator_id, working_rate) VALUES (?,?,?)",
        [(a + i * 300, "9312063", float(i % 3) * 50) for i in range(200)],
    )
    edges = [a + h * 3600 for h in range(1, 16)]
    whole = rec.energy_buckets(edges, ["9312063"])
    monkeypatch.setattr(recorder_module, "PAGE_ROWS", 7)
    assert rec.energy_buckets(edges, ["9312063"]) == whole
