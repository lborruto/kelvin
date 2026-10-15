"""MyElectricalData's public grid endpoints (spec §2.3; ruling 6: no other source).

- `GET /rte/tempo/{start}/{end}` → `{"YYYY-MM-DD": "BLUE" | "WHITE" | "RED"}`;
- `GET /rte/ecowatt/{start}/{end}` → `{"YYYY-MM-DD": {value, message, detail: {hour: level}}}`;
- `GET /edf/tempo/price` → the six Tempo prices (documented in MED's OpenAPI).
The first two are public but absent from MED's OpenAPI (only their admin refresh routes are
listed): the parsers are defensive and Task 15's capture pins the shapes in docs/linky-notes.md.
No token and no PDL are sent: dates only (spec §9.3). Every call is budgeted by the caller
(`LinkySync.spend`, one ledger for every MED call).
"""

from __future__ import annotations

import json
import logging
import re
import time
from collections.abc import Callable
from datetime import date, datetime, timedelta
from importlib.metadata import PackageNotFoundError, version
from typing import Any
from zoneinfo import ZoneInfo

import httpx

from kelvin.billing.pricing import COLOURS
from kelvin.grid.models import EcowattDay, GridError, GridThrottled
from kelvin.linky.med import parse_retry_at

log = logging.getLogger(__name__)

MED_BASE_URL = "https://www.myelectricaldata.fr"
TIMEOUT_S = 10.0
MAX_BYTES = 1_000_000
# How a bare hour index in an EcoWatt `detail` is dated (days after its key), once the main
# session has compared a capture with RTE's own signal (Task 15). None: bare hours are dropped.
BARE_HOURS_OFFSET_DAYS: int | None = None
_TEMPO = {
    "BLUE": "blue",
    "WHITE": "white",
    "RED": "red",
    "BLEU": "blue",
    "BLANC": "white",
    "ROUGE": "red",
}
_PRICE_KEY = re.compile(r"(blue|white|red)_(hc|hp)", re.IGNORECASE)


def user_agent() -> str:
    try:
        return f"Kelvin/{version('kelvin')}"
    except PackageNotFoundError:
        return "Kelvin"


def _day(key: Any) -> date | None:
    try:
        return date.fromisoformat(str(key)[:10])
    except ValueError:
        return None


def parse_tempo(payload: Any, start: date, end: date) -> dict[date, str]:
    if not isinstance(payload, dict):
        raise GridError("unexpected payload")
    out: dict[date, str] = {}
    dropped = 0
    for key, value in payload.items():
        d = _day(key)
        if d is None:
            dropped += 1
            continue
        if not start <= d < end:
            continue
        colour = _TEMPO.get(value.strip().upper()) if isinstance(value, str) else None
        if colour is None:  # not published yet, or a value Kelvin does not know
            dropped += 1
            continue
        out[d] = colour
    if dropped:
        log.info("tempo: %d entries without a known colour", dropped)
    return out


def _level(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    try:
        n = int(value)
    except (TypeError, ValueError, OverflowError):  # OverflowError: an infinite float
        return None
    return n if n in (1, 2, 3) and str(value).strip() == str(n) else None


def parse_ecowatt(
    payload: Any,
    start: date,
    end: date,
    tz: ZoneInfo,
    bare_offset: int | None = BARE_HOURS_OFFSET_DAYS,
) -> dict[date, EcowattDay]:
    """A day's level is `value` under its own date key. Hours are dated by the `detail` key's own
    timestamp; a bare hour index is dated only once its convention is known (`bare_offset`)."""
    if not isinstance(payload, dict):
        raise GridError("unexpected payload")
    levels: dict[date, int] = {}
    hourly: dict[date, dict[int, int]] = {}
    dropped = 0
    for key, value in payload.items():
        d = _day(key)
        if d is None or not isinstance(value, dict):
            dropped += 1
            continue
        level = _level(value.get("value"))
        if level is None:
            dropped += 1
        elif start <= d < end:
            levels[d] = level
        detail = value.get("detail")
        if not isinstance(detail, dict):
            continue
        for hk, hv in detail.items():
            hl = _level(hv)
            if hl is None:
                continue
            try:
                ts = datetime.fromisoformat(str(hk))
            except ValueError:
                ts = None
            if ts is not None and ts.tzinfo is not None:
                local = ts.astimezone(tz)
                hourly.setdefault(local.date(), {})[local.hour] = hl
            elif bare_offset is not None and str(hk).isdigit() and 0 <= int(hk) <= 23:
                hourly.setdefault(d + timedelta(days=bare_offset), {})[int(hk)] = hl
    if dropped:
        log.info("ecowatt: %d entries without a known level", dropped)
    out: dict[date, EcowattDay] = {}
    for d, level in levels.items():
        hrs = hourly.get(d)
        out[d] = EcowattDay(d, level, tuple(hrs.get(h) for h in range(24)) if hrs else None)
    return out


def parse_tempo_prices(payload: Any) -> dict[str, float]:
    """The six Tempo prices, wherever they sit one level down; all six or an error."""
    if not isinstance(payload, dict):
        raise GridError("unexpected payload")
    found: dict[str, float] = {}
    for scope in [payload, *[v for v in payload.values() if isinstance(v, dict)]]:
        for key, value in scope.items():
            m = _PRICE_KEY.fullmatch(str(key))
            if not m or isinstance(value, bool):
                continue
            try:
                v = float(value)
            except (TypeError, ValueError):
                continue
            if 0 < v < 10:
                found[f"{m[1].lower()}_{m[2].lower()}"] = v
    keys = [f"{c}_{p}" for c in COLOURS for p in ("hc", "hp")]
    if set(keys) - set(found):
        raise GridError("incomplete tempo prices")
    return {k: found[k] for k in keys}


class MedPublicClient:
    def __init__(
        self,
        *,
        base_url: str = MED_BASE_URL,
        tz: str = "Europe/Paris",
        client: httpx.AsyncClient | None = None,
        wall: Callable[[], float] = time.time,
    ) -> None:
        self._tz = ZoneInfo(tz)
        self._wall = wall
        self._client = client or httpx.AsyncClient(base_url=base_url, timeout=TIMEOUT_S)
        self._headers = {"User-Agent": user_agent(), "Accept": "application/json"}

    async def _get(self, path: str) -> Any:
        failure: str | None = None
        status = 0
        retry_header: str | None = None
        body = b""
        try:
            async with self._client.stream("GET", path, headers=self._headers) as r:
                status = r.status_code
                retry_header = r.headers.get("Retry-After")
                async for chunk in r.aiter_bytes():
                    body += chunk
                    if len(body) > MAX_BYTES:
                        failure = "too large"
                        break
        except httpx.HTTPError as e:
            failure = type(e).__name__
        if failure == "too large":
            raise GridError("response too large")
        if failure is not None:  # raised outside the except block: no URL in __context__
            raise GridError(f"network error: {failure}")
        try:
            # Infinity/NaN (which Python's JSON accepts) read as None: no non-finite number
            # reaches a parser. Deep nesting makes the scanner recurse: an unexpected payload too.
            data = json.loads(body, parse_constant=lambda _: None) if body else None
        except (ValueError, RecursionError):
            data = None
        if status == 429:
            retry_at = None
            if retry_header and retry_header.strip().isdigit():
                retry_at = self._wall() + int(retry_header.strip())
            raise GridThrottled(retry_at or parse_retry_at(data))
        if status >= 400 or data is None:
            raise GridError(f"HTTP {status}" if status >= 400 else "unexpected payload")
        return data

    async def tempo(self, start: date, end: date) -> dict[date, str]:
        return parse_tempo(await self._get(f"/rte/tempo/{start}/{end}"), start, end)

    async def ecowatt(self, start: date, end: date) -> dict[date, EcowattDay]:
        return parse_ecowatt(await self._get(f"/rte/ecowatt/{start}/{end}"), start, end, self._tz)

    async def tempo_prices(self) -> dict[str, float]:
        return parse_tempo_prices(await self._get("/edf/tempo/price"))

    async def aclose(self) -> None:
        await self._client.aclose()
