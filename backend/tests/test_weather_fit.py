import math

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from kelvin.weather import fit as F


def house(temps, a=9.6, b=2.3, tb=15.5, noise=lambda i: 0.0):
    return [F.Day(i, t, a + b * max(0.0, tb - t) + noise(i)) for i, t in enumerate(temps)]


def test_ols_statistics():
    ln = F.ols([(0, 1), (1, 3), (2, 5), (3, 8)])
    assert ln.a == pytest.approx(0.8)
    assert ln.b == pytest.approx(2.3)
    assert ln.sse == pytest.approx(0.30)
    assert ln.s2 == pytest.approx(0.15)
    assert ln.var_b == pytest.approx(0.03)
    assert ln.var_a == pytest.approx(0.105)
    assert ln.cov_ab == pytest.approx(-0.045)
    assert ln.r2 == pytest.approx(1 - 0.30 / 26.75)


def test_ols_needs_spread_and_three_points():
    assert F.ols([(1, 2), (1, 3), (1, 4)]) is None
    assert F.ols([(0, 1), (1, 2)]) is None


@pytest.mark.parametrize(
    "df,table",
    [(5, 1.4759), (10, 1.3722), (26, 1.3150), (60, 1.2958), (120, 1.2886), (10_000, 1.2816)],
)
def test_t_quantile_against_tables(df, table):
    assert F.t_quantile(df) == pytest.approx(table, abs=0.001)


def test_exact_house():
    r = F.assess(house([float(t) for t in range(-3, 25)]))
    assert r.why is None
    assert r.fit.tb == 15.5 and r.fit.source == "estimated"
    assert r.fit.line.a == pytest.approx(9.6) and r.fit.line.b == pytest.approx(2.3)
    assert r.fit.line.r2 == pytest.approx(1.0)
    assert r.thin == ("short_history", "few_cold_days")
    assert r.outliers == ()


def test_outliers_removed_once():
    temps = [float(t) for t in range(-3, 25)] * 4
    days = house(temps)
    for i in (0, 1, 2):  # three cold days at 30 %: an absence nobody recorded
        days[i] = F.Day(days[i].key, days[i].t, days[i].y * 0.3)
    r = F.assess(days)
    assert {d.key for d in r.outliers} == {0, 1, 2}
    assert r.fit.tb == 15.5
    assert r.fit.line.a == pytest.approx(9.6) and r.fit.line.b == pytest.approx(2.3)
    assert r.fit.line.n == len(temps) - 3


def test_winter_only_falls_back_to_convention():
    r = F.assess(house([-10.0 + (i % 25) for i in range(40)]))  # T from −10 to 14
    assert r.fit.source == "convention" and r.fit.tb == F.TB_CONVENTION
    # 9.6 + 2.3·(15.5 − T) = 3.85 + 2.3·(18 − T)
    assert r.fit.line.a == pytest.approx(3.85) and r.fit.line.b == pytest.approx(2.3)
    assert "no_mild_days" in r.thin


def test_summer_only_is_few_heating_days():
    r = F.assess(house([18.0 + (i % 11) for i in range(40)]))
    assert r.fit is None and r.why == "few_heating_days"


def test_unrelated_is_poor_fit():
    days = [F.Day(i, float(-3 + i % 28), 10.0 if i % 2 else 30.0) for i in range(56)]
    assert F.assess(days).why == "poor_fit"


def test_too_few_days():
    assert F.assess(house([float(t) for t in range(-3, 24)])).why == "few_days"  # 27 days


def test_given_balance_point_is_kept():
    r = F.assess(house([float(t) for t in range(-3, 25)], a=0.1, b=0.8), tb=15.5, room=True)
    assert r.fit.tb == 15.5 and r.fit.source == "given"
    assert r.fit.line.b == pytest.approx(0.8)


def test_room_tolerates_a_slightly_negative_baseload():
    noise = lambda i: 0.2 * math.sin(i)  # noqa: E731
    r = F.assess(
        house([float(t) for t in range(-3, 25)] * 2, a=0.0, b=0.8, noise=noise), tb=15.5, room=True
    )
    assert r.why is None  # a may fit at −0.05: accepted for a room
    r2 = F.assess(house([float(t) for t in range(-3, 25)] * 2, a=-3.0, b=0.8), tb=15.5, room=True)
    assert r2.why == "poor_fit"


def test_band_and_prediction():
    days = house([float(t) for t in range(-3, 25)] * 4, noise=lambda i: 0.5 * math.sin(i * 1.7))
    f = F.assess(days).fit
    ln = f.line
    q = F.t_quantile(ln.n - 2)
    y, lo, hi = F.band(f, 2.0)
    x = 15.5 - 2.0
    assert y == pytest.approx(ln.a + ln.b * x)
    assert hi - y == pytest.approx(q * math.sqrt(ln.s2 * (1 / ln.n + (x - ln.mx) ** 2 / ln.sxx)))
    p, plo, phi = F.predict(f, 2.0)
    assert phi - p == pytest.approx(
        q * math.sqrt(ln.s2 * (1 + 1 / ln.n + (x - ln.mx) ** 2 / ln.sxx))
    )
    assert phi - p > hi - y


def test_prediction_widens_with_lead():
    days = house([float(t) for t in range(-3, 25)] * 4, noise=lambda i: 0.5 * math.sin(i * 1.7))
    f = F.assess(days).fit
    _, lo1, hi1 = F.predict(f, 2.0, sigma_c=1.0)
    _, lo7, hi7 = F.predict(f, 2.0, sigma_c=2.7)
    assert hi7 - lo7 > hi1 - lo1
    _, a, b = F.predict(f, 20.0, sigma_c=2.7)  # above Tb: no heating, the σ term does not apply
    _, c, d = F.predict(f, 20.0)
    assert (a, b) == pytest.approx((c, d))


def test_sum_interval_matches_the_formula():
    days = house([float(t) for t in range(-3, 25)] * 4, noise=lambda i: 0.5 * math.sin(i * 1.7))
    f = F.assess(days).fit
    ln = f.line
    xs = [10.0, 0.0, 5.5]
    total, lo, hi = F.sum_interval(f, xs, extra_var=4.0)
    k, h = 3, 15.5
    var = k * ln.s2 + k * k * ln.var_a + h * h * ln.var_b + 2 * k * h * ln.cov_ab + 4.0
    assert total == pytest.approx(k * ln.a + ln.b * h)
    assert hi - total == pytest.approx(F.t_quantile(ln.n - 2) * math.sqrt(var))


def test_coefficient_ranges():
    days = house([float(t) for t in range(-3, 25)] * 4, noise=lambda i: 0.5 * math.sin(i * 1.7))
    f = F.assess(days).fit
    lo, hi = F.coef_range(f, "b")
    assert lo < f.line.b < hi
    assert hi - f.line.b == pytest.approx(F.t_quantile(f.line.n - 2) * math.sqrt(f.line.var_b))


@settings(max_examples=40, deadline=None)
@given(
    a=st.floats(3, 15),
    b=st.floats(0.5, 4),
    tb=st.sampled_from([12.0 + 0.5 * i for i in range(13)]),
)
def test_noisy_homes_are_recovered(a, b, tb):
    temps = [-5 + ((i * 7919) % 300) / 10 for i in range(200)]
    days = house(temps, a=a, b=b, tb=tb, noise=lambda i: 0.4 * math.sin(i * 2.3))
    r = F.assess(days)
    assert r.why is None
    assert abs(r.fit.tb - tb) <= 0.5
    assert r.fit.line.b == pytest.approx(b, rel=0.1, abs=0.05)
    assert r.fit.line.a == pytest.approx(a, abs=0.6)
