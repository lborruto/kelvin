"""Radiator energy per local day, with HC/HP and € from half-hour buckets (spec §2.1). Pure.

T1/T2 are the radiator's own registers, not HC/HP: HC/HP here come from Kelvin's HC slots,
applied to the half-hour each watt-hour was apportioned to.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from zoneinfo import ZoneInfo

from kelvin.billing.slots import Ranges, offpeak_minutes
from kelvin.billing.tariff import Tariff
from kelvin.recorder.energy import Bucket


@dataclass(frozen=True)
class RadiatorDay:
    wh: float | None
    hc_wh: float | None  # None without a tariff
    hp_wh: float | None
    eur: float | None  # energy only, no subscription
    interpolated: bool
    apportioned: bool
    complete: bool  # every half-hour of the day lies inside a measured span


def interval_offpeak(start: int, seconds: int, tariff: Tariff, tz: ZoneInfo) -> float:
    """Share of [start, start + seconds) inside the HC slots, by its wall-clock time."""
    local = datetime.fromtimestamp(start, tz)
    return _offpeak(local.hour * 60 + local.minute, seconds // 60, tariff.ranges())


def _offpeak(start_min: int, minutes: int, ranges: Ranges) -> float:
    return offpeak_minutes(start_min, minutes, ranges) / minutes


def radiator_days(
    buckets: list[Bucket], edges: list[int], tariff: Tariff | None, tz: ZoneInfo
) -> dict[date, RadiatorDay]:
    """Half-hour buckets of one radiator → one RadiatorDay per local day with any energy."""
    acc: dict[date, dict] = {}
    ranges = tariff.ranges() if tariff is not None else []
    shares: dict[tuple[int, int], float] = {}  # (local start minute, minutes) → HC share
    for i, b in enumerate(buckets):
        a, z = edges[i], edges[i + 1]
        local = datetime.fromtimestamp(a, tz)
        day = local.date()
        x = acc.setdefault(
            day,
            {
                "wh": 0.0,
                "hc": 0.0,
                "hp": 0.0,
                "eur": 0.0,
                "i": False,
                "a": False,
                "cov": 0,
                "len": 0,
                "known": False,
            },
        )
        x["len"] += z - a
        if b.wh is None:
            continue
        x["known"] = True
        x["wh"] += b.wh
        x["cov"] += b.covered_s
        x["i"] |= b.interpolated
        x["a"] |= b.apportioned
        if tariff is not None:
            key = (local.hour * 60 + local.minute, (z - a) // 60)
            f = shares.get(key)
            if f is None:
                f = shares[key] = _offpeak(*key, ranges)
            p = tariff.prices_on(day)
            x["hc"] += b.wh * f
            x["hp"] += b.wh * (1 - f)
            x["eur"] += b.wh / 1000 * (f * p.hc_eur_kwh + (1 - f) * p.hp_eur_kwh)
    priced = tariff is not None
    return {
        d: RadiatorDay(
            x["wh"],
            x["hc"] if priced else None,
            x["hp"] if priced else None,
            x["eur"] if priced else None,
            x["i"],
            x["a"],
            x["cov"] == x["len"],
        )
        for d, x in acc.items()
        if x["known"]
    }
