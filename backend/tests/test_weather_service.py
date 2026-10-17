"""WeatherService (spec §4, §5): private location, budgets, jobs, views."""

import logging
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from kelvin.errors import UserError
from kelvin.recorder.db import Database
from kelvin.scheduler import Scheduler
from kelvin.weather import service as ws
from kelvin.weather.dju import AROME_HD_SINCE
from kelvin.weather.fake import FakeWeatherSource
from kelvin.weather.models import WeatherBudgetSpent, WeatherError
from kelvin.weather.service import WeatherService
from kelvin.weather.store import WeatherStore
from tests.conftest import ManualClock

PARIS = ZoneInfo("Europe/Paris")


def at(y, mo, d, h=0, mi=0):
    return datetime(y, mo, d, h, mi, tzinfo=PARIS).timestamp()


NOW = at(2026, 11, 20, 14, 10)


def make(tmp_path, now=NOW, first=None, source=None):
    clock = ManualClock(now)
    db = Database(tmp_path / "k.db")
    src = source or FakeWeatherSource(wall=clock)
    changes: list[int] = []
    svc = WeatherService(
        WeatherStore(db, PARIS),
        src,
        db=db,
        tz=PARIS,
        wall=clock,
        first_days=lambda: list(first or []),
        on_change=lambda: changes.append(1),
    )
    return svc, src, clock, changes


def test_location_is_rounded_and_never_logged(tmp_path, caplog):
    caplog.set_level(logging.DEBUG)
    svc, _, _, changes = make(tmp_path)
    loc = svc.set_location(lat=45.7712, lon=4.8901, elevation_m=175, origin="manual")
    assert (loc.lat, loc.lon, loc.mode, loc.elevation_source) == (
        45.77,
        4.89,
        "meteofrance",
        "owner",
    )
    assert svc.location() == loc and changes == [1]
    assert "weather: location set" in caplog.text
    for secret in ("45.77", "4.89", "45.7712", "175"):
        assert secret not in caplog.text


@pytest.mark.parametrize(
    ("kw", "code"),
    [
        ({"lat": 91.5, "lon": 4.8}, "weather_location_invalid"),
        ({"lat": 45.0, "lon": float("nan")}, "weather_location_invalid"),
        ({"lat": 45.0, "lon": 4.8, "elevation_m": 5000}, "weather_elevation_invalid"),
        ({"lat": 45.0, "lon": 4.8, "country_code": "FRA"}, "weather_location_invalid"),
        ({"lat": 45.0, "lon": 4.8, "name": "x" * 81}, "weather_location_invalid"),
    ],
)
def test_invalid_locations_say_nothing_of_the_input(tmp_path, kw, code):
    svc, *_ = make(tmp_path)
    with pytest.raises(UserError) as e:
        svc.set_location(**kw)
    assert e.value.code == code and e.value.params == {}
    assert svc.location() is None


async def test_changing_the_place_clears_its_weather(tmp_path):
    svc, *_ = make(tmp_path)
    svc.set_location(lat=45.76, lon=4.84, elevation_m=173, name="Lyon", origin="search")
    await svc.forecast_job()
    assert svc.store.coverage() is not None
    svc.set_location(
        lat=45.76, lon=4.84, elevation_m=173, name="Lyon", origin="search"
    )  # same place
    assert svc.store.coverage() is not None
    svc.set_location(lat=50.63, lon=3.06, elevation_m=21, name="Lille", origin="search")
    assert svc.store.coverage() is None
    svc.clear_location()
    assert svc.location() is None and not svc.enabled() and svc.view() is None


async def test_forecast_job_fills_the_view(tmp_path):
    svc, src, clock, changes = make(tmp_path)
    assert await svc.forecast_job() is False and src.calls == []  # no place: no call
    svc.set_location(lat=45.76, lon=4.84, elevation_m=173, origin="search")
    assert await svc.forecast_job() is True
    v = svc.view()
    assert v["now"]["at"] == int(at(2026, 11, 20, 14)) and v["now"]["model"] == "arome_hd"
    assert v["now"]["temperature_c"] == src.temp_at(int(at(2026, 11, 20, 14)))
    assert v["today"]["max_at"] == int(at(2026, 11, 20, 15)) and v["today"]["max_ahead"] is True
    assert v["fetched_at"] == clock() and v["mode"] == "meteofrance"
    assert "lat" not in str(v) and "Lyon" not in str(v)
    pts = svc.hourly(int(at(2026, 11, 20)), int(at(2026, 11, 21)))["points"]
    assert pts[-1]["ts"] == int(at(2026, 11, 20, 14))  # past only on a history chart


def test_backfill_plan_sources_by_date(tmp_path):
    svc, *_ = make(tmp_path, first=[date(2021, 1, 1)])
    svc.set_location(lat=45.76, lon=4.84, origin="manual")
    today = date(2026, 11, 20)
    assert svc.backfill_start(today) == today - timedelta(days=ws.MAX_DAYS)
    plan = svc.backfill_plan()
    hd = [p for p in plan if p[0] == "arome_hd"]
    era = [p for p in plan if p[0] == "era5_land"]
    assert hd[0][2] == today and min(a for _, a, _ in hd) == AROME_HD_SINCE  # newest first
    assert all((b - a).days <= ws.CHUNK_DAYS for _, a, b in plan)
    assert max(b for _, _, b in era) == AROME_HD_SINCE and min(
        a for _, a, _ in era
    ) == svc.backfill_start(today)
    svc.set_location(lat=40.42, lon=-3.7, origin="manual")  # Madrid
    assert {k for k, _, _ in svc.backfill_plan()} == {"best_match"}


def test_backfill_start_follows_the_data(tmp_path):
    today = date(2026, 11, 20)
    svc, *_ = make(tmp_path)
    assert svc.backfill_start(today) == today - timedelta(days=ws.MIN_DAYS)
    svc, *_ = make(tmp_path / "b", first=[None, date(2026, 10, 1), date(2025, 11, 1)])
    assert svc.backfill_start(today) == date(2025, 11, 1)


async def test_backfill_stops_at_the_run_cap_and_resumes(tmp_path, monkeypatch):
    monkeypatch.setattr(ws, "BACKFILL_RUN_CAP", 10.0)
    svc, src, *_ = make(tmp_path, first=[date(2025, 11, 1)])
    svc.set_location(lat=45.76, lon=4.84, origin="manual")
    assert await svc.backfill_job() is True
    assert len([c for c in src.calls if c.startswith("history")]) == 1  # 6.6 + 6.6 > 10
    assert await svc.backfill_job() is True
    assert len([c for c in src.calls if c.startswith("history")]) == 2
    monkeypatch.setattr(ws, "BACKFILL_RUN_CAP", 300.0)
    await svc.backfill_job()
    assert svc.backfill_plan() == []  # everything since 1/11/2025 is there
    calls = len(src.calls)
    assert await svc.backfill_job() is False and len(src.calls) == calls  # nothing left: no call


async def test_era5_fills_what_arome_lacks_once_old_enough(tmp_path):
    class Holey(FakeWeatherSource):
        async def history(self, loc, start, end, kind):
            hours = await super().history(loc, start, end, kind)
            hole = datetime(2026, 11, 5, tzinfo=PARIS).timestamp()
            return [h for h in hours if kind != "arome_hd" or not hole <= h.ts < hole + 6 * 3600]

    svc, src, *_ = make(
        tmp_path, first=[date(2026, 10, 25)], source=Holey(wall=ManualClock(at(2026, 11, 20, 14)))
    )
    svc.set_location(lat=45.76, lon=4.84, origin="manual")
    await svc.backfill_job()
    assert any(c == "history:era5_land:2026-11-05:2026-11-06" for c in src.calls)
    assert svc.store.daily(date(2026, 11, 5), date(2026, 11, 6))[date(2026, 11, 5)].model == "mixed"


async def test_ledger_caps_the_day(tmp_path, monkeypatch):
    monkeypatch.setattr(ws, "DAILY_WEIGHT_CAP", 2.0)
    svc, src, clock, _ = make(tmp_path)
    svc.set_location(lat=45.76, lon=4.84, origin="manual")
    await svc.forecast_job()
    await svc.forecast_job()
    with pytest.raises(WeatherBudgetSpent):
        await svc.forecast_job()
    assert svc.calls_today() == 2.0
    clock.advance(86400)
    assert await svc.forecast_job() is True


async def test_a_job_never_stores_weather_for_a_place_changed_meanwhile(tmp_path):
    svc, src, *_ = make(tmp_path)
    svc.set_location(lat=45.76, lon=4.84, origin="manual")
    real = src.forecast

    async def slow(loc, p, f):
        hours = await real(loc, p, f)
        svc.set_location(lat=50.63, lon=3.06, origin="manual")  # the owner moved meanwhile
        return hours

    src.forecast = slow
    assert await svc.forecast_job() is False
    assert svc.store.coverage() is None


async def test_search_is_rate_limited_and_failures_are_503(tmp_path):
    svc, src, clock, _ = make(tmp_path)
    assert [p.name for p in await svc.search_places("lyo", "fr")] == ["Lyon"]
    for bad in ("l", " ", "x" * 61):
        with pytest.raises(UserError) as e:
            await svc.search_places(bad, "fr")
        assert e.value.code == "weather_search_invalid"
    for _ in range(ws.SEARCHES_PER_HOUR - 1):
        await svc.search_places("lil", "fr")
    with pytest.raises(UserError) as e:
        await svc.search_places("lil", "fr")
    assert (e.value.code, e.value.status) == ("weather_search_busy", 429)
    clock.advance(3601)
    src.fail["search"] = WeatherError("down")
    with pytest.raises(UserError) as e:
        await svc.search_places("lil", "fr")
    assert (e.value.code, e.value.status) == ("weather_unavailable", 503)


async def test_a_scheduler_day_costs_what_it_should(tmp_path):
    svc, src, clock, _ = make(tmp_path, now=at(2026, 11, 20, 0, 30), first=[date(2026, 9, 1)])
    svc.set_location(lat=45.76, lon=4.84, origin="manual")
    sched = Scheduler(svc.store.db, svc.jobs(), tz=PARIS, wall=clock)
    for _ in range(25):
        await sched.run_due()
        clock.advance(3600)
    assert src.calls.count("forecast") == 25  # the missed 00:17 at start, then 24 slots
    assert len([c for c in src.calls if c.startswith("history")]) == 1  # Sept–Nov in one chunk
    assert svc.calls_today() <= ws.DAILY_WEIGHT_CAP
    assert sched.status("weather_backfill")["state"] == "ok"


async def test_the_backfill_finalises_days_the_forecast_filled(tmp_path):
    svc, src, clock, _ = make(tmp_path, first=[date(2026, 11, 1)])
    svc.set_location(lat=45.76, lon=4.84, origin="manual")
    await svc.forecast_job()  # fills 18 and 19 November (past days), not final
    day = date(2026, 11, 18)
    assert not svc.store.daily(day, day + timedelta(days=1))[day].final
    clock.advance(4 * 86400)
    await svc.backfill_job()
    assert svc.store.daily(day, day + timedelta(days=1))[day].final


async def test_the_history_is_pending_until_every_range_was_asked(tmp_path):
    class NoOldDays(FakeWeatherSource):
        async def history(self, loc, start, end, kind):
            hours = await super().history(loc, start, end, kind)
            first = datetime(2026, 11, 5, tzinfo=PARIS).timestamp()
            return [h for h in hours if h.ts >= first]  # nothing older from any source

    svc, *_ = make(
        tmp_path,
        first=[date(2026, 10, 1)],
        source=NoOldDays(wall=ManualClock(at(2026, 11, 20, 14))),
    )
    svc.set_location(lat=45.76, lon=4.84, origin="manual")
    assert svc.settings_view()["coverage"]["pending"] is True
    await svc.backfill_job()
    cov = svc.settings_view()["coverage"]
    assert cov["pending"] is False  # asked once per source: the history ends where the data ends
    assert cov["first_day"] == "2026-11-05" and cov["from"] == "2026-10-01"
