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


def test_the_power_cap_rejects_a_spike_and_keeps_the_reference():
    """1 kW for 1 h can draw at most 1.1 kWh: a jump of 50 kWh is a spike, never adopted, so the
    real readings after it still count from the last good value."""
    spans = spans_of(
        [Reading(0, 10_000), Reading(3600, 60_000), Reading(7200, 10_900), Reading(10800, 11_500)],
        power_w=1000,
    )
    assert spans == [Span(0, 7200, 900.0, False), Span(7200, 10800, 600.0, False)]


def test_the_power_cap_allows_a_minute_of_delivery_jitter():
    """A reading learned a little late: 1 kW × (1 h + 60 s) × 1.1 is about 1118 Wh."""
    spans = spans_of([Reading(0, 10_000), Reading(3600, 11_110)], power_w=1000)
    assert spans == [Span(0, 3600, 1110.0, False)]
    assert spans_of([Reading(0, 10_000), Reading(3600, 11_130)], power_w=1000) == []


def test_a_transient_drop_to_zero_that_recovers_is_a_glitch_not_a_reset():
    """Without a known power: 1 500 000 → 0 → 1 500 100 Wh is 100 Wh, not a lifetime."""
    spans = spans_of([Reading(0, 1_500_000), Reading(3600, 0), Reading(7200, 1_500_100)])
    assert spans == [Span(0, 7200, 100.0, False)]


def test_a_unit_glitch_that_recovers_is_a_glitch_not_a_reset():
    """The counter read once in kWh (1500) instead of Wh: still 100 Wh."""
    spans = spans_of([Reading(0, 1_500_000), Reading(3600, 1500), Reading(7200, 1_500_100)])
    assert total(spans) == pytest.approx(100.0)


def test_a_reset_is_confirmed_by_the_next_different_reading_only():
    """A repeated post-reset value is no news; the reset waits for a reading that moves."""
    readings = [Reading(0, 1_500_000), Reading(3600, 100), Reading(5400, 100)]
    assert spans_of(readings) == []  # not confirmed yet: the time stays unknown
    readings.append(Reading(7200, 300))
    assert spans_of(readings) == [Span(0, 3600, 100.0, False), Span(3600, 7200, 200.0, False)]


def test_without_a_known_power_there_is_no_cap():
    spans = spans_of([Reading(0, 10_000), Reading(3600, 60_000)], power_w=None)
    assert total(spans) == 50_000


def test_a_reading_not_newer_than_the_reference_is_skipped():
    spans = spans_of([Reading(0, 1000), Reading(0, 1100), Reading(3600, 1200)])
    assert spans == [Span(0, 3600, 200.0, False)]


@st.composite
def blipped_series(draw):
    """A monotone counter over ≤ 60 readings, with injected −1 Wh blips, absent values,
    re-reported older values and transient drops to 0 that recover at the next reading. No true
    reset: every other value stays above half the running maximum."""
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
            kind = draw(st.sampled_from(["none", "minus1", "older", "absent", "dup", "zero"]))
            t += draw(st.integers(1, 600))
            if kind == "minus1":
                readings.append(Reading(t, v - 1))
            elif kind == "older":
                readings.append(Reading(t, truth[draw(st.integers(0, i))]))
            elif kind == "absent":
                readings.append(Reading(t, None))
            elif kind == "zero":  # a transient drop that recovers at the next reading
                readings.append(Reading(t, 0))
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


def test_a_new_level_that_persists_is_a_rebase_never_consumption():
    """A meter replaced by one with a higher count (power known): the jump is not counted, and
    once the next reading confirms the new level, counting goes on from there."""
    readings = [Reading(0, 10_000), Reading(3600, 1_510_000), Reading(5400, 1_510_000)]
    assert spans_of(readings, power_w=1000) == []  # a repeat does not confirm the jump
    readings.append(Reading(7200, 1_510_500))
    assert spans_of(readings, power_w=1000) == [Span(3600, 7200, 500.0, False)]


def test_a_glitched_first_reference_is_rebased_by_the_persisting_level():
    """The first reading is a 0 (power known): the real level that follows is adopted, not
    counted, and not blocked for ever either."""
    readings = [Reading(0, 0.0), Reading(3600, 3_000_000), Reading(7200, 3_000_300)]
    assert spans_of(readings, power_w=1500) == [Span(3600, 7200, 300.0, False)]
