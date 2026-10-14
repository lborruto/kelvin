"""Off-peak (HC) slots and the HC/HP split of the load curve (spec §3.5, §3.6)."""

from __future__ import annotations

import re
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import datetime
from zoneinfo import ZoneInfo

from kelvin.linky.models import CurvePoint

DAY_MIN = 1440
MAX_SLOTS = 3
_HHMM = re.compile(r"([01]\d|2[0-3]):([0-5]\d)")

Ranges = list[tuple[int, int]]


@dataclass(frozen=True)
class Slot:
    start: str  # "HH:MM"
    end: str


class SlotError(ValueError):
    """Invalid HC slots; the message is French, for the user."""


def to_minutes(hhmm: str) -> int:
    m = _HHMM.fullmatch(hhmm)
    if not m:
        raise SlotError(f"Heure invalide : {hhmm} (format HH:MM).")
    return int(m[1]) * 60 + int(m[2])


def slot_ranges(slots: Sequence[Slot]) -> Ranges:
    """Validated [a, b) minute ranges within one day; a slot across midnight becomes two."""
    if not slots:
        raise SlotError("Indiquez au moins une plage d’heures creuses.")
    if len(slots) > MAX_SLOTS:
        raise SlotError("Trois plages d’heures creuses au maximum.")
    ranges: Ranges = []
    for s in slots:
        a, b = to_minutes(s.start), to_minutes(s.end)
        if a == b:
            raise SlotError("Une plage d’heures creuses ne peut pas être vide.")
        if a < b:
            ranges.append((a, b))
        else:
            ranges.append((a, DAY_MIN))
            if b > 0:
                ranges.append((0, b))
    ranges.sort()
    for (_, b1), (a2, _) in zip(ranges, ranges[1:], strict=False):
        if a2 < b1:
            raise SlotError("Les plages d’heures creuses se chevauchent.")
    return ranges


def slots_from_pairs(pairs: Iterable[tuple[str, str]]) -> tuple[Slot, ...]:
    return tuple(Slot(a, b) for a, b in pairs)


def offpeak_share_of_day(ranges: Ranges) -> float:
    return sum(b - a for a, b in ranges) / DAY_MIN


def offpeak_minutes(start_min: int, length: int, ranges: Ranges) -> int:
    """Minutes of the wall-clock interval [start_min, start_min + length) inside the HC ranges.
    The interval may run past midnight."""
    total = 0
    s, e = start_min, start_min + length
    for shift in (0, DAY_MIN):
        for a, b in ranges:
            lo, hi = max(s, a + shift), min(e, b + shift)
            if hi > lo:
                total += hi - lo
    return total


def offpeak_fraction(point: CurvePoint, ranges: Ranges, tz: ZoneInfo) -> float:
    """Each interval is classified by its own wall-clock time, so DST days need no special case:
    the repeated autumn hour is counted twice, the skipped spring hour never."""
    local = datetime.fromtimestamp(point.ts, tz)
    start = local.hour * 60 + local.minute
    return offpeak_minutes(start, point.minutes, ranges) / point.minutes


def split_curve(points: Iterable[CurvePoint], ranges: Ranges, tz: ZoneInfo) -> tuple[float, float]:
    hc = hp = 0.0
    for p in points:
        f = offpeak_fraction(p, ranges, tz)
        hc += p.wh * f
        hp += p.wh * (1 - f)
    return hc, hp
