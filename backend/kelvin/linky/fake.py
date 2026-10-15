"""Synthetic Linky for the simulator and tests (KELVIN_FAKE=1).

It builds MyElectricalData-shaped payloads and reads them back through the real parsers, so the
simulator exercises them too. The figures are demo values, never presented as real consumption.
"""

from __future__ import annotations

import math
import random
import time
from collections.abc import Callable
from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from kelvin.linky.med import parse_contract, parse_curve, parse_daily
from kelvin.linky.models import (
    AccessStatus,
    Contract,
    CurvePoint,
    DailyReading,
    check_curve_span,
    day_bounds,
)

DEMO_PRM = "00000000000000"


def _weight(hour: int) -> float:
    """A household day: low at night, peaks in the morning and the evening."""
    if hour < 6:
        return 0.6
    if hour < 9:
        return 1.6
    if hour < 17:
        return 0.9
    if hour < 22:
        return 1.8
    return 1.0


class FakeLinkySource:
    def __init__(
        self,
        *,
        tz: str = "Europe/Paris",
        wall: Callable[[], float] = time.time,
        activation: date = date(2020, 1, 1),
        radiators_halfhours: Callable[[date], list[float | None] | None] | None = None,
    ) -> None:
        self.tz = ZoneInfo(tz)
        self.radiators_halfhours = radiators_halfhours
        self.wall = wall
        self.activation = activation
        self.calls: list[str] = []
        self.fail: dict[str, Exception] = {}
        self.missing: set[date] = set()
        self.contract_offpeak = (
            "HC (22H00-6H00)"  # the contract's off-peak hours, as MED words them
        )

    def _raise(self, kind: str) -> None:
        if kind in self.fail:
            raise self.fail[kind]

    def _today(self) -> date:
        return datetime.fromtimestamp(self.wall(), self.tz).date()

    def _parts(self, day: date) -> tuple[float, list[float] | None, float]:
        """(household base Wh, the radiators' Wh per half-hour or None, heating Wh).

        A half-hour no recorded radiator knows (m-9: one added part-way through the day, or
        before the recorder's history) gets its share of the seasonal estimate instead."""
        winter = (1 + math.cos(2 * math.pi * (day.timetuple().tm_yday - 15) / 365.25)) / 2
        rng = random.Random(day.toordinal())
        base = 8000 + 3000 * winter + rng.uniform(-700, 700)
        seasonal = 30000 * winter * rng.uniform(0.85, 1.15)
        known = self.radiators_halfhours(day) if self.radiators_halfhours is not None else None
        if known is None:
            return base, None, seasonal
        a, b = day_bounds(day, self.tz)
        weights = [_weight(datetime.fromtimestamp(t, self.tz).hour) for t in range(a, b, 1800)]
        total = sum(weights)
        halves = [
            h if h is not None else seasonal * w / total
            for h, w in zip(known, weights, strict=True)
        ]
        return base, halves, sum(halves)

    def day_wh(self, day: date) -> int:
        """The meter sees the whole home: a household base (about 8 kWh in July to 11 kWh in
        January) plus the heating. The heating is what the simulated radiators recorded that day
        (`radiators_halfhours`); a day they did not record whole gets a seasonal estimate
        instead (about 30 kWh in mid-January, nothing in July)."""
        base, _, heating = self._parts(day)
        return round(base + heating)

    def _published(self, start: date, end: date) -> list[date]:
        last = min(end, self._today())
        days = [start + timedelta(days=i) for i in range(max(0, (last - start).days))]
        return [d for d in days if d not in self.missing and d >= self.activation]

    def daily_payload(self, start: date, end: date) -> dict[str, Any]:
        items = [
            {"value": str(self.day_wh(d)), "date": d.isoformat()}
            for d in self._published(start, end)
        ]
        return {
            "meter_reading": {
                "usage_point_id": DEMO_PRM,
                "start": str(start),
                "end": str(end),
                "quality": "BRUT",
                "reading_type": {
                    "measurement_kind": "energy",
                    "measuring_period": "P1D",
                    "unit": "Wh",
                    "aggregate": "sum",
                },
                "interval_reading": items,
            }
        }

    def curve_payload(self, start: date, end: date) -> dict[str, Any]:
        items: list[dict[str, str]] = []
        for d in self._published(start, end):
            a, b = day_bounds(d, self.tz)
            starts = list(range(a, b, 1800))
            weights = [_weight(datetime.fromtimestamp(s, self.tz).hour) for s in starts]
            total = sum(weights)
            base, halves, heating = self._parts(d)  # once per day: it may query the recorder
            for i, (s, w) in enumerate(zip(starts, weights, strict=True)):
                # L15: the house half-hour = a base shape + what the radiators drew in it, so
                # the demo never shows radiators above the meter.
                rad = halves[i] if halves is not None else heating * w / total
                watts = (base * w / total + rad) * 2  # Wh over 30 min → mean W
                end_stamp = datetime.fromtimestamp(s + 1800, self.tz).strftime("%Y-%m-%d %H:%M:%S")
                items.append(
                    {
                        "value": f"{watts:.0f}",
                        "date": end_stamp,
                        "interval_length": "PT30M",
                        "measure_type": "B",
                    }
                )
        return {
            "meter_reading": {
                "usage_point_id": DEMO_PRM,
                "start": str(start),
                "end": str(end),
                "quality": "BRUT",
                "reading_type": {"measurement_kind": "power", "unit": "W", "aggregate": "average"},
                "interval_reading": items,
            }
        }

    async def check(self) -> AccessStatus:
        self.calls.append("check")
        self._raise("check")
        return AccessStatus(True, "2029-10-14T00:00:00", False, False)

    async def fetch_contract(self) -> Contract:
        self.calls.append("contract")
        self._raise("contract")
        return parse_contract(
            {
                "customer": {
                    "customer_id": "0000000000",
                    "usage_points": [
                        {
                            "usage_point": {"usage_point_id": DEMO_PRM},
                            "contracts": {
                                "subscribed_power": "9 kVA",
                                "offpeak_hours": self.contract_offpeak,
                                "last_activation_date": f"{self.activation}+01:00",
                                "distribution_tariff": "BTINFCU4",
                            },
                        }
                    ],
                }
            }
        )

    async def fetch_daily(self, start: date, end: date) -> list[DailyReading]:
        self.calls.append(f"daily:{start}:{end}")
        self._raise("daily")
        return parse_daily(self.daily_payload(start, end))

    async def fetch_curve(self, start: date, end: date) -> list[CurvePoint]:
        check_curve_span(start, end)
        self.calls.append(f"curve:{start}:{end}")
        self._raise("curve")
        return parse_curve(self.curve_payload(start, end), self.tz)

    async def aclose(self) -> None:
        return None
