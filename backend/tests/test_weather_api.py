"""Weather over the API (spec §4, §7): privacy, capability, codes, events."""

import json
import logging
from datetime import datetime
from zoneinfo import ZoneInfo

from tests.mcp_helpers import NOW, kelvin_app

PARIS = ZoneInfo("Europe/Paris")
DAY0 = int(datetime(2026, 11, 20, tzinfo=PARIS).timestamp())


async def test_sauter_simulator_starts_with_its_demo_place(tmp_path):
    async with kelvin_app(tmp_path) as (c, app):
        s = (await c.get("/api/settings/weather")).json()
        assert (
            s["location"]["name"] == "Lyon (simulateur)" and s["location"]["mode"] == "meteofrance"
        )
        assert s["attribution"]["url"] == "https://open-meteo.com/"
        await app.state.ctx.rt.weather.forecast_job()
        w = (await c.get("/api/weather")).json()
        assert w["now"]["temperature_c"] is not None and w["fetch"]["state"] in ("never", "ok")
        assert "45.76" not in json.dumps(w) and "Lyon" not in json.dumps(w)


async def test_other_simulator_houses_start_without_weather(tmp_path):
    async with kelvin_app(tmp_path, house="atlantic") as (c, app):
        assert (await c.get("/api/weather")).json() is None
        assert (await c.get("/api/settings/weather")).json()["location"] is None
        assert (await c.get(f"/api/weather/hourly?start={DAY0}&end={DAY0 + 3600}")).json()[
            "points"
        ] == []
        assert app.state.ctx.rt.snapshot()["weather"] is None


async def test_put_search_and_delete(tmp_path):
    async with kelvin_app(tmp_path, house="atlantic") as (c, app):
        hits = (await c.get("/api/weather/search?q=Cham&lang=fr")).json()["results"]
        assert hits[0] == {
            "name": "Chamonix-Mont-Blanc",
            "admin1": "Auvergne-Rhône-Alpes",
            "admin2": "Haute-Savoie",
            "country_code": "FR",
            "lat": 45.92,
            "lon": 6.87,
            "elevation_m": 1035,
        }
        r = await c.put("/api/settings/weather", json={**hits[0], "origin": "search"})
        assert r.status_code == 200 and r.json()["location"]["elevation_source"] == "geocoder"
        rt = app.state.ctx.rt
        assert rt.scheduler.state["weather_forecast"]["retry_at"] is not None  # asked to run now
        await rt.weather.forecast_job()
        pts = (await c.get(f"/api/weather/hourly?start={DAY0}&end={DAY0 + 86400}")).json()["points"]
        assert pts and pts[-1]["ts"] <= NOW
        r = await c.delete("/api/settings/weather")
        assert r.status_code == 204
        assert (await c.get("/api/weather")).json() is None
        assert rt.weather.store.coverage() is None
        assert "weather_forecast" not in rt.scheduler.state


async def test_invalid_location_never_echoes_the_coordinates(tmp_path, caplog):
    caplog.set_level(logging.DEBUG)
    async with kelvin_app(tmp_path, house="atlantic") as (c, _):
        r = await c.put(
            "/api/settings/weather", json={"lat": 91.5, "lon": 4.8123, "origin": "manual"}
        )
        assert r.status_code == 422 and r.json()["code"] == "weather_location_invalid"
        assert r.json()["params"] == {} and "91.5" not in r.text and "4.8123" not in r.text
        r = await c.put(
            "/api/settings/weather", json={"lat": 45.0, "lon": 4.8, "elevation_m": 9000}
        )
        assert r.json()["code"] == "weather_elevation_invalid" and "9000" not in r.text
        r = await c.put("/api/settings/weather", json={"lat": "x", "lon": 4.8})
        assert r.status_code == 422 and "x" not in json.dumps(r.json()["params"])
        r = await c.put(
            "/api/settings/weather", json={"lat": 45.7712, "lon": 4.8901, "elevation_m": 175}
        )
        assert r.status_code == 200
    for secret in ("91.5", "4.8123", "45.77", "4.89", "45.7712"):
        assert secret not in caplog.text


async def test_mutations_need_the_header_and_search_codes(tmp_path):
    async with kelvin_app(tmp_path, house="atlantic") as (c, _):
        r = await c.put(
            "/api/settings/weather", json={"lat": 45, "lon": 4}, headers={"X-Kelvin": ""}
        )
        assert r.status_code == 403
        assert (await c.get("/api/weather/search?q=l")).json()["code"] == "weather_search_invalid"
        r = await c.get(f"/api/weather/hourly?start={DAY0}&end={DAY0 + 40 * 86400}")
        assert r.status_code == 422 and r.json()["code"] == "period_invalid"


async def test_snapshot_and_sse_carry_no_coordinates(tmp_path):
    async with kelvin_app(tmp_path) as (c, app):
        rt = app.state.ctx.rt
        q = rt.broadcaster.subscribe()
        await rt.weather.forecast_job()
        msg = q.get_nowait()
        assert msg["event"] == "weather" and json.loads(msg["data"])["now"] is not None
        assert "45.76" not in msg["data"] and "simulateur" not in msg["data"]
        snap = json.dumps(rt.snapshot())
        assert '"weather"' in snap and "45.76" not in snap and "simulateur" not in snap
        src = (await c.get("/api/status")).json()["sources"]["weather"]
        assert src["enabled"] is True and src["budget"] == 400.0
