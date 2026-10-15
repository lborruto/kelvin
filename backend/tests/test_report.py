from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from hypothesis import HealthCheck, example, given, settings
from hypothesis import strategies as st

from kelvin.billing.costs import days_in_month
from kelvin.billing.radiators import RadiatorDay
from kelvin.billing.report import (
    ReportInputs,
    build_report,
    minus_year,
    next_unit,
    unit_start,
)
from kelvin.billing.slots import Slot
from kelvin.billing.tariff import (
    ALL_MONTHS,
    TARIFF_KEY,
    HcSchedule,
    HcVariant,
    PriceRow,
    Prices,
    Tariff,
    TariffStore,
)
from kelvin.linky.models import CurvePoint, day_bounds
from kelvin.linky.service import LOOKBACK_DAYS, radiator_ranges
from kelvin.recorder.db import Database

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


def test_l5_days_before_the_first_price_are_flagged():
    daily = {d: 10_000 for d in days(date(2026, 9, 25), date(2026, 10, 5))}
    t = tariff(Prices(date(2026, 10, 1), 15.0, 0.2, 0.3))
    r = build_report(date(2026, 9, 25), date(2026, 10, 5), "month", inputs(daily, t=t))
    sep, octo = r["buckets"]
    assert sep["retro_priced"] is True and octo["retro_priced"] is False
    assert r["quality"]["retro_priced_days"] == 6
    assert sep["prices"] == [
        {
            "valid_from": "2026-10-01",
            "option": "hchp",
            "subscription_eur_month": 15.0,
            "rates": {"hc": 0.2, "hp": 0.3},
        }
    ]


def test_prices_lists_each_row_a_bucket_used():
    daily = {d: 10_000 for d in days(date(2026, 9, 1), date(2026, 10, 1))}
    t = tariff(
        Prices(date(2026, 1, 1), 15.0, 0.20, 0.30), Prices(date(2026, 9, 16), 16.0, 0.25, 0.35)
    )
    [sep] = build_report(date(2026, 9, 1), date(2026, 10, 1), "month", inputs(daily, t=t))[
        "buckets"
    ]
    assert [p["valid_from"] for p in sep["prices"]] == ["2026-01-01", "2026-09-16"]


def test_split_method_and_present_days_per_bucket():
    day = date(2026, 10, 6)
    daily = {day: 24_000, day + timedelta(days=1): 24_000}
    curve = {day: flat(day, 24.0)}
    r = build_report(day, day + timedelta(days=3), "day", inputs(daily, curve=curve, t=tariff()))
    assert [b["split_method"] for b in r["buckets"]] == ["curve", "fallback_window", None]
    assert [b["present_days"] for b in r["buckets"]] == [1, 1, 0]
    both = build_report(
        day, day + timedelta(days=2), "month", inputs(daily, curve=curve, t=tariff())
    )
    assert both["buckets"][0]["split_method"] == "mixed"


def test_curve_figures_per_bucket_and_quality():
    day = date(2026, 10, 6)
    points = flat(day, 24.0)  # 500 Wh per half-hour = 1 000 W
    points[38] = CurvePoint(points[38].ts, 30, 3000.0)  # 19:00–19:30 at 6 000 W
    daily = {day: 26_000}  # the meter reads 500 Wh less than the curve's 26.5 kWh
    r = build_report(day, day + timedelta(days=1), "day", inputs(daily, curve={day: points}))
    [b] = r["buckets"]
    assert b["curve"] == {
        "complete_days": 1,
        "kwh": 26.5,
        "peak_w": 6000,
        "peak_ts": points[38].ts,
        "base_w_p10": 1000,
        "night_min_w": 1000,
    }
    assert r["quality"]["curve_vs_daily_pct"] == pytest.approx(500 / 26_000 * 100, abs=0.01)
    assert r["boundary_prorated"] is False


def test_l11_slots_off_the_half_hour_are_flagged():
    t = Tariff("hchp", 9, (Slot("00:50", "06:50"),), (Prices(date(2026, 1, 1), 15.0, 0.2, 0.3),))
    r = build_report(date(2026, 10, 1), date(2026, 10, 2), "day", inputs({}, t=t))
    assert r["boundary_prorated"] is True


def test_the_hc_lens_states_facts_for_the_selected_period():
    day = date(2026, 10, 6)
    daily = {day: 24_000}
    curve = {day: flat(day, 24.0)}  # HALF: half of every flat day is off-peak
    r = build_report(day, day + timedelta(days=1), "day", inputs(daily, curve=curve, t=tariff()))
    assert r["hc_lens"] == {
        "hc_share": 0.5,
        "slot_share": 0.5,
        "avg_price": 0.25,
        "delta_price": 0.1,
    }
    assert build_report(day, day + timedelta(days=1), "day", inputs(daily))["hc_lens"] is None


def test_i1_days_after_today_are_not_expected_radiator_days():
    """Batch-3 review I-1: a current month measured every elapsed day reads 100 %, as the hero
    does, not 13/31."""
    daily = {d: 10_000 for d in days(date(2026, 10, 1), date(2026, 10, 14))}
    a = {d: 2.0 for d in days(date(2026, 10, 1), date(2026, 10, 14))}
    r = build_report(
        date(2026, 10, 1), date(2026, 11, 1), "month", inputs(daily, radiators={"a": a})
    )
    [octo] = r["buckets"]
    assert octo["radiators"]["coverage"] == 1.0
    assert r["by_radiator"][0]["coverage"] == 1.0


def test_i3_the_hc_lens_divides_unrounded_figures():
    """Review I-3: 1.234 kWh, half off-peak at 0.1952 / 0.2516 €/kWh: the mean price is
    0.2234, not 0.28 € (rounded) / 1.234 kWh = 0.2269."""
    day = date(2026, 10, 6)
    t = tariff(Prices(date(2026, 1, 1), 15.0, 0.1952, 0.2516))
    inp = inputs({day: 1234}, curve={day: flat(day, 1.234)}, t=t, today=date(2026, 10, 7))
    lens = build_report(day, day + timedelta(days=1), "day", inp)["hc_lens"]
    assert lens["avg_price"] == pytest.approx(0.2234, abs=1e-4)
    assert lens["hc_share"] == 0.5


def test_i4_linky_since_is_never_before_the_first_counted_day():
    """Review I-4: the store keeps days older than the report counts (first_day caps them):
    `linky_since` names the first day the report shows, in v1 and in `quality`."""
    daily = {d: 10_000 for d in days(date(2026, 3, 1), date(2026, 10, 14))}
    inp = inputs(daily, linky_since=date(2026, 3, 1))
    inp.first_day = date(2026, 6, 1)
    r = build_report(date(2026, 1, 1), date(2027, 1, 1), "month", inp)
    assert r["linky_since"] == "2026-06-01" and r["quality"]["linky_since"] == "2026-06-01"
    inp = inputs({d: v for d, v in daily.items() if d >= date(2026, 9, 1)})
    inp.linky_since = date(2026, 3, 1)  # unknown contract: the store's first day (not loaded)
    r = build_report(date(2026, 9, 1), date(2026, 10, 1), "month", inp)
    assert r["linky_since"] == "2026-03-01"


def test_curve_figures_only_on_days_the_report_counts():
    """Review M-3: a complete curve day before first_day gives no `curve` block either."""
    day = date(2026, 9, 6)
    inp = inputs({day: 24_000}, curve={day: flat(day, 24.0)})
    inp.first_day = date(2026, 10, 1)
    [b] = build_report(day, day + timedelta(days=1), "day", inp)["buckets"]
    assert b["kwh"] is None and b["curve"] is None


def audit_b():
    """Audit case B: 20 kWh every day from 1 September, 5–7 October missing, today 14 Oct."""
    daily = {d: 20_000 for d in days(date(2026, 9, 1), date(2026, 10, 14))}
    for d in (date(2026, 10, 5), date(2026, 10, 6), date(2026, 10, 7)):
        del daily[d]
    return daily


def test_m3_the_comparison_pairs_days_present_on_both_sides():
    daily = audit_b()
    daily[date(2026, 10, 7)] = 20_000  # two missing days: 11 pairs of 13
    r = build_report(date(2025, 11, 1), date(2026, 11, 1), "month", inputs(daily, t=tariff()))
    prev = r["comparison"]["previous"]
    assert (prev["from"], prev["to"]) == ("2026-09-01", "2026-09-14")
    assert (prev["pairs"], prev["of"], prev["comparable"]) == (11, 13, True)
    assert prev["cur_kwh"] == prev["prev_kwh"] == 220.0
    assert prev["change"] == 0.0 and prev["change_energy_eur"] == 0.0
    # The v1 hero still compares unpaired sums (audit M3); Plan 6 shows the pairs instead.
    assert (r["hero"]["current"]["kwh"], r["hero"]["previous"]["kwh"]) == (220.0, 260.0)


def test_m3_more_than_20_percent_of_pairs_dropped_gives_no_change():
    """The audit's case B drops 3 pairs of 13 (23 %): the sums match, but no change is shown."""
    r = build_report(date(2025, 11, 1), date(2026, 11, 1), "month", inputs(audit_b()))
    prev = r["comparison"]["previous"]
    assert (prev["pairs"], prev["of"], prev["comparable"]) == (10, 13, False)
    assert prev["cur_kwh"] == prev["prev_kwh"] == 200.0
    assert prev["change"] is None
    assert r["comparison"]["last_year"]["pairs"] == 0
    assert r["comparison"]["last_year"]["change"] is None


def test_m4_the_month_projection_fills_missing_elapsed_days():
    r = build_report(date(2025, 11, 1), date(2026, 11, 1), "month", inputs(audit_b(), t=tariff()))
    month = r["projection"]["month"]
    assert month["kwh"] == pytest.approx(620.0) and month["filled_days"] == 3
    # energy of the 10 measured days + 21 estimated days at the trailing price + 15 € of
    # subscription for the whole month
    assert month["eur"] == pytest.approx(200 * 0.25 + 21 * 20 * 0.25 + 15.0, abs=0.01)


def test_m5_the_rolling_year_starts_tomorrow_and_lasts_365_days():
    r = build_report(date(2025, 11, 1), date(2026, 11, 1), "month", inputs(audit_b(), t=tariff()))
    rolling = r["projection"]["rolling"]
    assert (rolling["from"], rolling["to"]) == ("2026-10-15", "2027-10-15")
    assert rolling["kwh"] == pytest.approx(365 * 20.0)
    assert rolling["eur"] == pytest.approx(365 * 20 * 0.25 + 15.0 * 12, abs=0.6)
    assert rolling["method"] == "linear"


def test_l4_year_comparisons_use_calendar_dates_across_29_february():
    daily = {d: 10_000 for d in days(date(2027, 1, 1), date(2028, 3, 11))}
    r = build_report(
        date(2027, 1, 1), date(2029, 1, 1), "year", inputs(daily, today=date(2028, 3, 11))
    )
    prev = r["comparison"]["previous"]
    assert (prev["from"], prev["to"]) == ("2027-01-01", "2027-03-11")  # not 03-10
    assert (prev["pairs"], prev["of"], prev["change"]) == (70, 70, 0.0)


def test_month_counterparts_that_do_not_exist_are_not_pairs():
    daily = {d: 10_000 for d in days(date(2026, 9, 1), date(2026, 11, 1))}
    r = build_report(
        date(2026, 10, 1),
        date(2026, 11, 1),
        "month",
        inputs(daily, today=date(2026, 11, 2)),
    )
    assert r["comparison"]["previous"]["of"] == 30  # 31 October has no 31 September


def test_the_mean_of_the_four_previous_weeks():
    daily = {d: 10_000 for d in days(date(2026, 9, 7), date(2026, 10, 12))}
    for d in days(date(2026, 10, 12), date(2026, 10, 14)):
        daily[d] = 12_000
    r = build_report(date(2026, 9, 7), date(2026, 10, 19), "week", inputs(daily))
    avg4 = r["comparison"]["avg4"]
    assert avg4 == {
        "units": 4,
        "cur_kwh_per_day": 12.0,
        "prev_kwh_per_day": 10.0,
        "change": 0.2,
    }


def test_i1_the_rolling_year_takes_its_last_weeks_from_last_year():
    """Review I-1: from the 21st, the rolling year's tail month (October next year) is scaled
    by last October, not by the current, partly elapsed October."""
    daily = {d: 10_000 for d in days(date(2025, 9, 1), date(2026, 10, 1))}
    for d in days(date(2026, 10, 1), date(2026, 10, 28)):
        daily[d] = 20_000  # a cold October: 27 days, above MIN_MONTH_DAYS
    r = build_report(
        date(2026, 10, 1), date(2026, 11, 1), "month", inputs(daily, today=date(2026, 10, 28))
    )
    rolling = r["projection"]["rolling"]
    assert rolling["per_day_kwh"] == 19.0 and rolling["method"] == "seasonal"
    assert rolling["kwh"] == pytest.approx(365 * 19.0)


@pytest.mark.parametrize("group", ["day", "week", "month"])
def test_i2_a_custom_period_is_compared_with_the_days_just_before_it(group):
    """Review I-2: a period of ten days is compared with the ten days before it (and avg4 with
    the four previous runs of ten days), whatever the grouping, never with itself."""
    daily = {d: 10_000 for d in days(date(2026, 9, 1), date(2026, 10, 1))}
    for d in days(date(2026, 10, 1), date(2026, 10, 11)):
        daily[d] = 20_000
    r = build_report(
        date(2026, 9, 1),
        date(2026, 10, 12),
        group,
        inputs(daily),
        period=(date(2026, 10, 1), date(2026, 10, 11)),
    )
    comparison = r["comparison"]
    assert comparison["basis"] == "days"
    prev = comparison["previous"]
    assert (prev["from"], prev["to"], prev["pairs"], prev["of"]) == (
        "2026-09-21",
        "2026-10-01",
        10,
        10,
    )
    assert prev["change"] == 1.0
    avg4 = comparison["avg4"]  # 21–30 Sep, 11–20 Sep, 1–10 Sep; 22–31 Aug has no data
    assert (avg4["units"], avg4["change"]) == (3, 1.0)


def test_i2_a_whole_unit_is_compared_unit_by_unit():
    daily = {d: 10_000 for d in days(date(2026, 9, 1), date(2026, 10, 14))}
    r = build_report(date(2026, 9, 1), date(2026, 11, 1), "month", inputs(daily))
    assert r["comparison"]["basis"] == "unit"
    assert r["comparison"]["previous"]["from"] == "2026-09-01"


def test_i3_avg4_compares_the_same_days_on_both_sides():
    """Review I-3: the four previous weeks lack their Sundays (the costly day); the current
    week is measured on the days paired with them, so an unchanged home shows no change."""
    daily = {}
    for d in days(date(2026, 9, 7), date(2026, 10, 12)):
        if d.weekday() == 6:
            if d >= date(2026, 10, 5):
                daily[d] = 30_000
        else:
            daily[d] = 10_000
    r = build_report(date(2026, 9, 7), date(2026, 10, 12), "week", inputs(daily))
    avg4 = r["comparison"]["avg4"]
    assert avg4 == {
        "units": 4,
        "cur_kwh_per_day": 10.0,
        "prev_kwh_per_day": 10.0,
        "change": 0.0,
    }
    assert r["comparison"]["previous"]["change"] == 0.0


@pytest.mark.parametrize("contract_start", [date(2026, 10, 6), None])
def test_m3_the_filled_month_pays_its_subscription_from_the_contract_start(contract_start):
    """Batch-4 review m-3: in the contract's first month, the days before it start pay no
    subscription (the counted days start there; unknown start: the first data day)."""
    daily = {d: 20_000 for d in days(date(2026, 10, 6), date(2026, 10, 14))}
    inp = inputs(daily, t=tariff(), first_day=contract_start)
    month = build_report(date(2026, 10, 1), date(2026, 11, 1), "month", inp)["projection"]["month"]
    assert month["filled_days"] == 0 and month["kwh"] == pytest.approx(26 * 20.0)
    # 8 measured + 18 remaining days at the trailing price, subscription for 6-31 Oct only
    assert month["eur"] == pytest.approx(26 * 20 * 0.25 + 15.0 * 26 / 31, abs=0.01)


def test_final_i2_radiator_sums_count_exactly_the_days_coverage_counts():
    """Final review I2: today's partial day is not in coverage, so it is not in the kWh."""
    today = date(2026, 10, 14)
    daily = {d: 10_000 for d in days(date(2026, 10, 1), today)}
    per_day = {d: 5.0 for d in days(date(2026, 10, 1), today)}
    rd = rad_days({**per_day, today: 1.2}, partial={today})
    for d in per_day:
        rd[d] = RadiatorDay(5000.0, 2000.0, 3000.0, 2 * 0.2 + 3 * 0.3, False, False, True)
    rd[today] = RadiatorDay(1200.0, 600.0, 600.0, 0.6 * 0.2 + 0.6 * 0.3, False, False, False)
    inp = inputs(daily, t=tariff(), today=today)
    inp.radiators = {"a": rd}
    inp.radiator_life = {"a": (date(2026, 10, 1), None)}
    r = build_report(date(2026, 10, 1), date(2026, 11, 1), "month", inp)
    [octo] = r["buckets"]
    assert octo["radiators"]["coverage"] == 1.0
    assert octo["radiators"]["kwh"] == 65.0 and octo["radiators_kwh"] == 65.0
    assert (octo["radiators"]["hc_kwh"], octo["radiators"]["hp_kwh"]) == (26.0, 39.0)
    assert octo["radiators"]["eur"] == round(13 * 1.3, 2)
    assert (r["by_radiator"][0]["kwh"], r["by_radiator"][0]["coverage"]) == (65.0, 1.0)
    assert r["radiators"] == [{"radiator_id": "a", "kwh": 65.0}]  # v1


def test_the_total_is_the_sum_of_its_rounded_parts():
    """Like an invoice: eur = round(energy_eur) + round(subscription_eur), so the parts add up."""
    d = date(2026, 10, 13)  # 31 days: 15 / 31 = 0.4839 a day
    t = tariff(Prices(date(2026, 1, 1), 15.0, 0.2, 0.2))
    r = build_report(d, d + timedelta(days=1), "day", inputs({d: 26524.5}, t=t))
    [b] = r["buckets"]
    # Rounded apart: 5.3049 -> 5.30 and 0.4839 -> 0.48; the unrounded sum 5.7888 would read 5.79.
    assert (b["energy_eur"], b["subscription_eur"], b["eur"]) == (5.3, 0.48, 5.78)
    for s in (r["total"], r["period"], r["hero"]["current"], r["hero"]["previous"]):
        if s["eur"] is not None:
            assert s["eur"] == round(s["energy_eur"] + s["subscription_eur"], 2)


@pytest.mark.parametrize(
    ("start", "end", "group"),
    [
        (date(2026, 10, 1), date(2026, 11, 1), "day"),  # Mois by day, running: counted to the 13th
        (date(2025, 10, 20), date(2025, 10, 27), "day"),  # Semaine with the autumn DST day
        (date(2026, 3, 23), date(2026, 3, 30), "day"),  # Semaine with the spring DST day
        (date(2026, 1, 1), date(2027, 1, 1), "month"),  # Année by month, two prices
        (date(2026, 9, 1), date(2026, 10, 1), "week"),  # a month by (clipped) weeks
        (date(2026, 2, 1), date(2026, 3, 1), "day"),  # 28 days: 15 / 28 a day
    ],
)
def test_bucket_euros_add_up_to_the_period(start, end, group):
    """Shown sums add up (spec §9.1): the bars' subscription, energy and € sum to the period's
    to the cent; each bucket stays within a cent of its exact figure, and eur = energy + sub."""
    span = days(date(2025, 10, 1), date(2026, 10, 14))
    daily = {d: 13_337 + (i * 179) % 4_001 for i, d in enumerate(span)}
    t = tariff(
        Prices(date(2025, 1, 1), 15.0, 0.2068, 0.27),
        Prices(date(2026, 8, 1), 16.37, 0.2101, 0.2733),
    )
    r = build_report(start, end, group, inputs(daily, t=t), period=(start, end))
    cents = lambda v: round(v * 100)  # noqa: E731
    p = r["period"]
    for key in ("subscription_eur", "energy_eur", "eur"):
        assert sum(cents(b[key]) for b in r["buckets"] if b[key] is not None) == cents(p[key]), key
        assert cents(r["total"][key]) == cents(p[key])
    for b in r["buckets"]:
        if b["eur"] is not None:
            assert cents(b["eur"]) == cents(b["energy_eur"]) + cents(b["subscription_eur"])
        if b["subscription_eur"] is not None:
            a = date.fromisoformat(b["key"][:10]) if group == "day" else None
            if a is not None:
                exact = t.prices_on(a).subscription_eur_month / days_in_month(a)
                assert abs(b["subscription_eur"] - exact) < 0.01 + 1e-9


_SPAN = (date(2025, 11, 20), date(2026, 2, 10))  # across a new year and a price change
_DAILY = {d: 9_000 + (i * 7_919) % 13_001 for i, d in enumerate(days(*_SPAN))}
_TARIFF = tariff(
    Prices(date(2025, 1, 1), 15.0, 0.2068, 0.27), Prices(date(2026, 1, 15), 16.37, 0.2101, 0.2733)
)


def shaped(day: date, wh: float, hc: float) -> list[CurvePoint]:
    """A complete curve of `wh` with the share `hc` of it in the off-peak half (00:00–12:00)."""
    a, b = day_bounds(day, PARIS)
    ts = range(a, b, 1800)
    off = [t for t in ts if datetime.fromtimestamp(t, PARIS).hour < 12]
    on = [t for t in ts if datetime.fromtimestamp(t, PARIS).hour >= 12]
    return sorted(
        [CurvePoint(t, 30, wh * hc / len(off)) for t in off]
        + [CurvePoint(t, 30, wh * (1 - hc) / len(on)) for t in on],
        key=lambda p: p.ts,
    )


# Curves: an old history (more than 400 days before the span), a month, then a gap of more
# than 31 days around the span's start (days there have no curve within ±15 days), then the
# rest. Each day's off-peak share differs, so which curves a fallback reads changes its share.
_CURVE_DAYS = [
    *days(date(2024, 10, 1), date(2024, 11, 16)),
    *days(date(2025, 10, 1), date(2025, 11, 1)),
    *days(date(2026, 1, 10), date(2026, 2, 11)),
]
_CURVE = {
    d: shaped(d, _DAILY.get(d, 12_000), 0.15 + 0.7 * ((i * 37) % 11) / 10)
    for i, d in enumerate(_CURVE_DAYS)
}


# Three radiators whose daily € have fractions of a cent, so rounding each on its own drifts.
_RADS = {
    rid: {
        d: RadiatorDay(
            w := 1_000 + (i * k * 613) % 9_001,
            w * 0.3,
            w * 0.7,
            w / 1000 * 0.2531,
            False,
            False,
            True,
        )
        for i, d in enumerate(days(date(2025, 11, 1), date(2026, 2, 15)))
    }
    for rid, k in (("a", 1), ("b", 3), ("c", 7))
}


def _loaded(start: date, end: date, today: date) -> ReportInputs:
    """The inputs the service builds for the window [start, end) (period = window): the curves
    from 400 days before it on (`LinkyService.report`'s look-back), every day after, and the
    radiator days of the ranges the service loads (`radiator_ranges`)."""
    lo = start - timedelta(days=LOOKBACK_DAYS)
    curve = {d: p for d, p in _CURVE.items() if d >= lo}
    inp = inputs(_DAILY, curve=curve, t=_TARIFF, today=today, first_day=_CURVE_DAYS[0])
    ranges = radiator_ranges((start, end), (start, end))
    inp.radiators = {
        rid: {d: rd for d, rd in per.items() if any(a <= d < b for a, b in ranges)}
        for rid, per in _RADS.items()
    }
    inp.radiator_life = {rid: (date(2025, 11, 1), None) for rid in _RADS}
    return inp


def _rad_eur(s: dict) -> float | None:
    return (s.get("radiators") or {}).get("eur")


def _euros(s: dict) -> tuple:
    return (s["energy_eur"], s["subscription_eur"], s["eur"])


def _split(s: dict) -> tuple:
    return (s["hc_kwh"], s["hp_kwh"], s["split_method"])


@settings(max_examples=40, deadline=None, suppress_health_check=[HealthCheck.too_slow])
@given(
    a=st.integers(0, 75),
    n=st.integers(1, 60),
    group=st.sampled_from(["day", "week", "month"]),
)
@example(a=0, n=30, group="day")  # 10/12: no curve within ±15 days, history older than 400 days
def test_a_bucket_reads_the_same_euros_in_any_window_and_the_buckets_sum_to_the_period(a, n, group):
    """Same bucket, same figure: a bucket's € and HC/HP split do not depend on the window asked
    (a day reads the same in Jour, Semaine, Mois and Année), and any window's buckets add up to
    its period. The curves include a gap of more than 31 days and history older than the
    look-back, so a day's fallback share must not read curves only some windows load."""
    today = date(2026, 2, 15)
    start = _SPAN[0] + timedelta(days=a)
    end = min(start + timedelta(days=n), _SPAN[1] + timedelta(days=5))
    r = build_report(start, end, group, _loaded(start, end, today), period=(start, end))
    d = start
    for b in r["buckets"]:
        nxt = min(next_unit(unit_start(d, group), group), end)
        alone = build_report(d, nxt, "day", _loaded(d, nxt, today), period=(d, nxt))["period"]
        assert _euros(b) == _euros(alone), (b["key"], start, end)
        assert _split(b) == _split(alone), (b["key"], start, end)
        assert _rad_eur(b) == _rad_eur(alone), (b["key"], start, end)
        d = nxt
    cents = lambda v: round(v * 100)  # noqa: E731
    p = r["period"]
    for i in range(2):
        shown = [_euros(b)[i] for b in r["buckets"] if _euros(b)[i] is not None]
        assert (sum(cents(v) for v in shown) if shown else None) == (
            cents(_euros(p)[i]) if _euros(p)[i] is not None else None
        )
    for s in (*r["buckets"], p):
        if s["eur"] is not None:
            assert cents(s["eur"]) == cents(s["energy_eur"]) + cents(s["subscription_eur"])
    # The radiators' € too: the buckets add up to the period, and so do the radiators (the
    # rooms table's € and « Coût du chauffage » read the same total).
    if _rad_eur(p) is not None:
        assert sum(cents(_rad_eur(b) or 0) for b in r["buckets"]) == cents(_rad_eur(p))
        assert sum(cents(x["eur"]) for x in r["by_radiator"]) == cents(_rad_eur(p))


def test_period_quality_describes_the_selected_period_not_the_window():
    """Final review I-1: in Jour the window is the 7 days ending on the day; `period.quality`
    counts only the selected day, while `quality` keeps describing the window (the bars)."""
    day = date(2026, 10, 12)
    lo = day - timedelta(days=6)
    daily = {d: 24_000 for d in days(lo, day + timedelta(days=1))}
    curve = {day: flat(day, 24.0)}  # the selected day alone has a complete curve
    r = build_report(
        lo,
        day + timedelta(days=1),
        "day",
        inputs(daily, curve=curve, t=tariff()),
        (day, day + timedelta(days=1)),
    )
    assert r["quality"]["estimated_days"] == 6
    pq = r["period"]["quality"]
    assert pq["estimated_days"] == 0 and pq["retro_priced_days"] == 0
    assert pq["curve_vs_daily_pct"] == pytest.approx(0.0)
    assert set(pq) == set(r["quality"])
    # An estimated selected day reads 1, never the window's count.
    other = build_report(
        lo,
        day + timedelta(days=1),
        "day",
        inputs(daily, curve=curve, t=tariff()),
        (lo, lo + timedelta(days=1)),
    )
    assert other["period"]["quality"]["estimated_days"] == 1
    assert other["period"]["quality"]["curve_vs_daily_pct"] is None


def test_the_projection_reprices_the_trailing_rate_mix_at_today_s_row():
    from kelvin.billing.costs import DayEnergy
    from kelvin.billing.report import _projected_price
    from kelvin.billing.tariff import PriceRow

    tempo = {
        "blue_hc": 0.1,
        "blue_hp": 0.2,
        "white_hc": 0.1,
        "white_hp": 0.3,
        "red_hc": 0.1,
        "red_hp": 0.8,
    }
    row = PriceRow.make(date(2026, 1, 1), "tempo", 15.0, tempo)
    days_ = [
        DayEnergy(
            date(2026, 10, i),
            10.0,
            4.0,
            6.0,
            False,
            "curve",
            (("blue_hc", 4.0), ("blue_hp", 6.0)),
            1.6,
        )
        for i in range(1, 4)
    ]
    assert _projected_price(days_, row) == pytest.approx((4 * 0.1 + 6 * 0.2) / 10)
    other = PriceRow.make(date(2026, 1, 1), "base", 15.0, {"base": 0.19})
    assert _projected_price(days_, other) == pytest.approx(1.6 / 10)  # keys differ: mean price paid
    assert _projected_price([], row) is None


TEMPO_RATES = {
    "blue_hc": 0.1296,
    "blue_hp": 0.1609,
    "white_hc": 0.1486,
    "white_hp": 0.1894,
    "red_hc": 0.1568,
    "red_hp": 0.7562,
}


def tempo_tariff() -> Tariff:
    return Tariff.build(12, [PriceRow.make(date(2025, 9, 1), "tempo", 15.0, TEMPO_RATES)])


def test_unknown_colours_are_counted_and_not_priced():
    start, end = date(2026, 12, 1), date(2026, 12, 5)
    daily = {d: 24_000 for d in days(start, end)}
    curve = {d: flat(d, 24.0) for d in days(start, end)}
    colours = {
        date(2026, 11, 30): "blue",
        date(2026, 12, 1): "white",
        date(2026, 12, 2): "red",
        date(2026, 12, 3): "blue",
    }
    r = build_report(
        start, end, "day", inputs(daily, curve=curve, t=tempo_tariff(), colours=colours)
    )
    b = r["buckets"]
    assert [x["tempo"] for x in b] == [
        {"blue": 0, "white": 1, "red": 0, "unknown": 0},
        {"blue": 0, "white": 0, "red": 1, "unknown": 0},
        {"blue": 1, "white": 0, "red": 0, "unknown": 0},
        {"blue": 0, "white": 0, "red": 0, "unknown": 1},
    ]
    assert b[0]["by_rate"] == {"blue_hc": 6.0, "white_hc": 2.0, "white_hp": 16.0}
    assert b[0]["energy_eur"] == pytest.approx(round(6 * 0.1296 + 16 * 0.1894 + 2 * 0.1486, 2))
    assert (b[3]["kwh"], b[3]["energy_eur"], b[3]["eur"], b[3]["missing_colour_days"]) == (
        24.0,
        None,
        None,
        1,
    )
    total = r["total"]
    assert total["missing_colour_days"] == 1 and total["kwh"] == 96.0
    assert total["energy_eur"] == pytest.approx(sum(x["energy_eur"] for x in b[:3]), abs=0.02)
    assert r["option"] == "tempo" and r["quality"]["missing_colour_days"] == 1


def test_tempo_lens_gives_six_rows_and_the_colour_days():
    start, end = date(2026, 12, 1), date(2026, 12, 4)
    daily = {d: 24_000 for d in days(start, end)}
    curve = {d: flat(d, 24.0) for d in days(start, end)}
    colours = {
        date(2026, 11, 30): "blue",
        date(2026, 12, 1): "white",
        date(2026, 12, 2): "red",
        date(2026, 12, 3): "blue",
    }
    r = build_report(
        start,
        end,
        "day",
        inputs(daily, curve=curve, t=tempo_tariff(), colours=colours),
        period=(start, end),
    )
    lens = r["tempo_lens"]
    assert lens["days"] == {"blue": 1, "white": 1, "red": 1, "unknown": 0}
    rows = {x["key"]: x for x in lens["rows"]}
    assert [x["key"] for x in lens["rows"]] == [
        "blue_hc",
        "blue_hp",
        "white_hc",
        "white_hp",
        "red_hc",
        "red_hp",
    ]
    assert (
        rows["red_hp"]["kwh"] == 16.0 and rows["red_hc"]["kwh"] == 8.0
    )  # 2 kWh after 22:00 + 6 kWh before 06:00 next day
    assert (
        rows["blue_hc"]["kwh"] == 8.0 and rows["blue_hp"]["kwh"] == 16.0
    )  # 1 Dec before 06:00 (30 Nov blue) + 3 Dec after 22:00
    assert rows["white_hc"]["kwh"] == 8.0 and rows["white_hp"]["kwh"] == 16.0
    assert rows["red_hp"]["eur"] == pytest.approx(round(16 * 0.7562, 2))
    assert lens["unknown_kwh"] is None
    assert r["hc_lens"]["delta_price"] is None and r["hc_lens"]["hc_share"] == pytest.approx(
        1 / 3, abs=1e-4
    )
    plain = build_report(
        start, end, "day", inputs(daily, curve=curve, t=tariff()), period=(start, end)
    )
    assert plain["tempo_lens"] is None and {x["tempo"] for x in plain["buckets"]} == {None}


def test_a_switch_to_tempo_prices_each_side_by_its_own_row():
    t = Tariff.build(
        12,
        [
            Prices(date(2025, 1, 1), 15.0, 0.2, 0.3),
            PriceRow.make(date(2026, 11, 1), "tempo", 15.0, TEMPO_RATES),
        ],
        [HcSchedule(date(2025, 1, 1), (HcVariant(ALL_MONTHS, HALF),))],
    )
    start, end = date(2026, 10, 30), date(2026, 11, 3)
    daily = {d: 24_000 for d in days(start, end)}
    curve = {d: flat(d, 24.0) for d in days(start, end)}
    colours = {date(2026, 10, 31): "blue", date(2026, 11, 1): "white", date(2026, 11, 2): "red"}
    octo, nov = build_report(start, end, "month", inputs(daily, curve=curve, t=t, colours=colours))[
        "buckets"
    ]
    assert octo["by_rate"] == {"hc": 24.0, "hp": 24.0} and octo["tempo"] is None
    assert octo["energy_eur"] == pytest.approx(24 * 0.2 + 24 * 0.3)
    assert nov["by_rate"] == {
        "blue_hc": 6.0,
        "red_hc": 2.0,
        "red_hp": 16.0,
        "white_hc": 8.0,
        "white_hp": 16.0,
    }
    assert nov["tempo"] == {"blue": 0, "white": 1, "red": 1, "unknown": 0}
    assert (nov["hc_kwh"], nov["hp_kwh"]) == (16.0, 32.0)
    assert [set(p["rates"]) for p in nov["prices"]] == [set(TEMPO_RATES)]


def test_the_migration_changes_no_figure():
    v1 = {
        "option": "hchp",
        "kva": 9,
        "hc_slots": [{"start": "22:00", "end": "06:00"}],
        "prices": [
            {
                "valid_from": "2025-01-15",
                "subscription_eur_month": 15.0,
                "hc_eur_kwh": 0.2,
                "hp_eur_kwh": 0.27,
            },
            {
                "valid_from": "2026-08-01",
                "subscription_eur_month": 15.5,
                "hc_eur_kwh": 0.2068,
                "hp_eur_kwh": 0.27,
            },
        ],
    }
    daily = {d: 10_000 for d in days(date(2026, 7, 1), date(2026, 10, 1))}
    legacy = Tariff(
        "hchp",
        9,
        (Slot("22:00", "06:00"),),
        (
            Prices(date(2025, 1, 15), 15.0, 0.2, 0.27),
            Prices(date(2026, 8, 1), 15.5, 0.2068, 0.27),
        ),
    )
    db = Database(":memory:")
    db.set_setting(TARIFF_KEY, v1)
    migrated = TariffStore(db).get()
    a = build_report(date(2026, 7, 1), date(2026, 10, 1), "month", inputs(daily, t=legacy))
    b = build_report(date(2026, 7, 1), date(2026, 10, 1), "month", inputs(daily, t=migrated))
    assert a == b
    sep = a["buckets"][2]
    assert sep["energy_eur"] == pytest.approx(
        100 * 0.2068 + 200 * 0.27
    )  # a third off-peak, 30 × 10 kWh


def test_base_buckets_have_euros_and_no_split():
    t = Tariff.build(12, [PriceRow.make(date(2026, 1, 1), "base", 15.0, {"base": 0.1952})])
    daily = {d: 10_000 for d in days(date(2026, 10, 1), date(2026, 10, 4))}
    r = build_report(date(2026, 10, 1), date(2026, 10, 4), "month", inputs(daily, t=t))
    [b] = r["buckets"]
    assert (b["hc_kwh"], b["hp_kwh"], b["tempo"], b["estimated_split"]) == (None, None, None, False)
    assert b["by_rate"] == {"base": 30.0} and b["energy_eur"] == pytest.approx(5.86)
    assert r["hc_lens"] is None and r["option"] == "base"


def test_a_bucket_mixing_base_and_split_days_has_no_hc_hp_but_all_its_euros():
    t = Tariff.build(
        12,
        [
            PriceRow.make(date(2026, 1, 1), "base", 15.0, {"base": 0.2}),
            Prices(date(2026, 10, 3), 15.0, 0.2, 0.3),
        ],
        [HcSchedule(date(2026, 10, 3), (HcVariant(ALL_MONTHS, HALF),))],
    )
    daily = {d: 10_000 for d in days(date(2026, 10, 1), date(2026, 10, 5))}
    [b] = build_report(date(2026, 10, 1), date(2026, 10, 5), "month", inputs(daily, t=t))["buckets"]
    assert (b["hc_kwh"], b["hp_kwh"]) == (None, None)
    assert b["energy_eur"] == pytest.approx(2 * 10 * 0.2 + 2 * (5 * 0.2 + 5 * 0.3))


def test_days_before_the_first_schedule_are_retro_scheduled():
    t = Tariff.build(
        12,
        [Prices(date(2025, 1, 1), 15.0, 0.2, 0.3)],
        [HcSchedule(date(2026, 10, 10), (HcVariant(ALL_MONTHS, HALF),))],
    )
    daily = {d: 10_000 for d in days(date(2026, 10, 5), date(2026, 10, 12))}
    r = build_report(date(2026, 10, 5), date(2026, 10, 12), "month", inputs(daily, t=t))
    assert r["buckets"][0]["retro_scheduled"] is True
    assert r["quality"]["retro_scheduled_days"] == 5


def test_a_month_with_an_unknown_colour_never_reads_as_whole():
    """Review of batch 2 (Important 1): December under Tempo, 12 December's colour unknown. The
    12th and the 13th (00:00–06:00 is on the 12th's colour) have no €; the month's € adds the
    priced days only and says how many days it leaves out."""
    start, end = date(2026, 12, 1), date(2027, 1, 1)
    daily = {d: 24_000 for d in days(start, end)}
    curve = {d: flat(d, 24.0) for d in days(start, end)}
    every = {d: ("blue", "white", "red")[d.day % 3] for d in days(date(2026, 11, 30), end)}
    some = {d: c for d, c in every.items() if d != date(2026, 12, 12)}
    full = build_report(
        start, end, "month", inputs(daily, curve=curve, t=tempo_tariff(), colours=every, today=end)
    )
    part = build_report(
        start, end, "month", inputs(daily, curve=curve, t=tempo_tariff(), colours=some, today=end)
    )
    by_day = build_report(
        start, end, "day", inputs(daily, curve=curve, t=tempo_tariff(), colours=some, today=end)
    )
    [f], [m] = full["buckets"], part["buckets"]
    assert f["missing_colour_days"] == 0 and m["missing_colour_days"] == 2
    assert m["tempo"]["unknown"] == 1 and m["kwh"] == f["kwh"]
    unpriced = [b["key"] for b in by_day["buckets"] if b["energy_eur"] is None]
    assert unpriced == ["2026-12-12", "2026-12-13"]
    priced = [b["energy_eur"] for b in by_day["buckets"] if b["energy_eur"] is not None]
    assert m["energy_eur"] == pytest.approx(sum(priced), abs=1e-9)  # the days add up to the month
    assert m["energy_eur"] < f["energy_eur"]
    assert part["total"]["missing_colour_days"] == 2 and part["quality"]["missing_colour_days"] == 2
    # The 12th from 06:00 (18 kWh) and the 13th before 06:00 (6 kWh) have no colour.
    assert part["tempo_lens"]["unknown_kwh"] == pytest.approx(24.0)


@settings(max_examples=60, deadline=None, suppress_health_check=[HealthCheck.too_slow])
@given(
    wh=st.lists(st.integers(1, 60_000), min_size=1, max_size=5),
    unknown=st.booleans(),
)
def test_shown_rate_parts_add_up_to_the_shown_kwh(wh, unknown):
    start = date(2026, 12, 1)
    span = list(days(start, start + timedelta(days=len(wh))))
    daily = dict(zip(span, wh, strict=True))
    curve = {
        d: [CurvePoint(p.ts, 30, p.wh * (1 + (i % 7) / 3)) for i, p in enumerate(flat(d, 24.0))]
        for d in span
    }
    colours = {
        d: ("blue", "white", "red")[d.day % 3]
        for d in days(date(2026, 11, 30), span[-1] + timedelta(days=1))
    }
    if unknown:
        del colours[span[0]]
    r = build_report(
        start,
        span[-1] + timedelta(days=1),
        "month",
        inputs(
            daily,
            curve=curve,
            t=tempo_tariff(),
            colours=colours,
            today=span[-1] + timedelta(days=1),
        ),
        period=(start, span[-1] + timedelta(days=1)),
    )
    for b in [*r["buckets"], r["total"]]:
        assert round(sum(b["by_rate"].values()) * 1000) == round(b["kwh"] * 1000)
    lens = r["tempo_lens"]
    shown = sum(x["kwh"] for x in lens["rows"]) + (lens["unknown_kwh"] or 0.0)
    assert round(shown * 1000) == round(r["period"]["kwh"] * 1000)
    if not unknown:
        assert round(sum(x["eur"] for x in lens["rows"]) * 100) == round(
            r["period"]["energy_eur"] * 100
        )
