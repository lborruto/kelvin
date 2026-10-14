"""Power figures from the load curve (spec §3.2.5): peak, base load (P10) and night minimum.

Each interval's mean power is W = Wh × 60 / minutes. Pure.
"""

from __future__ import annotations

import math
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from kelvin.linky.models import CurvePoint

NIGHT_END_HOUR = 6  # « Talon » night window: 00:00–06:00 local


def mean_w(p: CurvePoint) -> float:
    return p.wh * 60 / p.minutes


def power_stats(points: list[CurvePoint], tz: ZoneInfo) -> dict[str, Any] | None:
    """`peak_w` with `peak_ts` (the first interval at the peak), `base_w_p10` (nearest-rank
    10th percentile of the intervals' W) and `night_min_w` (the lowest W starting before
    06:00 local), all integer W; None without points."""
    if not points:
        return None
    ws = sorted(mean_w(p) for p in points)
    peak = max(points, key=lambda p: (mean_w(p), -p.ts))
    night = [mean_w(p) for p in points if datetime.fromtimestamp(p.ts, tz).hour < NIGHT_END_HOUR]
    return {
        "peak_w": round(mean_w(peak)),
        "peak_ts": peak.ts,
        "base_w_p10": round(ws[math.ceil(0.1 * len(ws)) - 1]),
        "night_min_w": round(min(night)) if night else None,
    }
