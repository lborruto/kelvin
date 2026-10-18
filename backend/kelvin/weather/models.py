"""What Kelvin keeps from Open-Meteo (spec §4–§5).

Temperatures are °C at 2 m for the model cell of the home: model output (Météo-France AROME HD,
ARPEGE, ECMWF ERA5-Land, or Open-Meteo's best match), not a station. An hour is the epoch second
it starts; a day is a Paris civil day. The location's coordinates are private (spec §4.1)."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import date
from typing import Any, Literal, Protocol

AROME_HD = "arome_hd"
ARPEGE = "arpege"  # Open-Meteo's `meteofrance_seamless` (ARPEGE beyond AROME's reach)
ERA5_LAND = "era5_land"
BEST_MATCH = "best_match"
ECMWF = "ecmwf"  # ECMWF IFS 0.25° through Open-Meteo: forecast days 5–7 only (spec 2026-10-18 §6.2)
MIXED = "mixed"
VARIABLE_COUNT = 3  # temperature, apparent temperature, humidity
HistoryKind = Literal["arome_hd", "era5_land", "best_match"]


@dataclass(frozen=True)
class Place:
    name: str
    admin1: str | None
    admin2: str | None
    country_code: str | None
    lat: float  # rounded to 0.01° before it leaves the client
    lon: float
    elevation_m: int | None


@dataclass(frozen=True)
class Location:
    name: str | None
    admin1: str | None
    admin2: str | None
    country_code: str | None
    lat: float
    lon: float
    elevation_m: int | None
    elevation_source: Literal["geocoder", "owner", "none"]
    origin: Literal["search", "manual"]
    mode: Literal["meteofrance", "best_match"]
    set_at: float

    def to_setting(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_setting(cls, d: dict[str, Any]) -> Location:
        return cls(**{k: d.get(k) for k in cls.__dataclass_fields__})


@dataclass(frozen=True)
class Hour:
    ts: int
    t: float
    apparent: float | None
    rh: float | None  # percent, 0–100
    model: str


@dataclass(frozen=True)
class DayWeather:
    day: date
    tmin: float | None
    tmax: float | None
    tmean: float | None  # (tmin + tmax) / 2, the mean the DJU uses
    dju: float | None
    hours: int
    expected: int  # 23, 24 or 25
    model: str
    final: bool


class WeatherError(Exception):
    """Open-Meteo failed or answered something unexpected. Never carries a payload, a URL or a
    coordinate."""


class WeatherThrottled(WeatherError):
    def __init__(self, retry_at: float | None) -> None:
        super().__init__("throttled")
        self.retry_at = retry_at


class WeatherBudgetSpent(WeatherError):
    """Kelvin's own daily weather budget is spent: not a source failure."""

    quota = True


class WeatherSource(Protocol):
    async def forecast(self, loc: Location, past_days: int, forecast_days: int) -> list[Hour]: ...

    async def history(self, loc: Location, start: date, end: date, kind: HistoryKind) -> list[Hour]:
        """Hours of the Paris days [start, end) from the archive `kind`; missing hours absent."""
        ...

    async def search(self, text: str, language: str) -> list[Place]: ...

    async def aclose(self) -> None: ...
