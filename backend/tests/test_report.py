from datetime import date, timedelta
from zoneinfo import ZoneInfo

import pytest

from kelvin.billing.costs import days_in_month
from kelvin.billing.radiators import RadiatorDay
from kelvin.billing.report import ReportInputs, build_report, minus_year
from kelvin.billing.slots import Slot
from kelvin.billing.tariff import Prices, Tariff
from kelvin.linky.models import CurvePoint, day_bounds

PARIS = ZoneInfo("Europe/Paris")
HALF = (Slot("00:00", "12:00"),)  # half of every hour-weighted flat day is off-peak


def days(a: date, b: date):
    d = a
    while d < b:
        yield d
        d += timedelta(days=1)


def flat(day: date, kwh: float) -> list[CurvePoint]:
    a, b = day_bounds(day, PARIS)
    n = (b - a) // 1800
    return [CurvePoint(ts, 30, kwh * 1000 / n) for ts in range(a, b, 1800)]


def tariff(*prices: Prices) -> Tariff:
    return Tariff("hchp", 12, HALF, prices or (Prices(date(2026, 1, 1), 15.0, 0.2, 0.3),))


def rad_days(per_day: dict[date, float], partial=()) -> dict[date, RadiatorDay]:
    """kWh per day → measured RadiatorDays (no tariff split); `partial` days were not covered
    whole (the recorder's first day, say)."""
    return {
        d: RadiatorDay(kwh * 1000, None, None, None, False, False, d not in partial)
        for d, kwh in per_day.items()
    }


def inputs(daily, *, curve=None, radiators=None, t=None, today=date(2026, 10, 14), **kw):
    """`radiators`: {date: kWh} for one radiator "r", or {id: {date: kWh}}."""
    if radiators and all(isinstance(k, date) for k in radiators):
        radiators = {"r": radiators}
    rads = {rid: rad_days(v) for rid, v in (radiators or {}).items()}
    return ReportInputs(
        daily_wh=daily,
        curve=curve or {},
        tariff=t,
        tz=PARIS,
        today=today,
        radiators=rads,
        radiator_life={rid: (min(v), None) for rid, v in rads.items() if v},
        **kw,
    )


def test_price_change_mid_month():
    daily = {d: 10_000 for d in days(date(2026, 9, 1), date(2026, 10, 1))}
    t = tariff(
        Prices(date(2026, 9, 1), 15.0, 0.20, 0.30), Prices(date(2026, 9, 16), 15.0, 0.25, 0.35)
    )
    r = build_report(date(2026, 9, 1), date(2026, 10, 1), "month", inputs(daily, t=t))
    [sep] = r["buckets"]
    assert sep["key"] == "2026-09" and sep["kwh"] == 300.0
    assert sep["hc_kwh"] == pytest.approx(150.0) and sep["estimated_split"] is True
    assert sep["energy_eur"] == pytest.approx(15 * 2.5 + 15 * 3.0)  # 82.50
    assert sep["subscription_eur"] == pytest.approx(15.0)
    assert sep["eur"] == pytest.approx(97.5)


def test_missing_days_are_not_zero():
    daily = {d: 10_000 for d in days(date(2026, 9, 1), date(2026, 10, 1))}
    del daily[date(2026, 9, 10)], daily[date(2026, 9, 11)]
    radiators = {d: 3.0 for d in days(date(2026, 9, 1), date(2026, 10, 1))}
    r = build_report(
        date(2026, 9, 1),
        date(2026, 11, 1),
        "month",
        inputs(daily, radiators=radiators, t=tariff()),
    )
    sep, octo = r["buckets"]
    assert sep["missing_days"] == 2 and sep["kwh"] == 280.0
    assert sep["energy_eur"] == pytest.approx(28 * 2.5)
    assert sep["subscription_eur"] == pytest.approx(15.0)  # every counted day pays it
    assert (
        octo["missing_days"] == 0 and octo["kwh"] is None and octo["eur"] is None
    )  # after last_day
    assert r["last_day"] == "2026-09-30"
    assert r["heating_share"] == pytest.approx(3.0 / 10.0)  # only days with Linky data


def test_curve_days_split_exactly_and_others_use_their_share():
    day = date(2026, 10, 6)
    daily = {day: 24_000, day + timedelta(days=1): 24_000}
    curve = {day: flat(day, 24.0)}
    r = build_report(day, day + timedelta(days=2), "day", inputs(daily, curve=curve, t=tariff()))
    a, b = r["buckets"]
    assert a["hc_kwh"] == pytest.approx(12.0) and a["estimated_split"] is False
    assert b["hc_kwh"] == pytest.approx(12.0) and b["estimated_split"] is True


def test_hero_compares_the_same_elapsed_days():
    daily = {d: 10_000 for d in days(date(2026, 9, 1), date(2026, 10, 13))}
    r = build_report(date(2025, 11, 1), date(2026, 11, 1), "month", inputs(daily, t=tariff()))
    cur, prev = r["hero"]["current"], r["hero"]["previous"]
    assert (cur["from"], cur["to"]) == ("2026-10-01", "2026-10-13")
    assert (prev["from"], prev["to"]) == ("2026-09-01", "2026-09-13")
    assert cur["kwh"] == prev["kwh"] == 120.0
    r = build_report(date(2026, 10, 1), date(2026, 10, 14), "day", inputs(daily, t=tariff()))
    assert (r["hero"]["current"]["from"], r["hero"]["previous"]["from"]) == (
        "2026-10-12",
        "2026-10-11",
    )


def test_hero_never_runs_past_the_shorter_previous_month():
    daily = {d: 10_000 for d in days(date(2026, 2, 1), date(2026, 4, 1))}
    r = build_report(
        date(2026, 3, 1), date(2026, 4, 1), "month", inputs(daily, today=date(2026, 4, 2))
    )
    prev = r["hero"]["previous"]
    assert (prev["from"], prev["to"], prev["kwh"]) == ("2026-02-01", "2026-03-01", 280.0)


def test_year_buckets_and_no_tariff_means_kwh_only():
    daily = {d: 10_000 for d in days(date(2025, 12, 30), date(2026, 1, 3))}
    r = build_report(date(2025, 1, 1), date(2027, 1, 1), "year", inputs(daily))
    assert [b["key"] for b in r["buckets"]] == ["2025", "2026"]
    assert r["buckets"][0]["kwh"] == 20.0 and r["buckets"][0]["eur"] is None
    assert r["tariff"] is False and r["buckets"][0]["hc_kwh"] is None


def test_without_linky_the_radiators_still_show():
    a = {d: 1.5 for d in days(date(2026, 10, 1), date(2026, 10, 14))}
    b = {d: 1.0 for d in days(date(2026, 10, 1), date(2026, 10, 14))}
    r = build_report(
        date(2026, 10, 1), date(2026, 10, 15), "day", inputs({}, radiators={"a": a, "b": b})
    )
    assert r["linky"] is False and r["last_day"] is None and r["projection"] is None
    assert r["buckets"][0]["kwh"] is None and r["buckets"][0]["radiators_kwh"] == 2.5
    assert r["hero"]["current"]["from"] == "2026-10-13"  # yesterday
    assert r["radiators"] == [{"radiator_id": "a", "kwh": 19.5}, {"radiator_id": "b", "kwh": 13.0}]
    assert r["heating_share"] is None


def test_projection_is_linear_without_last_year():
    daily = {d: 10_000 for d in days(date(2026, 9, 1), date(2026, 10, 13))}
    p = build_report(date(2026, 10, 1), date(2026, 11, 1), "month", inputs(daily, t=tariff()))[
        "projection"
    ]
    assert p["month"]["key"] == "2026-10" and p["month"]["method"] == "linear"
    assert p["month"]["actual_kwh"] == 120.0
    assert p["month"]["kwh"] == pytest.approx(120 + 19 * 10)
    assert p["year"]["from"] == "2026-10" and p["year"]["to"] == "2027-09"
    assert p["year"]["kwh"] == pytest.approx(310 + 334 * 10)
    # € = kWh at the trailing HC share (half) + a full subscription per month (pro rata now)
    assert p["year"]["months"][1]["eur"] == pytest.approx(300 * 0.25 + 15.0)
    assert p["month"]["eur"] == pytest.approx(
        p["month"]["actual_eur"] + 190 * 0.25 + 15.0 * 19 / 31, abs=0.01
    )


def test_projection_scales_by_the_same_month_last_year():
    daily = {d: 5_000 for d in days(date(2025, 8, 1), date(2026, 1, 1))}
    for d in days(date(2025, 11, 1), date(2025, 12, 1)):
        daily[d] = 20_000  # last November was 4× the autumn average
    for d in days(date(2026, 9, 13), date(2026, 10, 13)):
        daily[d] = 10_000
    p = build_report(date(2026, 10, 1), date(2026, 11, 1), "month", inputs(daily))["projection"]
    months = {m["key"]: m for m in p["year"]["months"]}
    assert months["2026-11"]["method"] == "seasonal"
    assert months["2026-11"]["kwh"] == pytest.approx(30 * 10 * 4)
    assert months["2027-01"]["method"] == "linear"  # no January 2026 data
    assert p["year"]["method"] == "mixed"
    assert months["2026-11"]["eur"] is None  # no tariff


def test_projection_needs_a_week_of_data():
    daily = {d: 10_000 for d in days(date(2026, 10, 8), date(2026, 10, 13))}
    assert (
        build_report(date(2026, 10, 1), date(2026, 11, 1), "month", inputs(daily))["projection"]
        is None
    )


def test_minus_year_on_feb_29():
    assert minus_year(date(2028, 2, 29)) == date(2027, 2, 28)


def test_days_before_the_first_data_day_are_not_missing():
    daily = {d: 10_000 for d in days(date(2026, 8, 5), date(2026, 10, 13))}
    del daily[date(2026, 9, 5)]
    r = build_report(
        date(2026, 1, 1),
        date(2027, 1, 1),
        "year",
        inputs(daily, t=tariff(), today=date(2026, 10, 14)),
    )
    [year] = r["buckets"]
    assert year["missing_days"] == 1
    assert year["kwh"] == pytest.approx(68 * 10.0)
    expected_sub = sum(15.0 / days_in_month(d) for d in days(date(2026, 8, 5), date(2026, 10, 13)))
    assert year["subscription_eur"] == pytest.approx(expected_sub, abs=0.01)
    r = build_report(date(2025, 1, 1), date(2027, 1, 1), "year", inputs(daily, t=tariff()))
    prev = r["hero"]["previous"]
    assert prev["from"] == "2025-01-01"
    assert prev["kwh"] is None and prev["subscription_eur"] is None and prev["eur"] is None
    assert prev["missing_days"] == 0


def test_first_day_input_overrides_the_earliest_data_day():
    daily = {d: 10_000 for d in days(date(2026, 8, 5), date(2026, 8, 11))}
    inp = inputs(daily, t=tariff())
    r = build_report(date(2026, 8, 1), date(2026, 9, 1), "month", inp)
    assert r["buckets"][0]["missing_days"] == 0  # first data day is 5 Aug
    inp.first_day = date(2026, 8, 1)
    r = build_report(date(2026, 8, 1), date(2026, 9, 1), "month", inp)
    assert r["buckets"][0]["missing_days"] == 4  # 1-4 Aug are real holes


def test_l7_a_share_above_the_meter_is_flagged_never_clamped():
    daily = {date(2026, 10, 1): 10_000}
    r = build_report(
        date(2026, 10, 1),
        date(2026, 10, 2),
        "day",
        inputs(daily, radiators={date(2026, 10, 1): 12.0}, today=date(2026, 10, 2)),
    )
    assert r["heating_share"] is None  # v1 field: « — »
    assert r["heating"] == {
        "value": 1.2,
        "days": 1,
        "of_days": 1,
        "since": "2026-10-01",
        "inconsistent": True,
    }


def test_projection_is_dropped_when_the_data_is_stale():
    daily = {d: 10_000 for d in days(date(2026, 9, 1), date(2026, 10, 8))}
    r = build_report(date(2026, 10, 1), date(2026, 11, 1), "month", inputs(daily))
    assert r["projection"] is None  # last day 7 Oct, today 14 Oct


def test_a_bucket_of_missing_days_has_a_subscription_but_no_energy_cost():
    daily = {date(2026, 9, 1): 10_000, date(2026, 9, 30): 10_000}
    r = build_report(date(2026, 9, 1), date(2026, 10, 1), "month", inputs(daily, t=tariff()))
    mid = build_report(date(2026, 9, 10), date(2026, 9, 12), "day", inputs(daily, t=tariff()))
    for b in mid["buckets"]:
        assert b["missing_days"] == 1 and b["kwh"] is None and b["eur"] is None
        assert b["subscription_eur"] == pytest.approx(0.5)
    assert r["buckets"][0]["missing_days"] == 28


def test_dst_day_with_a_complete_curve():
    day = date(2026, 10, 25)  # 25 hours
    daily = {day: 24_000}
    curve = {day: flat(day, 24.0)}
    r = build_report(day, day + timedelta(days=1), "day", inputs(daily, curve=curve, t=tariff()))
    [b] = r["buckets"]
    assert b["kwh"] == 24.0 and b["estimated_split"] is False and b["missing_days"] == 0
    assert b["hc_kwh"] + b["hp_kwh"] == pytest.approx(24.0)


def test_seasonal_factor_with_a_zero_shifted_average_falls_back_to_linear():
    daily = {d: 0 for d in days(date(2025, 8, 1), date(2025, 12, 1))}
    for d in days(date(2026, 9, 13), date(2026, 10, 13)):
        daily[d] = 10_000
    p = build_report(date(2026, 10, 1), date(2026, 11, 1), "month", inputs(daily))["projection"]
    assert p["year"]["method"] == "linear"


def test_days_before_first_day_feed_nothing():
    """A caller-supplied first_day later than the earliest data bounds every path, the heating
    share and the projection included, not only the counted days."""
    daily = {date(2026, 10, 1): 10_000, date(2026, 10, 2): 10_000}
    inp = inputs(daily, radiators={date(2026, 10, 1): 9.0, date(2026, 10, 2): 5.0})
    inp.first_day = date(2026, 10, 2)
    r = build_report(date(2026, 10, 1), date(2026, 10, 3), "day", inp)
    assert r["heating_share"] == 0.5


def test_heating_share_counts_only_days_with_both_linky_and_radiator_data():
    """Radiators only report since Kelvin started recording: Linky days before that must not
    dilute the share, and the report says from which day the share runs."""
    daily = {d: 10_000 for d in days(date(2026, 9, 1), date(2026, 10, 11))}
    radiators = {d: 4.0 for d in days(date(2026, 10, 1), date(2026, 10, 14))}
    r = build_report(
        date(2026, 9, 1), date(2026, 11, 1), "month", inputs(daily, radiators=radiators)
    )
    assert r["heating_share"] == pytest.approx(0.4)  # 1-10 Oct only
    assert r["heating_share_since"] == "2026-10-01"


def test_heating_share_since_is_none_without_a_common_day():
    daily = {date(2026, 9, 1): 10_000}
    r = build_report(
        date(2026, 9, 1),
        date(2026, 10, 1),
        "month",
        inputs(daily, radiators={date(2026, 9, 2): 3.0}),
    )
    assert r["heating_share"] is None and r["heating_share_since"] is None


def test_linky_since_is_the_first_day_with_linky_data():
    daily = {d: 10_000 for d in days(date(2026, 8, 5), date(2026, 8, 11))}
    inp = inputs(daily)
    inp.first_day = date(2026, 8, 1)  # contract start: data may only begin later
    r = build_report(date(2026, 1, 1), date(2027, 1, 1), "month", inp)
    assert r["linky_since"] == "2026-08-05"
    assert (
        build_report(date(2026, 1, 1), date(2027, 1, 1), "month", inputs({}))["linky_since"] is None
    )


def test_days_kelvin_never_recorded_have_no_radiator_figure():
    """Before the recorder's first day, the radiators are unknown, not 0 kWh."""
    daily = {d: 10_000 for d in days(date(2026, 10, 1), date(2026, 10, 6))}
    radiators = {date(2026, 10, 4): 3.0, date(2026, 10, 5): 0.0}
    r = build_report(
        date(2026, 10, 1), date(2026, 10, 6), "day", inputs(daily, radiators=radiators)
    )
    assert [b["radiators_kwh"] for b in r["buckets"]] == [None, None, None, 3.0, 0.0]
    assert r["total"]["radiators_kwh"] == 3.0
    month = build_report(
        date(2026, 9, 1), date(2026, 11, 1), "month", inputs(daily, radiators=radiators)
    )
    assert [b["radiators_kwh"] for b in month["buckets"]] == [None, 3.0]


def test_heating_share_skips_the_partial_first_recording_day():
    """The recorder's first day holds only part of a day: it would understate the share."""
    daily = {d: 10_000 for d in days(date(2026, 10, 1), date(2026, 10, 4))}
    radiators = {date(2026, 10, 1): 1.0, date(2026, 10, 2): 5.0, date(2026, 10, 3): 5.0}
    inp = inputs(daily, radiators=radiators)
    inp.radiators["r"] = rad_days(radiators, partial={date(2026, 10, 1)})
    r = build_report(date(2026, 10, 1), date(2026, 10, 4), "day", inp)
    assert r["heating_share"] == pytest.approx(0.5)
    assert r["heating_share_since"] == "2026-10-02"


def test_week_buckets_are_iso_weeks_from_monday():
    daily = {d: 10_000 for d in days(date(2026, 10, 1), date(2026, 10, 14))}
    r = build_report(date(2026, 9, 28), date(2026, 10, 19), "week", inputs(daily))
    assert [b["key"] for b in r["buckets"]] == ["2026-W40", "2026-W41", "2026-W42"]
    assert [b["kwh"] for b in r["buckets"]] == [40.0, 70.0, 20.0]
    assert r["period"]["from"] == "2026-10-12" and r["period"]["to"] == "2026-10-19"


def test_week_53_and_the_year_boundary():
    daily = {d: 10_000 for d in days(date(2026, 12, 28), date(2027, 1, 5))}
    r = build_report(
        date(2026, 12, 28), date(2027, 1, 11), "week", inputs(daily, today=date(2027, 1, 6))
    )
    assert [b["key"] for b in r["buckets"]] == ["2026-W53", "2027-W01"]
    assert [b["days"] for b in r["buckets"]] == [7, 7]


def test_the_selected_period_is_independent_of_the_chart_window():
    daily = {d: 10_000 for d in days(date(2026, 1, 1), date(2026, 10, 14))}
    r = build_report(
        date(2025, 11, 1),
        date(2026, 11, 1),
        "month",
        inputs(daily),
        period=(date(2026, 3, 1), date(2026, 4, 1)),
    )
    assert (r["period"]["from"], r["period"]["to"]) == ("2026-03-01", "2026-04-01")
    assert r["period"]["kwh"] == 310.0 and len(r["buckets"]) == 12


def test_l8_a_radiator_added_mid_window_makes_coverage_partial_and_rest_unknown():
    daily = {d: 10_000 for d in days(date(2026, 10, 5), date(2026, 10, 12))}
    a = {d: 2.0 for d in days(date(2026, 10, 5), date(2026, 10, 12))}
    b = {d: 1.0 for d in days(date(2026, 10, 8), date(2026, 10, 12))}
    inp = inputs(daily, radiators={"a": a, "b": b}, today=date(2026, 10, 12))
    r = build_report(
        date(2026, 10, 5),
        date(2026, 10, 12),
        "week",
        inp,
        period=(date(2026, 10, 5), date(2026, 10, 12)),
    )
    [week] = r["buckets"]
    assert week["radiators"]["coverage"] == 1.0  # b did not exist before the 8th
    assert week["rest_kwh"] == pytest.approx(70 - 14 - 4)
    inp.radiators["b"] = rad_days(b, partial={date(2026, 10, 8)})  # first day half-measured
    r = build_report(
        date(2026, 10, 5),
        date(2026, 10, 12),
        "week",
        inp,
        period=(date(2026, 10, 5), date(2026, 10, 12)),
    )
    [week] = r["buckets"]
    assert week["radiators"]["coverage"] == pytest.approx(10 / 11, abs=1e-4)
    assert week["rest_kwh"] is None
    assert r["heating"]["days"] == 6 and r["heating"]["of_days"] == 7


def test_l8_a_removed_radiator_stays_in_the_history_without_dragging_coverage():
    daily = {d: 10_000 for d in days(date(2026, 10, 1), date(2026, 10, 8))}
    gone = {d: 3.0 for d in days(date(2026, 10, 1), date(2026, 10, 4))}
    stays = {d: 2.0 for d in days(date(2026, 10, 1), date(2026, 10, 8))}
    inp = inputs(daily, radiators={"gone": gone, "stays": stays}, today=date(2026, 10, 8))
    inp.radiator_life["gone"] = (date(2026, 10, 1), date(2026, 10, 3))
    r = build_report(date(2026, 10, 1), date(2026, 10, 8), "day", inp)
    assert [b["radiators"]["coverage"] for b in r["buckets"]] == [1.0] * 7
    assert r["buckets"][0]["radiators_kwh"] == 5.0 and r["buckets"][5]["radiators_kwh"] == 2.0


def test_m6_by_radiator_covers_the_selected_period_not_the_window():
    daily = {d: 10_000 for d in days(date(2026, 9, 1), date(2026, 10, 14))}
    a = {d: 1.0 for d in days(date(2026, 9, 1), date(2026, 10, 14))}
    inp = inputs(
        daily,
        radiators={"a": a},
        rooms={"a": "salon"},
        sample_stats={"a": {"temp_avg": 19.43, "setpoint_avg": 20.0, "heating_hours": 2.84}},
    )
    r = build_report(date(2025, 11, 1), date(2026, 11, 1), "month", inp)
    assert (r["period"]["from"], r["period"]["to"]) == ("2026-10-01", "2026-11-01")
    [row] = r["by_radiator"]
    assert row["kwh"] == 13.0  # October only, though the window holds September too
    assert row["room_id"] == "salon" and row["from"] == "2026-09-01"
    assert (row["temp_avg"], row["setpoint_avg"], row["heating_hours"]) == (19.4, 20.0, 2.8)
    assert r["radiators"] == [{"radiator_id": "a", "kwh": 43.0}]  # v1: the chart window


def test_radiator_hc_hp_and_euros_add_up_per_bucket():
    day = date(2026, 10, 6)
    rd = RadiatorDay(4000.0, 1000.0, 3000.0, 1000 / 1000 * 0.2 + 3 * 0.3, False, True, True)
    inp = inputs({day: 10_000}, t=tariff(), today=date(2026, 10, 7))
    inp.radiators = {"a": {day: rd}}
    inp.radiator_life = {"a": (day, None)}
    [b] = build_report(day, day + timedelta(days=1), "day", inp)["buckets"]
    assert b["radiators"] == {
        "kwh": 4.0,
        "hc_kwh": 1.0,
        "hp_kwh": 3.0,
        "eur": 1.1,
        "interpolated": False,
        "apportioned": True,
        "coverage": 1.0,
    }
    assert b["rest_kwh"] == 6.0
