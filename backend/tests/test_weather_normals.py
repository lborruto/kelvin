from datetime import date, timedelta
from statistics import stdev
from zoneinfo import ZoneInfo

import pytest

from kelvin.linky.models import day_bounds
from kelvin.weather import normals as N
from kelvin.weather.dju import day_weather, forecast_days
from kelvin.weather.models import AROME_HD, ECMWF, Hour

TZ = ZoneInfo("Europe/Paris")


def years_of(t_by_year: dict[int, float]) -> dict[date, float]:
    out = {}
    for y, t in t_by_year.items():
        d = date(y, 1, 1)
        while d.year == y:
            out[d] = t
            d += timedelta(days=1)
    return out


def test_normal_is_the_mean_of_degrees_over_years():
    temps = years_of({2021: 5.0, 2022: 6.0, 2023: 7.0, 2024: 8.0, 2025: 9.0})
    got = N.normal_days(temps, [date(2026, 1, 15)], 15.5, today=date(2026, 1, 10))
    n = got[date(2026, 1, 15)]
    assert n.degrees == pytest.approx(8.5)  # mean(10.5, 9.5, 8.5, 7.5, 6.5)
    assert n.t_c == pytest.approx(7.0)
    assert n.years == 5


def test_degrees_are_averaged_not_the_temperature():
    # one warm and one cold year around the balance point: mean(max(0, Tb − T)) ≠ max(0, Tb − mean
    # T)
    temps = years_of({2023: 10.0, 2024: 20.0, 2025: 10.0})
    n = N.normal_days(temps, [date(2026, 3, 1)], 15.5, today=date(2026, 2, 1))[date(2026, 3, 1)]
    assert n.degrees == pytest.approx((5.5 + 0.0 + 5.5) / 3)


def test_fewer_than_three_years_gives_no_normal():
    temps = years_of({2024: 5.0, 2025: 6.0})
    assert N.normal_days(temps, [date(2026, 1, 15)], 15.5, today=date(2026, 1, 1)) == {}


def test_a_year_needs_four_of_its_seven_days():
    temps = years_of({2022: 5.0, 2023: 6.0, 2024: 7.0})
    for d in [date(2024, 1, 12) + timedelta(days=i) for i in range(4)]:  # 4 of 7 removed in 2024
        del temps[d]
    assert N.normal_days(temps, [date(2026, 1, 15)], 15.5, today=date(2026, 1, 1)) == {}


def test_leap_day_maps_to_28_february():
    temps = years_of({2025: 4.0, 2026: 5.0, 2027: 6.0})
    n = N.normal_days(temps, [date(2028, 2, 29)], 15.5, today=date(2028, 1, 1))
    assert n[date(2028, 2, 29)].years == 3


def test_never_a_day_from_today_on():
    temps = years_of({2023: 5.0, 2024: 6.0, 2025: 7.0, 2026: -50.0})
    n = N.normal_days(temps, [date(2027, 1, 15)], 15.5, today=date(2026, 1, 16))
    assert (
        n[date(2027, 1, 15)].years == 4
    )  # 2026's 4 window days before today count; its later days do not
    assert n[date(2027, 1, 15)].t_c > -10


def test_spread_of_the_sum_over_years():
    temps = years_of({2021: 5.0, 2022: 6.0, 2023: 7.0, 2024: 8.0, 2025: 9.0})
    days = [date(2026, 1, 20), date(2026, 1, 21), date(2026, 1, 22)]
    sd = N.normal_sum_sd(temps, days, 15.5, today=date(2026, 1, 10))
    assert sd == pytest.approx(stdev([3 * (15.5 - t) for t in (5, 6, 7, 8, 9)]))
    assert (
        N.normal_sum_sd(years_of({2024: 5.0, 2025: 6.0}), days, 15.5, today=date(2026, 1, 10))
        is None
    )


def _hours(day, t, model, tz=TZ):
    a, b = day_bounds(day, tz)
    return [Hour(ts, t, None, None, model) for ts in range(a, b, 3600)]


def test_forecast_days_merge_outlook_where_meteo_france_has_none():
    today = date(2026, 10, 18)
    mf = [h for i in range(1, 5) for h in _hours(today + timedelta(days=i), 4.0, AROME_HD)]
    ec = [h for i in range(0, 8) for h in _hours(today + timedelta(days=i), 9.0, ECMWF)]
    days = forecast_days(mf, ec, TZ, today)
    assert [d.day for d in days] == [today + timedelta(days=i) for i in range(1, 8)]
    assert days[0].tmean == 4.0 and days[0].model == AROME_HD  # Météo-France wins
    assert days[5].tmean == 9.0 and days[5].model == ECMWF


def test_forecast_day_over_dst_has_25_hours():
    today = date(2026, 10, 24)  # 25 October 2026: 25 hours
    d = day_weather(
        today + timedelta(days=1), _hours(today + timedelta(days=1), 3.0, AROME_HD), [], TZ
    )
    assert d.expected == 25 and d.tmean == 3.0


def test_uncovered_forecast_day_is_listed_empty():
    today = date(2026, 10, 18)
    days = forecast_days([], [], TZ, today)
    assert len(days) == 7 and all(
        d.tmean is None and d.hours == 0 and d.model == "none" for d in days
    )
