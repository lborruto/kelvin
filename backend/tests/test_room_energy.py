"""Room energy over the last days (spec QW3): the report's radiator-day figures and its € rule."""

from datetime import date, timedelta

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from kelvin.billing.radiators import RadiatorDay
from kelvin.billing.report import radiator_cents, radiator_year_cum
from kelvin.billing.room_energy import counted_by, room_energy

TODAY = date(2026, 10, 14)
LIFE = {"a": (date(2026, 1, 1), None), "b": (date(2026, 1, 1), None)}


def rd(wh, eur=None, *, complete=True, interpolated=False):
    """A priced day splits half HC, half HP here: the split itself is radiator_days' job."""
    hc = None if eur is None else wh / 2
    return RadiatorDay(wh, hc, hc, eur, interpolated, False, complete)


def days_back(n, make):
    """{day: make(i)} for the n days up to and including today (i = 0 is today)."""
    return {TODAY - timedelta(days=i): make(i) for i in range(n)}


def test_elapsed_days_and_today_add_up_and_the_window_is_rounded_once():
    # 0.206 € the day before the window, 0.201 € a day inside it, 0.1 € so far today.
    per = {
        "a": {
            **days_back(8, lambda i: rd(1000.0, 0.201)),
            TODAY: rd(500.0, 0.1),
            TODAY - timedelta(days=7): rd(1000.0, 0.206),
        }
    }
    out = room_energy(per, LIFE, ["a"], 7, TODAY, {"a": 2.0}, priced=True)
    assert (out["from"], out["to"], out["days"]) == ("2026-10-08", "2026-10-14", 7)
    assert out["kwh"] == pytest.approx(6.5)  # six elapsed days and today so far
    assert out["hc_kwh"] == pytest.approx(3.25) and out["hp_kwh"] == pytest.approx(3.25)
    # On its own, 6 × 0.201 + 0.1 = 1.306 would round to 1.31. The running sum from 1 January
    # reads 0.206 at the window's start (21 cents) and 1.512 at its end, today included (151).
    assert out["eur"] == pytest.approx(1.30)
    assert out["heating_hours"] == pytest.approx(2.0)
    assert out["coverage"] == pytest.approx(1.0)
    assert (out["interpolated"], out["apportioned"], out["priced"]) == (False, False, True)


def test_windows_add_up_to_the_cent():
    per = {"a": days_back(40, lambda i: rd(700.0 + 13 * i, 0.137 + 0.011 * i))}
    e7 = room_energy(per, LIFE, ["a"], 7, TODAY, {}, priced=True)["eur"]
    e30 = room_energy(per, LIFE, ["a"], 30, TODAY, {}, priced=True)["eur"]
    years = {2026: radiator_year_cum(per, counted_by(LIFE, TODAY), 2026)}
    earlier = radiator_cents(
        years.__getitem__, TODAY - timedelta(days=29), TODAY - timedelta(days=6)
    )
    assert round((e30 - e7) * 100) == earlier


def test_today_alone_is_the_measured_half_hours_in_the_running_sum():
    per = {"a": {TODAY - timedelta(days=1): rd(1000.0, 0.206), TODAY: rd(300.0, 0.1)}}
    out = room_energy(per, LIFE, ["a"], 1, TODAY, {"a": 0.5}, priced=True)
    assert (out["kwh"], out["eur"], out["coverage"]) == (
        pytest.approx(0.3),
        pytest.approx(0.10),
        None,
    )


def test_no_reading_is_null_not_zero():
    out = room_energy({}, LIFE, ["a"], 7, TODAY, {"a": None}, priced=True)
    assert (out["kwh"], out["hc_kwh"], out["hp_kwh"], out["eur"], out["heating_hours"]) == (
        None,
    ) * 5
    assert out["coverage"] == 0.0  # the radiator existed on six days and none was measured


def test_a_radiator_never_recorded_lowers_nothing_but_leaves_the_hours_unknown():
    per = {"a": days_back(8, lambda i: rd(1000.0, 0.2))}
    out = room_energy(per, LIFE, ["a", "ghost"], 7, TODAY, {"a": 1.0}, priced=True)
    assert out["kwh"] == pytest.approx(7.0)
    assert out["coverage"] == pytest.approx(1.0)  # « ghost » never counted, as in the report
    assert out["heating_hours"] is None  # « ghost » has no samples: the room figure is unknown


def test_no_tariff_gives_kwh_only():
    per = {"a": days_back(8, lambda i: rd(1000.0))}
    out = room_energy(per, LIFE, ["a"], 7, TODAY, {"a": 1.0}, priced=False)
    assert out["kwh"] == pytest.approx(7.0)
    assert (out["hc_kwh"], out["hp_kwh"], out["eur"], out["priced"]) == (None, None, None, False)


def test_coverage_counts_elapsed_days_only_and_the_flags_follow():
    per = {
        "a": {
            **days_back(7, lambda i: rd(1000.0, 0.2, complete=i != 3)),
            TODAY: rd(100.0, 0.02, complete=False, interpolated=True),
        }
    }
    out = room_energy(per, LIFE, ["a"], 7, TODAY, {"a": 1.0}, priced=True)
    assert out["coverage"] == pytest.approx(
        5 / 6, abs=1e-4
    )  # 4 dp, as the report; today, still running, is in no denominator
    assert out["interpolated"] is True


def test_radiator_cents_splits_at_the_new_year_and_the_extra_rounds_with_the_end():
    cum = {
        2025: {date(2025, 12, 31): 0.0, date(2026, 1, 1): 0.206},
        2026: {date(2026, 1, 1): 0.0, date(2026, 1, 2): 0.201, date(2026, 1, 3): 0.402},
    }
    assert radiator_cents(cum.__getitem__, date(2025, 12, 31), date(2026, 1, 3)) == 21 + 40
    assert (
        radiator_cents(cum.__getitem__, date(2025, 12, 31), date(2026, 1, 3), extra=0.1) == 21 + 50
    )
    assert radiator_cents(cum.__getitem__, date(2026, 1, 2), date(2026, 1, 2), extra=0.1) == 10


@settings(max_examples=60)
@given(
    st.lists(st.lists(st.one_of(st.none(), st.floats(0, 5000)), min_size=7, max_size=7), max_size=4)
)
def test_room_energy_is_the_sum_of_its_radiators(rows):
    per = {
        f"r{i}": {TODAY - timedelta(days=k): rd(v) for k, v in enumerate(row) if v is not None}
        for i, row in enumerate(rows)
    }
    life = {rid: (date(2026, 1, 1), None) for rid in per}
    out = room_energy(per, life, list(per), 7, TODAY, {}, priced=False)
    known = [v for row in rows for v in row if v is not None]
    if not known:
        assert out["kwh"] is None
    else:
        assert out["kwh"] == pytest.approx(sum(known) / 1000, abs=5e-4)  # kWh keep 3 decimals


def test_a_day_reads_its_par_piece_share_not_a_room_only_rounding():
    # Two radiators in two rooms, 0.4 cent each on the same day: the house's running sum gives
    # that day 1 cent, which the report's Par pièce shares by largest remainder (to « a », the
    # first on a tie). The room reads that very share, not round(0.4 cent) = 0 on its own.
    day = TODAY - timedelta(days=1)
    per = {"a": {day: rd(20.0, 0.004)}, "b": {day: rd(20.0, 0.004)}}
    a = room_energy(per, LIFE, ["a"], 2, TODAY, {}, priced=True)
    b = room_energy(per, LIFE, ["b"], 2, TODAY, {}, priced=True)
    assert (a["eur"], b["eur"]) == (pytest.approx(0.01), pytest.approx(0.0))
    # The rooms add up to the house's cents for the day, as the Par pièce rows do.
    years = {2026: radiator_year_cum(per, counted_by(LIFE, TODAY), 2026)}
    assert round((a["eur"] + b["eur"]) * 100) == radiator_cents(years.__getitem__, day, TODAY)


def test_the_heating_hours_are_the_mean_of_the_radiators_as_in_par_piece():
    per = {"a": days_back(2, lambda i: rd(1000.0)), "b": days_back(2, lambda i: rd(1000.0))}
    out = room_energy(per, LIFE, ["a", "b"], 2, TODAY, {"a": 3.0, "b": 1.0}, priced=False)
    assert out["heating_hours"] == pytest.approx(2.0)


def test_under_base_a_room_has_euros_and_no_split():
    base = RadiatorDay(1000.0, None, None, 0.2, False, False, True)
    per = {"a": days_back(3, lambda i: base)}
    out = room_energy(per, LIFE, ["a"], 3, TODAY, {"a": 1.0}, priced=True)
    assert out["kwh"] == pytest.approx(3.0) and out["eur"] == pytest.approx(0.6)
    assert (out["hc_kwh"], out["hp_kwh"]) == (None, None) and out["missing_colour_days"] == 0


def test_a_day_without_a_tempo_colour_leaves_the_split_and_no_euros():
    per = {"a": days_back(3, lambda i: rd(1000.0, 0.2))}
    per["a"][TODAY - timedelta(days=1)] = RadiatorDay(
        1000.0, 500.0, 500.0, None, False, False, True
    )
    out = room_energy(per, LIFE, ["a"], 3, TODAY, {"a": 1.0}, priced=True)
    assert out["eur"] is None and out["missing_colour_days"] == 1  # never a partial €, and why
    assert out["kwh"] == pytest.approx(3.0) and out["hc_kwh"] == pytest.approx(1.5)
