"""Plan 13: REST and MCP read the same code (no duplicated glue)."""

from datetime import datetime
from zoneinfo import ZoneInfo

from kelvin.api import views
from tests.mcp_helpers import NOW, kelvin_app


async def test_duty_and_activity_views_are_what_the_routes_answer(tmp_path):
    async with kelvin_app(tmp_path, sync=False) as (c, app):
        rt = app.state.ctx.rt
        assert (await c.get("/api/rooms/duty")).json() == views.rooms_duty(rt, int(NOW))
        start = int(datetime(2026, 11, 20, tzinfo=ZoneInfo("Europe/Paris")).timestamp())
        r = await c.get(f"/api/rooms/p-ch1/activity?start={start}&end={int(NOW)}")
        _, rads = views.room_radiators(rt, "p-ch1")
        assert r.json() == views.room_activity(rt, [x.id for x in rads], start, int(NOW))


async def test_peek_never_settles_a_restore(tmp_path, monkeypatch):
    async with kelvin_app(tmp_path, sync=False) as (c, app):
        r = await c.post("/api/rooms/p-salon/boost", json={"temperature": 22, "duration_min": 30})
        assert r.status_code == 202
        rt = app.state.ctx.rt
        expected = rt.overrides.active()

        def boom():
            raise AssertionError("peek must not reap")

        monkeypatch.setattr(rt.overrides, "_reap", boom)
        assert rt.overrides.peek() == expected
