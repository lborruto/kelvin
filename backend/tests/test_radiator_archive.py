"""A complete radiator-day is final across a prune: its half-hours are kept (`radiator_halfhours`)
before the working-rate samples that weight them are deleted, so the old days read the same
kWh, HC/HP and € afterwards, and a prune drops nothing the report had cached."""

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from kelvin.billing.slots import Slot
from kelvin.billing.tariff import Prices, Tariff
from kelvin.house.model import build_house
from kelvin.linky.fake import FakeLinkySource
from kelvin.linky.service import LinkyService
from kelvin.overkiz.models import StateChange
from kelvin.overkiz.sample import SAMPLE_GATEWAY, sample_house
from kelvin.recorder.db import Database
from kelvin.recorder.energy import local_edges
from kelvin.recorder.recorder import SAMPLE_RETENTION_S, Recorder
from tests.conftest import ManualClock

PARIS = ZoneInfo("Europe/Paris")
RID = "9500003"  # 1 500 W in the sample house
ENERGY = f"{SAMPLE_GATEWAY}/9500003#5"
NIGHT = Tariff("hchp", 9, (Slot("22:00", "06:00"),), (Prices(date(2000, 1, 1), 15.0, 0.2, 0.3),))
NOW = datetime(2026, 12, 20, 12, tzinfo=PARIS)
OLD = (date(2025, 10, 10), date(2025, 10, 16))  # more than 400 days before NOW
DEC = (date(2026, 12, 1), date(2027, 1, 1))


def ts(d: date, h: int = 0) -> int:
    return int(datetime(d.year, d.month, d.day, h, tzinfo=PARIS).timestamp())


def night_samples(a: int, b: int) -> list[tuple[int, str, float]]:
    """A sample every 5 minutes over [a, b): heating at full power from 22:00 to 06:00 only."""
    out = []
    for t in range(a, b, 300):
        h = datetime.fromtimestamp(t, PARIS).hour
        out.append((t, RID, 100.0 if h >= 22 or h < 6 else 0.0))
    return out


@pytest.fixture
def home():
    """One radiator. In October 2025 (older than the sample retention): a reading every 6 h and
    samples that put the heating in the night. In December 2026: a reading every hour up to the
    15th at noon, as in `test_radiator_cache.py`."""
    clock = ManualClock(NOW.timestamp())
    db = Database(":memory:")
    house = build_house(*sample_house())
    rows, wh = [], 1_000_000.0
    for t in range(ts(OLD[0]), ts(OLD[1]) + 1, 6 * 3600):
        rows.append((t, RID, wh))
        wh += 600
    for t in range(ts(DEC[0]), ts(date(2026, 12, 15), 12) + 1, 3600):
        rows.append((t, RID, wh))
        wh += 500
    db.executemany("INSERT INTO energy VALUES (?,?,?,NULL,NULL)", rows)
    samples = night_samples(ts(OLD[0]), ts(OLD[1]))
    db.executemany("INSERT INTO samples (ts, radiator_id, working_rate) VALUES (?,?,?)", samples)
    house.apply(StateChange(ENERGY, "core:ElectricEnergyConsumptionState", rows[-1][2]))
    rec = Recorder(db, house, wall=clock)
    svc = LinkyService(db, make_source=lambda *_: FakeLinkySource(), credentials=None, wall=clock)
    svc.tariffs.save(NIGHT)
    rooms = {rid: r.room_id for rid, r in house.radiators.items()}
    return clock, db, rec, svc, rooms, len(samples)


SAMPLE_STATS = {"temp_avg", "setpoint_avg", "heating_hours"}  # room statistics: from samples


def figures(v):
    """A report without the statistics read from the samples themselves (they go with them)."""
    if isinstance(v, dict):
        return {k: figures(x) for k, x in v.items() if k not in SAMPLE_STATS}
    return [figures(x) for x in v] if isinstance(v, list) else v


def report(svc, rec, rooms, window=OLD):
    return figures(svc.report(window[0], window[1], "day", rec, rooms, window))


def fresh(db, clock, rec, rooms, window=OLD, tariff=None):
    """The same report from a service with nothing cached."""
    svc = LinkyService(db, make_source=lambda *_: FakeLinkySource(), credentials=None, wall=clock)
    if tariff is not None:
        svc.tariffs.save(tariff)
    return report(svc, rec, rooms, window)


def radiators(r, key):
    return next(b for b in r["buckets"] if b["key"] == key)["radiators"]


def halfhours(rec, lo: date, hi: date):
    return rec.energy_buckets(local_edges(lo, hi, "halfhour", PARIS), [RID])[RID]


def test_an_old_day_reads_the_same_before_and_after_the_prune(home):
    clock, db, rec, svc, rooms, n_samples = home
    before = report(svc, rec, rooms)
    day = radiators(before, "2025-10-12")
    assert day["coverage"] == 1
    # The working rate puts the 18:00–24:00 reading in 22:00–24:00: half the day is off-peak.
    assert (day["kwh"], day["hc_kwh"], day["hp_kwh"]) == (2.4, 1.2, 1.2)
    hours = halfhours(rec, *OLD)
    epoch = rec.energy_epoch
    assert rec.prune() == n_samples
    assert db.query("SELECT COUNT(*) AS n FROM samples")[0]["n"] == 0
    assert rec.energy_epoch == epoch  # nothing a prune can change is left to recompute
    assert report(svc, rec, rooms) == before
    assert fresh(db, clock, rec, rooms) == before
    assert halfhours(rec, *OLD) == hours
    # One day asked on its own, and the day view's own half-hours: the same buckets.
    one = (date(2025, 10, 12), date(2025, 10, 13))
    assert halfhours(rec, *one) == hours[2 * 48 : 3 * 48]
    # A later prune, a day on: the same again.
    clock.advance(86400)
    assert rec.prune() == 0
    later = fresh(db, clock, rec, rooms)  # (its « today » moved: the window's figures did not)
    assert (later["buckets"], later["by_radiator"]) == (before["buckets"], before["by_radiator"])
    assert halfhours(rec, *OLD) == hours


def test_a_tariff_change_reprices_an_old_day_from_its_kept_half_hours(home):
    clock, db, rec, svc, rooms, _ = home
    dearer = Tariff(
        "hchp", 9, (Slot("22:00", "06:00"),), (Prices(date(2000, 1, 1), 15.0, 0.25, 0.35),)
    )
    expected = fresh(db, clock, rec, rooms, tariff=dearer)
    rec.prune()
    svc.tariffs.save(dearer)
    got = report(svc, rec, rooms)
    assert got == expected
    assert radiators(got, "2025-10-12")["eur"] == round(1.2 * 0.25 + 1.2 * 0.35, 2)


def test_a_prune_leaves_the_cached_days_cached(home, monkeypatch):
    clock, db, rec, svc, rooms, _ = home
    cold = report(svc, rec, rooms, DEC)
    asked: list[int] = []
    original = rec.energy_buckets

    def spy(edges, *args, **kwargs):
        asked.append(edges[0])
        return original(edges, *args, **kwargs)

    assert rec.prune() > 0
    monkeypatch.setattr(rec, "energy_buckets", spy)
    assert report(svc, rec, rooms, DEC) == cold
    # Only the days since the counter last moved (15 December on) are read again.
    assert asked and min(asked) >= ts(date(2026, 12, 15))


def test_the_daily_buckets_of_an_old_day_follow_its_kept_half_hours(home):
    """`/api/energy/radiators` by day or hour: the same kWh as the half-hours add up to."""
    clock, db, rec, svc, rooms, _ = home
    a, b = ts(OLD[0]), ts(OLD[1])
    days = rec.radiator_energy([RID], a, b, "day")
    hours = rec.radiator_energy([RID], a, b, "hour")
    rec.prune()
    assert rec.radiator_energy([RID], a, b, "day") == days
    assert rec.radiator_energy([RID], a, b, "hour") == hours


def test_a_span_across_the_cutoff_keeps_its_days_too():
    """A reading that closes four idle days, two of them older than the cutoff: its energy was
    put in its last two hours by the working rate. Deleting the samples of its first half must
    not spread it over the four days."""
    clock = ManualClock(NOW.timestamp())
    cutoff = int(clock()) - SAMPLE_RETENTION_S  # 15 November 2025 at noon
    d = date(2025, 11, 15)
    db = Database(":memory:")
    house = build_house(*sample_house())
    rows, wh = [], 1_000_000.0
    for t in range(ts(d - timedelta(days=4)), ts(d - timedelta(days=2), 12) + 1, 3600):
        rows.append((t, RID, wh))
        wh += 100
    wh += 2900  # the idle days end with two hours of heating
    for t in range(ts(d + timedelta(days=2), 12), ts(d + timedelta(days=4)) + 1, 3600):
        rows.append((t, RID, wh))
        wh += 100
    db.executemany("INSERT INTO energy VALUES (?,?,?,NULL,NULL)", rows)
    idle = (ts(d - timedelta(days=2), 12), ts(d + timedelta(days=2), 12))
    db.executemany(
        "INSERT INTO samples (ts, radiator_id, working_rate) VALUES (?,?,?)",
        [(t, RID, 100.0 if t >= idle[1] - 7200 else 0.0) for t in range(idle[0], idle[1], 300)],
    )
    rec = Recorder(db, house, wall=clock)
    lo, hi = d - timedelta(days=4), d + timedelta(days=4)
    before = halfhours(rec, lo, hi)
    by_day = rec.radiator_energy([RID], ts(lo), ts(hi), "day")
    last = [r["kwh"] for r in by_day if r["bucket"] == str(d + timedelta(days=2))]
    assert last == [3.0 + 1.2]  # the 3 kWh of the idle span, then 12 hours at 100 Wh
    assert rec.prune() == (cutoff - idle[0]) // 300
    assert halfhours(rec, lo, hi) == before
    assert rec.radiator_energy([RID], ts(lo), ts(hi), "day") == by_day


def test_only_complete_days_are_kept_and_once(home):
    clock, db, rec, svc, rooms, _ = home
    rec.prune()
    kept = db.query("SELECT day FROM radiator_halfhours WHERE radiator_id = ? ORDER BY day", (RID,))
    days = [r["day"] for r in kept]
    assert days[0] == "2025-10-10" and "2025-10-15" in days
    # 15 December 2026 is measured up to noon only: not final, never kept.
    assert "2026-12-15" not in days and len(days) == len(set(days))
    rows = db.query("SELECT COUNT(*) AS n FROM radiator_halfhours")[0]["n"]
    clock.advance(86400)
    rec.prune()
    assert db.query("SELECT COUNT(*) AS n FROM radiator_halfhours")[0]["n"] == rows


def test_kept_and_computed_days_mix_in_one_window(home):
    """A day that was not kept sits between kept ones: it is computed from the readings (by
    time, its samples are gone), the days around it are read as kept."""
    clock, db, rec, svc, rooms, _ = home
    hours = halfhours(rec, *OLD)
    rec.prune()
    db.execute("DELETE FROM radiator_halfhours WHERE day = '2025-10-12'")
    got = halfhours(rec, *OLD)
    assert got[: 2 * 48] == hours[: 2 * 48] and got[3 * 48 :] == hours[3 * 48 :]
    day = got[2 * 48 : 3 * 48]
    assert sum(b.wh for b in day) == pytest.approx(2400.0) and day != hours[2 * 48 : 3 * 48]
    assert all(b.covered_s == 1800 for b in day)


def test_a_reading_written_into_the_past_forgets_the_kept_days_it_can_change(home):
    """The wall clock steps back by more than a year and a reading lands inside kept days:
    history is rewritten (`energy_epoch` moves), so those days are computed again."""
    clock, db, rec, svc, rooms, _ = home
    rec.prune()
    epoch = rec.energy_epoch
    clock.t = ts(date(2025, 10, 13), 3)
    rec.house.apply(StateChange(ENERGY, "core:ElectricEnergyConsumptionState", 1_007_400.0))
    assert rec.snapshot_energy([RID]) == 1 and rec.energy_epoch == epoch + 1
    kept = db.query("SELECT day FROM radiator_halfhours WHERE radiator_id = ? ORDER BY day", (RID,))
    assert [r["day"] for r in kept] == ["2025-10-10", "2025-10-11"]
