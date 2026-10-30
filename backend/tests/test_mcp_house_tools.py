"""House tools (spec MCP §3) on the simulator: the same facts the app shows."""

from datetime import date

from kelvin.api import views
from kelvin.billing.overlap import week_overlap
from kelvin.mcp.shape import UNITS
from tests.mcp_helpers import NOW, call, data, error_code, kelvin_app


def _keys(v):
    if isinstance(v, dict):
        for k, x in v.items():
            yield k
            yield from _keys(x)
    elif isinstance(v, list):
        for x in v:
            yield from _keys(x)


async def test_get_overview(tmp_path):
    async with kelvin_app(tmp_path, sync=False) as (c, app):
        rt = app.state.ctx.rt
        env = data(await call(app, "get_overview"))
        assert env["meta"]["units"] == UNITS and env["meta"]["basis"] == "measured"
        rooms = {r["room_id"]: r for r in env["data"]["rooms"]}
        assert {"p-ch1", "p-salon", "p-ch2"} <= set(rooms)
        assert rooms["p-salon"]["name"] == rt.house.room_view("p-salon")["name"]
        assert rooms["p-salon"]["temperature_c"] == rt.house.room_view("p-salon")["temperature"]
        assert env["data"]["overrides"] == []
        assert not {"hc", "hp"} & {t for k in _keys(env) for t in k.split("_")}
        await c.post("/api/rooms/p-salon/boost", json={"temperature": 22, "duration_min": 30})
        env = data(await call(app, "get_overview"))
        (o,) = env["data"]["overrides"]
        assert o["kind"] == "boost" and o["room_id"] == "p-salon" and o["temperature_c"] == 22
        assert o["ends_at"].startswith("2026-11-20T14:30") and o["open_ended"] is False


async def test_get_overview_open_ended_away(tmp_path):
    async with kelvin_app(tmp_path, sync=False) as (c, app):
        r = await c.post("/api/house/away", json={"until": None, "temperature": 12})
        assert r.status_code == 202
        env = data(await call(app, "get_overview"))
        (o,) = env["data"]["overrides"]
        assert o["kind"] == "away" and o["ends_at"] is None and o["open_ended"] is True


async def test_get_room(tmp_path):
    async with kelvin_app(tmp_path, sync=False) as (c, app):
        rt = app.state.ctx.rt
        env = data(await call(app, "get_room", {"room_id": "p-ch1"}))
        d = env["data"]
        _, rads = views.room_radiators(rt, "p-ch1")
        assert [r["radiator_id"] for r in d["radiators"]] == [r.id for r in rads]
        r0, v0 = d["radiators"][0], rads[0].view()
        assert r0["temperature_c"] == v0["temperature"] and r0["comfort_c"] == v0["comfort"]
        assert r0["mode"] == v0["mode"] and r0["power_w"] == v0["power_w"]
        # Sauter's eco lowering as verified on hardware: 1 refused, so [2, 8].
        assert r0["capabilities"]["eco"] == [2.0, 8.0]
        duty = views.rooms_duty(rt, int(NOW))["rooms"]["p-ch1"]
        assert d["heating_duty_24h_share"] == duty["duty"]
        midnight = int(NOW) - 14 * 3600
        act = views.room_activity(rt, [r.id for r in rads], midnight, int(NOW))
        assert len(d["today_window_open"]) == len(act["window"])
        assert any("lifetime counter" in n for n in env["meta"]["notes"])  # review M-7
        assert error_code(await call(app, "get_room", {"room_id": "nope"})) == "room_unknown"


async def test_get_programmes(tmp_path):
    async with kelvin_app(tmp_path, sync=False) as (c, app):
        rt = app.state.ctx.rt
        env = data(await call(app, "get_programmes", {"room_id": "p-ch1"}))
        d = env["data"]
        assert d["week_of_date"] == "2026-11-16"  # the Monday of NOW's week
        assert set(d["offpeak_hours"]) == {
            "monday",
            "tuesday",
            "wednesday",
            "thursday",
            "friday",
            "saturday",
            "sunday",
        }
        tariff = rt.linky.tariffs.get()
        for item in d["radiators"]:
            r = rt.house.radiators[item["radiator_id"]]
            assert item["programme"] == {k: r.program.get(k) for k in item["programme"]}
            assert item["locked_days"] == dict(r.program_locked)
            ov = (
                week_overlap(date(2026, 11, 16), r.program, tariff) if r.mode == "program" else None
            )
            assert item["comfort_peak_share"] == (ov.share if ov else None)
        locked = {x["radiator_id"]: x["locked_days"] for x in d["radiators"]}
        assert any(v.get("saturday") == "unrecognised" for v in locked.values())
        assert any(v.get("sunday") == "midnight" for v in locked.values())
        all_rooms = data(await call(app, "get_programmes"))["data"]["radiators"]
        assert len(all_rooms) == sum(
            1 for r in rt.house.radiators.values() if r.capabilities.program
        )
