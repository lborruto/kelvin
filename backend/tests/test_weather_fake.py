"""The simulator's weather (spec §11): deterministic, seasonal, tagged like the real sources."""

from datetime import date, datetime
from zoneinfo import ZoneInfo

import pytest

from kelvin.weather.fake import DEMO_PLACE, FakeWeatherSource
from kelvin.weather.models import AROME_HD, ARPEGE, ERA5_LAND, Location, WeatherError
from tests.conftest import ManualClock

PARIS = ZoneInfo("Europe/Paris")
LOC = Location(
    "Lyon", None, "Rhône", "FR", 45.76, 4.84, 173, "geocoder", "search", "meteofrance", 0.0
)


def ts(y, mo, d, h=0):
    return int(datetime(y, mo, d, h, tzinfo=PARIS).timestamp())


async def test_forecast_covers_past_and_ahead_hourly():
    now = ts(2026, 11, 20, 14) + 600
    fake = FakeWeatherSource(wall=ManualClock(now))
    hours = await fake.forecast(LOC, 2, 2)
    assert hours[0].ts == ts(2026, 11, 18) and hours[-1].ts == ts(2026, 11, 21, 23)
    assert len(hours) == 96 and {h.model for h in hours} == {AROME_HD}
    longer = await fake.forecast(LOC, 2, 3)
    # Past AROME HD's ~36 h (now + 36 h = 22/11 02:10): the fallback, like the real source.
    assert {h.model for h in longer if h.ts >= ts(2026, 11, 22, 3)} == {ARPEGE}
    assert {h.model for h in longer if h.ts < ts(2026, 11, 22, 3)} == {AROME_HD}


async def test_history_is_deterministic_seasonal_and_dst_aware():
    fake = FakeWeatherSource(wall=ManualClock(ts(2026, 11, 20)))
    a = await fake.history(LOC, date(2026, 10, 25), date(2026, 10, 26), "arome_hd")
    assert len(a) == 25 and a == await fake.history(
        LOC, date(2026, 10, 25), date(2026, 10, 26), "arome_hd"
    )
    old = await fake.history(LOC, date(2021, 1, 1), date(2021, 1, 2), "era5_land")
    assert {h.model for h in old} == {ERA5_LAND}
    assert (
        await fake.history(LOC, date(2021, 1, 1), date(2021, 1, 2), "arome_hd") == []
    )  # before 2022-11-13
    assert fake.temp_at(ts(2026, 1, 20, 15)) < 10 < fake.temp_at(ts(2026, 7, 21, 15))
    night, afternoon = fake.temp_at(ts(2026, 1, 20, 5)), fake.temp_at(ts(2026, 1, 20, 15))
    assert afternoon > night


async def test_search_knows_four_public_towns_france_first():
    fake = FakeWeatherSource(wall=ManualClock(0))
    assert [p.name for p in await fake.search(" ly", "fr")] == ["Lyon"]
    assert (await fake.search("gen", "fr"))[0].country_code == "CH"
    assert await fake.search("x", "fr") == []
    assert DEMO_PLACE.name == "Lyon (simulateur)" and DEMO_PLACE.elevation_m == 173
    fake.fail["search"] = WeatherError("down")
    with pytest.raises(WeatherError):
        await fake.search("lyon", "fr")
    assert fake.calls == ["search", "search", "search", "search"]  # the failing one is recorded too
