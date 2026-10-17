"""Spec §9: get_weather reads the store only; no place ever leaves; energy carries outdoor."""

import json

from tests.mcp_helpers import call, data, error_code, kelvin_app

COORD_KEYS = {
    "lat",
    "lon",
    "latitude",
    "longitude",
    "elevation",
    "elevation_m",
    "name",
    "admin1",
    "admin2",
}


def keys(x):
    if isinstance(x, dict):
        return set(x) | {k for v in x.values() for k in keys(v)}
    if isinstance(x, list):
        return {k for v in x for k in keys(v)}
    return set()


async def test_get_weather_daily_and_hourly(tmp_path):
    async with kelvin_app(tmp_path) as (c, app):
        rt = app.state.ctx.rt
        await rt.weather.forecast_job()
        await rt.weather.backfill_job()
        calls_before = list(rt.weather.source.calls)
        d = data(await call(app, "get_weather", {"start": "2026-11-01", "end": "2026-11-20"}))
        assert d["meta"]["basis"] == "published"
        body = d["data"]
        assert body["location_set"] is True and body["dju_base_c"] == 18.0
        assert len(body["days"]) == 19 and body["days"][0]["heating_degree_days"] is not None
        h = data(
            await call(
                app,
                "get_weather",
                {"start": "2026-11-19", "end": "2026-11-21", "granularity": "hourly"},
            )
        )
        hours = h["data"]["hours"]
        assert hours and any(x["forecast"] for x in hours) and 0 <= hours[0]["humidity_share"] <= 1
        assert rt.weather.source.calls == calls_before  # never a fetch
        assert not keys(body) & COORD_KEYS and not keys(h["data"]) & COORD_KEYS
        assert "45.76" not in json.dumps(d) and "simulateur" not in json.dumps(d)


async def test_get_weather_without_a_place_and_bounds(tmp_path):
    async with kelvin_app(tmp_path, house="atlantic") as (c, app):
        d = data(await call(app, "get_weather", {"start": "2026-11-01", "end": "2026-11-20"}))
        assert (
            d["data"]["location_set"] is False
            and d["data"]["days"] == []
            and d["meta"]["basis"] == "unknown"
        )
        r = await call(
            app,
            "get_weather",
            {"start": "2026-09-01", "end": "2026-11-20", "granularity": "hourly"},
        )
        assert error_code(r) == "period_invalid"


async def test_energy_buckets_carry_outdoor_and_status_says_set(tmp_path):
    async with kelvin_app(tmp_path) as (c, app):
        rt = app.state.ctx.rt
        await rt.weather.forecast_job()
        await rt.weather.backfill_job()
        e = data(
            await call(
                app, "get_energy", {"start": "2026-11-01", "end": "2026-11-20", "group": "day"}
            )
        )
        b = e["data"]["buckets"][9]
        assert set(b["outdoor"]) == {
            "mean_c",
            "min_c",
            "max_c",
            "heating_degree_days",
            "days_with_weather",
            "elapsed_days",
        }
        ly = e["data"]["comparison"]["last_year"]
        assert ly is None or "weather_normalised" in ly
        s = data(await call(app, "get_data_status"))["data"]["weather"]
        assert s["location_set"] is True and s["mode"] == "meteofrance" and not keys(s) & COORD_KEYS
