"""Radiator energy per local day, with HC/HP and € from half-hour buckets (spec §2.1). Pure.

T1/T2 are the radiator's own registers, not HC/HP: HC/HP and € here come from the tariff
(`Pricing`: that day's option, slots or Tempo hours, and Tempo colour), applied to the half-hour
each watt-hour was apportioned to.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import date, datetime
from zoneinfo import ZoneInfo

from kelvin.billing.pricing import Pricing
from kelvin.billing.tariff import Tariff
from kelvin.recorder.energy import Bucket


@dataclass(frozen=True)
class RadiatorDay:
    wh: float | None
    hc_wh: float | None  # None without a tariff, or on a day with a Base half-hour (no split)
    hp_wh: float | None
    eur: float | None  # energy only, no subscription; None on a day with an unknown Tempo colour
    interpolated: bool
    apportioned: bool
    complete: bool  # every half-hour of the day lies inside a measured span


def radiator_days(
    buckets: list[Bucket],
    edges: list[int],
    tariff: Tariff | None,
    tz: ZoneInfo,
    *,
    colours: Mapping[date, str] | None = None,
) -> dict[date, RadiatorDay]:
    """Half-hour buckets of one radiator → one RadiatorDay per local day with any energy. Each
    half-hour is priced by `Pricing`: HC/HP is None on a day with a Base half-hour, € is None on
    a day with an unpriced half-hour (an unknown Tempo colour)."""
    pricing = Pricing(tariff, tz, colours) if tariff is not None else None
    acc: dict[date, dict] = {}
    for i, b in enumerate(buckets):
        a, z = edges[i], edges[i + 1]
        day = datetime.fromtimestamp(a, tz).date()
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
                "split": True,
                "priced": True,
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
        if pricing is not None:
            sl = pricing.slice(a, z - a)
            if sl.offpeak is None:
                x["split"] = False
            else:
                x["hc"] += b.wh * sl.offpeak
                x["hp"] += b.wh * (1 - sl.offpeak)
            price = pricing.price(sl)
            if price is None:
                x["priced"] = False
            else:
                x["eur"] += b.wh / 1000 * price
    on = pricing is not None
    return {
        d: RadiatorDay(
            x["wh"],
            x["hc"] if on and x["split"] else None,
            x["hp"] if on and x["split"] else None,
            x["eur"] if on and x["priced"] else None,
            x["i"],
            x["a"],
            x["cov"] == x["len"],
        )
        for d, x in acc.items()
        if x["known"]
    }
