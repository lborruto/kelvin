"""Final review I-4: the radiators' per-day figures are cached for the days that can no longer
change, so a December report does not replay the half-hours from 1 January on every request; the
cache never serves a figure a fresh computation would not give."""

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from kelvin.billing.slots import Slot
from kelvin.billing.tariff import PriceRow, Prices, Tariff
from kelvin.house.model import build_house
from kelvin.linky.fake import FakeLinkySource
from kelvin.linky.service import LinkyService
from kelvin.overkiz.models import StateChange
from kelvin.overkiz.sample import SAMPLE_GATEWAY, sample_house
from kelvin.recorder.db import Database
from kelvin.recorder.recorder import Recorder

PARIS = ZoneInfo("Europe/Paris")
RID = "9500003"  # 1 500 W in the sample house
ENERGY = f"{SAMPLE_GATEWAY}/9500003#5"
T_TARIFF = Tariff("hchp", 9, (Slot("22:00", "06:00"),), (Prices(date(2000, 1, 1), 15.0, 0.2, 0.3),))
DEC = (date(2026, 12, 1), date(2027, 1, 1))


def ts(d: date, h: int = 0) -> int:
    return int(datetime(d.year, d.month, d.day, h, tzinfo=PARIS).timestamp())


class Clock:
    def __init__(self, t: float) -> None:
        self.t = t

    def __call__(self) -> float:
        return self.t


@pytest.fixture
def home():
    """One radiator measured hourly from 1 March to 15 December at noon (500 Wh an hour), then
    quiet: the time since its counter last moved is unknown until it moves again."""
    clock = Clock(ts(date(2026, 12, 20), 12))
    db = Database(":memory:")
    house = build_house(*sample_house())
    rows = []
    t, wh = ts(date(2026, 3, 1)), 1_000_000.0
    while t <= ts(date(2026, 12, 15), 12):
        rows.append((t, RID, wh))
        t, wh = t + 3600, wh + 500
    db.executemany("INSERT INTO energy VALUES (?,?,?,NULL,NULL)", rows)
    set_total(house, rows[-1][2])
    rec = Recorder(db, house, wall=clock)
    svc = LinkyService(db, make_source=lambda *_: FakeLinkySource(), credentials=None, wall=clock)
    svc.tariffs.save(T_TARIFF)
    rooms = {rid: r.room_id for rid, r in house.radiators.items()}
    return clock, db, house, rec, svc, rooms


def set_total(house, wh: float) -> None:
    house.apply(StateChange(ENERGY, "core:ElectricEnergyConsumptionState", wh))


def total(house) -> float:
    return house.radiators[RID].energy_wh["total"]


def report(svc, rec, rooms, window=DEC, group="day", period=DEC):
    return svc.report(window[0], window[1], group, rec, rooms, period)


def fresh(db, clock, rec, rooms, **kw):
    """The same report from a service with nothing cached."""
    svc = LinkyService(db, make_source=lambda *_: FakeLinkySource(), credentials=None, wall=clock)
    return report(svc, rec, rooms, **kw)


def spy_days(monkeypatch, rec) -> list[tuple[int, int]]:
    asked: list[tuple[int, int]] = []
    original = rec.energy_buckets

    def spy(edges, *args, **kwargs):
        asked.append((edges[0], edges[-1]))
        return original(edges, *args, **kwargs)

    monkeypatch.setattr(rec, "energy_buckets", spy)
    return asked


def bucket(r, key):
    return next(b for b in r["buckets"] if b["key"] == key)


def test_a_repeated_report_replays_only_the_days_that_can_still_change(home, monkeypatch):
    clock, db, _, rec, svc, rooms = home
    asked = spy_days(monkeypatch, rec)
    cold = report(svc, rec, rooms)
    assert min(a for a, _ in asked) <= ts(date(2026, 3, 1))  # from the first reading on
    asked.clear()
    warm = report(svc, rec, rooms)
    # Only the days since the counter last moved (15 December on) are read again.
    assert asked and min(a for a, _ in asked) >= ts(date(2026, 12, 15))
    assert warm == cold == fresh(db, clock, rec, rooms)
    # Another view of the same days reads them from the cache too.
    asked.clear()
    week = (date(2026, 12, 7), date(2026, 12, 14))
    got = report(svc, rec, rooms, window=week, period=week)
    assert all(a >= ts(date(2026, 12, 15)) for a, _ in asked)
    assert got == fresh(db, clock, rec, rooms, window=week, period=week)


def test_a_new_reading_changes_the_days_it_measures(home):
    clock, db, house, rec, svc, rooms = home
    before = report(svc, rec, rooms)
    assert bucket(before, "2026-12-16")["radiators"] is None  # unknown since the counter stopped
    assert bucket(before, "2026-12-15")["radiators"]["coverage"] == 0  # known up to noon
    # The counter moves again on 20 December at noon: the quiet days become a measured span.
    set_total(house, total(house) + 3000)
    assert rec.snapshot_energy([RID]) == 1
    after = report(svc, rec, rooms)
    assert bucket(after, "2026-12-16")["radiators"] is not None
    assert bucket(after, "2026-12-15")["radiators"]["coverage"] == 1
    assert after == fresh(db, clock, rec, rooms)


def test_a_tariff_change_reprices_the_cached_days(home):
    clock, db, _, rec, svc, rooms = home
    before = report(svc, rec, rooms)
    svc.tariffs.save(
        Tariff("hchp", 9, (Slot("22:00", "06:00"),), (Prices(date(2000, 1, 1), 15.0, 0.25, 0.35),))
    )
    after = report(svc, rec, rooms)
    eur = [bucket(r, "2026-12-10")["radiators"]["eur"] for r in (before, after)]
    assert eur[1] > eur[0]
    assert after == fresh(db, clock, rec, rooms)


def test_a_reading_that_rewrites_the_last_one_drops_what_is_cached(home):
    """Two different values learned in the same second: the second replaces the first row, so
    a span already counted changes."""
    clock, db, house, rec, svc, rooms = home
    epoch = rec.energy_epoch
    set_total(house, total(house) + 3000)
    rec.snapshot_energy([RID])
    report(svc, rec, rooms)
    assert rec.energy_epoch == epoch  # a newer reading rewrites nothing
    set_total(house, total(house) + 1000)
    rec.snapshot_energy([RID])  # the same second: INSERT OR REPLACE
    assert rec.energy_epoch == epoch + 1
    assert report(svc, rec, rooms) == fresh(db, clock, rec, rooms)


def test_pruned_samples_drop_what_is_cached(home):
    clock, db, _, rec, svc, rooms = home
    db.executemany(
        "INSERT INTO samples (ts, radiator_id, working_rate) VALUES (?,?,?)",
        [(ts(date(2025, 1, 1)), RID, 50.0)],
    )
    epoch = rec.energy_epoch
    assert rec.prune() == 1
    assert rec.energy_epoch == epoch + 1
    assert rec.prune() == 0 and rec.energy_epoch == epoch + 1


def test_the_cache_is_bounded(home):
    clock, db, _, rec, svc, rooms = home
    svc.radiator_days.max_days = 50
    r = report(svc, rec, rooms)
    assert 0 < len(svc.radiator_days) <= 50
    assert report(svc, rec, rooms) == r == fresh(db, clock, rec, rooms)


def test_samples_written_after_a_backward_clock_step_drop_what_is_cached():
    """Final review I-5 (the reviewer's targeted.py): the wall clock steps back, and `sample()`
    writes working rates inside spans already counted: their HC/HP split moves, so the cache
    must not keep the old figures."""
    clock = Clock(datetime(2026, 11, 2, 0, tzinfo=PARIS).timestamp())
    db = Database(":memory:")
    house = build_house(*sample_house())
    rec = Recorder(db, house, wall=clock)
    svc = LinkyService(db, make_source=lambda *_: FakeLinkySource(), credentials=None, wall=clock)
    svc.tariffs.save(T_TARIFF)
    rooms = {rid: r.room_id for rid, r in house.radiators.items()}

    def rate(v: float) -> None:
        house.apply(StateChange(f"{SAMPLE_GATEWAY}/{RID}#1", "io:CurrentWorkingRateState", v))

    def reading() -> None:
        set_total(house, total(house) + 600)
        rec.snapshot_energy([RID])

    # Readings every 6 h over 3 days; samples every 5 min, working at 100 % only in 22:00–06:00.
    for i in range(3 * 288):
        h = datetime.fromtimestamp(clock.t, PARIS).hour
        rate(100 if h >= 22 or h < 6 else 0)
        rec.sample()
        if i % 36 == 0:
            reading()
        clock.t += 300
    reading()
    rec.sample()  # at the reading's own second: its span's weights stop before it
    assert rec.energy_epoch == 0  # samples and readings moving forward rewrite nothing
    days = (date(2026, 11, 1), date(2026, 11, 6))
    before = report(svc, rec, rooms, window=days, period=days)
    assert bucket(before, "2026-11-03")["radiators"]["coverage"] == 1  # cached
    # The clock steps back to 3 November 21:01: an hour of samples at 100 % lands in that day.
    now = clock.t
    clock.t = datetime(2026, 11, 3, 21, 1, tzinfo=PARIS).timestamp()
    epoch = rec.energy_epoch
    for _ in range(11):
        rate(100)
        rec.sample()
        clock.t += 300
    clock.t = now
    assert rec.energy_epoch > epoch
    after = report(svc, rec, rooms, window=days, period=days)
    assert after == fresh(db, clock, rec, rooms, window=days, period=days)
    assert bucket(after, "2026-11-03")["radiators"] != bucket(before, "2026-11-03")["radiators"]


def set_power(house, w: int) -> None:
    house.apply(StateChange(f"{SAMPLE_GATEWAY}/{RID}#1", "io:PowerState", w))


def test_a_power_change_drops_that_radiators_days(home):
    clock, db, house, rec, svc, rooms = home
    before = report(svc, rec, rooms)
    set_power(house, 300)  # 500 Wh an hour is above 300 W: the readings become spikes
    after = report(svc, rec, rooms)
    assert after == fresh(db, clock, rec, rooms) != before


def test_days_computed_at_a_power_that_changed_meanwhile_are_not_kept(home, monkeypatch):
    """Final review minor: request A computes at the old power while request B sees the new one
    and clears the radiator; A must not store its days afterwards."""
    clock, db, house, rec, svc, rooms = home
    original = rec.energy_buckets
    raced = []

    def racing(edges, *args, **kwargs):
        out = original(edges, *args, **kwargs)
        if not raced:  # request B arrives while A computes
            raced.append(True)
            set_power(house, 300)
            report(svc, rec, rooms)
        return out

    monkeypatch.setattr(rec, "energy_buckets", racing)
    report(svc, rec, rooms)  # request A
    monkeypatch.setattr(rec, "energy_buckets", original)
    assert report(svc, rec, rooms) == fresh(db, clock, rec, rooms)


def test_an_unpriced_tempo_day_is_not_cached_and_is_priced_once_its_colour_arrives(home):
    clock, db, house, rec, svc, rooms = home
    tempo = {
        "blue_hc": 0.1,
        "blue_hp": 0.2,
        "white_hc": 0.1,
        "white_hp": 0.3,
        "red_hc": 0.1,
        "red_hp": 0.8,
    }
    svc.tariffs.save(Tariff.build(9, [PriceRow.make(date(2000, 1, 1), "tempo", 15.0, tempo)]))
    colours = {date(2026, 11, 30) + timedelta(days=i): "blue" for i in range(16)}
    del colours[date(2026, 12, 2)]  # not published (a MED outage): its Tempo day is unknown
    svc.colours = lambda a, b: {d: c for d, c in colours.items() if a <= d < b}
    first = report(svc, rec, rooms)
    assert bucket(first, "2026-12-01")["radiators"]["eur"] is not None
    # The Tempo day of 2 December runs 06:00 → 06:00: both calendar days hold unpriced half-hours.
    assert bucket(first, "2026-12-02")["radiators"]["eur"] is None
    assert bucket(first, "2026-12-03")["radiators"]["eur"] is None
    cached = svc.radiator_days._days
    assert (RID, date(2026, 12, 1)) in cached and (RID, date(2026, 12, 2)) not in cached
    assert (RID, date(2026, 12, 3)) not in cached
    colours[date(2026, 12, 2)] = "red"
    second = report(svc, rec, rooms)
    dec2 = bucket(second, "2026-12-02")["radiators"]["eur"]
    assert dec2 is not None and dec2 > bucket(second, "2026-12-01")["radiators"]["eur"]  # red HP
    assert bucket(second, "2026-12-03")["radiators"]["eur"] is not None
    assert (RID, date(2026, 12, 2)) in svc.radiator_days._days
