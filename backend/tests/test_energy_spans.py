"""clean_spans (spec §2.1, audit H1): readings of a cumulative counter → measured spans."""

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from kelvin.recorder.energy import MAX_GAP_S, Reading, Span, clean_spans


def spans_of(readings, **kw) -> list[Span]:
    return list(clean_spans(readings, **kw))


def total(spans: list[Span]) -> float:
    return sum(s.wh for s in spans)


def test_h1_a_one_wh_blip_down_is_not_a_lifetime_of_consumption():
    """Audit H1 case F: 1 500 000 → 1 499 999 → 1 501 000 Wh is about 1 kWh, not 1 501 kWh."""
    spans = spans_of([Reading(0, 1_500_000), Reading(3600, 1_499_999), Reading(7200, 1_501_000)])
    assert total(spans) == pytest.approx(1000.0)
    assert spans == [Span(0, 7200, 1000.0, False)]  # the glitch did not cut the span


def test_h1_a_missing_value_is_skipped_not_zero():
    """Audit H1 case E: a counter absent for one reading never adds the whole counter."""
    spans = spans_of([Reading(0, 900_000), Reading(3600, None), Reading(7200, 901_000)])
    assert total(spans) == pytest.approx(1000.0)


def test_a_true_reset_counts_the_value_after_the_reset():
    spans = spans_of([Reading(0, 1_500_000), Reading(3600, 100), Reading(7200, 300)])
    assert [s.wh for s in spans] == [100, 200]


def test_a_small_counter_dropping_is_a_glitch_not_a_reset():
    """Below RESET_MIN_WH a drop is never a reset: a new radiator's counter re-reported."""
    spans = spans_of([Reading(0, 800), Reading(600, 300), Reading(1200, 900)])
    assert total(spans) == pytest.approx(100.0)


def test_repeated_values_do_not_cut_a_span():
    """Overkiz reports a counter on change; a re-reported or heartbeat value is no news, so the
    energy of the whole gap stays one span to spread (never piled on the last hour)."""
    spans = spans_of(
        [Reading(0, 10_000), Reading(3600, 10_000), Reading(7200, 10_000), Reading(10800, 13_000)]
    )
    assert spans == [Span(0, 10800, 3000.0, False)]


def test_spans_longer_than_three_hours_are_flagged_interpolated():
    spans = spans_of([Reading(0, 0.0), Reading(MAX_GAP_S, 10.0), Reading(2 * MAX_GAP_S + 1, 20)])
    assert [s.interpolated for s in spans] == [False, True]


def test_the_power_cap_rejects_an_implausible_jump_and_keeps_the_time_unknown():
    """1 kW for 1 h can draw at most 1.1 kWh; a jump of 50 kWh leaves no span for that hour."""
    spans = spans_of(
        [Reading(0, 10_000), Reading(3600, 60_000), Reading(7200, 60_800)], power_w=1000
    )
    assert spans == [Span(3600, 7200, 800.0, False)]


def test_without_a_known_power_there_is_no_cap():
    spans = spans_of([Reading(0, 10_000), Reading(3600, 60_000)], power_w=None)
    assert total(spans) == 50_000


def test_a_reading_not_newer_than_the_reference_is_skipped():
    spans = spans_of([Reading(0, 1000), Reading(0, 1100), Reading(3600, 1200)])
    assert spans == [Span(0, 3600, 200.0, False)]


@st.composite
def blipped_series(draw):
    """A monotone counter over ≤ 60 readings, with injected −1 Wh blips, absent values and
    re-reported older values. Values stay above half the running maximum (no reset)."""
    first = draw(st.integers(1_000_000, 10_000_000))
    steps = draw(st.lists(st.integers(0, 2000), min_size=1, max_size=60))
    truth = [first]
    for s in steps:
        truth.append(truth[-1] + s)
    readings: list[Reading] = []
    t = 0
    for i, v in enumerate(truth):
        t += draw(st.integers(1, 7200))
        readings.append(Reading(t, v))
        if i and i < len(truth) - 1:
            kind = draw(st.sampled_from(["none", "minus1", "older", "absent", "dup"]))
            t += draw(st.integers(1, 600))
            if kind == "minus1":
                readings.append(Reading(t, v - 1))
            elif kind == "older":
                readings.append(Reading(t, truth[draw(st.integers(0, i))]))
            elif kind == "absent":
                readings.append(Reading(t, None))
            elif kind == "dup":
                readings.append(Reading(t, v))
    return truth, readings


@settings(max_examples=300, deadline=None)
@given(blipped_series())
def test_property_blips_never_change_the_sum(series):
    truth, readings = series
    spans = spans_of(readings)
    assert total(spans) == pytest.approx(truth[-1] - truth[0])
    for a, b in zip(spans, spans[1:], strict=False):
        assert a.end <= b.start  # spans never overlap
