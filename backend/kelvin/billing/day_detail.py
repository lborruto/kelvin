"""One day in detail (`GET /api/energy/day`, spec §3.3, audit M7 and L11). Pure.

The half-hour bars stay as measured; the day's HC/HP totals follow the daily reading (what is
billed), split by the curve's share, so the Courbe panel and the hero give one figure (M7).
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any
from zoneinfo import ZoneInfo

from kelvin.billing.costs import DayEnergy
from kelvin.billing.power import mean_w, power_stats
from kelvin.billing.radiators import interval_offpeak
from kelvin.billing.slots import DAY_MIN, split_curve, to_minutes
from kelvin.billing.tariff import Tariff
from kelvin.linky.models import CurvePoint
from kelvin.recorder.energy import Bucket


def _r(v: float | None, n: int = 3) -> float | None:
    return None if v is None else round(v, n)


def boundary_inside(start: int, minutes: int, tariff: Tariff, tz: ZoneInfo) -> bool:
    """True when an HC slot starts or ends strictly inside the interval (L11: its HC share
    is prorated, so the UI marks it « ≈ »)."""
    local = datetime.fromtimestamp(start, tz)
    a = local.hour * 60 + local.minute
    edges = {to_minutes(t) for s in tariff.hc_slots for t in (s.start, s.end)}
    return any(a < m < a + minutes or a < m + DAY_MIN < a + minutes for m in edges)


def day_detail(
    day: date,
    points: list[CurvePoint],
    energy: DayEnergy | None,
    tariff: Tariff | None,
    tz: ZoneInfo,
    radiators: dict[str, list[Bucket]],
    edges: list[int],
    rooms: dict[str, str],
    complete: bool,
    *,
    life: dict[str, tuple[int, int | None]] | None = None,
) -> dict[str, Any]:
    """`radiators`: half-hour buckets per radiator over `edges` (the day's half-hours);
    `rooms`: radiator id → current room (radiators no longer in the house have none);
    `life`: radiator id → (first reading ts, last reading ts, or None while in the house).

    A radiator exists in an interval from its first reading to its last; without `life`,
    always. When one that exists has no figure for an interval, the radiators' sum (and its
    room's) is null, never partial (review I-4): « Reste » is the meter minus a whole sum."""

    def exists(rid: str, t: int) -> bool:
        span = (life or {}).get(rid)
        return span is None or (span[0] <= t and (span[1] is None or t < span[1]))

    index = {t: i for i, t in enumerate(edges[:-1])}
    prices = tariff.prices_on(day) if tariff else None
    intervals = []
    for p in points:
        f = interval_offpeak(p.ts, p.minutes * 60, tariff, tz) if tariff else None
        price = (
            f * prices.hc_eur_kwh + (1 - f) * prices.hp_eur_kwh
            if f is not None and prices
            else None
        )
        i = index.get(p.ts) if p.minutes == 30 else None
        known: list[Bucket] = []
        total = 0
        rooms_wh: dict[str, float | None] = {}
        if i is not None:
            for rid, row in radiators.items():
                b, room = row[i], rooms.get(rid)
                there = exists(rid, p.ts) or b.wh is not None
                total += there
                if b.wh is not None:
                    known.append(b)
                if room is None or not there:
                    continue
                prev = rooms_wh.get(room, 0.0)
                rooms_wh[room] = None if prev is None or b.wh is None else prev + b.wh
        intervals.append(
            {
                "ts": p.ts,
                "minutes": p.minutes,
                "wh": p.wh,
                "w": round(mean_w(p)),
                "offpeak": _r(f, 4),
                "boundary": bool(tariff) and boundary_inside(p.ts, p.minutes, tariff, tz),
                "price": _r(price, 4),
                "eur": _r(p.wh / 1000 * price, 4) if price is not None else None,
                "radiators_wh": _r(sum(b.wh for b in known), 1)  # type: ignore[misc]
                if known and len(known) == total
                else None,
                "radiators_known": len(known),
                "radiators_total": total,
                "radiators_interp": any(b.interpolated for b in known),
                "radiators_apportioned": any(b.apportioned for b in known),
                "by_room": {k: _r(v, 1) for k, v in sorted(rooms_wh.items())},
            }
        )
    curve_wh = sum(p.wh for p in points)
    hc_c = hp_c = None
    if tariff and points:
        hc_c, hp_c = split_curve(points, tariff.ranges(), tz)
    return {
        "date": day.isoformat(),
        "complete": complete,
        "points": len(points),
        "intervals": intervals,
        "totals": {
            "curve_kwh": _r(curve_wh / 1000) if points else None,
            "daily_kwh": _r(energy.kwh) if energy else None,
            "hc_kwh": _r(energy.hc_kwh) if energy else None,
            "hp_kwh": _r(energy.hp_kwh) if energy else None,
            "split_method": energy.method if energy else None,
            "hc_kwh_curve": _r(hc_c / 1000) if hc_c is not None else None,
            "hp_kwh_curve": _r(hp_c / 1000) if hp_c is not None else None,
        },
        "power": {
            **(
                power_stats(points, tz)
                if complete
                else dict.fromkeys(("peak_w", "peak_ts", "base_w_p10", "night_min_w"))
            ),  # type: ignore[dict-item]
            "kva": tariff.kva if tariff else None,
        },
    }
