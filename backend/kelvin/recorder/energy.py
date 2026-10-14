"""Radiator energy from cumulative counter readings (spec §2.1, audit H1/M1/M2). Pure.

A reading is a counter value at the time Kelvin learned it. Overkiz reports a counter only when
it changes (or on a refresh), at irregular and sometimes long intervals, so nothing here assumes
a cadence: energy between two readings is spread over the time between them, weighted by the
radiator's own heating evidence (working rate) when there is enough of it.
"""

from __future__ import annotations

import logging
from collections.abc import Iterable, Iterator
from dataclasses import dataclass

log = logging.getLogger(__name__)

RESET_RATIO = 0.5  # a reading at or below half the previous one is a counter reset...
RESET_MIN_WH = 1000.0  # ...if the previous one was above 1 kWh
POWER_MARGIN = 1.1  # a span may not exceed the nominal power by more than 10 %
MAX_GAP_S = 3 * 3600  # longer spans are flagged "interpolated"


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
