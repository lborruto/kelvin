"""Final review I-4: the radiators' per-day figures are cached for the days that can no longer
change, so a December report does not replay the half-hours from 1 January on every request; the
cache never serves a figure a fresh computation would not give."""

from datetime import date, datetime
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
from kelvin.recorder.recorder import Recorder

PARIS = ZoneInfo("Europe/Paris")
RID = "9312063"  # 1 500 W in the sample house
ENERGY = f"{SAMPLE_GATEWAY}/9312063#5"
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
