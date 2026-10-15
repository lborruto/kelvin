"""A day's energy by rate key (spec §2.2, §3.1 L6, M7): the curve or the fallback profile decides
how the daily reading splits; Tempo uses the previous day's colour before 06:00."""

from datetime import date, timedelta
from zoneinfo import ZoneInfo

import pytest

from kelvin.billing.costs import day_energy, energy_eur
from kelvin.billing.pricing import Pricing
from kelvin.billing.slots import Slot
from kelvin.billing.split import FallbackShares
from kelvin.billing.tariff import PriceRow, Prices, Tariff
from kelvin.linky.models import CurvePoint, day_bounds

PARIS = ZoneInfo("Europe/Paris")
NIGHT = (Slot("22:00", "06:00"),)
TEMPO = {
    "blue_hc": 0.1296,
    "blue_hp": 0.1609,
    "white_hc": 0.1486,
    "white_hp": 0.1894,
    "red_hc": 0.1568,
    "red_hp": 0.7562,
}
HCHP = Tariff("hchp", 9, NIGHT, (Prices(date(2026, 1, 1), 15.0, 0.2, 0.3),))
TEMPO_T = Tariff.build(9, [PriceRow.make(date(2025, 9, 1), "tempo", 15.0, TEMPO)])
BASE = Tariff.build(9, [PriceRow.make(date(2026, 1, 1), "base", 15.0, {"base": 0.1952})])


def flat(day: date, wh: float = 500.0) -> list[CurvePoint]:
    a, b = day_bounds(day, PARIS)
    return [CurvePoint(ts, 30, wh) for ts in range(a, b, 1800)]


def shaped(
    day: date, night_w: float, day_w: float, evening_w: float | None = None
) -> list[CurvePoint]:
    """W per local hour: night (00–06) and evening (22–24) vs day; Wh per half-hour = W / 2."""
    a, b = day_bounds(day, PARIS)
    out = []
    for i, ts in enumerate(range(a, b, 1800)):
        h = i // 2
        w = (
            night_w
            if h < 6
            else day_w
            if h < 22
            else (evening_w if evening_w is not None else night_w)
        )
        out.append(CurvePoint(ts, 30, w / 2))
    return out


def as_dict_values(d):
    return {k: pytest.approx(v) for k, v in d.items()}


def test_the_curve_splits_the_daily_reading_m7():
    day = date(2026, 10, 6)
    p = Pricing(HCHP, PARIS)
    e = day_energy(day, 30_000, flat(day), p, PARIS, None)
    assert (e.kwh, e.estimated, e.method) == (30.0, False, "curve")
    assert (e.hc_kwh, e.hp_kwh) == (pytest.approx(10.0), pytest.approx(20.0))  # a third off-peak
    assert dict(e.by_rate) == as_dict_values({"hc": 10.0, "hp": 20.0})
    assert e.energy_eur == pytest.approx(10 * 0.2 + 20 * 0.3) and energy_eur(e) == e.energy_eur
    even = day_energy(day, 30_000, None, p, PARIS, None)
    assert (even.method, even.estimated, even.hc_kwh) == ("slots", True, pytest.approx(10.0))
    assert day_energy(day, None, flat(day), p, PARIS, None).kwh == pytest.approx(24.0)
    assert day_energy(day, None, flat(day)[:-1], p, PARIS, None) is None
    assert day_energy(day, None, None, p, PARIS, None) is None
    bare = day_energy(day, 30_000, None, None, PARIS, None)  # no tariff: kWh only
    assert (bare.kwh, bare.hc_kwh, bare.hp_kwh, bare.method, bare.energy_eur) == (
        30.0,
        None,
        None,
        None,
        None,
    )


@pytest.mark.parametrize(
    ("day", "colours", "expected"),
    [
        (
            date(2026, 10, 25),  # 50 half-hours: seven hours before 06:00, all on the 24th's colour
            {date(2026, 10, 24): "white", date(2026, 10, 25): "red"},
            {"white_hc": 7.0, "red_hp": 16.0, "red_hc": 2.0},
        ),
        (
            date(2027, 3, 28),  # 46 half-hours: five hours before 06:00
            {date(2027, 3, 27): "blue", date(2027, 3, 28): "white"},
            {"blue_hc": 5.0, "white_hp": 16.0, "white_hc": 2.0},
        ),
    ],
)
def test_tempo_day_cost_over_the_autumn_dst_night(day, colours, expected):
    points = flat(day)
    total = sum(p.wh for p in points)
    e = day_energy(day, round(total), points, Pricing(TEMPO_T, PARIS, colours), PARIS, None)
    assert dict(e.by_rate) == as_dict_values(expected)
    assert e.energy_eur == pytest.approx(sum(kwh * TEMPO[k] for k, kwh in expected.items()))
    assert e.hc_kwh == pytest.approx(sum(v for k, v in expected.items() if k.endswith("_hc")))
    assert not e.colour_missing and not e.estimated


def test_without_a_curve_tempo_splits_into_three_windows():
    day = date(2026, 12, 3)
    near = {
        day - timedelta(days=i): shaped(day - timedelta(days=i), 1000, 500, 1500)
        for i in range(1, 6)
    }
    profile = FallbackShares(near, PARIS).for_day(day)
    assert profile.method == "fallback_window"
    colours = {date(2026, 12, 2): "blue", day: "red"}
    e = day_energy(day, 34_000, None, Pricing(TEMPO_T, PARIS, colours), PARIS, profile)
    # Each neighbour: 6 kWh before 06:00, 8 kWh 06–22, 3 kWh 22–24 (17 kWh): A 6/17, B 8/17, C 3/17.
    assert dict(e.by_rate) == as_dict_values({"blue_hc": 12.0, "red_hp": 16.0, "red_hc": 6.0})
    assert (e.estimated, e.method) == (True, "fallback_window")
    assert e.energy_eur == pytest.approx(12 * 0.1296 + 16 * 0.7562 + 6 * 0.1568)


def test_an_unknown_colour_keeps_the_kwh_and_has_no_euros():
    day = date(2026, 12, 3)
    e = day_energy(
        day, 24_000, flat(day), Pricing(TEMPO_T, PARIS, {date(2026, 12, 2): "blue"}), PARIS, None
    )
    assert e.kwh == 24.0 and e.colour_missing and e.energy_eur is None
    assert e.hc_kwh == pytest.approx(8.0) and e.hp_kwh == pytest.approx(16.0)
    assert dict(e.by_rate) == as_dict_values(
        {"blue_hc": 6.0, "unknown_hp": 16.0, "unknown_hc": 2.0}
    )


def test_the_fallback_profile_is_seasonal_then_monthly_then_overall_then_even():
    winter = {date(2026, 1, d): shaped(date(2026, 1, d), 3000, 1000) for d in range(1, 11)}
    summer = {date(2026, 7, d): shaped(date(2026, 7, d), 500, 1000) for d in range(1, 11)}
    shares = FallbackShares({**winter, **summer}, PARIS)
    p = Pricing(HCHP, PARIS)

    def hc_share(day):
        prof = shares.for_day(day)
        return prof.method, day_energy(day, 1000, None, p, PARIS, prof).hc_kwh

    assert hc_share(date(2026, 1, 20)) == ("fallback_window", pytest.approx(24 / 40))
    assert hc_share(date(2026, 7, 12)) == ("fallback_window", pytest.approx(4 / 20))
    # 30 January: no complete day within ±15 days (the winter days end on the 10th), but the same
    # month from day − 35 (26 December) on holds them (pre-flight: the FLOOR_DAYS rule, spec §2.2).
    assert shares.for_day(date(2026, 1, 30)).method == "fallback_month"
    # 1 April: nothing in the window nor in April; the pool is every complete day from 25 February
    # on — the summer days only (the winter days are older than the floor): their share, 4/20.
    assert hc_share(date(2026, 4, 1)) == ("fallback_all", pytest.approx(4 / 20))
    none = FallbackShares({}, PARIS).for_day(date(2026, 4, 1))
    assert (none.method, none.weights) == ("slots", ())
    assert shares.overall().method == "fallback_all"


def test_base_days_have_no_split_and_no_estimate():
    e = day_energy(date(2026, 10, 6), 30_000, None, Pricing(BASE, PARIS), PARIS, None)
    assert (e.hc_kwh, e.hp_kwh, e.estimated, e.method) == (None, None, False, None)
    assert e.energy_eur == pytest.approx(30 * 0.1952)


def test_a_dst_day_without_a_curve_spreads_over_its_real_half_hours():
    e = day_energy(date(2026, 10, 25), 25_000, None, Pricing(HCHP, PARIS), PARIS, None)
    assert e.hc_kwh == pytest.approx(25 * 18 / 50)  # 14 half-hours before 06:00 + 4 after 22:00


def test_the_v1_two_argument_form_still_prices_an_hc_hp_split():
    from kelvin.billing.costs import DayEnergy

    e = DayEnergy(date(2026, 2, 3), 10.0, 4.0, 6.0, False)
    assert energy_eur(e, Prices(date(2026, 1, 1), 15.5, 0.2, 0.3)) == pytest.approx(
        4 * 0.2 + 6 * 0.3
    )
    assert (
        energy_eur(
            DayEnergy(date(2026, 2, 3), 10.0, None, None, False), Prices(date(2026, 1, 1), 1, 1, 1)
        )
        is None
    )


def test_the_month_and_all_days_pools_start_35_days_before_the_day():
    """Spec §2.2: the pool never depends on the window asked (Plan 5's floor, kept)."""
    summer = {date(2026, 7, d): shaped(date(2026, 7, d), 500, 1000) for d in range(1, 11)}
    shares = FallbackShares(summer, PARIS)
    assert shares.for_day(date(2025, 7, 12)).method == "fallback_month"  # later curves count
    assert shares.for_day(date(2027, 1, 30)).method == "slots"  # older ones are not read
