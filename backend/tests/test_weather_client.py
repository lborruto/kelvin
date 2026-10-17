"""Open-Meteo client (spec §2.3, §3): what is sent, what is kept, what is refused."""

from datetime import date, datetime
from urllib.parse import parse_qs, urlsplit
from zoneinfo import ZoneInfo

import httpx
import pytest

from kelvin.weather.client import (
    API_AROME_HD,
    API_SEAMLESS,
    MAX_BYTES,
    OpenMeteoClient,
    parse_hours,
    parse_places,
)
from kelvin.weather.models import (
    AROME_HD,
    ARPEGE,
    BEST_MATCH,
    ERA5_LAND,
    Location,
    Place,
    WeatherError,
    WeatherThrottled,
)
from tests.conftest import ManualClock

PARIS = ZoneInfo("Europe/Paris")
LYON = Location(
    "Lyon", None, "Rhône", "FR", 45.76, 4.84, 173, "geocoder", "search", "meteofrance", 0.0
)
MADRID = Location(None, None, None, None, 40.42, -3.7, None, "none", "manual", "best_match", 0.0)


def ts(y, mo, d, h=0):
    return int(datetime(y, mo, d, h, tzinfo=PARIS).timestamp())


def multi(times, hd, seamless):
    """A two-model answer as Open-Meteo gives it: suffixed keys, nulls where a model has none."""
    return {
        "hourly_units": {
            "time": "unixtime",
            f"temperature_2m_{API_AROME_HD}": "°C",
            f"temperature_2m_{API_SEAMLESS}": "°C",
            f"relative_humidity_2m_{API_AROME_HD}": "%",
        },
        "hourly": {
            "time": times,
            f"temperature_2m_{API_AROME_HD}": hd,
            f"apparent_temperature_{API_AROME_HD}": [None if v is None else v - 2 for v in hd],
            f"relative_humidity_2m_{API_AROME_HD}": [None if v is None else 80 for v in hd],
            f"temperature_2m_{API_SEAMLESS}": seamless,
            f"apparent_temperature_{API_SEAMLESS}": [v - 3 for v in seamless],
            f"relative_humidity_2m_{API_SEAMLESS}": [70 for _ in seamless],
        },
    }


def single(times, temps, unit="°C"):
    return {
        "hourly_units": {"time": "unixtime", "temperature_2m": unit},
        "hourly": {
            "time": times,
            "temperature_2m": temps,
            "apparent_temperature": temps,
            "relative_humidity_2m": [50 for _ in temps],
        },
    }


def test_parse_hours_prefers_arome_hd_and_falls_back_per_hour():
    t = [ts(2026, 10, 17, h) for h in range(4)]
    got = parse_hours(
        multi(t, [10.0, None, 12.0, None], [9.0, 9.5, 11.0, 13.0]),
        [(API_AROME_HD, AROME_HD), (API_SEAMLESS, ARPEGE)],
    )
    assert [(h.t, h.model) for h in got] == [
        (10.0, AROME_HD),
        (9.5, ARPEGE),
        (12.0, AROME_HD),
        (13.0, ARPEGE),
    ]
    assert got[0].apparent == 8.0 and got[0].rh == 80
    assert got[1].apparent == 6.5 and got[1].rh == 70  # the same model's values, never mixed


def test_parse_hours_drops_gaps_and_refuses_bad_shapes():
    t = [ts(2026, 10, 17, h) for h in range(4)]
    got = parse_hours(single(t, [8.1, None, 99.0, True]), [(None, ERA5_LAND)])
    assert [h.ts for h in got] == [t[0]]  # a gap is a gap, never 0
    with pytest.raises(WeatherError, match="unit"):
        parse_hours(single(t, [8.0] * 4, unit="°F"), [(None, ERA5_LAND)])
    iso = single(t, [8.0] * 4)
    iso["hourly"]["time"] = ["2026-10-17T00:00"] * 4
    with pytest.raises(WeatherError, match="time format"):
        parse_hours(iso, [(None, ERA5_LAND)])
    short = single(t, [8.0] * 4)
    short["hourly"]["temperature_2m"].pop()
    with pytest.raises(WeatherError):
        parse_hours(short, [(None, ERA5_LAND)])
    with pytest.raises(WeatherError):
        parse_hours(["x"], [(None, ERA5_LAND)])
    assert parse_hours({}, [(None, ERA5_LAND)]) == []


def test_parse_places_rounds_cleans_and_puts_france_first():
    got = parse_places(
        {
            "results": [
                {
                    "name": "Genève",
                    "latitude": 46.20222,
                    "longitude": 6.14569,
                    "elevation": 375.0,
                    "country_code": "CH",
                    "admin1": "Genève",
                },
                {
                    "name": "Lyon",
                    "latitude": 45.74846,
                    "longitude": 4.84671,
                    "elevation": 173.0,
                    "country_code": "FR",
                    "admin1": "Auvergne-Rhône-Alpes",
                    "admin2": "Rhône",
                },
                {"name": "Ly\non", "latitude": 45.0, "longitude": 4.0, "country_code": "FR"},
                {"name": "Nowhere", "latitude": "45", "longitude": 4.0},
                {"name": "", "latitude": 1.0, "longitude": 1.0},
                {"name": "Far", "latitude": 91.0, "longitude": 1.0},
            ]
        }
    )
    assert got[0] == Place("Lyon", "Auvergne-Rhône-Alpes", "Rhône", "FR", 45.75, 4.85, 173)
    assert got[1] == Place("Lyon", None, None, "FR", 45.0, 4.0, None)  # control characters removed
    assert got[2].name == "Genève" and got[2].lat == 46.2 and got[2].elevation_m == 375
    assert len(got) == 3
    assert parse_places({"generationtime_ms": 0.2}) == []  # no match: no `results` key
    with pytest.raises(WeatherError):
        parse_places({"results": "Lyon"})


def client_for(handler, wall=None) -> OpenMeteoClient:
    return OpenMeteoClient(
        forecast_url="https://forecast.test",
        historical_url="https://historical.test",
        archive_url="https://archive.test",
        geocoding_url="https://geo.test",
        client=httpx.AsyncClient(transport=httpx.MockTransport(handler), timeout=10.0),
        wall=wall or ManualClock(1000.0),
    )


async def test_what_each_request_sends():
    seen: list[httpx.Request] = []
    t = [ts(2026, 10, 17, 0)]

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        if request.url.host == "geo.test":
            return httpx.Response(200, json={"results": []})
        if "models" in request.url.params and "," in request.url.params["models"]:
            return httpx.Response(200, json=multi(t, [8.0], [7.0]))
        return httpx.Response(200, json=single(t, [8.0]))

    c = client_for(handler)
    lyon_precise = Location(**{**LYON.to_setting(), "lat": 45.7712, "lon": 4.8901})
    await c.forecast(lyon_precise, 2, 2)
    await c.forecast(MADRID, 2, 2)
    await c.history(LYON, date(2025, 1, 1), date(2025, 4, 3), "arome_hd")
    await c.history(LYON, date(2021, 1, 1), date(2021, 1, 2), "era5_land")
    await c.history(MADRID, date(2025, 1, 1), date(2025, 1, 2), "best_match")
    await c.search("Lyon", "de")
    paths = [r.url.host + r.url.path for r in seen]
    assert paths == [
        "forecast.test/v1/meteofrance",
        "forecast.test/v1/forecast",
        "historical.test/v1/forecast",
        "archive.test/v1/archive",
        "archive.test/v1/archive",
        "geo.test/v1/search",
    ]
    q = [{k: v[0] for k, v in parse_qs(urlsplit(str(r.url)).query).items()} for r in seen]
    assert q[0] == {
        "latitude": "45.77",
        "longitude": "4.89",
        "elevation": "173",
        "hourly": "temperature_2m,apparent_temperature,relative_humidity_2m",
        "models": f"{API_AROME_HD},{API_SEAMLESS}",
        "past_days": "2",
        "forecast_days": "2",
        "timezone": "Europe/Paris",
        "timeformat": "unixtime",
        "temperature_unit": "celsius",
    }
    assert "models" not in q[1] and "elevation" not in q[1]  # best match, no elevation known
    assert q[2]["models"] == API_AROME_HD
    assert (q[2]["start_date"], q[2]["end_date"]) == ("2025-01-01", "2025-04-02")  # inclusive
    assert q[3]["models"] == "era5_land" and "models" not in q[4]
    assert q[5] == {"name": "Lyon", "count": "20", "language": "fr", "format": "json"}
    for r in seen:
        assert "authorization" not in r.headers and "cookie" not in r.headers
        assert r.headers["user-agent"].startswith("Kelvin")


async def test_models_are_tagged_by_source():
    t = [ts(2026, 10, 17, 0)]
    c = client_for(lambda r: httpx.Response(200, json=single(t, [8.0])))
    assert (await c.history(LYON, date(2025, 1, 1), date(2025, 1, 2), "arome_hd"))[
        0
    ].model == AROME_HD
    assert (await c.history(LYON, date(2021, 1, 1), date(2021, 1, 2), "era5_land"))[
        0
    ].model == ERA5_LAND
    assert (await c.forecast(MADRID, 2, 2))[0].model == BEST_MATCH


async def test_failures_are_weather_errors_without_url_or_coordinates():
    clock = ManualClock(1000.0)
    c = client_for(lambda r: httpx.Response(429, headers={"Retry-After": "120"}), wall=clock)
    with pytest.raises(WeatherThrottled) as e:
        await c.forecast(LYON, 2, 2)
    assert e.value.retry_at == 1120.0
    big = client_for(lambda r: httpx.Response(200, content=b" " * (MAX_BYTES + 1)))
    with pytest.raises(WeatherError, match="too large"):
        await big.forecast(LYON, 2, 2)
    bad = {"error": True, "reason": "Latitude must be in range of -90 to 90°. Given: 91.5."}
    with pytest.raises(WeatherError) as e:
        await client_for(lambda r: httpx.Response(400, json=bad)).forecast(LYON, 2, 2)
    assert str(e.value) == "HTTP 400" and "91.5" not in repr(e.value)
    with pytest.raises(WeatherError):
        await client_for(lambda r: httpx.Response(200, content=b"<html>")).forecast(LYON, 2, 2)

    def down(request):
        raise httpx.ConnectError("boom", request=request)

    with pytest.raises(WeatherError) as e:
        await client_for(down).search("Lyon", "fr")
    assert "geo.test" not in str(e.value) and "45.76" not in str(e.value)
    assert e.value.__cause__ is None and e.value.__context__ is None
    empty = client_for(lambda r: pytest.fail("no call for an empty range"))
    assert await empty.history(LYON, date(2026, 1, 2), date(2026, 1, 2), "arome_hd") == []
