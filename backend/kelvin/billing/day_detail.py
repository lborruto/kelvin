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
) -> dict[str, Any]:
    """`radiators`: half-hour buckets per radiator over `edges` (the day's half-hours);
    `rooms`: radiator id → current room (radiators no longer in the house have none)."""
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
        rad = [b[i] for b in radiators.values()] if i is not None else []
        known = [b for b in rad if b.wh is not None]
        by_room: dict[str, float] = {}
        if i is not None:
            for rid, row in radiators.items():
                room = rooms.get(rid)
                if room is not None and row[i].wh is not None:
                    by_room[room] = by_room.get(room, 0.0) + row[i].wh  # type: ignore[operator]
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
                "radiators_wh": _r(sum(b.wh for b in known), 1) if known else None,  # type: ignore[misc]
                "radiators_interp": any(b.interpolated for b in known),
                "radiators_apportioned": any(b.apportioned for b in known),
                "by_room": {k: round(v, 1) for k, v in sorted(by_room.items())},
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
