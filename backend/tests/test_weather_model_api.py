from contextlib import asynccontextmanager

from tests.mcp_helpers import kelvin_app  # its NOW: Friday 2026-11-20 14:00, the heating season

COUPLED = {"kelvin_sim_history_days": 45, "kelvin_sim_weather_coupling": True}


@asynccontextmanager
async def demo(tmp_path, *, coupled=True, fetched=True):
    """The Sauter demo (its weather place seeded), Linky synced, the weather jobs run once."""
    async with kelvin_app(tmp_path, **(COUPLED if coupled else {})) as (client, app):
        rt = app.state.ctx.rt
        if fetched:
            await rt.weather.backfill_job()
            await rt.weather.forecast_job()
            await rt.weather.outlook_job()
        yield client, rt


def a_room(rt):
    return next(r for r in rt.house.rooms if rt.house.room_radiators(r))


async def test_weather_model_on_the_demo_house(tmp_path):
    async with demo(tmp_path) as (client, rt):
        r = await client.get("/api/energy/weather")
        assert r.status_code == 200
        v = r.json()
        h = v["house"]
        assert h["state"] == "ok", h["why"]
        assert 8.5 <= h["baseload_kwh_day"] <= 10.7  # the simulator's 9.6 ± noise
        assert 1.9 <= h["kwh_per_c"] <= 2.7  # its 2.3
        assert h["excluded"]["away"] == 3
        assert v["forecast"]["state"] == "ok" and len(v["forecast"]["days"]) == 7
        assert all(d["complete"] for d in v["forecast"]["days"])
        assert v["price"] is not None
        assert h["eur_per_c"] == round(h["kwh_per_c"] * v["price"]["eur_kwh"], 2)
        assert any(i["state"] == "ok" for i in v["rooms"]["items"])


async def test_period_query_and_bounds(tmp_path):
    async with demo(tmp_path, fetched=False) as (client, rt):
        ok = await client.get("/api/energy/weather?from=2026-10-01&to=2026-11-01")
        assert ok.status_code == 200 and ok.json()["period"] == {
            "from": "2026-10-01",
            "to": "2026-11-01",
        }
        assert (await client.get("/api/energy/weather?from=2026-10-01")).status_code == 422
        assert (
            await client.get("/api/energy/weather?from=2026-11-01&to=2026-10-01")
        ).status_code == 422


async def test_forecast_endpoint_is_light(tmp_path):
    async with demo(tmp_path) as (client, rt):
        v = (await client.get("/api/energy/weather/forecast")).json()
        assert set(v) == {"computed_at", "level", "price", "house", "forecast"}
        assert not {"line", "points", "period_share"} & set(v["house"])


async def test_room_energy_carries_its_weather(tmp_path):
    async with demo(tmp_path) as (client, rt):
        room = a_room(rt)
        w = (await client.get(f"/api/rooms/{room}/energy?days=7")).json()["weather"]
        assert w["room_id"] == room and "balance_point_c" in w and "coverage" in w


async def test_weather_off_hides_everything(tmp_path):
    async with demo(tmp_path, coupled=False, fetched=False) as (client, rt):
        assert (await client.delete("/api/settings/weather")).status_code == 204
        v = (await client.get("/api/energy/weather")).json()
        assert v["house"]["why"] == "weather_off" and v["forecast"]["why"] == "weather_off"
        assert (await client.get(f"/api/rooms/{a_room(rt)}/energy?days=1")).json()[
            "weather"
        ] is None
        rep = (await client.get("/api/energy?from=2026-11-01&to=2026-12-01&group=day")).json()
        assert rep["projection"]["month"]["weather"] is None


async def test_projection_month_is_weather_aware(tmp_path):
    async with demo(tmp_path) as (client, rt):
        rep = (await client.get("/api/energy?from=2026-11-01&to=2026-12-01&group=day")).json()
        m = rep["projection"]["month"]
        assert m["method"] == "weather", m["weather"]
        assert m["weather"]["kwh_lo"] < m["kwh"] < m["weather"]["kwh_hi"]


async def test_the_model_is_memoised(tmp_path, monkeypatch):
    import kelvin.linky.service as S

    async with demo(tmp_path) as (client, rt):
        calls = []
        real = S.build
        monkeypatch.setattr(S, "build", lambda inp: calls.append(1) or real(inp))
        await client.get("/api/energy/weather?from=2026-10-01&to=2026-11-01")
        await client.get("/api/energy/weather?from=2026-11-01&to=2026-12-01")
        await client.get("/api/energy/weather/forecast")
        assert len(calls) == 1  # one core, three periods and views


async def test_a_place_change_reaches_the_model_at_once(tmp_path):
    """Review: the memo key holds weather_on(), so removing (or setting) a place takes effect
    without waiting for the next hour."""
    async with demo(tmp_path, coupled=False, fetched=False) as (client, rt):
        assert (await client.get("/api/energy/weather")).json()["house"]["why"] != "weather_off"
        rt.weather.clear_location()
        assert (await client.get("/api/energy/weather")).json()["house"]["why"] == "weather_off"
