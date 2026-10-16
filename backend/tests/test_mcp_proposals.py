"""Proposals (spec MCP §6): measured exposure, labelled estimates, never a promise."""

import json
from datetime import datetime

from kelvin.mcp.proposals import (
    PROMISE_WORDS,
    HouseFacts,
    RoomFacts,
    build_proposals,
    check_week,
    programme_estimate,
    review_setpoints,
    shift_to_offpeak,
    tempo_red_days,
)
from tests.mcp_helpers import PARIS, call, data, error_code, kelvin_app


def house(**over) -> HouseFacts:
    base = dict(
        days=30,
        option="hchp",
        rates={"hc": 0.2068, "hp": 0.27},
        tempo_rows=None,
        tempo_days=None,
        tomorrow_colour=None,
        tempo_hours=None,
        coverage_share=1.0,
        missing_days=0,
        linky_last_day="2026-11-19",
    )
    return HouseFacts(**{**base, **over})


def salon(**over) -> RoomFacts:
    base = dict(
        room_id="p-salon",
        name="Salon",
        peak_kwh=80.0,
        offpeak_kwh=40.0,
        cost_eur=30.5,
        coverage_share=1.0,
        comfort_c=20.0,
        eco_c=17.0,
        heating_hours=60.0,
        radiators=[{"radiator_id": "r1", "temp_avg_c": 19.4, "setpoint_avg_c": 19.0}],
        manual_setpoint=True,
        in_programme=True,
        peak_share=0.75,
        comfort_minutes=2520,
    )
    return RoomFacts(**{**base, **over})


def test_shift_to_offpeak_upper_bound():
    p = shift_to_offpeak(house(), salon())
    assert p["kind"] == "shift_to_offpeak" and p["scope"] == {"room_id": "p-salon"}
    assert p["figures"]["price_gap_eur_per_kwh"] == 0.0632
    assert p["estimate"] == {
        "upper_bound_eur": 5.06,
        "period_days": 30,
        "basis": "estimated",
        "why": None,
    }
    assert "same_consumption" in p["assumptions"] and p["basis"] == "estimated"
    assert shift_to_offpeak(house(option="base"), salon()) is None
    assert shift_to_offpeak(house(), salon(peak_kwh=0.0)) is None


def test_tempo_red_days_plan():
    rates = {"blue_hc": 0.1296, "blue_hp": 0.1609, "red_hc": 0.1568, "red_hp": 0.7562}
    rows = [
        {"key": "red_hp", "kwh": 20.0, "eur": 15.12},
        {"key": "red_hc", "kwh": 8.0, "eur": 1.25},
    ]
    h = house(
        option="tempo",
        rates=rates,
        tempo_rows=rows,
        tempo_days={"blue": 20, "white": 4, "red": 2, "unknown": 0},
        tomorrow_colour="red",
        tempo_hours={"hc_start": "22:00", "hc_end": "06:00"},
    )
    p = tempo_red_days(h)
    assert p["figures"]["red_days"] == 2 and p["figures"]["tomorrow_colour"] == "red"
    assert p["estimate"]["upper_bound_eur"] == round(20.0 * (0.7562 - 0.1568), 2)
    assert (
        tempo_red_days(
            house(option="tempo", rates=rates, tempo_days={"red": 0}, tomorrow_colour="blue")
        )
        is None
    )


def test_setpoint_review_has_no_estimate():
    p = review_setpoints(house(), salon())
    assert p["estimate"] == {"upper_bound_eur": None, "why": "no_thermal_model"}
    assert p["basis"] == "measured"


def test_no_promise_words():
    rows = [{"key": "red_hp", "kwh": 20.0, "eur": 15.0}]
    for h in (
        house(),
        house(
            option="tempo",
            rates={"red_hp": 0.75, "red_hc": 0.15},
            tempo_rows=rows,
            tempo_days={"red": 2},
            tomorrow_colour="red",
            coverage_share=0.5,
            missing_days=3,
        ),
    ):
        text = json.dumps(build_proposals(h, [salon()]))
        assert not PROMISE_WORDS.search(text), text


def test_build_orders_gaps_first_then_by_money():
    rooms = [salon(), salon(room_id="p-ch1", name="Chambre 1", peak_kwh=10.0, cost_eur=5.0)]
    kinds = [p["kind"] for p in build_proposals(house(coverage_share=0.5), rooms)]
    assert kinds[0] == "data_gaps"
    shifts = [p for p in build_proposals(house(), rooms) if p["kind"] == "shift_to_offpeak"]
    assert [p["scope"]["room_id"] for p in shifts] == ["p-salon", "p-ch1"]


def test_check_week():
    week = {
        "monday": [{"start": "06:00", "end": "08:00"}, {"start": "07:00", "end": "09:00"}],
        "tuesday": [{"start": "06:10", "end": "23:50"}],
        "funday": [],
        "saturday": [{"start": "06:00", "end": "08:00"}],
    }
    codes = {(p["day"], p["code"]) for p in check_week(week, {"saturday": "unrecognised"})}
    assert ("monday", "program_overlap") in codes
    assert ("tuesday", "not_quarter_hour") in codes
    assert ("tuesday", "editor_end_after_2345") in codes
    assert ("funday", "day_unknown") in codes
    assert ("saturday", "day_locked") in codes


def test_programme_estimate():
    e = programme_estimate(
        option="hchp",
        rates={"hc": 0.2, "hp": 0.27},
        peak_kwh=40.0,
        before_peak_minutes=600,
        after_peak_minutes=300,
        days=30,
    )
    assert e["estimated_eur"] == round(40.0 * 0.5 * 0.07, 2)
    assert "consumption_proportional_to_comfort_minutes" in e["assumptions"]
    assert (
        programme_estimate(
            option="base",
            rates={},
            peak_kwh=40.0,
            before_peak_minutes=600,
            after_peak_minutes=0,
            days=30,
        )["estimated_eur"]
        is None
    )


async def test_propose_savings_on_the_simulator(tmp_path):
    async with kelvin_app(tmp_path) as (c, app):
        env = data(await call(app, "propose_savings", {"days": 30}))
        d = env["data"]
        assert d["window_days"] == 30 and d["applies_nothing"] is True
        for p in d["proposals"]:
            assert {
                "kind",
                "scope",
                "title",
                "rationale",
                "basis",
                "figures",
                "estimate",
                "assumptions",
                "apply_in_app",
            } <= set(p)
        assert not PROMISE_WORDS.search(json.dumps(d))


async def test_evaluate_programme_sends_nothing(tmp_path, monkeypatch):
    async with kelvin_app(tmp_path) as (c, app):
        rt = app.state.ctx.rt
        sent = []
        monkeypatch.setattr(rt.gateway, "execute", lambda *a, **k: sent.append(a))
        before = {r.id: dict(r.program) for r in rt.house.radiators.values()}
        week = {"monday": [{"start": "05:00", "end": "06:00"}, {"start": "22:00", "end": "23:00"}]}
        d = data(await call(app, "evaluate_programme", {"room_id": "p-salon", "week": week}))[
            "data"
        ]
        assert d["sent"] is False and d["valid"] is True
        assert {"before", "after"} <= set(d["radiators"][0])
        assert sent == [] and before == {r.id: dict(r.program) for r in rt.house.radiators.values()}
        bad = {"room_id": "nope", "week": week}
        assert error_code(await call(app, "evaluate_programme", bad)) == "room_unknown"


SEVEN_AM = datetime(2026, 11, 20, 7, 0, tzinfo=PARIS).timestamp()


def _room_sums(rows, room_id):
    mine = [r for r in rows if r["room_id"] == room_id]
    peak = [r["hp_kwh"] for r in mine if r["hp_kwh"] is not None]
    cents = [round(r["eur"] * 100) for r in mine if r["eur"] is not None]
    return (round(sum(peak), 3) if peak else None), (sum(cents) / 100 if cents else None)


async def _by_radiator(c, a, z):
    q = f"from={a}&to={z}&group=day&period_from={a}&period_to={z}"
    return (await c.get(f"/api/energy?{q}")).json()["by_radiator"]


async def test_room_figures_cover_the_declared_window(tmp_path):
    """Review I-2: at 07:00 a room's figures are the declared [from, to) window's, as
    GET /api/energy gives them, never the last `days` days with this morning in."""
    async with kelvin_app(tmp_path, now=SEVEN_AM) as (c, app):
        d = data(await call(app, "propose_savings", {"days": 30}))["data"]
        a, z = d["from_date"], d["to_date_exclusive"]
        assert (a, z) == ("2026-10-21", "2026-11-20")
        rest = await _by_radiator(c, a, z)
        rooms = [
            p for p in d["proposals"] if "room_id" in p["scope"] and "cost_eur" in p["figures"]
        ]
        assert rooms, d["proposals"]
        for p in rooms:
            peak, eur = _room_sums(rest, p["scope"]["room_id"])
            assert p["figures"]["cost_eur"] == eur, p["kind"]
            if "peak_kwh" in p["figures"]:
                assert p["figures"]["peak_kwh"] == peak, p["kind"]
        week = {"monday": [{"start": "05:00", "end": "06:00"}]}
        e = data(await call(app, "evaluate_programme", {"room_id": "p-salon", "week": week}))
        m = e["data"]["measured"]
        rest = await _by_radiator(c, m["from_date"], m["to_date_exclusive"])
        assert m["to_date_exclusive"] == "2026-11-20" and m["days"] == 30
        assert m["peak_kwh"] == _room_sums(rest, "p-salon")[0]


async def test_setpoint_reviews_only_for_rooms_in_manual_mode(tmp_path):
    async with kelvin_app(tmp_path) as (c, app):
        rt = app.state.ctx.rt
        d = data(await call(app, "propose_savings", {"days": 30}))["data"]
        for p in d["proposals"]:
            if p["kind"] == "review_setpoints":
                rads = rt.house.room_radiators(p["scope"]["room_id"])
                assert any(r.mode == "manual" for r in rads), p["scope"]
