"""Radiator energy from cumulative counter readings (spec §2.1, audit H1/M1/M2). Pure.

A reading is a counter value at the time Kelvin learned it. Overkiz reports a counter only when
it changes (or on a refresh), at irregular and sometimes long intervals, so nothing here assumes
a cadence: energy between two readings is spread over the time between them, weighted by the
radiator's own heating evidence (working rate) when there is enough of it.
"""

from __future__ import annotations

import logging
from bisect import bisect_left, bisect_right
from collections.abc import Callable, Iterable, Iterator
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from datetime import time as dtime
from itertools import accumulate
from typing import Literal, NamedTuple
from zoneinfo import ZoneInfo

log = logging.getLogger(__name__)

RESET_RATIO = 0.5  # a reading at or below half the previous one is a counter reset...
RESET_MIN_WH = 1000.0  # ...if the previous one was above 1 kWh
POWER_MARGIN = 1.1  # a span may not exceed the nominal power by more than 10 %
POWER_SLACK_S = 60  # ...over its length plus a minute (a reading learned late)
# Plausibility ceiling when a radiator's power is unknown (one no longer in the house): above
# any Sauter heater. It only bounds what a span may hold; it never weighs the spreading.
FALLBACK_POWER_W = 5000.0
MAX_GAP_S = 3 * 3600  # longer spans are flagged "interpolated"

MIN_WEIGHT_COVERAGE = 0.8  # working-rate weights need samples over 80 % of the span
SAMPLE_STEP_S = 300  # a 5-min sample stands for at most the next 5 minutes

Unit = Literal["halfhour", "hour", "day", "week", "month", "year"]
# (integral of working_rate/100 dt over [a, b), seconds of [a, b) that have a sample)
WeightFn = Callable[[int, int], tuple[float, int]]


class Reading(NamedTuple):
    """A tuple, so the recorder can stream plain (ts, value) rows through `clean_spans`."""

    ts: int
    value: float | None  # None: the counter state was absent; not a reading


class Span(NamedTuple):
    """Energy measured over [start, end)."""

    start: int
    end: int
    wh: float
    interpolated: bool  # longer than MAX_GAP_S


@dataclass(frozen=True)
class Bucket:
    wh: float | None  # None: no span overlaps the bucket (unknown, never 0)
    covered_s: int  # seconds of the bucket inside some span
    interpolated: bool  # a span longer than MAX_GAP_S with energy fed it
    apportioned: bool  # a span with energy that started before or ended after it fed it


def clean_spans(
    readings: Iterable[Reading] | Iterable[tuple[int, float | None]],
    *,
    power_w: float | None = None,
    reset_ratio: float = RESET_RATIO,
    reset_min_wh: float = RESET_MIN_WH,
    max_gap_s: int = MAX_GAP_S,
    stop_at: int | None = None,
) -> Iterator[Span]:
    """Consecutive good readings of one counter, in time order → spans of measured energy.

    A generator over a generator: the recorder streams the rows page by page, so memory does
    not grow with the window.

    - A reading not newer than the reference is skipped (duplicate or out of order).
    - None is not a reading: skipped, the previous good value stays the reference.
    - A value equal to the reference is no news (a heartbeat or a re-reported state): skipped,
      so the span runs on until the counter actually moves.
    - d = value − reference. d > 0 is consumption.
    - d < 0 with value ≤ reset_ratio × reference and reference > reset_min_wh is a reset
      candidate. It is confirmed only when the next reading with another value stays below
      reset_ratio × the pre-reset reference; then the consumption up to the candidate is its
      value and the candidate becomes the reference. Otherwise it was a transient drop (a 0, a
      value read in the wrong unit) and is skipped like a glitch.
    - Any other d < 0 is a glitch (out-of-order or stale value): skipped, the reference stays the
      high-water mark.
    - Consumption above power_w × (Δt + POWER_SLACK_S) × POWER_MARGIN is implausible (a spike):
      no span is emitted and the reference stays, so the next real reading counts from the last
      good one. The slack absorbs a reading learned a little late.
    - A spike becomes the new reference only when the counter moves on from it: the next reading
      above it is plausible relative to it (a replaced meter, or a glitched reference such as a
      first reading of 0). That jump is a rebase, never consumption; its time stays unknown.

    With `stop_at`, the generator ends after the first span that reaches it (end >= stop_at).
    """
    ref: float | None = None
    t0 = 0
    confirmed = False  # a span was accepted from the reference (it is no glitch)
    cand: tuple[int, float] | None = None  # an unconfirmed reset: (ts, value)
    jump: tuple[int, float] | None = None  # a rejected spike that may be a new level
    low: tuple[int, float] | None = None  # a reading below an unconfirmed reference
    cap = (power_w or FALLBACK_POWER_W) * POWER_MARGIN / 3600  # Wh per second
    span = tuple.__new__  # Span(...) without the NamedTuple constructor's call overhead
    for ts, c in readings:
        if c is None:
            continue
        if ref is None:
            ref, t0 = c, ts
            continue
        if cand is not None:
            if ts <= cand[0] or c == cand[1]:
                continue
            if c < reset_ratio * ref:  # the counter stayed low: a true reset
                ts_c, v_c = cand
                if v_c <= cap * (ts_c - t0 + POWER_SLACK_S):
                    yield span(Span, (t0, ts_c, v_c, ts_c - t0 > max_gap_s))
                    if stop_at is not None and ts_c >= stop_at:
                        return
                ref, t0 = v_c, ts_c  # the new counter is the reference either way
                confirmed, jump, low = False, None, None
            else:
                log.info("energy counter drop skipped: it recovered at the next reading")
            cand = None
        if ts <= t0 or c == ref:
            continue
        d = c - ref
        if d > 0:
            dt = ts - t0
            rebased = False
            if d > cap * (dt + POWER_SLACK_S):
                if jump is None or c < jump[1]:
                    jump = (ts, c)
                    log.warning("energy spike skipped: %.0f Wh in %d s exceeds the power", d, dt)
                    continue
                if c == jump[1]:
                    continue  # a repeat is no news: the jump is not confirmed yet
                if c - jump[1] > cap * (ts - jump[0] + POWER_SLACK_S):
                    jump = (ts, c)  # implausible from the jump too: this is the candidate now
                    continue
                log.info("energy counter rebased: a new level persisted")
                ref, t0, rebased = jump[1], jump[0], True
                d, dt = c - ref, ts - t0
            jump = low = None
            yield span(Span, (t0, ts, d, dt > max_gap_s))
            if stop_at is not None and ts >= stop_at:
                return
            ref, t0, confirmed = c, ts, not rebased
        elif c <= reset_ratio * ref and ref > reset_min_wh:
            cand = (ts, c)
        elif not confirmed:
            # Readings below a reference no span confirmed: it may be the glitch. A lower level
            # that persists (the next reading moves on from it plausibly) becomes the reference.
            if low is not None and c > low[1] and c - low[1] <= cap * (ts - low[0] + POWER_SLACK_S):
                log.info("energy counter rebased: a lower level persisted")
                jump = None
                yield span(Span, (low[0], ts, c - low[1], ts - low[0] > max_gap_s))
                if stop_at is not None and ts >= stop_at:
                    return
                ref, t0, confirmed, low = c, ts, True, None
            elif low is None or c != low[1]:
                low = (ts, c)
        else:
            log.info("energy counter glitch skipped (%.0f Wh below the reference)", -d)


class RateIndex:
    """Working-rate evidence from 5-min samples, as a step function.

    A sample at ts with rate p holds over [ts, min(next sample, ts + SAMPLE_STEP_S)); a sample
    whose rate is None gives no evidence. The rate is clamped to [0, 100].
    """

    def __init__(self, samples: Iterable[tuple[int, float | None]], step: int = SAMPLE_STEP_S):
        rows = sorted((ts, p) for ts, p in samples if p is not None)
        self.starts: list[int] = []
        self.ends: list[int] = []
        self.rates: list[float] = []
        for i, (ts, p) in enumerate(rows):
            end = ts + step
            if i + 1 < len(rows):
                end = min(end, rows[i + 1][0])
            if end > ts:
                self.starts.append(ts)
                self.ends.append(end)
                self.rates.append(min(100.0, max(0.0, float(p))) / 100.0)
        lengths = [e - s for s, e in zip(self.starts, self.ends, strict=True)]
        self._cum_w = [0.0, *accumulate(r * n for r, n in zip(self.rates, lengths, strict=True))]
        self._cum_c = [0, *accumulate(lengths)]

    def _upto(self, x: int) -> tuple[float, int]:
        k = bisect_right(self.starts, x) - 1
        if k < 0:
            return 0.0, 0
        inside = min(max(x - self.starts[k], 0), self.ends[k] - self.starts[k])
        return self._cum_w[k] + self.rates[k] * inside, self._cum_c[k] + inside

    def __call__(self, a: int, b: int) -> tuple[float, int]:
        wa, ca = self._upto(a)
        wb, cb = self._upto(b)
        return wb - wa, cb - ca

    def peak(self, a: int, b: int) -> float:
        """The highest rate (0–1) with evidence inside [a, b); 0.0 when there is none."""
        k = max(bisect_right(self.starts, a) - 1, 0)
        top = 0.0
        while k < len(self.starts) and self.starts[k] < b:
            if self.ends[k] > a and self.rates[k] > top:
                top = self.rates[k]
            k += 1
        return top


def apportion(
    spans: Iterable[Span],
    edges: list[int],
    weights: WeightFn | None = None,
    *,
    power_w: float | None = None,
    clip: tuple[int, int] | None = None,
) -> list[Bucket]:
    """Energy per bucket [edges[i], edges[i+1]); `spans` may be a stream (memory O(buckets)).

    Each span is spread over the buckets it overlaps: by working-rate weight when `weights`
    covers at least MIN_WEIGHT_COVERAGE of the span, its integral is positive and (with a known
    `power_w` and a `RateIndex`) the weighted power never exceeds the radiator's power; by time
    otherwise. With `clip=(lo, hi)` only the part of each span inside [lo, hi) is counted (the
    flags still describe the whole span against the whole bucket). Σ bucket wh equals Σ of the
    span energy inside the edges and the clip (tested).
    """
    n = len(edges) - 1
    if n <= 0:
        return []
    wh = [0.0] * n
    covered = [0] * n
    interp = [False] * n
    appor = [False] * n
    lo_clip, hi_clip = clip if clip is not None else (edges[0], edges[-1])
    lo_clip, hi_clip = max(lo_clip, edges[0]), min(hi_clip, edges[-1])
    k = 0  # bucket of the previous span's start: spans usually come in time order
    for s in spans:
        if s.end <= lo_clip or s.start >= hi_clip or s.end <= s.start:
            continue
        if edges[k] <= s.start:
            while k + 1 < n and edges[k + 1] <= s.start:
                k += 1
            first = k
        else:
            first = k = max(bisect_right(edges, s.start) - 1, 0)
        if s.end <= edges[first + 1] and lo_clip <= s.start and s.end <= hi_clip:
            # Inside one bucket and the clip: all of it lands there, whatever the weights.
            wh[first] += s.wh
            covered[first] += s.end - s.start
            if s.wh > 0:
                interp[first] |= s.interpolated
            continue
        last = min(bisect_left(edges, s.end), n)
        length = s.end - s.start
        total = 0.0
        use_weights = False
        if weights is not None:
            total, cov = weights(s.start, s.end)
            use_weights = cov >= MIN_WEIGHT_COVERAGE * length and total > 0
            if use_weights and power_w and isinstance(weights, RateIndex):
                peak_w = s.wh * 3600 * weights.peak(s.start, s.end) / total
                use_weights = peak_w <= power_w * POWER_MARGIN
        for i in range(first, last):
            lo = max(s.start, edges[i], lo_clip)
            hi = min(s.end, edges[i + 1], hi_clip)
            if hi <= lo:
                continue
            frac = (weights(lo, hi)[0] / total) if use_weights else (hi - lo) / length
            wh[i] += s.wh * frac
            covered[i] += hi - lo
            if s.wh > 0:
                interp[i] |= s.interpolated
                appor[i] |= s.start < edges[i] or s.end > edges[i + 1]
    return [
        Bucket(wh[i] if covered[i] else None, covered[i], interp[i], appor[i]) for i in range(n)
    ]


def unit_start(day: date, unit: Unit) -> date:
    if unit == "week":
        return day - timedelta(days=day.weekday())
    if unit == "month":
        return day.replace(day=1)
    if unit == "year":
        return date(day.year, 1, 1)
    return day


def next_unit_start(start: date, unit: Unit) -> date:
    if unit == "week":
        return start + timedelta(days=7)
    if unit == "month":
        return date(start.year + start.month // 12, start.month % 12 + 1, 1)
    if unit == "year":
        return date(start.year + 1, 1, 1)
    return start + timedelta(days=1)


def _midnight(day: date, tz: ZoneInfo) -> int:
    return int(datetime.combine(day, dtime(0), tzinfo=tz).timestamp())


def local_edges(start: date, end: date, unit: Unit, tz: ZoneInfo) -> list[int]:
    """Epoch edges of the local units covering [start, end) (whole local days).

    Half-hours and hours are every 1800/3600 s from local midnight: Europe/Paris offsets are
    whole hours, so a DST day has 46 or 50 half-hours. Days, ISO weeks (Monday), months and
    years start at local midnight.
    """
    a, b = _midnight(start, tz), _midnight(end, tz)
    if unit in ("halfhour", "hour"):
        step = 1800 if unit == "halfhour" else 3600
        return list(range(a, b + 1, step)) if b > a else [a]
    out = []
    d = unit_start(start, unit)
    while d < end:
        out.append(_midnight(d, tz))
        d = next_unit_start(d, unit)
    out.append(_midnight(d, tz))
    return out
