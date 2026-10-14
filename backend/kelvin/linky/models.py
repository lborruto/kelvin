"""Linky data and the LinkySource interface (spec §3.5). A TIC dongle can implement it later."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from datetime import time as dtime
from typing import Protocol
from zoneinfo import ZoneInfo

CURVE_MAX_DAYS = 7  # Enedis: at most 7 days of load curve per request


@dataclass(frozen=True)
class DailyReading:
    day: date
    wh: int


@dataclass(frozen=True)
class CurvePoint:
    ts: int  # interval start, epoch seconds
    minutes: int
    wh: float


@dataclass(frozen=True)
class Contract:
    kva: int | None
    offpeak: tuple[tuple[str, str], ...]  # ("HH:MM", "HH:MM") HC slots
    activation_date: date | None  # Enedis has no data before it
    tariff_code: str | None


@dataclass(frozen=True)
class AccessStatus:
    valid: bool
    consent_expires: str | None
    quota_reached: bool
    banned: bool


class LinkyError(Exception):
    """MyElectricalData failed or answered something unexpected. Never carries a secret."""


class LinkyAuthError(LinkyError):
    """Token or PDL refused, or the Enedis consent expired."""


class LinkyThrottled(LinkyError):
    def __init__(self, retry_at: float | None) -> None:
        super().__init__("throttled")
        self.retry_at = retry_at


class LinkySource(Protocol):
    async def check(self) -> AccessStatus: ...

    async def fetch_contract(self) -> Contract: ...

    async def fetch_daily(self, start: date, end: date) -> list[DailyReading]:
        """Wh per local day for [start, end)."""
        ...

    async def fetch_curve(self, start: date, end: date) -> list[CurvePoint]:
        """Load curve for [start, end), at most CURVE_MAX_DAYS days."""
        ...

    async def aclose(self) -> None: ...


def check_curve_span(start: date, end: date) -> None:
    if (end - start).days > CURVE_MAX_DAYS:
        raise ValueError(f"at most {CURVE_MAX_DAYS} days of load curve per request")


def day_bounds(day: date, tz: ZoneInfo) -> tuple[int, int]:
    """Epoch seconds of local midnight and of the next local midnight (23 h or 25 h on DST days)."""
    start = datetime.combine(day, dtime(0), tzinfo=tz)
    end = datetime.combine(day + timedelta(days=1), dtime(0), tzinfo=tz)
    return int(start.timestamp()), int(end.timestamp())


def local_day(ts: int, tz: ZoneInfo) -> date:
    return datetime.fromtimestamp(ts, tz).date()


def curve_complete(day: date, points: list[CurvePoint] | None, tz: ZoneInfo) -> bool:
    """True when the curve points of a local day cover all of it (23 h or 25 h on DST days)."""
    if not points:
        return False
    a, b = day_bounds(day, tz)
    return sum(p.minutes for p in points) * 60 >= b - a
