"""Radiator HC/HP and € from half-hour buckets (spec §2.1)."""

from datetime import date
from zoneinfo import ZoneInfo

import pytest

from kelvin.billing.radiators import radiator_days
from kelvin.billing.slots import Slot
from kelvin.billing.tariff import Prices, Tariff
from kelvin.recorder.energy import Bucket, local_edges

PARIS = ZoneInfo("Europe/Paris")
NIGHT = Tariff("hchp", 9, (Slot("22:00", "06:00"),), (Prices(date(2026, 1, 1), 15.0, 0.2, 0.3),))


def test_each_half_hour_is_priced_by_its_own_slot_on_a_dst_day():
    day = date(2026, 10, 25)  # 50 half-hours; 00:00–06:00 lasts 7 h (02:00–03:00 twice)
    edges = local_edges(day, date(2026, 10, 26), "halfhour", PARIS)
    buckets = [Bucket(100.0, 1800, False, False) for _ in edges[:-1]]
    [(d, rd)] = radiator_days(buckets, edges, NIGHT, PARIS).items()
    assert d == day and rd.wh == pytest.approx(5000.0) and rd.complete
    assert rd.hc_wh == pytest.approx(1800.0)  # 14 off-peak half-hours before 06:00, 4 after 22:00
    assert rd.hp_wh == pytest.approx(3200.0)
    assert rd.eur == pytest.approx(1.8 * 0.2 + 3.2 * 0.3)


def test_unknown_half_hours_make_the_day_partial_and_without_a_tariff_no_split():
    day = date(2026, 10, 14)
    edges = local_edges(day, date(2026, 10, 15), "halfhour", PARIS)
    buckets = [Bucket(None, 0, False, False)] * 10 + [Bucket(50.0, 1800, True, True)] * 38
    rd = radiator_days(buckets, edges, None, PARIS)[day]
    assert rd.wh == pytest.approx(1900.0) and rd.complete is False
    assert (rd.hc_wh, rd.hp_wh, rd.eur) == (None, None, None)
    assert rd.interpolated and rd.apportioned
    assert radiator_days([Bucket(None, 0, False, False)] * 48, edges, None, PARIS) == {}
