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
from typing import Literal
from zoneinfo import ZoneInfo

log = logging.getLogger(__name__)

RESET_RATIO = 0.5  # a reading at or below half the previous one is a counter reset...
RESET_MIN_WH = 1000.0  # ...if the previous one was above 1 kWh
POWER_MARGIN = 1.1  # a span may not exceed the nominal power by more than 10 %
MAX_GAP_S = 3 * 3600  # longer spans are flagged "interpolated"

MIN_WEIGHT_COVERAGE = 0.8  # working-rate weights need samples over 80 % of the span
SAMPLE_STEP_S = 300  # a 5-min sample stands for at most the next 5 minutes

Unit = Literal["halfhour", "hour", "day", "week", "month", "year"]
# (integral of working_rate/100 dt over [a, b), seconds of [a, b) that have a sample)
WeightFn = Callable[[int, int], tuple[float, int]]


@dataclass(frozen=True)
class Reading:
    ts: int
    value: float | None  # None: the counter state was absent; not a reading


@dataclass(frozen=True)
class Span:
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
    readings: Iterable[Reading],
    *,
    power_w: float | None = None,
    reset_ratio: float = RESET_RATIO,
    reset_min_wh: float = RESET_MIN_WH,
    max_gap_s: int = MAX_GAP_S,
) -> Iterator[Span]:
    """Consecutive good readings of one counter, in time order → spans of measured energy.

    A generator over a generator: the recorder streams the rows page by page, so memory does
    not grow with the window.

    - A reading not newer than the reference is skipped (duplicate or out of order).
    - None is not a reading: skipped, the previous good value stays the reference.
    - A value equal to the reference is no news (a heartbeat or a re-reported state): skipped,
      so the span runs on until the counter actually moves.
    - d = value − reference. d > 0 is consumption.
    - d < 0 with value ≤ reset_ratio × reference and reference > reset_min_wh: a reset; the
      consumption is the new value.
    - Any other d < 0 is a glitch (out-of-order or stale value): skipped, the reference stays the
      high-water mark.
    - Consumption above power_w × Δt × POWER_MARGIN is implausible: no span is emitted (the time
      stays unknown) and the new value becomes the reference.
    """
    ref: float | None = None
    t0 = 0
    for r in readings:
        c = r.value
        if c is None:
            continue
        if ref is None:
            ref, t0 = c, r.ts
            continue
        if r.ts <= t0 or c == ref:
            continue
        d = c - ref
        if d > 0:
            wh = d
        elif c <= reset_ratio * ref and ref > reset_min_wh:
            wh = c
        else:
            log.info("energy counter glitch skipped (%.0f Wh below the reference)", -d)
            continue
        dt = r.ts - t0
        if power_w and wh > power_w * dt / 3600 * POWER_MARGIN:
            log.warning("energy span rejected: %.0f Wh in %d s exceeds the radiator power", wh, dt)
        else:
            yield Span(t0, r.ts, wh, dt > max_gap_s)
        ref, t0 = c, r.ts


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


def apportion(
    spans: Iterable[Span], edges: list[int], weights: WeightFn | None = None
) -> list[Bucket]:
    """Energy per bucket [edges[i], edges[i+1]); `spans` may be a stream (memory O(buckets)).

    Each span is spread over the buckets it overlaps: by working-rate weight when `weights`
    covers at least MIN_WEIGHT_COVERAGE of the span and its integral is positive, otherwise by
    time. Σ bucket wh equals Σ of the span energy inside the edges (tested).
    """
    n = len(edges) - 1
    wh = [0.0] * n
    covered = [0] * n
    interp = [False] * n
    appor = [False] * n
    if n <= 0:
        return []
    for s in spans:
        if s.end <= edges[0] or s.start >= edges[-1] or s.end <= s.start:
            continue
        length = s.end - s.start
        total = 0.0
        use_weights = False
        if weights is not None:
            total, cov = weights(s.start, s.end)
            use_weights = cov >= MIN_WEIGHT_COVERAGE * length and total > 0
        first = max(bisect_right(edges, s.start) - 1, 0)
        last = min(bisect_left(edges, s.end), n)
        for i in range(first, last):
            lo, hi = max(s.start, edges[i]), min(s.end, edges[i + 1])
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
