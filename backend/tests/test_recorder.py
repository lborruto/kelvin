import threading
import time
from contextlib import ExitStack
from datetime import date, datetime, timedelta
from unittest import mock
from zoneinfo import ZoneInfo

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

import kelvin.recorder.recorder as recorder_module
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
            (ts(2026, 10, 13, 2), 200),  # meter reset: 200 Wh...
            (ts(2026, 10, 14, 2), 700),  # ...confirmed (still low); 500 Wh over 24 h
        ],
    )
    got = day_kwh(rec, ["9312063"], date(2026, 10, 12), date(2026, 10, 15))["9312063"]
    assert got == [0.25, round(0.25 + 0.2 + 0.5 * 22 / 24, 3), round(0.5 * 2 / 24, 3)]


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


def _h(d, h=0):
    return int(ts(2026, 10, d, h))


@pytest.mark.parametrize(
    "rows",
    [
        # a glitch just after the window: the span crossing its end must not stop there
        [(_h(13, 10), 1_000_000), (_h(13, 12), 1_001_000), (_h(14, 1), 1_000_999)]
        + [(_h(14, 12), 1_002_000)],
        # a blip down then back before the window: the reference is the high-water mark
        [(_h(12, 0), 1_000_000), (_h(12, 1), 999_999), (_h(12, 12), 1_000_000)]
        + [(_h(13, 12), 1_001_000)],
        # the value the counter held at the window start is a glitch
        [(_h(12, 0), 1_000_000), (_h(12, 12), 999_999), (_h(14, 0), 1_002_000)],
    ],
    ids=["tail-glitch", "head-blip-recovered", "head-glitch-value"],
)
def test_a_day_gets_the_same_energy_whatever_the_window(env, rows):
    db, _, _, rec = env
    db.executemany(
        "INSERT INTO energy VALUES (?,?,?,?,?)", [(t, "g", v, None, None) for t, v in rows]
    )
    alone = day_kwh(rec, ["g"], date(2026, 10, 13), date(2026, 10, 14))["g"]
    two = day_kwh(rec, ["g"], date(2026, 10, 13), date(2026, 10, 15))["g"]
    three = day_kwh(rec, ["g"], date(2026, 10, 12), date(2026, 10, 15))["g"]
    assert alone[0] == two[0] == three[1]


@st.composite
def messy_history(draw):
    """Two weeks of one counter at irregular gaps (1 min to 20 h) with blips, absent values,
    transient drops to 0, true resets and upward spikes; sometimes working-rate samples."""
    t = _h(1)
    v = float(draw(st.integers(2_000, 2_000_000)))
    rows = []
    while t < _h(15):
        t += draw(st.sampled_from([20 * 3600, 3 * 3600, 3600, 300, 60]))
        kind = draw(
            st.sampled_from(["up"] * 6 + ["flat", "blip", "zero", "reset", "spike", "none"])
        )
        if kind == "up":
            v += draw(st.integers(0, 800))
            rows.append((t, v))
        elif kind == "flat":
            rows.append((t, v))
        elif kind == "blip":
            rows.append((t, v - draw(st.sampled_from([1, 50]))))
        elif kind == "zero":
            rows.append((t, 0.0))
        elif kind == "reset":
            v = float(draw(st.integers(0, int(v * 0.3))))
            rows.append((t, v))
        elif kind == "spike":
            rows.append((t, v + 10_000_000))
        else:
            rows.append((t, None))
    samples = []
    if draw(st.booleans()):  # a daily heating pattern, one rate per hour
        pattern = draw(st.lists(st.sampled_from([0.0, 50.0, 100.0]), min_size=24, max_size=24))
        s0 = _h(1)
        samples = [(s0 + i * 300, pattern[i // 12 % 24]) for i in range(14 * 288)]
    return rows, samples


@settings(
    max_examples=60,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.large_base_example],
)
@given(
    messy_history(),
    st.sampled_from(["g", "9312063"]),  # power unknown / 1500 W
    st.sampled_from([None, (2 * 86400, 86400)]),  # default chunks, or small ones
    st.sampled_from(["day", "hour"]),
)
def test_property_a_bucket_is_the_same_in_any_window(history, rid, chunking, unit):
    rows, samples = history
    db = Database(":memory:")
    rec = Recorder(db, build_house(*sample_house()))
    db.executemany(
        "INSERT INTO energy VALUES (?,?,?,?,?)", [(t, rid, v, None, v and v / 2) for t, v in rows]
    )
    db.executemany(
        "INSERT INTO samples (ts, radiator_id, working_rate) VALUES (?,?,?)",
        [(t, rid, r) for t, r in samples],
    )
    with ExitStack() as stack:
        if chunking:
            stack.enter_context(mock.patch.object(recorder_module, "CHUNK_S", chunking[0]))
            stack.enter_context(mock.patch.object(recorder_module, "LOOKBACK_S", chunking[1]))
        days = [date(2026, 10, 2) + timedelta(days=i) for i in range(12)]
        for counter in ("total", "t2"):
            big_edges = local_edges(days[0], days[-1] + timedelta(days=1), unit, PARIS)
            big = rec.energy_buckets(big_edges, [rid], counter=counter)[rid]
            per_day = []
            for d in days:
                edges = local_edges(d, d + timedelta(days=1), unit, PARIS)
                per_day += rec.energy_buckets(edges, [rid], counter=counter)[rid]
            assert len(per_day) == len(big)
            for a, b in zip(big, per_day, strict=True):
                assert (a.wh is None) == (b.wh is None)
                assert (a.wh or 0.0) == pytest.approx(b.wh or 0.0, rel=1e-9, abs=1e-6)
                assert (a.covered_s, a.interpolated, a.apportioned) == (
                    b.covered_s,
                    b.interpolated,
                    b.apportioned,
                )


@pytest.mark.perf
def test_ten_radiators_over_four_years_stay_fast(env):
    """10 radiators × 4 years of hourly readings + 400 days of 5-min samples: the day, month
    and hourly radiator views each answer in well under the bound (generous: CI machines)."""
    db, house, _, rec = env
    now = int(ts(2026, 10, 14, 12))
    ids = [*house.radiators, *(f"x{i}" for i in range(6))]
    a, s = now - 4 * 366 * 86400, now - 400 * 86400
    for rid in ids:
        db.executemany(
            "INSERT INTO energy VALUES (?,?,?,?,?)",
            [
                (a + h * 3600, rid, 1e6 + h * 300, (1e6 + h * 300) * 0.4, (1e6 + h * 300) * 0.6)
                for h in range(4 * 366 * 24)
            ],
        )
        db.executemany(
            "INSERT INTO samples (ts, radiator_id, working_rate) VALUES (?,?,?)",
            [(s + i * 300, rid, float(i % 5 * 25)) for i in range(400 * 288)],
        )
    for unit, days in (("day", 4 * 366), ("month", 4 * 366), ("hour", 62)):
        t0 = time.perf_counter()
        rows = rec.radiator_energy(ids, now - days * 86400, now, unit)
        assert time.perf_counter() - t0 < 5.0, unit
        assert rows


def test_a_failed_energy_write_is_retried(env, monkeypatch):
    db, _, clock, rec = env
    real = db.executemany

    def full(sql, rows):
        raise RuntimeError("disk full")

    monkeypatch.setattr(db, "executemany", full)
    with pytest.raises(RuntimeError):
        rec.snapshot_energy()
    monkeypatch.setattr(db, "executemany", real)
    clock.advance(300)
    assert rec.snapshot_energy() == 4


def _chunk_start():
    return int(ts(2026, 10, 14)) // recorder_module.CHUNK_S * recorder_module.CHUNK_S


@pytest.mark.parametrize("rid", ["9312063", "g"])  # 1500 W, power unknown
@pytest.mark.parametrize("glitch", ["zero", "70pct"])
def test_a_glitch_at_the_chunk_anchor_changes_nothing(rid, glitch):
    """The last reading before a chunk's replay start is a glitch: the chunk's days read the
    same as without it (not unknown, not inflated)."""
    g = _chunk_start()
    anchor = g - recorder_module.LOOKBACK_S

    def days(glitched):
        db = Database(":memory:")
        rec = Recorder(db, build_house(*sample_house()))
        rows = [
            [t, 3_000_000.0 + 300 * i]
            for i, t in enumerate(range(g - 40 * 86400, g + 40 * 86400, 1800))
        ]
        if glitched:
            k = max(i for i, (t, _) in enumerate(rows) if t < anchor)
            rows[k][1] = 0.0 if glitch == "zero" else rows[k][1] * 0.7
        db.executemany(
            "INSERT INTO energy VALUES (?,?,?,?,?)", [(t, rid, v, None, None) for t, v in rows]
        )
        d0 = datetime.fromtimestamp(g + 2 * 86400, PARIS).date()
        edges = local_edges(d0, d0 + timedelta(days=5), "day", PARIS)
        return [b.wh for b in rec.energy_buckets(edges, [rid])[rid]]

    clean = days(False)
    assert clean == pytest.approx([14_400.0] * 5)
    assert days(True) == pytest.approx(clean)


def test_legacy_repeated_rows_across_a_chunk_start_are_counted_once():
    """Rows written every 5 min before Plan 5 repeat a flat value: a flat stretch across a
    chunk start then +1 kWh is 1 kWh in total, spread as with change-only rows."""
    g = _chunk_start()

    def buckets(hourly):
        db = Database(":memory:")
        rec = Recorder(db, build_house(*sample_house()))
        rows = [(g - 10 * 86400, 1_000_000.0)]
        if hourly:
            rows += [(t, 1_000_000.0) for t in range(g - 10 * 86400 + 3600, g + 86400, 3600)]
        rows.append((g + 86400, 1_001_000.0))
        db.executemany(
            "INSERT INTO energy VALUES (?,?,?,?,?)", [(t, "g", v, None, None) for t, v in rows]
        )
        edges = list(range(g - 12 * 86400, g + 3 * 86400, 86400))
        return [b.wh for b in rec.energy_buckets(edges, ["g"])["g"]]

    legacy = buckets(True)
    assert sum(x or 0.0 for x in legacy) == pytest.approx(1000.0)
    assert legacy == pytest.approx(buckets(False))
