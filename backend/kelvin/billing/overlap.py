"""How much of a programme's comfort time falls in peak hours (spec feature 9). Pure.

For each day of a week, a comfort slot [a, b) (wall-clock minutes, as the radiator reads its
programme; `24:00` = 1440) counts its minutes outside that day's off-peak ranges: the dated and
seasonal HC schedule (`slots_on`) on an HC/HP day, the Tempo hours on a Tempo day. A Base day has
no peak hours, and a day missing from the programme is unknown: the week then has no figure.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

from kelvin.billing.slots import DAY_MIN, Ranges, offpeak_minutes, to_minutes
from kelvin.billing.tariff import Tariff
from kelvin.errors import UserError
from kelvin.house.model import DAY_ORDER

Week = Mapping[str, Sequence[Mapping[str, str]]]


def minutes_of(hhmm: str) -> int:
    """'HH:MM' → minutes; '24:00' (a slot ending at midnight, Plan 8) → 1440."""
    return DAY_MIN if hhmm == "24:00" else to_minutes(hhmm)


@dataclass(frozen=True)
class Overlap:
    hp_minutes: int
    minutes: int

    @property
    def share(self) -> float | None:
        return self.hp_minutes / self.minutes if self.minutes else None

    def view(self) -> dict[str, Any]:
        return {"hp_minutes": self.hp_minutes, "minutes": self.minutes, "share": self.share}


def day_ranges(tariff: Tariff, day: date) -> Ranges | None:
    """The off-peak ranges in force on `day`; None under Base."""
    option = tariff.option_on(day)
    if option == "tempo":
        return tariff.tempo_ranges()
    if option == "hchp":
        return tariff.ranges_on(day)
    return None


def week_overlap(monday: date, week: Week, tariff: Tariff) -> Overlap | None:
    total = hp = 0
    for i, name in enumerate(DAY_ORDER):
        day = monday + timedelta(days=i)
        ranges = day_ranges(tariff, day)
        if ranges is None or name not in week:
            return None
        for slot in week[name]:
            try:
                a, b = minutes_of(slot["start"]), minutes_of(slot["end"])
            except (KeyError, ValueError, UserError):  # SlotError is a UserError (Plan 7)
                return None
            if b <= a:
                return None
            total += b - a
            hp += (b - a) - offpeak_minutes(a, b - a, ranges)
    return Overlap(hp, total)
