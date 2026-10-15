"""History, alerts, grid and tariff tools (spec MCP §3) against the services they read."""

from datetime import date, timedelta

from kelvin.billing.slots import Slot
from kelvin.billing.tariff import ALL_MONTHS, HcSchedule, HcVariant, PriceRow, Prices, Tariff
from kelvin.mcp.shape import neutral
from tests.mcp_helpers import NOW, call, data, error_code, kelvin_app

TEMPO = {
    "blue_hc": 0.1296,
    "blue_hp": 0.1609,
    "white_hc": 0.1486,
    "white_hp": 0.1894,
    "red_hc": 0.1568,
    "red_hp": 0.7562,
}


def tempo_tariff() -> Tariff:
    return Tariff.build(
        9,
        [
            Prices(date(2026, 1, 1), 15.0, 0.2, 0.27),
            PriceRow.make(date(2026, 11, 1), "tempo", 15.6, TEMPO),
        ],
        [HcSchedule(date(2026, 1, 1), (HcVariant(ALL_MONTHS, (Slot("22:00", "06:00"),)),))],
    )


async def test_history_matches_the_recorder(tmp_path):
    async with kelvin_app(tmp_path, sync=False) as (c, app):
        rt = app.state.ctx.rt
        args = {
            "room_id": "p-salon",
            "start": "2026-11-19T00:00:00",
            "end": "2026-11-20T00:00:00",
            "step_minutes": 60,
        }
        d = data(await call(app, "get_temperature_history", args))["data"]
        ids = [r.id for r in rt.house.room_radiators("p-salon")]
        rows = rt.recorder.history(ids, NOW - 38 * 3600, NOW - 14 * 3600, 3600)
        assert d["columns"] == ["at", "temperature_c", "effective_setpoint_c", "target_c"]
        got = {s["radiator_id"]: len(s["rows"]) for s in d["series"]}
        for rid in ids:
            assert got[rid] == sum(1 for x in rows if x["radiator_id"] == rid)
        too_long = {**args, "start": "2026-01-01T00:00:00", "step_minutes": 5}
        assert error_code(await call(app, "get_temperature_history", too_long)) == "period_invalid"
        none = {**args, "room_id": None, "radiator_ids": ["nope"]}
        assert error_code(await call(app, "get_temperature_history", none)) == "radiator_unknown"


async def test_alerts_are_the_store_listing(tmp_path):
    async with kelvin_app(tmp_path, sync=False) as (c, app):
        rt = app.state.ctx.rt
        rt.alerts.evaluate()  # test setup: let the rules run once at NOW
        d = data(await call(app, "get_alerts", {"state": "all"}))["data"]
        listing = rt.alerts.store.listing("all")
        assert [a["alert_id"] for a in d["alerts"]] == [a["id"] for a in listing]
        assert [a["kind"] for a in d["alerts"]] == [a["kind"] for a in listing]


async def test_grid_without_and_with_a_tempo_row(tmp_path):
    async with kelvin_app(tmp_path) as (c, app):
        rt = app.state.ctx.rt
        d = data(await call(app, "get_grid_signals"))["data"]
        if "tempo" not in rt.linky.tariffs.get().options():
            assert (
                d["tempo_tariff"] is False and d["tempo_days"] == [] and d["tempo_counts"] is None
            )
        rt.linky.tariffs.replace(tempo_tariff())  # test setup
        colours = {
            date(2026, 11, 1) + timedelta(days=i): ("blue", "white", "red")[i % 3]
            for i in range(19)
        }
        rt.grid.store.tempo_colours = lambda a, b: {k: v for k, v in colours.items() if a <= k < b}
        d = data(await call(app, "get_grid_signals", {"start": "2026-11-01", "end": "2026-11-20"}))[
            "data"
        ]
        assert d["tempo_tariff"] is True
        assert d["tempo_counts"] == {"blue": 7, "white": 6, "red": 6}
        bad = {"start": "2026-11-20", "end": "2026-11-01"}
        assert error_code(await call(app, "get_grid_signals", bad)) == "period_invalid"


async def test_tariff_is_neutral_and_has_no_pdl(tmp_path):
    async with kelvin_app(tmp_path) as (c, app):
        rt = app.state.ctx.rt
        d = data(await call(app, "get_tariff"))["data"]
        assert d["tariff"] == neutral(rt.linky.tariffs.get().view())
        assert d["option_today"] == rt.linky.tariffs.get().option_on(date(2026, 11, 20))
        assert "prm" not in str(d)
