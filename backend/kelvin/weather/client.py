"""Open-Meteo (https://open-meteo.com, data CC BY 4.0; facts verified in docs/weather-notes.md).

- forecast, France: `GET /v1/meteofrance?models=meteofrance_arome_france_hd,meteofrance_seamless`,
  AROME HD's value per hour, else seamless's (spec §2.3); elsewhere `GET /v1/forecast` (best match);
- history: AROME HD from the historical forecast API (`/v1/forecast` on its own host), ERA5-Land or
  best match from `/v1/archive`; `start_date`/`end_date` are inclusive;
- geocoding: `GET /v1/search`, on a user search only.
Hours come as `timeformat=unixtime` (epoch seconds), so DST nights are unambiguous; Kelvin builds
Paris days itself (Open-Meteo's daily aggregates use one fixed offset per answer). Only the
rounded coordinates, the elevation and dates are sent; the typed text for a search.
"""

from __future__ import annotations

import json
import math
import time
import unicodedata
from collections.abc import Callable
from datetime import date, timedelta
from typing import Any

import httpx

from kelvin.grid.client import user_agent
from kelvin.weather.dju import round_coord
from kelvin.weather.models import (
    AROME_HD,
    ARPEGE,
    BEST_MATCH,
    ERA5_LAND,
    HistoryKind,
    Hour,
    Location,
    Place,
    WeatherError,
    WeatherThrottled,
)

FORECAST_URL = "https://api.open-meteo.com"
HISTORICAL_URL = "https://historical-forecast-api.open-meteo.com"
ARCHIVE_URL = "https://archive-api.open-meteo.com"
GEOCODING_URL = "https://geocoding-api.open-meteo.com"
TIMEOUT_S = 10.0
MAX_BYTES = 2_000_000
VARIABLES = ("temperature_2m", "apparent_temperature", "relative_humidity_2m")
API_AROME_HD = "meteofrance_arome_france_hd"
API_SEAMLESS = "meteofrance_seamless"
SEARCH_COUNT = 20
SEARCH_KEEP = 8
LABEL_MAX = 80
LANGUAGES = ("fr", "en")
T_MIN_C, T_MAX_C = -60.0, 60.0  # outside this a value is a fault, not weather
_UNITS = {"temperature_2m": "°C", "apparent_temperature": "°C", "relative_humidity_2m": "%"}


def printable(s: str) -> str:
    """Without control or format characters (a label is shown and stored as text)."""
    return "".join(c for c in s if unicodedata.category(c)[0] != "C").strip()


def _num(v: Any, lo: float, hi: float) -> float | None:
    if isinstance(v, bool) or not isinstance(v, int | float):
        return None
    x = float(v)
    return x if math.isfinite(x) and lo <= x <= hi else None


def _key(var: str, api_model: str | None) -> str:
    return var if api_model is None else f"{var}_{api_model}"


def parse_hours(payload: Any, models: list[tuple[str | None, str]]) -> list[Hour]:
    """`models`: (Open-Meteo model id or None for an unsuffixed answer, Kelvin's model code), in
    order of preference. Per hour the first model with a usable temperature wins, and its own
    apparent temperature and humidity come with it. A null or implausible value is a gap."""
    if not isinstance(payload, dict):
        raise WeatherError("unexpected payload")
    block = payload.get("hourly")
    if block is None:
        return []
    if not isinstance(block, dict):
        raise WeatherError("unexpected payload")
    units = payload.get("hourly_units")
    if isinstance(units, dict):
        for api_model, _ in models:
            for var, unit in _UNITS.items():
                got = units.get(_key(var, api_model))
                if got is not None and got != unit:
                    raise WeatherError("unexpected unit")
    times = block.get("time")
    if not isinstance(times, list):
        raise WeatherError("unexpected payload")
    if any(isinstance(t, bool) or not isinstance(t, int) for t in times):
        raise WeatherError("unexpected time format")  # Kelvin asks for unixtime
    cols: dict[str, list[Any]] = {}
    for api_model, _ in models:
        for var in VARIABLES:
            k = _key(var, api_model)
            col = block.get(k, [None] * len(times))
            if not isinstance(col, list) or len(col) != len(times):
                raise WeatherError("unexpected payload")
            cols[k] = col
    out: list[Hour] = []
    for i, t in enumerate(times):
        for api_model, code in models:
            temp = _num(cols[_key("temperature_2m", api_model)][i], T_MIN_C, T_MAX_C)
            if temp is None:
                continue
            out.append(
                Hour(
                    t,
                    temp,
                    _num(
                        cols[_key("apparent_temperature", api_model)][i], T_MIN_C - 20, T_MAX_C + 20
                    ),
                    _num(cols[_key("relative_humidity_2m", api_model)][i], 0.0, 100.0),
                    code,
                )
            )
            break
    return out


def _text(v: Any) -> str | None:
    return (printable(v)[:LABEL_MAX] or None) if isinstance(v, str) else None


def parse_places(payload: Any) -> list[Place]:
    """At most SEARCH_KEEP places, French ones first (Open-Meteo's order kept inside each group),
    coordinates rounded here so a precise one never leaves the backend."""
    if not isinstance(payload, dict):
        raise WeatherError("unexpected payload")
    results = payload.get("results") or []
    if not isinstance(results, list):
        raise WeatherError("unexpected payload")
    places: list[Place] = []
    for r in results[:SEARCH_COUNT]:
        if not isinstance(r, dict):
            continue
        name = _text(r.get("name"))
        lat = _num(r.get("latitude"), -90, 90)
        lon = _num(r.get("longitude"), -180, 180)
        if not name or lat is None or lon is None:
            continue
        elev = _num(r.get("elevation"), -500, 9000)
        cc = r.get("country_code")
        places.append(
            Place(
                name,
                _text(r.get("admin1")),
                _text(r.get("admin2")),
                cc.upper() if isinstance(cc, str) and len(cc) == 2 and cc.isalpha() else None,
                round_coord(lat),
                round_coord(lon),
                round(elev) if elev is not None else None,
            )
        )
    places.sort(key=lambda p: p.country_code != "FR")  # stable: Open-Meteo's order inside
    return places[:SEARCH_KEEP]


class OpenMeteoClient:
    def __init__(
        self,
        *,
        forecast_url: str = FORECAST_URL,
        historical_url: str = HISTORICAL_URL,
        archive_url: str = ARCHIVE_URL,
        geocoding_url: str = GEOCODING_URL,
        tz: str = "Europe/Paris",
        client: httpx.AsyncClient | None = None,
        wall: Callable[[], float] = time.time,
    ) -> None:
        self._forecast = forecast_url.rstrip("/")
        self._historical = historical_url.rstrip("/")
        self._archive = archive_url.rstrip("/")
        self._geocoding = geocoding_url.rstrip("/")
        self._tz = tz
        self._wall = wall
        self._client = client or httpx.AsyncClient(timeout=TIMEOUT_S, follow_redirects=False)
        self._headers = {"User-Agent": user_agent(), "Accept": "application/json"}

    async def _get(self, url: str, params: dict[str, Any]) -> Any:
        failure: str | None = None
        status = 0
        retry_header: str | None = None
        body = b""
        try:
            async with self._client.stream("GET", url, params=params, headers=self._headers) as r:
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
            raise WeatherError("response too large")
        if failure is not None:  # raised outside the except block: no URL in __context__
            raise WeatherError(f"network error: {failure}")
        if status == 429:
            retry_at = None
            if retry_header and retry_header.strip().isdigit():
                retry_at = self._wall() + int(retry_header.strip())
            raise WeatherThrottled(retry_at)
        if status >= 400:
            raise WeatherError(f"HTTP {status}")  # never Open-Meteo's reason: it echoes inputs
        try:
            return json.loads(body, parse_constant=lambda _: None)
        except (ValueError, RecursionError):
            raise WeatherError("unexpected payload") from None

    def _base(self, loc: Location) -> dict[str, Any]:
        params: dict[str, Any] = {
            "latitude": round_coord(loc.lat),
            "longitude": round_coord(loc.lon),
        }
        if loc.elevation_m is not None:
            params["elevation"] = int(loc.elevation_m)
        params["hourly"] = ",".join(VARIABLES)
        return params

    def _tail(self) -> dict[str, Any]:
        return {"timezone": self._tz, "timeformat": "unixtime", "temperature_unit": "celsius"}

    async def forecast(self, loc: Location, past_days: int, forecast_days: int) -> list[Hour]:
        span = {"past_days": past_days, "forecast_days": forecast_days}
        if loc.mode == "meteofrance":
            params = {
                **self._base(loc),
                "models": f"{API_AROME_HD},{API_SEAMLESS}",
                **span,
                **self._tail(),
            }
            payload = await self._get(f"{self._forecast}/v1/meteofrance", params)
            return parse_hours(payload, [(API_AROME_HD, AROME_HD), (API_SEAMLESS, ARPEGE)])
        params = {**self._base(loc), **span, **self._tail()}
        return parse_hours(
            await self._get(f"{self._forecast}/v1/forecast", params), [(None, BEST_MATCH)]
        )

    async def history(self, loc: Location, start: date, end: date, kind: HistoryKind) -> list[Hour]:
        if end <= start:
            return []
        dates = {"start_date": start.isoformat(), "end_date": (end - timedelta(days=1)).isoformat()}
        if kind == "arome_hd":
            url, extra, code = f"{self._historical}/v1/forecast", {"models": API_AROME_HD}, AROME_HD
        elif kind == "era5_land":
            url, extra, code = f"{self._archive}/v1/archive", {"models": "era5_land"}, ERA5_LAND
        else:
            url, extra, code = f"{self._archive}/v1/archive", {}, BEST_MATCH
        params = {**self._base(loc), **extra, **dates, **self._tail()}
        return parse_hours(await self._get(url, params), [(None, code)])

    async def search(self, text: str, language: str) -> list[Place]:
        params = {
            "name": text,
            "count": SEARCH_COUNT,
            "language": language if language in LANGUAGES else "fr",
            "format": "json",
        }
        return parse_places(await self._get(f"{self._geocoding}/v1/search", params))

    async def aclose(self) -> None:
        await self._client.aclose()
