"""MyElectricalData (Enedis) LinkySource. Facts verified in docs/linky-notes.md."""

from __future__ import annotations

import json
import logging
import math
import re
from datetime import date, datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

import httpx

from kelvin.linky.models import (
    AccessStatus,
    Contract,
    CurvePoint,
    DailyReading,
    LinkyAuthError,
    LinkyError,
    LinkyThrottled,
    check_curve_span,
    day_bounds,
)

MED_BASE_URL = "https://www.myelectricaldata.fr"
CURVE_DATE_IS_END = True  # docs/linky-notes.md: a point dated 00:30 covers 00:00–00:30
NO_DATA_STATUSES = frozenset({404})  # "not published yet": an empty answer, not an error

# httpx logs request URLs at INFO, and MED URLs carry the PDL: keep those lines out of the logs.
logging.getLogger("httpx").setLevel(logging.WARNING)

_OFFPEAK = re.compile(r"(\d{1,2})H(\d{2})\s*-\s*(\d{1,2})H(\d{2})")
_KVA = re.compile(r"\s*(\d+)")
_PT = re.compile(r"PT(\d+)M")
_NEXT_ACCESS = re.compile(r"(\d{4})-([A-Za-z]{3})-(\d{2}) (\d{2}):(\d{2}):(\d{2})([+-]\d{4})")
_MONTHS = {
    m: i
    for i, m in enumerate(
        ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1
    )
}


def parse_offpeak(text: str | None) -> tuple[tuple[str, str], ...]:
    """'HC (1H30-7H30;12H30-14H30)' → (('01:30', '07:30'), ('12:30', '14:30'))."""
    if not text:
        return ()
    return tuple(
        (f"{int(a):02d}:{b}", f"{int(c):02d}:{d}") for a, b, c, d in _OFFPEAK.findall(text)
    )


def parse_kva(text: Any) -> int | None:
    m = _KVA.match(str(text or ""))
    return int(m[1]) if m else None


def parse_retry_at(body: Any) -> float | None:
    """nextAccessTime of a 429. It sits in a JSON *string* in `detail`:
    '2026-Oct-14 07:00:00+0000 UTC' → epoch seconds."""
    if body is None:
        return None
    m = _NEXT_ACCESS.search(json.dumps(body))
    if not m or m[2].title() not in _MONTHS:
        return None
    sign = 1 if m[7][0] == "+" else -1
    offset = sign * timedelta(hours=int(m[7][1:3]), minutes=int(m[7][3:5]))
    try:
        dt = datetime(
            int(m[1]),
            _MONTHS[m[2].title()],
            int(m[3]),
            int(m[4]),
            int(m[5]),
            int(m[6]),
            tzinfo=timezone(offset),
        )
    except ValueError:
        return None
    return dt.timestamp()


def _meter_reading(payload: Any) -> dict[str, Any]:
    reading = payload.get("meter_reading") if isinstance(payload, dict) else None
    if not isinstance(reading, dict) or not isinstance(reading.get("interval_reading"), list):
        raise LinkyError("unexpected payload")
    return reading


def parse_daily(payload: Any) -> list[DailyReading]:
    reading = _meter_reading(payload)
    unit = (reading.get("reading_type") or {}).get("unit", "Wh")
    factor = 1000 if unit == "kWh" else 1
    try:
        return [
            DailyReading(date.fromisoformat(str(i["date"])[:10]), round(float(i["value"]) * factor))
            for i in reading["interval_reading"]
            if i.get("value") not in (None, "")
        ]
    except (KeyError, ValueError, TypeError, AttributeError, OverflowError):
        raise LinkyError("unexpected payload") from None


def _minutes(text: Any) -> int:
    m = _PT.fullmatch(str(text or ""))
    return int(m[1]) if m else 30


def _local_ts(text: str, tz: ZoneInfo, after: int | None) -> int:
    """Epoch seconds of an Enedis timestamp. Naive local times repeat in the autumn DST hour:
    the occurrence that comes after `after` (fold=1) is the right one."""
    dt = datetime.fromisoformat(text.strip().replace(" ", "T"))
    if dt.tzinfo is not None:
        return int(dt.timestamp())
    first = int(dt.replace(tzinfo=tz, fold=0).timestamp())
    if after is not None and first <= after:
        second = int(dt.replace(tzinfo=tz, fold=1).timestamp())
        if second > after:
            return second
    return first


def parse_curve(
    payload: Any, tz: ZoneInfo, *, date_is_end: bool = CURVE_DATE_IS_END
) -> list[CurvePoint]:
    reading = _meter_reading(payload)
    unit = (reading.get("reading_type") or {}).get("unit", "W")
    points: list[CurvePoint] = []
    last: int | None = None
    try:
        for item in reading["interval_reading"]:
            if item.get("value") in (None, ""):
                continue
            minutes = _minutes(item.get("interval_length"))
            stamp = _local_ts(str(item["date"]), tz, last)
            last = stamp
            value = float(item["value"])
            if not math.isfinite(value):
                raise ValueError("non-finite value")
            wh = value * minutes / 60 if unit == "W" else value
            start = stamp - minutes * 60 if date_is_end else stamp
            points.append(CurvePoint(start, minutes, round(wh, 3)))
    except (KeyError, ValueError, TypeError, AttributeError, OverflowError):
        raise LinkyError("unexpected payload") from None
    return points


def parse_contract(payload: Any) -> Contract:
    try:
        c = payload["customer"]["usage_points"][0]["contracts"]
    except (KeyError, IndexError, TypeError):
        raise LinkyError("unexpected contract payload") from None
    try:
        act = c.get("last_activation_date")
        return Contract(
            kva=parse_kva(c.get("subscribed_power")),
            offpeak=parse_offpeak(c.get("offpeak_hours")),
            activation_date=date.fromisoformat(str(act)[:10]) if act else None,
            tariff_code=c.get("distribution_tariff"),
        )
    except (ValueError, TypeError, AttributeError):
        raise LinkyError("unexpected contract payload") from None


class MedSource:
    def __init__(
        self,
        prm: str,
        token: str,
        *,
        base_url: str = MED_BASE_URL,
        tz: str = "Europe/Paris",
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self._prm = prm
        self._token = token
        self._tz = ZoneInfo(tz)
        self._client = client or httpx.AsyncClient(base_url=base_url, timeout=60.0)

    def __repr__(self) -> str:
        return "MedSource(<hidden>)"

    async def _get(self, path: str) -> Any:
        failure: str | None = None
        try:
            r = await self._client.get(
                f"/{path}", headers={"Authorization": self._token, "Accept": "application/json"}
            )
        except httpx.HTTPError as e:
            failure = type(e).__name__
        if failure is not None:
            # Raised outside the except block: neither __cause__ nor __context__ may hold the
            # httpx error, whose repr carries the URL, hence the PDL.
            raise LinkyError(f"network error: {failure}")
        try:
            body = r.json()
        except ValueError:
            body = None
        if r.status_code == 429:
            raise LinkyThrottled(parse_retry_at(body))
        if r.status_code in (401, 403):
            raise LinkyAuthError(f"HTTP {r.status_code}")
        if r.status_code in NO_DATA_STATUSES:
            return None
        if r.status_code >= 400 or body is None:
            raise LinkyError(f"HTTP {r.status_code}")
        if not isinstance(body, dict):  # every MED answer is an object; anything else is junk
            raise LinkyError("unexpected payload")
        return body

    async def check(self) -> AccessStatus:
        body = await self._get(f"valid_access/{self._prm}") or {}
        return AccessStatus(
            valid=body.get("valid") is True,
            consent_expires=body.get("consent_expiration_date"),
            quota_reached=bool(body.get("quota_reached")),
            banned=bool(body.get("ban")),
        )

    async def fetch_contract(self) -> Contract:
        body = await self._get(f"contracts/{self._prm}")
        if body is None:
            raise LinkyError("no contract")
        return parse_contract(body)

    async def fetch_daily(self, start: date, end: date) -> list[DailyReading]:
        if end <= start:
            return []
        body = await self._get(f"daily_consumption/{self._prm}/start/{start}/end/{end}")
        if body is None or "meter_reading" not in body:
            return []
        # Verified (docs/linky-notes.md): a not-yet-published day is answered with the previous
        # day's reading (start=D returns D-1). Keep only the days that were asked for.
        return [r for r in parse_daily(body) if start <= r.day < end]

    async def fetch_curve(self, start: date, end: date) -> list[CurvePoint]:
        check_curve_span(start, end)
        if end <= start:
            return []
        body = await self._get(f"consumption_load_curve/{self._prm}/start/{start}/end/{end}")
        if body is None or "meter_reading" not in body:
            return []
        lo, hi = day_bounds(start, self._tz)[0], day_bounds(end, self._tz)[0]
        # Same shifted-window behaviour as daily: keep intervals starting in [start, end).
        return [p for p in parse_curve(body, self._tz) if lo <= p.ts < hi]

    async def aclose(self) -> None:
        await self._client.aclose()
