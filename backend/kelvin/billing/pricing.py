"""What a time interval is billed at (spec §2.2), under every option. Pure.

An interval [start, start + seconds) is classified by its own wall-clock time, so DST days need
no special case: the repeated autumn hour is counted twice, the skipped spring hour never.
- `hchp`: its off-peak fraction under the slots of its local date (dated, seasonal schedules);
- `tempo`: its off-peak fraction under the Tempo hours, and the colour of its **Tempo day**: the
  local date, minus one day when the interval starts before 06:00 (a Tempo day runs from 06:00
  to 06:00 the next day). The day is taken on the wall clock: on 25 October, 05:30 belongs to the
  Tempo day of 24 October, whatever the UTC offset did at 03:00;
- `base`: no off-peak fraction.
The price row is the one in force on the interval's local date (regulated prices change at 00:00).
An unknown Tempo colour prices nothing: the keys say `unknown_hc` / `unknown_hp`.
"""

from __future__ import annotations

import calendar
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from kelvin.billing.slots import DAY_MIN, offpeak_minutes, offpeak_share_of_day, to_minutes
from kelvin.billing.tariff import TEMPO_DAY_START, PriceRow, Tariff, ranges_of

TEMPO_DAY_START_MIN = to_minutes(TEMPO_DAY_START)
COLOURS = ("blue", "white", "red")
UNKNOWN = "unknown"


def tempo_day(ts: int, tz: ZoneInfo) -> date:
    local = datetime.fromtimestamp(ts, tz)
    day = local.date()
    if local.hour * 60 + local.minute < TEMPO_DAY_START_MIN:
        return day - timedelta(days=1)
    return day


def _inside(minute: int, minutes: int, edges: set[int]) -> bool:
    return any(
        minute < m < minute + minutes or minute < m + DAY_MIN < minute + minutes for m in edges
    )


@dataclass(frozen=True)
class Slice:
    day: date  # the local date of the start: its price row's day
    option: str
    offpeak: float | None  # off-peak share of the interval; None under base
    keys: tuple[tuple[str, float], ...]  # rate key → share of the interval (sums to 1)
    colour: str | None  # tempo: blue | white | red, None when unknown; None for other options
    boundary: bool  # an off-peak edge falls strictly inside the interval (L11 « ≈ »)


class Pricing:
    def __init__(
        self, tariff: Tariff, tz: ZoneInfo, colours: Mapping[date, str] | None = None
    ) -> None:
        self.tariff = tariff
        self.tz = tz
        self.colours = colours or {}

    def row(self, day: date) -> PriceRow:
        return self.tariff.prices_on(day)

    def subscription(self, day: date) -> float:
        return self.row(day).subscription_eur_month / calendar.monthrange(day.year, day.month)[1]

    def _colour_of(self, tday: date) -> str | None:
        c = self.colours.get(tday)
        return c if c in COLOURS else None

    def slice(self, start: int, seconds: int) -> Slice:
        local = datetime.fromtimestamp(start, self.tz)
        day = local.date()
        minute = local.hour * 60 + local.minute
        minutes = max(1, seconds // 60)
        row = self.row(day)
        if row.option == "base":
            return Slice(day, "base", None, (("base", 1.0),), None, False)
        colour: str | None = None
        if row.option == "tempo":
            th = self.tariff.tempo_hours
            ranges = self.tariff.tempo_ranges()
            edges = {to_minutes(th.hc_start), to_minutes(th.hc_end)}
            colour = self._colour_of(tempo_day(start, self.tz))
            hc_key, hp_key = f"{colour or UNKNOWN}_hc", f"{colour or UNKNOWN}_hp"
        else:
            slots = self.tariff.slots_on(day) or ()
            ranges = ranges_of(slots) if slots else []
            edges = {to_minutes(s.start) for s in slots} | {to_minutes(s.end) for s in slots}
            hc_key, hp_key = "hc", "hp"
        f = offpeak_minutes(minute, minutes, ranges) / minutes
        keys = tuple((k, s) for k, s in ((hc_key, f), (hp_key, 1 - f)) if s > 0)
        return Slice(day, row.option, f, keys, colour, _inside(minute, minutes, edges))

    def price(self, sl: Slice) -> float | None:
        """€/kWh of a slice: Σ share × rate; None when a key has no price (unknown colour)."""
        row = self.row(sl.day)
        total = 0.0
        for key, share in sl.keys:
            r = row.rate(key)
            if r is None:
                return None
            total += share * r
        return total

    def offpeak(self, start: int, seconds: int) -> float | None:
        return self.slice(start, seconds).offpeak

    def rate(self, start: int, seconds: int) -> float | None:
        return self.price(self.slice(start, seconds))

    def colour(self, start: int) -> str | None:
        """The Tempo colour of the Tempo day holding `start` (whatever the option that day)."""
        return self._colour_of(tempo_day(start, self.tz))

    def day_share(self, day: date) -> float | None:
        """The off-peak share of the day's clock hours (« vos heures creuses durent … »)."""
        option = self.tariff.option_on(day)
        if option == "base":
            return None
        if option == "tempo":
            return offpeak_share_of_day(self.tariff.tempo_ranges())
        ranges = self.tariff.ranges_on(day)
        return offpeak_share_of_day(ranges) if ranges else None
