"""clean_spans (spec §2.1, audit H1): readings of a cumulative counter → measured spans."""

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from kelvin.recorder.energy import (
    CONFIRM_ABOVE_S,
    FALLBACK_POWER_W,
    MAX_GAP_S,
    POWER_MARGIN,
    POWER_SLACK_S,
    Reading,
    Span,
    clean_spans,
)


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


def test_without_a_known_power_the_fallback_ceiling_applies():
    """FALLBACK_POWER_W (5 kW, above any Sauter heater) bounds plausibility, nothing else."""
    assert spans_of([Reading(0, 10_000), Reading(3600, 60_000)], power_w=None) == []
    cap = FALLBACK_POWER_W * POWER_MARGIN * (3600 + POWER_SLACK_S) / 3600
    spans = spans_of([Reading(0, 10_000), Reading(3600, 10_000 + int(cap))], power_w=None)
    assert total(spans) == int(cap)


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
        t += draw(st.integers(1800, 7200))  # ≤ 2 kWh in ≥ 30 min: under the 5 kW ceiling
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


def test_a_first_reference_glitched_up_is_rebased_down_by_the_persisting_level():
    """The first reading is 20 % too high (power known): the real level below it persists, so
    counting goes on from there instead of waiting months for the counter to catch up."""
    readings = [Reading(0, 3_600_000), Reading(1800, 3_000_300), Reading(3600, 3_000_600)]
    readings.append(Reading(5400, 3_000_900))
    spans = spans_of(readings, power_w=1500)
    assert spans == [Span(1800, 3600, 300.0, False), Span(3600, 5400, 300.0, False)]


def test_a_confirmed_reference_still_skips_a_lower_reading_as_a_glitch():
    """Once a span was accepted from it, the reference is the high-water mark (audit H1)."""
    readings = [Reading(0, 1_000_000), Reading(1800, 1_000_300), Reading(3600, 999_000)]
    readings += [Reading(5400, 999_300), Reading(7200, 1_000_600)]
    assert spans_of(readings, power_w=1500) == [
        Span(0, 1800, 300.0, False),
        Span(1800, 7200, 300.0, False),
    ]


def test_an_unknown_power_twenty_percent_glitch_is_neither_counted_nor_blocking():
    readings = [Reading(0, 3_000_000), Reading(1800, 3_600_000), Reading(3600, 3_000_600)]
    assert spans_of(readings) == [Span(0, 3600, 600.0, False)]


def test_an_unknown_power_first_reading_of_zero_is_not_a_lifetime():
    readings = [Reading(0, 0.0), Reading(3600, 3_000_000), Reading(7200, 3_000_300)]
    assert spans_of(readings) == [Span(3600, 7200, 300.0, False)]


def test_after_an_upward_rebase_a_lower_persisting_level_rebases_back():
    """A +20 % offset seen twice is rebased (that is the rule); the real level below it then
    persists, so counting recovers instead of stopping for months."""
    readings = [Reading(0, 3_000_000), Reading(1800, 3_000_300), Reading(3600, 3_600_000)]
    readings += [Reading(5400, 3_600_100), Reading(7200, 3_000_900), Reading(9000, 3_001_200)]
    spans = spans_of(readings, power_w=1500)
    assert spans[-1] == Span(7200, 9000, 300.0, False)


@settings(max_examples=500, deadline=None)
@given(
    st.lists(
        st.tuples(
            st.integers(1, 20_000),
            st.one_of(
                st.none(),
                st.sampled_from([0.0, 1.0, 999.0, 2000.0, 1e7, 1e7 + 1]),
                st.floats(0, 1e7),
            ),
        ),
        max_size=40,
    ),
    st.sampled_from([None, 1000.0, 1500.0]),
)
def test_property_any_readings_give_ordered_disjoint_spans(steps, power_w):
    """Whatever the counter does (resets, spikes, rebases up or down), spans never overlap,
    never go back in time and never hold negative energy."""
    t, readings = 0, []
    for gap, v in steps:
        t += gap
        readings.append(Reading(t, v))
    spans = spans_of(readings, power_w=power_w)
    for s in spans:
        assert s.end > s.start and s.wh >= 0
    for a, b in zip(spans, spans[1:], strict=False):
        assert a.end <= b.start


def test_a_spike_before_a_reset_cannot_rebase_after_it():
    """Found by the window property: a spike rejected before a confirmed reset was later taken
    as a persisting level, and the rebase moved the span start back in time (overlap)."""
    readings = [Reading(0, 2000.0), Reading(10_000, 0.0), Reading(20_000, 1e7)]
    readings += [Reading(90_000, 1.0), Reading(160_000, 0.0), Reading(170_000, 1.0)]
    readings.append(Reading(240_000, 1e7 + 1))
    spans = spans_of(readings, power_w=1500)
    for a, b in zip(spans, spans[1:], strict=False):
        assert a.end <= b.start


def test_a_pending_jump_is_not_counted_when_the_next_reading_comes_late():
    """Re-review round 3, repro A: a first reading of 0, the real level, then the counter is
    flat for 42 h. By then the whole jump is within the cap from the 0 through elapsed time
    alone, but it is still a rebase: only the 100 Wh after the level counts."""
    readings = [Reading(0, 0.0), Reading(3600, 60_000.0), Reading(153_600, 60_100.0)]
    assert spans_of(readings, power_w=1500) == [Span(3600, 153_600, 100.0, True)]


def test_a_new_level_after_a_confirmed_reference_is_not_counted_when_the_next_reading_is_late():
    """Repro B: a confirmed reference, then a meter replaced at +60 kWh, then +100 Wh 42 h
    later: the new level is never consumption, however late the reading that confirms it."""
    readings = [Reading(0, 1000.0), Reading(1800, 1100.0), Reading(3600, 61_100.0)]
    readings.append(Reading(153_600, 61_200.0))
    assert spans_of(readings, power_w=1500) == [
        Span(0, 1800, 100.0, False),
        Span(3600, 153_600, 100.0, True),
    ]


def test_legacy_repeats_of_a_pending_jump_are_no_news_however_late():
    """Fuzz seed 224: legacy hourly rows repeat the jump's value. Once enough time passed, a
    repeat was within the cap from the old reference and the jump became a 60 kWh span."""
    readings = [Reading(0, 0.0)] + [Reading(3600 * k, 60_000.0) for k in range(1, 60)]
    readings.append(Reading(3600 * 60, 60_100.0))
    assert spans_of(readings, power_w=1500) == [Span(3600, 3600 * 60, 100.0, True)]


def test_a_reading_below_a_pending_spike_still_counts_from_the_reference():
    """A transient spike is never adopted: the next reading below it counts from the last good
    reference, as before the pending-jump rule."""
    readings = [Reading(0, 3_000_000), Reading(1800, 3_000_300), Reading(3600, 3_600_000)]
    readings.append(Reading(5400, 3_000_900))
    assert spans_of(readings, power_w=1500) == [
        Span(0, 1800, 300.0, False),
        Span(1800, 5400, 600.0, False),
    ]


DAY = 86400


def test_an_upward_glitch_after_a_quiet_stretch_is_not_counted():
    """Batch-2 re-review: 1 500 W, a 3 MWh counter idle for 3 days, then one reading 2 % too
    high. The cap over 3 days would allow its 60 kWh, but the readings after it fall back to
    the real level: it was a glitch. Neither is the next 100 h of real heating lost."""
    readings = [Reading(0, 3_000_000.0), Reading(3 * DAY, 3_060_000.0)]
    readings += [Reading(3 * DAY + 1800 * k, 3_000_000.0 + 300 * k) for k in range(1, 201)]
    spans = spans_of(readings, power_w=1500)
    assert total(spans) == pytest.approx(200 * 300)
    assert spans[0] == Span(0, 3 * DAY + 1800, 300.0, True)  # nothing invented in the idle days
    assert all(s.wh <= 300 for s in spans)


def test_a_large_increase_after_a_long_gap_waits_for_the_next_reading():
    """20 kWh after 3 days is plausible (a recorder down while it heated) but more than the
    radiator draws in CONFIRM_ABOVE_S: it stays pending (unknown, never 0) until the next
    reading moves on from it plausibly, then it counts whole."""
    readings = [Reading(0, 3_000_000.0), Reading(3 * DAY, 3_020_000.0)]
    assert spans_of(readings, power_w=1500) == []
    readings.append(Reading(3 * DAY + 1800, 3_020_300.0))
    assert spans_of(readings, power_w=1500) == [
        Span(0, 3 * DAY, 20_000.0, True),
        Span(3 * DAY, 3 * DAY + 1800, 300.0, False),
    ]


def test_a_repeat_of_a_pending_increase_does_not_confirm_it():
    readings = [Reading(0, 3_000_000.0)]
    readings += [Reading(3 * DAY + 3600 * k, 3_020_000.0) for k in range(5)]
    assert spans_of(readings, power_w=1500) == []


def test_an_increase_within_confirm_above_s_of_full_power_counts_at_once():
    cap = 1500 * POWER_MARGIN * (CONFIRM_ABOVE_S + POWER_SLACK_S) / 3600
    readings = [Reading(0, 3_000_000.0), Reading(3 * DAY, 3_000_000.0 + int(cap))]
    assert spans_of(readings, power_w=1500) == [Span(0, 3 * DAY, int(cap), True)]
