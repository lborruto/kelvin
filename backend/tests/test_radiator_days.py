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


TEMPO = {
    "blue_hc": 0.1296,
    "blue_hp": 0.1609,
    "white_hc": 0.1486,
    "white_hp": 0.1894,
    "red_hc": 0.1568,
    "red_hp": 0.7562,
}


def test_radiators_on_a_tempo_dst_day_take_each_half_hour_s_colour():
    from kelvin.billing.tariff import PriceRow

    day = date(2026, 10, 25)
    edges = local_edges(day, date(2026, 10, 26), "halfhour", PARIS)
    buckets = [Bucket(100.0, 1800, False, False) for _ in edges[:-1]]
    t = Tariff.build(9, [PriceRow.make(date(2025, 9, 1), "tempo", 15.0, TEMPO)])
    colours = {date(2026, 10, 24): "white", day: "red"}
    rd = radiator_days(buckets, edges, t, PARIS, colours=colours)[day]
    assert rd.hc_wh == pytest.approx(1800.0) and rd.hp_wh == pytest.approx(3200.0)
    assert rd.eur == pytest.approx((1400 * 0.1486 + 400 * 0.1568 + 3200 * 0.7562) / 1000)
    unknown = radiator_days(buckets, edges, t, PARIS, colours={date(2026, 10, 24): "white"})[day]
    assert unknown.eur is None and unknown.hc_wh == pytest.approx(1800.0)


def test_radiators_under_base_have_euros_and_no_split():
    from kelvin.billing.tariff import PriceRow

    day = date(2026, 10, 14)
    edges = local_edges(day, date(2026, 10, 15), "halfhour", PARIS)
    t = Tariff.build(9, [PriceRow.make(date(2026, 1, 1), "base", 15.0, {"base": 0.1952})])
    rd = radiator_days([Bucket(100.0, 1800, False, False)] * 48, edges, t, PARIS)[day]
    assert (rd.hc_wh, rd.hp_wh) == (None, None) and rd.eur == pytest.approx(4.8 * 0.1952)
