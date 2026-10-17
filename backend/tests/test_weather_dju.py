"""Weather rules (spec §4–§6): rounding, DJU, the France box, Open-Meteo weights, days."""

from datetime import date, datetime
from zoneinfo import ZoneInfo

import pytest

from kelvin.weather.dju import (
    AROME_HD_SINCE,
    aggregate,
    dju,
    expected_hours,
    mode_for,
    round_coord,
    weight,
)
from kelvin.weather.models import AROME_HD, ERA5_LAND, MIXED, Hour, Location

PARIS = ZoneInfo("Europe/Paris")


def ts(y, mo, d, h=0):
    return int(datetime(y, mo, d, h, tzinfo=PARIS).timestamp())


@pytest.mark.parametrize(
    ("v", "want"),
    [
        (45.7712, 45.77),
        (4.8901, 4.89),
        (4.845, 4.85),
        (-0.005, -0.01),
        (-122.41941, -122.42),
        (0.0, 0.0),
    ],
)
def test_round_coord_to_a_hundredth_half_away_from_zero(v, want):
    assert round_coord(v) == want


def test_dju_is_the_meteo_method_base_18():
    assert dju(2.0, 8.0) == 13.0
    assert dju(-3.5, 4.5) == 17.5
    assert dju(14.0, 22.0) == 0.0  # mean exactly 18 °C
    assert dju(15.0, 23.0) == 0.0  # never negative


@pytest.mark.parametrize(
    ("lat", "lon", "mode"),
    [
        (45.76, 4.84, "meteofrance"),  # Lyon
        (41.93, 8.74, "meteofrance"),  # Ajaccio
        (51.03, 2.38, "meteofrance"),  # Dunkerque
        (
            46.2,
            6.15,
            "meteofrance",
        ),  # Genève sits in the box: AROME HD covers it, seamless backs it
        (-20.88, 55.45, "best_match"),  # La Réunion
        (40.42, -3.70, "best_match"),  # Madrid
        (52.37, 4.90, "best_match"),  # Amsterdam
    ],
)
def test_mode_follows_the_metropolitan_box(lat, lon, mode):
    assert mode_for(lat, lon) == mode


def test_weight_follows_open_meteo_rule():
    assert weight(6, 4) == 1.0  # the forecast: two models × three variables, four days
    assert weight(3, 14) == 1.0
    assert weight(3, 92) == pytest.approx(92 / 14)
    assert weight(15, 14) == 1.5  # Open-Meteo's own example
    assert weight(15, 28) == 3.0


def test_expected_hours_on_dst_days():
    assert expected_hours(date(2026, 3, 29), PARIS) == 23
    assert expected_hours(date(2026, 10, 25), PARIS) == 25
    assert expected_hours(date(2026, 10, 26), PARIS) == 24


def hours_of(day, temps, model=AROME_HD):
    """One Hour per local hour of `day`, temperatures from `temps(i)`."""
    a = int(datetime.combine(day, datetime.min.time(), PARIS).timestamp())
    n = expected_hours(day, PARIS)
    return [Hour(a + 3600 * i, temps(i), None, None, model) for i in range(n)]


def test_aggregate_handles_dst_days():
    now = ts(2026, 11, 20, 12)
    autumn = aggregate(
        date(2026, 10, 25), hours_of(date(2026, 10, 25), lambda i: 5.0 + i % 10), PARIS, now
    )
    assert autumn.expected == 25 and autumn.hours == 25
    assert (autumn.tmin, autumn.tmax, autumn.tmean, autumn.dju) == (5.0, 14.0, 9.5, 8.5)
    assert autumn.final and autumn.model == AROME_HD
    spring = aggregate(date(2026, 3, 29), hours_of(date(2026, 3, 29), lambda i: 4.0), PARIS, now)
    assert spring.expected == 23 and spring.hours == 23 and spring.dju == 14.0


def test_aggregate_tolerates_two_missing_hours_not_three():
    now = ts(2026, 11, 20, 12)
    day = date(2026, 11, 10)
    full = hours_of(day, lambda i: 6.0)
    two = aggregate(day, full[:-2], PARIS, now)
    assert two.dju == 12.0 and two.hours == 22
    three = aggregate(day, full[:-3], PARIS, now)
    assert three.hours == 21 and three.tmin is None and three.dju is None and not three.final


def test_aggregate_is_final_only_72_hours_after_the_day_ends():
    day = date(2026, 11, 17)
    hours = hours_of(day, lambda i: 6.0)
    end = ts(2026, 11, 18)
    assert not aggregate(day, hours, PARIS, end + 72 * 3600 - 1).final
    assert aggregate(day, hours, PARIS, end + 72 * 3600).final


def test_aggregate_names_a_mixed_day_and_ignores_other_days():
    day = date(2026, 11, 10)
    hours = hours_of(day, lambda i: 6.0)
    hours[3] = Hour(hours[3].ts, 6.0, None, None, ERA5_LAND)
    stray = Hour(ts(2026, 11, 11, 5), 30.0, None, None, AROME_HD)
    got = aggregate(day, [*hours, stray], PARIS, ts(2026, 11, 20))
    assert got.model == MIXED and got.tmax == 6.0
    assert aggregate(day, [], PARIS, ts(2026, 11, 20)) is None


def test_location_round_trips_through_the_setting():
    loc = Location(
        "Lyon",
        "Auvergne-Rhône-Alpes",
        "Rhône",
        "FR",
        45.76,
        4.84,
        173,
        "geocoder",
        "search",
        "meteofrance",
        1000.0,
    )
    assert Location.from_setting(loc.to_setting()) == loc
    assert AROME_HD_SINCE == date(2022, 11, 13)
