"""Spec §6.3: consumption against DJU around the reference, actual over expected on both sides."""

import math
from datetime import date, timedelta

from hypothesis import given, settings
from hypothesis import strategies as st

from kelvin.billing.compare import mapper, minus_years
from kelvin.weather.normalise import fit, normalised_change


def temp(d: date) -> float:
    return 11 - 8 * math.cos(2 * math.pi * (d.timetuple().tm_yday - 20) / 365.25)


def world(
    start=date(2024, 9, 1),
    end=date(2026, 3, 1),
    *,
    base=8.0,
    slope=2.0,
    colder=0.0,
    factor=1.0,
    cur=(date(2026, 1, 1), date(2026, 2, 1)),
    poison=False,
    kwh_from=None,
):
    """Daily DJU and kWh: E = base + slope × DJU everywhere; inside `cur` the weather is `colder`
    degrees colder and the home uses `factor` × that (or 1000 kWh/day with `poison`)."""
    dju, kwh = {}, {}
    d = start
    while d < end:
        inside = cur[0] <= d < cur[1]
        x = max(0.0, 18 - temp(d) + (colder if inside else 0.0))
        dju[d] = x
        if kwh_from is None or d >= kwh_from:
            kwh[d] = (
                1000.0 if inside and poison else (base + slope * x) * (factor if inside else 1.0)
            )
        d += timedelta(days=1)
    return dju, kwh


def jan_days():
    return [date(2026, 1, 1) + timedelta(days=i) for i in range(31)]


def run(dju, kwh, to=lambda d: minus_years(d, 1), comparable=True):
    return normalised_change(jan_days(), to, kwh.get, dju.get, comparable=comparable)


def test_fit_recovers_a_line():
    f = fit([(x, 8 + 2 * x) for x in range(20)])
    assert (round(f.a, 6), round(f.b, 6), round(f.r2, 6), f.n) == (8.0, 2.0, 1.0, 20)
    assert fit([(3.0, 1.0), (3.0, 2.0)]) is None  # no spread: no slope


def test_same_behaviour_colder_month_is_zero():
    dju, kwh = world(colder=3.0)
    out = run(dju, kwh)
    raw = sum(kwh[d] for d in jan_days()) / sum(kwh[minus_years(d, 1)] for d in jan_days()) - 1
    assert raw > 0.05  # it used more…
    assert out["change"] == 0.0 and out["why"] is None  # …because it was colder
    assert out["model"]["baseload_kwh_day"] == 8.0 and out["model"]["kwh_per_dju"] == 2.0
    assert out["model"]["r2"] == 1.0 and out["dju_cur"] > out["dju_ref"]


def test_ten_percent_more_is_ten_percent():
    dju, kwh = world(colder=3.0, factor=1.1)
    assert run(dju, kwh)["change"] == 0.1


def test_fit_never_sees_the_current_period():
    dju, kwh = world(poison=True)  # the current January is absurd; the reference must not move
    out = run(dju, kwh, to=mapper("month", 1))  # December 2025 ± 45 days reaches into January
    assert out["model"]["baseload_kwh_day"] == 8.0 and out["model"]["kwh_per_dju"] == 2.0


def test_mild_period_is_hidden():
    dju, kwh = world(
        start=date(2025, 4, 1), end=date(2026, 9, 1), cur=(date(2026, 7, 1), date(2026, 8, 1))
    )
    days = [date(2026, 7, 1) + timedelta(days=i) for i in range(31)]
    out = normalised_change(days, lambda d: minus_years(d, 1), kwh.get, dju.get, comparable=True)
    assert out["change"] is None and out["why"] == "mild_period"


def test_too_few_days():
    dju, kwh = world(kwh_from=date(2025, 12, 10))
    out = run(dju, kwh, to=mapper("month", 1))
    assert out["why"] == "few_days" and out["model"] is None


def test_missing_weather_and_not_comparable():
    dju, kwh = world()
    dju[date(2025, 1, 7)] = None
    assert run(dju, kwh)["why"] == "weather_missing"
    dju, kwh = world()
    assert run(dju, kwh, comparable=False)["why"] == "not_comparable"


def test_poor_fit():
    dju, kwh = world()
    for i, d in enumerate(sorted(kwh)):
        kwh[d] = 20.0 + (7 * i) % 13  # no relation with the cold
    assert run(dju, kwh)["why"] in ("poor_fit", "few_heating_days")


@settings(max_examples=50, deadline=None)
@given(
    base=st.floats(0, 20),
    slope=st.floats(0.5, 5),
    factor=st.floats(0.5, 2),
    colder=st.floats(-3, 6),
)
def test_normalised_change_is_the_behaviour_change(base, slope, factor, colder):
    dju, kwh = world(base=base, slope=slope, factor=factor, colder=colder)
    out = run(dju, kwh)
    assert out["why"] is None
    assert abs(out["change"] - (factor - 1)) < 1e-3
