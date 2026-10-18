from datetime import date, timedelta

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from kelvin.billing.radiators import RadiatorDay
from kelvin.weather import costmodel as C
from kelvin.weather.models import AROME_HD, DayWeather

TODAY = date(2026, 11, 20)
ONE = timedelta(days=1)


def temp(
    d: date,
) -> float:  # deterministic, every whole degree from −3 to 24 °C (11 is prime to 28)
    return float(-3 + (d.toordinal() * 11) % 28)


def wx(d, t=None, model=AROME_HD):
    t = temp(d) if t is None else t
    return DayWeather(d, t - 3, t + 3, t, max(0.0, 18 - t), 24, 24, model, True)


def kwh(t, a=9.6, b=2.3, tb=15.5):
    return a + b * max(0.0, tb - t)


def inputs(**kw):
    days = [TODAY - timedelta(days=i) for i in range(1, 366)]
    base = dict(
        today=TODAY,
        weather_on=True,
        linky=True,
        points={d: C.DayPoint(d, kwh(temp(d)), None, None, False, None) for d in days},
        weather={d: wx(d) for d in days + [TODAY - timedelta(days=i) for i in range(366, 5 * 366)]},
        away=set(),
        rooms={},
        radiators={},
        life={},
        forecast=[wx(TODAY + timedelta(days=i), 2.0) for i in range(1, 8)],
        today_weather=wx(TODAY, 4.0),
        fetched_at=1.0,
    )
    base.update(kw)
    return C.ModelInputs(**base)


def test_house_recovers_the_home():
    core, _ = C.build(inputs())
    h = C.period_view(core, (date(2026, 11, 1), TODAY + ONE), TODAY)["house"]
    assert h["state"] == "ok" and h["why"] is None and h["thin"] == []
    assert h["balance_point_c"] == 15.5 and h["balance_point_source"] == "estimated"
    assert h["baseload_kwh_day"] == pytest.approx(9.6, abs=1e-3)
    assert h["kwh_per_c"] == pytest.approx(2.3, abs=1e-3)
    assert h["fit_days"] == 365 and h["excluded"] == {
        "no_energy": 0,
        "no_weather": 0,
        "away": 0,
        "outlier": 0,
    }
    assert h["eur_per_c"] is None  # € come from report.model_euros


def test_points_line_and_share():
    v = C.period_view(C.build(inputs())[0], (date(2026, 11, 1), TODAY + ONE), TODAY)
    h = v["house"]
    assert len(h["points"]) == 365
    p = next(p for p in h["points"] if p["date"] == (TODAY - ONE).isoformat())
    assert p["in_period"] is True and p["used"] is True and p["excluded"] is None
    assert p["expected_kwh"] == pytest.approx(kwh(temp(TODAY - ONE)), abs=1e-3)
    ts = [s["t_c"] for s in h["line"]]
    assert ts == sorted(ts) and 15.5 in ts and ts[0] == -3.0 and ts[-1] == 24.0
    s = h["period_share"]
    assert s["days"] == s["of"] == 19
    weather = sum(2.3 * max(0, 15.5 - temp(TODAY - timedelta(days=i))) for i in range(1, 20))
    total = sum(kwh(temp(TODAY - timedelta(days=i))) for i in range(1, 20))
    assert s["share"] == pytest.approx(weather / total, abs=1e-4)


def test_period_outside_the_window_has_no_share():
    v = C.period_view(C.build(inputs())[0], (date(2024, 1, 1), date(2024, 2, 1)), TODAY)
    assert v["house"]["period_share"] is None
    assert not any(p["in_period"] for p in v["house"]["points"])


def test_away_days_are_excluded_and_marked():
    away = {TODAY - timedelta(days=i) for i in (30, 31, 32)}
    v = C.period_view(C.build(inputs(away=away))[0], (date(2026, 11, 1), TODAY + ONE), TODAY)
    h = v["house"]
    assert h["excluded"]["away"] == 3 and h["fit_days"] == 362
    marked = [p for p in h["points"] if p["excluded"] == "away"]
    assert len(marked) == 3 and not any(p["used"] for p in marked)


def test_weather_off_view():
    core, mo = C.build(inputs(weather_on=False))
    v = C.period_view(core, (date(2026, 11, 1), TODAY + ONE), TODAY)
    assert v["house"]["why"] == "weather_off" and v["house"]["points"] == []
    assert v["forecast"] == {
        "state": "hidden",
        "why": "weather_off",
        "fetched_at": None,
        "days": [],
        "week": None,
    }
    assert v["normals"] is None and mo is None


def test_hidden_house_keeps_its_points():
    few = {d: p for d, p in inputs().points.items() if d > TODAY - timedelta(days=13)}
    v = C.period_view(C.build(inputs(points=few))[0], (date(2026, 11, 1), TODAY + ONE), TODAY)
    h = v["house"]
    assert h["state"] == "hidden" and h["why"] == "few_days"
    assert h["kwh_per_c"] is None and h["line"] == [] and h["period_share"] is None
    assert len(h["points"]) == 12 and all(p["expected_kwh"] is None for p in h["points"])
    assert v["forecast"]["state"] == "hidden" and v["forecast"]["why"] == "model_hidden"
    assert all(d["kwh"] is None and d["t_c"] == 2.0 for d in v["forecast"]["days"])


def test_forecast_days_and_week():
    v = C.period_view(C.build(inputs())[0], (date(2026, 11, 1), TODAY + ONE), TODAY)
    fc = v["forecast"]
    assert fc["state"] == "ok" and len(fc["days"]) == 7
    d1, d7 = fc["days"][0], fc["days"][6]
    assert d1["lead"] == 1 and d1["sigma_c"] == C.SIGMA_C[0]
    assert d1["kwh"] == pytest.approx(kwh(2.0), abs=1e-3)
    assert d1["heating_kwh"] == pytest.approx(2.3 * 13.5, abs=1e-3)
    assert d1["degrees_c"] == 13.5
    assert d7["kwh_hi"] - d7["kwh_lo"] >= d1["kwh_hi"] - d1["kwh_lo"]
    assert fc["week"]["days"] == 7 and fc["week"]["kwh"] == pytest.approx(7 * kwh(2.0), abs=1e-2)


def test_incomplete_forecast_days():
    fc_days = [wx(TODAY + timedelta(days=i), 2.0) for i in range(1, 4)] + [
        DayWeather(TODAY + timedelta(days=i), None, None, None, None, 0, 24, "none", False)
        for i in range(4, 8)
    ]
    fc = C.period_view(
        C.build(inputs(forecast=fc_days))[0], (date(2026, 11, 1), TODAY + ONE), TODAY
    )["forecast"]
    assert [d["complete"] for d in fc["days"]] == [True] * 3 + [False] * 4
    assert fc["days"][4]["kwh"] is None and fc["days"][4]["model"] is None
    assert fc["week"]["days"] == 3


def _rad(wh, complete=True):
    return RadiatorDay(wh, None, None, None, False, False, complete)


def room_inputs(r2_complete=lambda d: True, r2_from=None, away=frozenset()):
    days = [TODAY - timedelta(days=i) for i in range(1, 61)]
    r1 = {d: _rad(1000 * kwh(temp(d), a=0.1, b=0.5)) for d in days}
    r2 = {d: _rad(1000 * kwh(temp(d), a=0.0, b=0.3), r2_complete(d)) for d in days}
    life = {"R1": (days[-1], None), "R2": (r2_from or days[-1], None)}
    return inputs(
        rooms={"salon": ["R1", "R2"]}, radiators={"R1": r1, "R2": r2}, life=life, away=set(away)
    )


def test_room_counts_only_fully_measured_days():
    inc = {TODAY - timedelta(days=i) for i in range(5, 24)}  # 19 incomplete days for R2
    v = C.period_view(
        C.build(room_inputs(r2_complete=lambda d: d not in inc))[0],
        (date(2026, 11, 1), TODAY + ONE),
        TODAY,
    )
    r = v["rooms"]["items"][0]
    assert r["room_id"] == "salon" and r["state"] == "ok"
    assert r["coverage"] == {"days": 41, "of": 60, "share": round(41 / 60, 4)}
    assert r["excluded"]["incomplete"] == 19
    assert r["kwh_per_c"] == pytest.approx(0.8, abs=1e-3)  # 0.5 + 0.3: only whole days counted
    assert v["rooms"]["balance_point_source"] == "house" and v["rooms"]["balance_point_c"] == 15.5


def test_room_coverage_and_exclusions():
    r2_from = TODAY - timedelta(days=50)  # R2 added 50 days ago: before that R1 alone is the room
    away = {TODAY - timedelta(days=i) for i in (2, 3)}
    v = C.period_view(
        C.build(room_inputs(r2_from=r2_from, away=away))[0], (date(2026, 11, 1), TODAY + ONE), TODAY
    )
    r = v["rooms"]["items"][0]
    assert (
        r["coverage"]["of"] == 60
        and r["excluded"]["away"] == 2
        and r["excluded"]["incomplete"] == 0
    )


def test_no_linky_rooms_still_fit():
    r = room_inputs()
    core, _ = C.build(
        inputs(linky=False, points={}, rooms=r.rooms, radiators=r.radiators, life=r.life)
    )
    v = C.period_view(core, (date(2026, 11, 1), TODAY + ONE), TODAY)
    assert v["house"]["why"] == "no_linky"
    assert v["rooms"]["balance_point_source"] in ("radiators", "convention")
    assert v["rooms"]["items"][0]["state"] in ("ok", "hidden")  # 60 days: ok in November


def test_month_outlook_sources_and_interval():
    core, mo = C.build(inputs())
    assert mo.why is None
    assert mo.days[TODAY - ONE][1] == "observed" and mo.days[TODAY][1] == "today"
    assert mo.days[TODAY + 3 * ONE][1] == "forecast" and mo.days[TODAY + 9 * ONE][1] == "normal"
    lo, hi, spread = mo.interval([TODAY, TODAY + ONE, TODAY + 9 * ONE])
    assert lo < sum(mo.days[d][0] for d in (TODAY, TODAY + ONE, TODAY + 9 * ONE)) < hi
    assert spread == "full"


def test_month_outlook_spread_without_years():
    recent = {d: w for d, w in inputs().weather.items() if d > TODAY - timedelta(days=400)}
    core, mo = C.build(inputs(weather=recent))
    assert all(src != "normal" for _, src in mo.days.values())
    assert mo.missing[TODAY + 9 * ONE] == "no_normals"


def test_forecast_never_touches_a_past_day():
    core, mo = C.build(inputs(forecast=[wx(TODAY + timedelta(days=i), -20.0) for i in range(1, 8)]))
    assert mo.days[TODAY - ONE][0] == pytest.approx(kwh(temp(TODAY - ONE)), abs=1e-6)


@settings(max_examples=30, deadline=None)
@given(st.sets(st.integers(1, 60), max_size=30))
def test_a_room_never_counts_an_incomplete_day(gaps):
    inc = {TODAY - timedelta(days=i) for i in gaps}
    v = C.period_view(
        C.build(room_inputs(r2_complete=lambda d: d not in inc))[0],
        (date(2026, 11, 1), TODAY + ONE),
        TODAY,
    )
    r = v["rooms"]["items"][0]
    assert r["excluded"]["incomplete"] == len(inc)
    assert r["coverage"]["days"] == 60 - len(inc)


def test_month_outlook_without_the_exact_day_in_three_years():
    """Normals exist (±3 days, 5 years) but only 2 years hold the exact calendar day: the range
    leaves the weather spread out and says so."""
    d9 = TODAY + 9 * ONE
    w = {
        d: x
        for d, x in inputs().weather.items()
        if not ((d.month, d.day) == (d9.month, d9.day) and d.year in (2021, 2022, 2023))
    }
    _, mo = C.build(inputs(weather=w))
    assert mo.days[d9][1] == "normal"
    assert mo.interval([d9])[2] == "no_normals_spread"
    assert mo.interval([TODAY + 3 * ONE])[2] == "full"  # no normal day asked: nothing left out
