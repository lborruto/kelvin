"""`GET /api/energy/day` content (spec §3.3; audit M7, L11). Pure."""

from datetime import date, timedelta
from zoneinfo import ZoneInfo

import pytest

from kelvin.billing.costs import day_energy
from kelvin.billing.day_detail import day_detail
from kelvin.billing.slots import Slot
from kelvin.billing.split import Share
from kelvin.billing.tariff import Prices, Tariff
from kelvin.linky.models import CurvePoint, day_bounds
from kelvin.recorder.energy import Bucket, local_edges

PARIS = ZoneInfo("Europe/Paris")
NIGHT = Tariff("hchp", 9, (Slot("22:00", "06:00"),), (Prices(date(2026, 1, 1), 15.0, 0.2, 0.3),))


def curve(day: date, wh: float = 500.0) -> list[CurvePoint]:
    a, b = day_bounds(day, PARIS)
    return [CurvePoint(ts, 30, wh) for ts in range(a, b, 1800)]


def detail(day, points, daily_wh, tariff=NIGHT, radiators=None, rooms=None):
    edges = local_edges(day, day + timedelta(days=1), "halfhour", PARIS)
    ranges = tariff.ranges() if tariff else None
    e = day_energy(day, daily_wh, points, ranges, PARIS, Share(0.3, "fallback_all"))
    return day_detail(
        day, points, e, tariff, PARIS, radiators or {}, edges, rooms or {}, len(points) >= 46
    )


def test_m7_one_hc_hp_figure_scaled_to_the_daily_reading():
    day = date(2026, 10, 14)
    points = curve(day)  # 24.0 kWh of curve
    d = detail(day, points, 24_480)  # the meter's day is 2 % above the curve
    t = d["totals"]
    assert t["hc_kwh"] + t["hp_kwh"] == pytest.approx(24.48)  # exactly the daily reading
    assert (t["hc_kwh"], t["split_method"]) == (pytest.approx(8.16), "curve")
    assert (t["curve_kwh"], t["hc_kwh_curve"], t["hp_kwh_curve"]) == (24.0, 8.0, 16.0)
    assert t["daily_kwh"] == 24.48
    assert sum(i["wh"] for i in d["intervals"]) == 24_000  # the bars stay as measured


def test_intervals_carry_power_price_and_cost():
    day = date(2026, 10, 14)
    d = detail(day, curve(day), 24_000)
    first, noon = d["intervals"][0], d["intervals"][24]
    assert (first["w"], first["offpeak"], first["price"], first["eur"]) == (1000, 1.0, 0.2, 0.1)
    assert (noon["offpeak"], noon["price"], noon["eur"]) == (0.0, 0.3, 0.15)
    assert d["power"] == {
        "peak_w": 1000,
        "peak_ts": first["ts"],
        "base_w_p10": 1000,
        "night_min_w": 1000,
        "kva": 9,
    }


@pytest.mark.parametrize(("day", "n"), [(date(2026, 3, 29), 46), (date(2026, 10, 25), 50)])
def test_dst_days_have_46_or_50_intervals(day, n):
    d = detail(day, curve(day), None)
    assert d["points"] == n and len(d["intervals"]) == n and d["complete"]


def test_l11_slots_off_the_half_hour_mark_two_intervals_a_day():
    t = Tariff("hchp", 9, (Slot("00:50", "06:50"),), (Prices(date(2026, 1, 1), 15.0, 0.2, 0.3),))
    day = date(2026, 10, 14)
    d = detail(day, curve(day), 24_000, tariff=t)
    marked = [i for i in d["intervals"] if i["boundary"]]
    assert len(marked) == 2
    assert [m["offpeak"] for m in marked] == [0.3333, 0.6667]  # 00:30–01:00, 06:30–07:00


def test_radiators_per_interval_and_per_room():
    day = date(2026, 10, 14)
    n = 48
    radiators = {
        "a": [Bucket(100.0, 1800, False, False)] * n,
        "b": [Bucket(None, 0, False, False)] * 10 + [Bucket(50.0, 1800, True, True)] * (n - 10),
        "gone": [Bucket(20.0, 1800, False, False)] * n,
    }
    d = detail(day, curve(day), 24_000, radiators=radiators, rooms={"a": "salon", "b": "salon"})
    first, late = d["intervals"][0], d["intervals"][20]
    assert (first["radiators_wh"], first["radiators_interp"]) == (120.0, False)
    assert first["by_room"] == {"salon": 100.0}  # "gone" has no room any more
    assert (late["radiators_wh"], late["radiators_interp"], late["radiators_apportioned"]) == (
        170.0,
        True,
        True,
    )


def test_an_incomplete_day_has_no_power_figures_and_no_tariff_no_prices():
    day = date(2026, 10, 14)
    d = detail(day, curve(day)[:40], 24_000, tariff=None)
    assert d["complete"] is False and d["power"]["peak_w"] is None and d["power"]["kva"] is None
    assert d["intervals"][0]["price"] is None and d["totals"]["hc_kwh"] is None
