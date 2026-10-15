"""Window/presence runs and the duty cycle from 5-min samples (spec QW4, QW5)."""

import pytest

from kelvin.recorder.activity import radiator_duty, room_duty, runs, union


def run(start, end, open_=False):
    return {"start": start, "end": end, "open": open_}


def test_a_run_starts_at_the_first_1_and_ends_at_the_next_0():
    s = [(0, 0), (300, 1), (600, 1), (900, 1), (1200, 0), (1500, 0)]
    assert runs(s, 0, 1800) == [run(300, 1200)]


def test_a_gap_over_15_minutes_ends_a_run_one_step_after_the_last_1():
    s = [(0, 1), (300, 1), (2100, 1), (2400, 0)]
    assert runs(s, 0, 3000) == [run(0, 600), run(2100, 2400)]


def test_a_15_minute_gap_does_not():
    assert runs([(0, 1), (900, 1), (1200, 0)], 0, 1800) == [run(0, 1200)]


def test_null_ends_a_run_and_never_starts_one():
    s = [(0, 1), (300, None), (600, None), (900, 0)]
    assert runs(s, 0, 1200) == [run(0, 300)]
    assert runs([(0, None), (300, None)], 0, 600) == []


def test_a_run_still_open_at_the_window_end_is_flagged():
    assert runs([(0, 0), (300, 1), (600, 1)], 0, 700) == [run(300, 700, True)]


def test_an_old_last_1_closes_one_step_after_it():
    assert runs([(0, 1)], 0, 5000) == [run(0, 300)]


def test_runs_are_clipped_to_the_window():
    s = [(0, 1), (300, 1), (600, 0)]
    assert runs(s, 200, 1000) == [run(200, 600)]


def test_union_merges_overlaps_and_keeps_open():
    assert union([run(0, 300), run(200, 600, True), run(900, 1200)]) == [
        run(0, 600, True),
        run(900, 1200),
    ]


def test_duty_formula_and_coverage():
    s = [(t, 50.0) for t in range(0, 43_200, 300)] + [(t, 0.0) for t in range(43_200, 86_400, 300)]
    duty, cov = radiator_duty(s, 0, 86_400)
    assert duty == pytest.approx(0.25)
    assert cov == pytest.approx(1.0)


def test_duty_is_none_under_half_coverage():
    s = [(t, 100.0) for t in range(0, 40_000, 300)]
    duty, cov = radiator_duty(s, 0, 86_400)
    assert duty is None and cov < 0.5


def test_null_rates_do_not_count_as_zero():
    s = [(t, 100.0 if t % 600 == 0 else None) for t in range(0, 86_400, 300)]
    duty, cov = radiator_duty(s, 0, 86_400)
    assert (duty, cov) == (pytest.approx(1.0), pytest.approx(0.5))


def test_room_duty_is_power_weighted():
    per = {"a": (0.5, 1.0), "b": (0.1, 1.0)}
    assert room_duty(per, {"a": 2000, "b": 1000}) == pytest.approx((0.5 * 2000 + 0.1 * 1000) / 3000)


def test_room_duty_unknown_power_weighs_as_the_mean_of_the_known():
    per = {"a": (0.5, 1.0), "b": (0.1, 1.0), "c": (0.3, 1.0)}
    got = room_duty(per, {"a": 2000, "b": 1000, "c": None})
    assert got == pytest.approx((0.5 * 2000 + 0.1 * 1000 + 0.3 * 1500) / 4500)
    assert room_duty({"a": (0.5, 1.0), "b": (0.1, 1.0)}, {}) == pytest.approx(0.3)


def test_room_duty_is_none_when_any_radiator_is_unknown():
    assert room_duty({"a": (0.5, 1.0), "b": (None, 0.2)}, {"a": 1000, "b": 1000}) is None
    assert room_duty({}, {}) is None
