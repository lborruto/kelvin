"""apportion, RateIndex and local_edges (spec §2.1, audit M1/M2)."""

from datetime import date, datetime
from zoneinfo import ZoneInfo

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from kelvin.recorder.energy import (
    RateIndex,
    Reading,
    Span,
    apportion,
    clean_spans,
    local_edges,
)

PARIS = ZoneInfo("Europe/Paris")


def ts(y, mo, d, h=0, mi=0) -> int:
    return int(datetime(y, mo, d, h, mi, tzinfo=PARIS).timestamp())


def test_m1_a_30_hour_gap_is_spread_over_both_days():
    """Audit M1 case D: 1 kWh/h with no reading from Oct 4 12:00 to Oct 5 18:00 gives
    24.0 / 24.0 kWh, not 12 / 36; the days the gap touched are flagged interpolated."""
    readings = []
    t, wh = ts(2026, 10, 1, 0, 20), 0.0
    while t < ts(2026, 10, 10):
        if not ts(2026, 10, 4, 12) <= t < ts(2026, 10, 5, 18):
            readings.append(Reading(t, wh))
        t += 3600
        wh += 1000
    edges = local_edges(date(2026, 10, 2), date(2026, 10, 9), "day", PARIS)
    days = apportion(clean_spans(readings), edges)
    assert [round(b.wh / 1000, 3) for b in days] == [24.0] * 7
    assert [b.interpolated for b in days] == [False, False, True, True, False, False, False]


def test_m2_clock_hours_hold_their_own_energy_whatever_the_reading_minute():
    """Readings at hh:05 put 10:00–11:00 energy under 10:00, not under 11:00."""
    # 1 kWh from 09:05 to 10:05, then 2 kWh from 10:05 to 11:05.
    readings = [Reading(ts(2026, 10, 13, 9, 5), 0), Reading(ts(2026, 10, 13, 10, 5), 1000)]
    readings.append(Reading(ts(2026, 10, 13, 11, 5), 3000))
    edges = [ts(2026, 10, 13, h) for h in (9, 10, 11, 12)]
    b = apportion(clean_spans(readings), edges)
    assert b[1].wh == pytest.approx(1000 / 12 + 2000 * 55 / 60)  # 10:00–10:05 + 10:05–11:00
    assert b[1].apportioned is True
    assert b[0].wh == pytest.approx(1000 * 55 / 60)
    assert b[0].covered_s == 55 * 60  # partial: the first reading came at 09:05


def test_buckets_no_span_reaches_are_unknown_not_zero():
    spans = [Span(ts(2026, 10, 13, 10), ts(2026, 10, 13, 11), 500.0, False)]
    edges = [ts(2026, 10, 13, h) for h in (8, 9, 10, 11)]
    b = apportion(spans, edges)
    assert [x.wh for x in b] == [None, None, 500.0]
    assert b[2].apportioned is False  # the span sits exactly in the bucket


def test_a_zero_energy_span_flags_nothing():
    spans = [Span(0, 4 * 3600, 0.0, True)]
    b = apportion(spans, [0, 3600, 7200])
    assert [(x.wh, x.interpolated, x.apportioned) for x in b] == [(0.0, False, False)] * 2


def test_working_rate_weights_put_the_energy_where_the_radiator_heated():
    """A 10 h gap: the radiator heated (working rate 100) only in the last hour."""
    a = ts(2026, 10, 13, 0)
    samples = [(a + i * 300, 100.0 if i >= 108 else 0.0) for i in range(120)]
    spans = [Span(a, a + 10 * 3600, 1000.0, True)]
    edges = [a + h * 3600 for h in range(11)]
    b = apportion(spans, edges, RateIndex(samples))
    assert [round(x.wh, 6) for x in b] == [0.0] * 9 + [1000.0]


def test_weights_need_80_percent_of_the_span_otherwise_time_is_used():
    a = ts(2026, 10, 13, 0)
    samples = [(a + i * 300, 100.0) for i in range(12)]  # only the first hour of four
    spans = [Span(a, a + 4 * 3600, 400.0, True)]
    b = apportion(spans, [a + h * 3600 for h in range(5)], RateIndex(samples))
    assert [x.wh for x in b] == pytest.approx([100.0] * 4)


def test_weights_all_zero_fall_back_to_time():
    samples = [(i * 300, 0.0) for i in range(24)]
    b = apportion([Span(0, 7200, 200.0, False)], [0, 3600, 7200], RateIndex(samples))
    assert [x.wh for x in b] == pytest.approx([100.0, 100.0])


def test_rate_index_integral_and_coverage():
    idx = RateIndex([(0, 50.0), (300, None), (600, 100.0), (2000, 20.0)])
    # [0,300) at 0.5, [600,900) at 1.0, [2000,2300) at 0.2; 300–600 and 900–2000 have no evidence
    assert idx(0, 2300) == (pytest.approx(150 + 300 + 60), 900)
    assert idx(150, 750) == (pytest.approx(75 + 150), 300)
    assert idx(-100, 0) == (0.0, 0)


@pytest.mark.parametrize(
    ("day", "n"), [(date(2026, 3, 29), 46), (date(2026, 10, 25), 50), (date(2026, 10, 14), 48)]
)
def test_half_hour_edges_on_dst_days(day, n):
    edges = local_edges(day, date.fromordinal(day.toordinal() + 1), "halfhour", PARIS)
    assert len(edges) - 1 == n


def test_week_month_year_edges_start_at_local_midnight():
    weeks = local_edges(date(2026, 10, 14), date(2026, 10, 27), "week", PARIS)
    assert [datetime.fromtimestamp(e, PARIS).date().isoformat() for e in weeks] == [
        "2026-10-12",
        "2026-10-19",
        "2026-10-26",
        "2026-11-02",
    ]
    assert weeks[2] - weeks[1] == 7 * 86400 + 3600  # the DST week has 169 h
    months = local_edges(date(2026, 1, 1), date(2027, 1, 1), "month", PARIS)
    assert len(months) == 13
    assert local_edges(date(2026, 5, 2), date(2026, 5, 3), "year", PARIS) == [
        ts(2026, 1, 1),
        ts(2027, 1, 1),
    ]


@st.composite
def spans_inside(draw):
    edges = sorted(set(draw(st.lists(st.integers(0, 100_000), min_size=2, max_size=30))))
    spans = []
    t = edges[0]
    while True:
        length = draw(st.integers(1, 20_000))
        if t + length > edges[-1]:
            break
        spans.append(Span(t, t + length, draw(st.floats(0, 5000)), length > 10_800))
        t += length + draw(st.integers(0, 5000))
    samples = [(s, draw(st.one_of(st.none(), st.floats(0, 100)))) for s in range(0, 100_000, 300)]
    return edges, spans, samples


@settings(max_examples=200, deadline=None)
@given(spans_inside(), st.booleans())
def test_property_apportion_conserves_energy(case, weighted):
    edges, spans, samples = case
    b = apportion(spans, edges, RateIndex(samples) if weighted else None)
    assert sum(x.wh or 0.0 for x in b) == pytest.approx(sum(s.wh for s in spans), abs=1e-6)
