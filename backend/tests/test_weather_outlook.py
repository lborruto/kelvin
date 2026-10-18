from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import httpx
import pytest

from kelvin.linky.models import day_bounds
from kelvin.recorder.db import Database
from kelvin.weather.client import OUTLOOK_MODEL, OpenMeteoClient
from kelvin.weather.fake import FakeWeatherSource
from kelvin.weather.models import ECMWF, Hour
from kelvin.weather.service import (
    BEST_MATCH_FORECAST_DAYS,
    FORECAST_DAYS,
    MAX_DAYS,
    OUTLOOK_TIMES,
    WeatherService,
)
from kelvin.weather.store import WeatherStore
from tests.conftest import ManualClock

TZ = ZoneInfo("Europe/Paris")
NOW = datetime(2026, 11, 18, 14, 20, tzinfo=TZ).timestamp()


def service(tmp_path, clock=None):
    clock = clock or ManualClock(NOW)
    db = Database(tmp_path / "k.db")
    store = WeatherStore(db, "Europe/Paris")
    src = FakeWeatherSource(wall=clock)
    svc = WeatherService(store, src, db=db, wall=clock)
    svc.set_location(
        lat=45.76, lon=4.84, elevation_m=173, name="Lyon", origin="search", country_code="FR"
    )
    return svc, store, src, db


async def test_forecast_asks_four_days_in_france(tmp_path):
    svc, store, src, _ = service(tmp_path)
    assert FORECAST_DAYS == 4 and BEST_MATCH_FORECAST_DAYS == 8
    await svc.forecast_job()
    a, b = day_bounds(date(2026, 11, 21), TZ)
    assert store.hours(a, b)  # forecast_days counts today: 18 … 21 November
    a, b = day_bounds(date(2026, 11, 22), TZ)
    assert store.hours(a, b) == []  # beyond: the outlook's (ECMWF), stored apart


async def test_outlook_job_stores_future_hours_apart(tmp_path):
    svc, store, src, db = service(tmp_path)
    before = svc.calls_today()
    assert await svc.outlook_job() is True
    assert svc.calls_today() == pytest.approx(before + 1.0)
    a, b = day_bounds(date(2026, 11, 25), TZ)
    hours = store.outlook(a, b)
    assert hours and all(h.model == ECMWF for h in hours)
    assert store.hours(a, b) == []  # never in weather_hourly
    assert all(h.ts >= NOW - 3600 for h in store.outlook(0, 2**40))


async def test_outlook_replaces_the_previous_fetch(tmp_path):
    svc, store, _, db = service(tmp_path)
    await svc.outlook_job()
    n = len(store.outlook(0, 2**40))
    await svc.outlook_job()
    assert len(store.outlook(0, 2**40)) == n


async def test_outlook_is_france_mode_only(tmp_path):
    svc, *_ = service(tmp_path)
    svc.set_location(lat=40.0, lon=-3.7, origin="manual")  # Madrid: best_match
    job = next(j for j in svc.jobs() if j.name == "weather_outlook")
    assert job.enabled() is False
    assert await svc.outlook_job() is False


def test_outlook_times():
    assert [t.strftime("%H:%M") for t in OUTLOOK_TIMES] == ["05:40", "11:40", "17:40", "23:40"]


def test_backfill_reaches_five_years(tmp_path):
    svc, *_ = service(tmp_path)
    today = date(2026, 11, 18)
    assert svc.backfill_start(today) == today - timedelta(days=MAX_DAYS)


def test_clear_drops_the_outlook(tmp_path):
    svc, store, *_ = service(tmp_path)
    store.ingest_outlook([Hour(int(NOW) + 7200, 3.0, None, None, ECMWF)], NOW)
    svc.clear_location()
    assert store.outlook(0, 2**40) == []


def test_signature_moves_with_data(tmp_path):
    _, store, *_ = service(tmp_path)
    s0 = store.signature()
    store.ingest_outlook([Hour(int(NOW) + 7200, 3.0, None, None, ECMWF)], NOW)
    assert store.signature() != s0


async def test_client_outlook_request_and_parse():
    seen = {}

    def handler(req: httpx.Request) -> httpx.Response:
        seen.update(dict(req.url.params), path=req.url.path)
        t0 = int(NOW) // 3600 * 3600
        return httpx.Response(
            200,
            json={
                "hourly_units": {"temperature_2m": "°C"},
                "hourly": {"time": [t0, t0 + 3600], "temperature_2m": [3.2, None]},
            },
        )

    c = OpenMeteoClient(
        client=httpx.AsyncClient(transport=httpx.MockTransport(handler)), tz="Europe/Paris"
    )
    hours = await c.outlook(_loc(), 8)
    assert seen["path"] == "/v1/forecast"
    assert seen["models"] == OUTLOOK_MODEL == "ecmwf_ifs025"
    assert seen["hourly"] == "temperature_2m" and seen["forecast_days"] == "8"
    assert "past_days" not in seen
    assert [(h.t, h.model) for h in hours] == [(3.2, ECMWF)]


def _loc():
    from kelvin.weather.models import Location

    return Location(
        "Lyon", None, None, "FR", 45.76, 4.84, 173, "geocoder", "search", "meteofrance", NOW
    )


def test_fake_day_mean_is_the_daily_rule():
    src = FakeWeatherSource()
    d = date(2026, 1, 20)
    a, b = day_bounds(d, TZ)
    ts = [src.temp_at(t) for t in range(a, b, 3600)]
    assert src.day_mean(d) == pytest.approx((min(ts) + max(ts)) / 2)
