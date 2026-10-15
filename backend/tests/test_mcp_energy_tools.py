"""Energy tools (spec MCP §3, §4.3): the report's own figures, reshaped and flagged."""

from kelvin.mcp.shape import neutral
from tests.mcp_helpers import call, data, error_code, kelvin_app

Q = "from=2026-08-01&to=2026-11-01&group=month&period_from=2026-08-01&period_to=2026-11-01"


async def test_get_energy_matches_the_rest_report(tmp_path):
    async with kelvin_app(tmp_path) as (c, app):
        rest = (await c.get(f"/api/energy?{Q}")).json()
        env = data(
            await call(
                app, "get_energy", {"start": "2026-08-01", "end": "2026-11-01", "group": "month"}
            )
        )
        d = env["data"]
        assert d["buckets"] == neutral(rest["buckets"])
        assert d["totals"] == neutral(rest["total"])
        assert d["by_radiator"] == neutral(rest["by_radiator"])
        assert d["comparison"] == neutral(rest["comparison"])


async def test_room_cost_is_the_sum_of_its_radiators(tmp_path):
    async with kelvin_app(tmp_path) as (c, app):
        rest = (await c.get(f"/api/energy?{Q}")).json()
        d = data(
            await call(
                app, "get_energy", {"start": "2026-08-01", "end": "2026-11-01", "group": "month"}
            )
        )["data"]
        for room in d["by_room"]:
            rows = [r for r in rest["by_radiator"] if r["room_id"] == room["room_id"]]
            cents = [round(r["eur"] * 100) for r in rows if r["eur"] is not None]
            assert room["cost_eur"] == (sum(cents) / 100 if cents else None)


async def test_estimated_parts_are_flagged(tmp_path):
    async with kelvin_app(tmp_path) as (c, app):
        rest = (await c.get(f"/api/energy?{Q}")).json()
        env = data(
            await call(
                app, "get_energy", {"start": "2026-08-01", "end": "2026-11-01", "group": "month"}
            )
        )
        # After one sync the simulator holds 30 days of curve: August–October are split by the
        # fallback profile.
        assert rest["total"]["estimated_split"] is True
        assert env["meta"]["basis"] == "mixed"
        assert any(n.startswith("split_estimated") for n in env["meta"]["notes"])


async def test_bounds(tmp_path):
    async with kelvin_app(tmp_path) as (c, app):
        long = {"start": "2026-01-01", "end": "2026-11-01", "group": "day"}
        assert error_code(await call(app, "get_energy", long)) == "period_invalid"
        back = {"start": "2026-11-01", "end": "2026-10-01", "group": "day"}
        assert error_code(await call(app, "get_energy", back)) == "period_invalid"


async def test_room_energy_and_day_detail_are_the_rest_bodies(tmp_path):
    async with kelvin_app(tmp_path) as (c, app):
        rest = (await c.get("/api/rooms/p-salon/energy?days=7")).json()
        d = data(await call(app, "get_room_energy", {"room_id": "p-salon", "days": 7}))["data"]
        assert d == neutral(rest)
        rest = (await c.get("/api/energy/day?date=2026-11-19")).json()
        rest.pop("room")
        d = data(await call(app, "get_day_detail", {"date": "2026-11-19"}))["data"]
        assert d == neutral(rest)
        assert (
            error_code(await call(app, "get_room_energy", {"room_id": "x", "days": 7}))
            == "room_unknown"
        )
