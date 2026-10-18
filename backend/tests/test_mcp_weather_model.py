from tests.mcp_helpers import call, data, error_code, kelvin_app

COUPLED = {"kelvin_sim_history_days": 45, "kelvin_sim_weather_coupling": True}


async def test_get_weather_model_shape(tmp_path):
    async with kelvin_app(tmp_path, **COUPLED) as (_, app):
        rt = app.state.ctx.rt
        await rt.weather.backfill_job()
        await rt.weather.forecast_job()
        await rt.weather.outlook_job()
        calls_before = list(rt.weather.source.calls)
        env = data(await call(app, "get_weather_model", {"include_days": True}))
        assert rt.weather.source.calls == calls_before  # never a fetch
        assert env["meta"]["basis"] == "estimated"
        d = env["data"]
        assert d["location_set"] is True and d["state"] == "ok"
        assert {
            "why",
            "estimate_reasons",
            "balance_point_c",
            "kwh_per_degree_c",
            "kwh_per_degree_c_range",
            "eur_per_degree_c",
            "rooms",
            "forecast",
            "interval_level_share",
            "window",
            "days",
        } <= set(d)
        assert d["interval_level_share"] == 0.8
        assert all("room_name" in r for r in d["rooms"])
        assert all(
            {"kwh_low", "kwh_high", "eur_missing_reason"} <= set(x) for x in d["forecast"]["days"]
        )
        assert not any("hc" in k.split("_") for p in d["days"] for k in p)  # neutral keys


async def test_get_weather_model_without_a_place(tmp_path):
    async with kelvin_app(tmp_path) as (_, app):
        app.state.ctx.rt.weather.clear_location()
        env = data(await call(app, "get_weather_model", {}))
        assert env["meta"]["basis"] == "unknown"
        d = env["data"]
        assert d["location_set"] is False and d["state"] == "hidden" and d["why"] == "weather_off"


async def test_get_weather_model_bounds(tmp_path):
    async with kelvin_app(tmp_path) as (_, app):
        one = {"start": "2026-10-01"}
        assert error_code(await call(app, "get_weather_model", one)) == "period_invalid"
        long = {"start": "2020-01-01", "end": "2026-01-01"}
        assert error_code(await call(app, "get_weather_model", long)) == "period_invalid"


async def test_get_room_energy_carries_the_room_model(tmp_path):
    async with kelvin_app(tmp_path) as (_, app):
        rt = app.state.ctx.rt
        room = next(r for r in rt.house.rooms if rt.house.room_radiators(r))
        d = data(await call(app, "get_room_energy", {"room_id": room, "days": 7}))["data"]
        assert d["weather"]["room_id"] == room and "balance_point_c" in d["weather"]
