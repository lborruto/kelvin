"""A room's radiator energy over the last `days` local days, today included (spec QW3).

The elapsed days are the report's own RadiatorDay figures (the radiator cache keeps the complete
ones), summed as the report sums them (`radiator_totals`). Their € are, day by day, the room's
radiators' rows in the report's `by_radiator` for that day (`radiator_shares`: the house's cents
from running sums anchored on 1 January, shared by largest remainder), so a room's day reads what
Énergie's Par pièce shows for it, in every window, and windows add up to the cent. Today's
measured half-hours enter the same running sum as its last point (`radiator_cents(extra=)`):
nothing is rounded on its own. Each half-hour was priced by `Pricing` (its option, its slots or
Tempo hours, its Tempo day's colour) when the radiator days were built. Unknown is None, never 0:
no split under Base; a day without € (a Tempo colour unknown, before the first price row) adds
nothing to `eur` and is counted in `missing_colour_days`, as in the report's radiator block; a
radiator never recorded lowers nothing, as in the report.
"""

from __future__ import annotations

from datetime import date, timedelta
from functools import cache
from typing import Any

from kelvin.billing.radiators import RadiatorDay
from kelvin.billing.report import (
    Counted,
    radiator_cents,
    radiator_shares,
    radiator_totals,
    radiator_year_cum,
)

MAX_ROOM_DAYS = 31
# Each radiator's first reading's day and its last (None while it is still in the house).
Life = dict[str, tuple[date, date | None]]
ONE = timedelta(days=1)


def counted_by(life: Life, today: date) -> Counted:
    """The report's rule: a radiator-day counts when the radiator existed that day and the day
    is over (today is still running)."""

    def counted(rid: str, d: date) -> bool:
        span = life.get(rid)
        return span is not None and d < today and span[0] <= d and (span[1] is None or d <= span[1])

    return counted


def room_energy(
    per: dict[str, dict[date, RadiatorDay]],
    life: Life,
    ids: list[str],
    days: int,
    today: date,
    heating_hours: dict[str, float | None],
    *,
    priced: bool,
) -> dict[str, Any]:
    """`per`: every recorded radiator's days (the house's, not only the room's: a day's cents are
    the house's, shared between its radiators), from 1 January of the window's first year."""
    first = today - timedelta(days=days - 1)
    counted = counted_by(life, today)
    whole = radiator_totals(per, counted, ids, first, today)  # the elapsed days, as the report
    now = [
        rd for rid in ids if (rd := per.get(rid, {}).get(today)) is not None and rd.wh is not None
    ]
    found = whole.found or bool(now)
    has_eur = whole.priced or any(rd.eur is not None for rd in now)
    # As the report's radiator block: the € are the priced days' (each as its Par pièce rows),
    # and `missing_colour_days` counts the days they leave out (a Tempo colour not published, a
    # day before the first price row), so a partial € always carries its reason. No priced day
    # at all: unknown, never 0. HC/HP need every day's split (none under Base).
    unpriced = len(whole.unpriced) + any(rd.eur is None for rd in now) if priced else 0
    eur = None
    if found and priced and has_eur:
        years = cache(lambda year: radiator_year_cum(per, counted, year))
        mine = set(ids)
        cents = 0
        d = first
        while d < today:  # each elapsed day as its Par pièce row
            shares = radiator_shares(per, counted, years, d, d + ONE)
            cents += sum(c for rid, c in shares.items() if rid in mine)
            d += ONE
        extra = sum(rd.eur or 0.0 for rd in now)
        cents += radiator_cents(years, today, today, extra=extra)
        eur = cents / 100
    split = found and priced and whole.split and all(rd.hc_wh is not None for rd in now)
    hours = [heating_hours.get(rid) for rid in ids]
    return {
        "from": first.isoformat(),
        "to": today.isoformat(),
        "days": days,
        "kwh": round((whole.wh + sum(rd.wh or 0.0 for rd in now)) / 1000, 3) if found else None,
        "hc_kwh": (
            round((whole.hc_wh + sum(rd.hc_wh or 0.0 for rd in now)) / 1000, 3) if split else None
        ),
        "hp_kwh": (
            round((whole.hp_wh + sum(rd.hp_wh or 0.0 for rd in now)) / 1000, 3) if split else None
        ),
        "eur": eur,
        # A room's equivalent full-power hours: the mean over its radiators, as Par pièce reads.
        "heating_hours": (
            round(sum(h for h in hours if h is not None) / len(hours), 4)
            if hours and all(h is not None for h in hours)
            else None
        ),
        "coverage": round(whole.recorded / whole.known, 4) if whole.known else None,
        "interpolated": whole.interpolated or any(rd.interpolated for rd in now),
        "apportioned": whole.apportioned or any(rd.apportioned for rd in now),
        "priced": priced,
        # Days with energy but no € (under Tempo, a colour not published): left out of `eur`.
        "missing_colour_days": unpriced,
    }
