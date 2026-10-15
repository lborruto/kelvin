"""Runs and duty from the 5-min samples (spec QW4, QW5). Pure functions.

A run starts at the first sample reporting 1 and ends at the next sample reporting 0. A null
sample or a gap of more than MAX_GAP_S ends it one step after its last 1 (edges are ±5 min, the
UI says so). A run still going at the window's end ends there and is flagged open.
"""

from __future__ import annotations

from collections.abc import Iterable
from statistics import mean
from typing import Any

STEP = 300
MAX_GAP_S = 900
DUTY_WINDOW_S = 86400
MIN_COVERAGE = 0.5
MAX_SPAN_S = 31 * 86400  # the longest window a route may ask for (about 9 000 rows a radiator)


def runs(
    samples: Iterable[tuple[int, int | None]],
    start: int,
    end: int,
    *,
    step: int = STEP,
    max_gap: int = MAX_GAP_S,
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    cur: int | None = None
    last_one = prev = 0

    def close(at: int, open_: bool = False) -> None:
        nonlocal cur
        a, z = max(cur, start), min(at, end)  # type: ignore[arg-type]
        if z > a:
            out.append({"start": a, "end": z, "open": open_})
        cur = None

    for ts, v in samples:
        if cur is not None and ts - prev > max_gap:
            close(last_one + step)
        if v == 1:
            if cur is None:
                cur = ts
            last_one = ts
        elif cur is not None:
            close(ts if v == 0 else last_one + step)
        prev = ts
    if cur is not None:
        if end - last_one <= max_gap:
            close(end, True)
        else:
            close(last_one + step)
    return out


def union(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    merged: list[dict[str, Any]] = []
    for r in sorted(items, key=lambda r: r["start"]):
        if merged and r["start"] <= merged[-1]["end"]:
            last = merged[-1]
            last["end"] = max(last["end"], r["end"])
            last["open"] = last["open"] or r["open"]
        else:
            merged.append(dict(r))
    return merged


def radiator_duty(
    samples: Iterable[tuple[int, float | None]], start: int, end: int, *, step: int = STEP
) -> tuple[float | None, float]:
    """duty = Σ(rate/100 × Δt) / Σ Δt over the samples present; None below 50 % coverage."""
    present = [min(max(r, 0.0), 100.0) for ts, r in samples if start <= ts < end and r is not None]
    coverage = min(1.0, len(present) * step / (end - start)) if end > start else 0.0
    if coverage < MIN_COVERAGE or not present:
        return None, coverage
    return sum(present) / 100 / len(present), coverage


def room_duty(
    per: dict[str, tuple[float | None, float]], powers: dict[str, int | None]
) -> float | None:
    """Power-weighted mean Σ(duty_r × power_r) / Σ power_r. Unknown power weighs as the mean of
    the known ones (equal weights when none is known). None when any radiator is unknown."""
    if not per or any(d is None for d, _ in per.values()):
        return None
    known = [p for p in (powers.get(rid) for rid in per) if p]
    fallback = mean(known) if known else 1.0
    weights = {rid: (powers.get(rid) or fallback) for rid in per}
    total = sum(weights.values())
    return sum(per[rid][0] * w for rid, w in weights.items()) / total  # type: ignore[operator]
