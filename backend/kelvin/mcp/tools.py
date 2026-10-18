"""The MCP tools (spec MCP §3): read-only views over Kelvin's services, in the §4 envelope.
Builders take the AppContext and return an envelope; the Runner wraps every call."""

from __future__ import annotations

import asyncio
from collections import Counter
from datetime import date, datetime, timedelta
from typing import Annotated, Any, Literal
from zoneinfo import ZoneInfo

from mcp.server.mcpserver import MCPServer
from mcp.types import ToolAnnotations
from pydantic import Field

from kelvin.api import bounds, views
from kelvin.api.auth_routes import status_word
from kelvin.api.runtime import sources
from kelvin.billing.overlap import day_ranges, week_overlap
from kelvin.billing.room_energy import MAX_ROOM_DAYS
from kelvin.errors import UserError
from kelvin.house.model import DAY_ORDER
from kelvin.linky.models import day_bounds
from kelvin.mcp import energy as en
from kelvin.mcp import proposals as pr
from kelvin.mcp import shape
from kelvin.mcp.errors import tool_error
from kelvin.mcp.runner import Runner
from kelvin.weather.dju import DJU_BASE_C, DJU_METHOD

READ_ONLY = ToolAnnotations(
    read_only_hint=True, destructive_hint=False, idempotent_hint=True, open_world_hint=False
)
_SOURCE_TIMES = {"last_ok": "last_ok_at", "error_since": "error_since_at", "next": "next_at"}


def _source(view: dict[str, Any], tz: str) -> dict[str, Any]:
    return {
        _SOURCE_TIMES.get(k, k): shape.iso(v, tz) if k in _SOURCE_TIMES else v
        for k, v in view.items()
    }


async def data_status(ctx: Any) -> dict[str, Any]:
    rt, tz = ctx.rt, ctx.settings.tz
    data: dict[str, Any] = {
        "kelvin_mode": status_word(ctx),
        "timezone": tz,
        "cozytouch": None,
        "linky": None,
        "grid_sources": None,
        "weather": None,
        "radiator_meters": [],
    }
    if rt is not None:
        p = rt.pump.status()
        data["cozytouch"] = {
            "connected": p["connected"],
            "last_ok_at": shape.iso(p["last_ok_at"], tz),
            "last_error_code": p["last_error_code"],
            "setup_reads_24h": p["setup_reads_24h"],
        }
        if rt.linky is not None:
            s = rt.linky.status()
            data["linky"] = {
                "state": s["state"],
                "configured": s["configured"],
                "last_day_date": s["last_day"],
                "last_ok_at": shape.iso(s["last_ok_at"], tz),
                "consent_expires_date": s["consent_expires"],
                "med_calls_today": s["calls_today"],
                "med_grid_calls_today": s["grid_calls_today"],
                "med_budget": s["budget"],
            }
        src = sources(rt)
        if src is not None:
            data["grid_sources"] = {
                k: _source(v, tz) for k, v in src.items() if k not in ("med", "weather")
            }
        if rt.weather is not None:
            loc = rt.weather.location()
            st = rt.scheduler.status("weather_forecast") if rt.scheduler is not None else None
            data["weather"] = {
                "location_set": loc is not None,
                "mode": loc.mode if loc else None,
                "state": st["state"] if st else None,
                "last_ok_at": shape.iso(st["last_ok"], tz) if st else None,
                "next_at": shape.iso(st["next"], tz) if st else None,
                "weighted_calls_today": rt.weather.calls_today(),
            }
        extent = await asyncio.to_thread(rt.recorder.energy_extent)
        data["radiator_meters"] = [
            {
                "radiator_id": rid,
                "first_reading_at": shape.iso(a, tz),
                "last_reading_at": shape.iso(b, tz),
            }
            for rid, (a, b) in sorted(extent.items())
        ]
    return shape.envelope(
        "get_data_status",
        data,
        ctx=ctx,
        sources=["cozytouch", "linky", "grid", "recorder", "weather"],
        basis="measured",
    )


def _today(ctx: Any) -> date:
    return datetime.fromtimestamp(ctx.wall(), ZoneInfo(ctx.settings.tz)).date()


def _at(value: Any, tz: str) -> Any:
    """Epoch seconds → local ISO; a value already ISO (or None) passes."""
    return shape.iso(value, tz) if isinstance(value, (int, float)) else value


def _hhmm(minutes: int) -> str:
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def _radiator_view(r: Any, tz: str) -> dict[str, Any]:
    v = r.view()
    rate = v["working_rate"]
    meter = v["energy_wh"]  # {total, t1, t2} in Wh, or None; T1/T2 are not HC/HP
    return {
        "radiator_id": v["id"],
        "room_id": v["room_id"],
        "name": v["name"],
        "model": v["model"],
        "kind": v["kind"],
        "support": v["support"],
        "power_w": v["power_w"],
        "temperature_c": v["temperature"],
        "mode": v["mode"],
        "manual_setpoint_c": v["target"],
        "comfort_c": v["comfort"],
        "eco_c": v["eco"],
        "eco_offset_c": v["eco_delta"],
        "effective_setpoint_c": v["effective_setpoint"],
        "heating_level": v["heating_level"],
        "max_temperature_c": v["max_temperature"],
        "heating_now": None if rate is None else rate > 0,
        "working_rate_share": None if rate is None else round(rate / 100, 4),
        "window_open": v["window_open"],
        "presence": v["occupied"],
        "window_detection": v["window_detection"],
        "presence_detection": v["presence_detection"],
        "reachable": v["reachable"],
        "unreachable_since_at": _at(v["unreachable_since"], tz),
        "last_event_at": _at(v["last_event_at"], tz),
        "meter_total_kwh": None if meter is None else round(meter["total"] / 1000, 3),
        "capabilities": v["capabilities"],
        "towel_dryer": v["dryer"],
    }


async def overview(ctx: Any) -> dict[str, Any]:
    rt, tz = ctx.rt, ctx.settings.tz
    house = rt.house
    rooms = []
    for rid in house.rooms:
        v = house.room_view(rid)
        rates = [r.working_rate for r in house.room_radiators(rid) if r.working_rate is not None]
        rooms.append(
            {
                "room_id": v["id"],
                "name": v["name"],
                "is_whole_house": v["is_root"],
                "radiator_ids": v["radiator_ids"],
                "temperature_c": v["temperature"],
                "mode": v["mode"],
                "effective_setpoint_c": v["effective_setpoint"],
                "comfort_c": v["comfort"],
                "eco_c": v["eco"],
                "heating_now": any(x > 0 for x in rates) if rates else None,
                "window_open": v["window_open"],
                "presence": v["presence"],
            }
        )
    overrides = [
        {
            "kind": o["kind"],
            "room_id": o["room_id"],
            "radiator_ids": o["radiator_ids"],
            "temperature_c": o["temperature"],
            "ends_at": shape.iso(o["ends_at"], tz),
            "restoring": o["restoring"],
        }
        for o in rt.overrides.peek()
    ]
    alerts = rt.alerts.store.summary() if rt.alerts else {"active": 0, "highest": None}
    grid = rt.grid.view() if rt.grid else None
    tariff = rt.linky.tariffs.get() if rt.linky else None
    data = {
        "rooms": rooms,
        "overrides": overrides,
        "alerts": {"active_count": alerts["active"], "highest_severity": alerts["highest"]},
        "grid": None
        if grid is None
        else {"tempo": grid["tempo"], "ecowatt_days": grid["ecowatt"]["days"]},
        "tariff_option_today": tariff.option_on(_today(ctx)) if tariff else None,
        "cozytouch_connected": rt.pump.connected,
    }
    return shape.envelope(
        "get_overview",
        shape.neutral(data),
        ctx=ctx,
        sources=["cozytouch", "kelvin", "grid"],
        basis="measured",
        notes=["mode: off, manual, program or other; mixed when a room's radiators differ"],
    )


async def room(ctx: Any, room_id: str) -> dict[str, Any]:
    rt, tz = ctx.rt, ctx.settings.tz
    name, rads = views.room_radiators(rt, room_id)
    now = int(ctx.wall())
    midnight = int(datetime.combine(_today(ctx), datetime.min.time(), ZoneInfo(tz)).timestamp())
    duty = await asyncio.to_thread(views.rooms_duty, rt, now)
    act = await asyncio.to_thread(views.room_activity, rt, [r.id for r in rads], midnight, now)
    d = duty["rooms"].get(room_id, {})

    def runs(items: list[dict]) -> list[dict]:
        return [
            {
                "start_at": shape.iso(x["start"], tz),
                "end_at": shape.iso(x["end"], tz),
                "ongoing": x["open"],
            }
            for x in items
        ]

    data = {
        "room_id": room_id,
        "name": name,
        "radiators": [_radiator_view(r, tz) for r in rads],
        "heating_duty_24h_share": d.get("duty"),
        "duty_coverage_share": d.get("coverage"),
        "today_window_open": runs(act["window"]),
        "today_presence": runs(act["presence"]),
    }
    return shape.envelope(
        "get_room",
        shape.neutral(data),
        ctx=ctx,
        sources=["cozytouch", "recorder"],
        basis="measured",
        notes=[
            "capabilities are what Kelvin's app can drive; nothing here drives them",
            "meter_total_kwh is a radiator's lifetime counter as last reported: never subtract two"
            " readings to get consumption (the counter lags and resets); use get_room_energy",
        ],
    )


async def programmes(ctx: Any, room_id: str | None) -> dict[str, Any]:
    rt = ctx.rt
    today = _today(ctx)
    monday = today - timedelta(days=today.weekday())
    tariff = rt.linky.tariffs.get() if rt.linky else None
    rads = views.room_radiators(rt, room_id)[1] if room_id else list(rt.house.radiators.values())
    items = []
    for r in rads:
        if not r.capabilities.program:
            continue
        ov = (
            week_overlap(monday, r.program, tariff)
            if tariff is not None and r.mode == "program"
            else None
        )
        items.append(
            {
                "radiator_id": r.id,
                "room_id": r.room_id,
                "name": r.name,
                "mode": r.mode,
                "programme_applies": r.mode == "program",
                "comfort_c": r.comfort,
                "eco_c": r.eco,
                "programme": {d: r.program.get(d) for d in DAY_ORDER},
                "locked_days": dict(r.program_locked),
                "comfort_minutes_per_week": ov.minutes if ov else None,
                "peak_minutes_per_week": ov.hp_minutes if ov else None,
                "comfort_peak_share": ov.share if ov else None,
            }
        )
    offpeak: dict[str, Any] = {}
    for i, day in enumerate(DAY_ORDER):
        rng = day_ranges(tariff, monday + timedelta(days=i)) if tariff else None
        offpeak[day] = (
            None if rng is None else [{"start": _hhmm(a), "end": _hhmm(b)} for a, b in rng]
        )
    data = {
        "week_of_date": monday.isoformat(),
        "tariff_option_today": tariff.option_on(today) if tariff else None,
        "offpeak_hours": offpeak,
        "radiators": items,
    }
    return shape.envelope(
        "get_programmes",
        shape.neutral(data),
        ctx=ctx,
        sources=["cozytouch", "tariff"],
        basis="static",
        notes=[
            "programme slots are comfort periods; outside them the radiator heats to eco",
            "a slot ending 24:00 runs to midnight; locked days are kept as the radiator holds them",
            "peak shares count radiators in programme mode only; null under Base or an unreadable"
            " day",
        ],
    )


MAX_MCP_POINTS = 2000  # per radiator: a result an agent can read (Decision 9)
MAX_MCP_TOTAL_POINTS = 20_000  # per call, all radiators together (review M-6)
MAX_GRID_DAYS = 366
MAX_WEATHER_HOURLY_DAYS = 31


def _local_ts(value: datetime, tz: str) -> float:
    return (value if value.tzinfo else value.replace(tzinfo=ZoneInfo(tz))).timestamp()


async def history(
    ctx: Any,
    start: datetime,
    end: datetime,
    room_id: str | None,
    radiator_ids: list[str] | None,
    step_minutes: int,
) -> dict[str, Any]:
    rt, tz = ctx.rt, ctx.settings.tz
    a, b = _local_ts(start, tz), _local_ts(end, tz)
    if room_id:
        ids = [r.id for r in views.room_radiators(rt, room_id)[1]]
    else:
        ids = bounds.check_ids(radiator_ids or [])
        for i in ids:
            views.radiator(rt, i)
    if not ids:
        raise UserError("radiator_unknown")
    bounds.check_span(a, b)
    step = step_minutes * 60
    points = (b - a) / step
    if points > MAX_MCP_POINTS or points * len(ids) > MAX_MCP_TOTAL_POINTS:
        raise UserError("period_invalid")
    rows = await asyncio.to_thread(rt.recorder.history, ids, a, b, step)
    series: dict[str, list[list[Any]]] = {i: [] for i in ids}
    for x in rows:
        series[x["radiator_id"]].append(
            [shape.iso(x["ts"], tz), x["temperature"], x["setpoint"], x["target"]]
        )
    data = {
        "from_at": shape.iso(a, tz),
        "to_at": shape.iso(b, tz),
        "step_minutes": step_minutes,
        "columns": ["at", "temperature_c", "effective_setpoint_c", "target_c"],
        "series": [
            {"radiator_id": i, "name": rt.house.radiators[i].name, "rows": series[i]} for i in ids
        ],
    }
    return shape.envelope(
        "get_temperature_history",
        data,
        ctx=ctx,
        sources=["recorder"],
        basis="measured",
        notes=["each row is the mean over its step; a step without samples is absent"],
    )


async def alerts(ctx: Any, state: str) -> dict[str, Any]:
    rt, tz = ctx.rt, ctx.settings.tz
    rows = rt.alerts.store.listing(state) if rt.alerts else []
    data = {
        "state": state,
        "alerts": [
            {
                "alert_id": a["id"],
                "kind": a["kind"],
                "severity": a["severity"],
                "params": a["params"],
                "first_seen_at": shape.iso(a["first_seen"], tz),
                "last_seen_at": shape.iso(a["last_seen"], tz),
                "resolved_at": shape.iso(a["resolved_at"], tz),
                "dismissed": a["dismissed"],
            }
            for a in rows
        ],
    }
    return shape.envelope(
        "get_alerts",
        data,
        ctx=ctx,
        sources=["kelvin"],
        basis="measured",
        notes=[
            "kinds are stable codes (backend/README.md); params name Kelvin's room and radiator ids"
        ],
    )


async def weather(ctx: Any, start: date, end: date, granularity: str) -> dict[str, Any]:
    """Spec §9: the stored outdoor weather (never a fetch, never the place)."""
    rt, tz = ctx.rt, ctx.settings.tz
    limit = MAX_WEATHER_HOURLY_DAYS if granularity == "hourly" else bounds.MAX_REPORT_DAYS
    if not bounds.FIRST_DAY <= start < end or (end - start).days > limit:
        raise UserError("period_invalid")
    w = rt.weather
    loc = w.location() if w is not None else None
    data: dict[str, Any] = {
        "location_set": loc is not None,
        "mode": loc.mode if loc else None,
        "from_date": start.isoformat(),
        "to_date_exclusive": end.isoformat(),
        "dju_base_c": DJU_BASE_C,
        "dju_method": DJU_METHOD,
    }
    if granularity == "hourly":
        zone = ZoneInfo(tz)
        a, b = day_bounds(start, zone)[0], day_bounds(end, zone)[0]
        data["hours"] = (
            [
                {
                    "at": shape.iso(h.ts, tz),
                    "temperature_c": h.t,
                    "apparent_c": h.apparent,
                    "humidity_share": None if h.rh is None else round(h.rh / 100, 3),
                    "model": h.model,
                    "forecast": h.forecast,
                }
                for h in w.store.hours(a, b)
            ]
            if loc is not None
            else []
        )
    else:
        days = w.store.daily(start, end) if loc is not None else {}
        data["days"] = [
            {
                "date": d.isoformat(),
                "mean_c": x.tmean,
                "min_c": x.tmin,
                "max_c": x.tmax,
                "heating_degree_days": x.dju,
                "hours": x.hours,
                "expected_hours": x.expected,
                "complete": x.tmean is not None,
                "final": x.final,
                "model": x.model,
            }
            for d, x in sorted(days.items())
        ]
    return shape.envelope(
        "get_weather",
        data,
        ctx=ctx,
        sources=["weather"],
        basis="published" if loc is not None else "unknown",
        notes=[
            "model data for the home's cell: arome_hd = Meteo-France AROME France HD (1.5 km),"
            " arpege = Meteo-France seamless beyond AROME's reach, era5_land = ERA5-Land"
            " reanalysis (Copernicus), best_match = Open-Meteo's best model outside France",
            "a day's mean_c is (min_c + max_c) / 2 of the Paris civil day; heating_degree_days ="
            " max(0, 18 − mean_c); null when more than two hours are missing",
            "forecast: true marks hours that were still ahead when fetched",
            "Weather data by Open-Meteo.com (CC BY 4.0)",
        ],
    )


async def grid_signals(ctx: Any, start: date | None, end: date | None) -> dict[str, Any]:
    rt = ctx.rt
    today = _today(ctx)
    a = start or today - timedelta(days=30)
    b = end or today + timedelta(days=2)
    if not bounds.FIRST_DAY <= a < b or (b - a).days > MAX_GRID_DAYS:
        raise UserError("period_invalid")
    tariff = rt.linky.tariffs.get() if rt.linky else None
    tempo = tariff is not None and "tempo" in tariff.options()
    colours = rt.grid.store.tempo_colours(a, b) if rt.grid is not None and tempo else {}
    eco = rt.grid.store.ecowatt(a, b) if rt.grid is not None else {}
    view = rt.grid.view() if rt.grid is not None else None
    counts = Counter(colours.values())
    data = {
        "from_date": a.isoformat(),
        "to_date_exclusive": b.isoformat(),
        "tempo_tariff": tempo,
        "tempo_today_tomorrow": view["tempo"] if view else None,
        "tempo_days": [{"date": d.isoformat(), "colour": c} for d, c in sorted(colours.items())],
        "tempo_counts": {k: counts[k] for k in ("blue", "white", "red")} if tempo else None,
        "ecowatt_days": [{"date": d.isoformat(), "level": e.level} for d, e in sorted(eco.items())],
        "ecowatt_upcoming": view["ecowatt"]["days"] if view else [],
    }
    return shape.envelope(
        "get_grid_signals",
        data,
        ctx=ctx,
        sources=["grid"],
        basis="measured",
        notes=[
            "Tempo colours are listed only when the tariff has a Tempo row",
            "a Tempo day runs from 06:00 to 06:00 the next day",
            "EcoWatt days are kept 30 days; level 1 normal, 2 strained, 3 cut risk",
        ],
    )


async def tariff_view(ctx: Any) -> dict[str, Any]:
    rt, tz = ctx.rt, ctx.settings.tz
    t = rt.linky.tariffs.get() if rt.linky else None
    contract = rt.linky.tariffs.contract_last() if rt.linky else None
    data = {
        "configured": t is not None,
        "option_today": t.option_on(_today(ctx)) if t else None,
        "tariff": t.view() if t else None,
        "contract": None
        if contract is None
        else {
            "subscribed_kva": contract["kva"],
            "offpeak_hours": contract["offpeak"],
            "read_at": shape.iso(contract["fetched_at"], tz),
        },
    }
    return shape.envelope(
        "get_tariff",
        shape.neutral(data),
        ctx=ctx,
        sources=["tariff", "enedis_contract"],
        basis="static",
        notes=["prices are as the owner entered them, incl. VAT; each row applies from valid_from"],
    )


_BUCKET_DAYS = {"day": 1, "week": 7, "month": 31, "year": 366}


async def energy(ctx: Any, start: date, end: date, group: str) -> dict[str, Any]:
    rt = ctx.rt
    linky = views.linky_of(rt)
    bounds.check_days(linky, start, end)
    if end <= start or (end - start).days > bounds.MAX_REPORT_DAYS:
        raise UserError("period_invalid")
    if (end - start).days / _BUCKET_DAYS[group] > en.MAX_BUCKETS:
        raise UserError("period_invalid")
    report = await asyncio.to_thread(
        linky.report, start, end, group, rt.recorder, views.radiator_rooms(rt), (start, end)
    )
    names = {rid: room.name for rid, room in rt.house.rooms.items()}
    basis, notes = en.report_basis(report)
    return shape.envelope(
        "get_energy",
        en.energy_view(report, names),
        ctx=ctx,
        sources=["linky", "radiator_meters", "tariff"],
        basis=basis,
        notes=notes,
    )


async def room_energy(ctx: Any, room_id: str, days: int) -> dict[str, Any]:
    rt = ctx.rt
    linky = views.linky_of(rt)
    _, rads = views.room_radiators(rt, room_id)
    body = await asyncio.to_thread(
        linky.room_energy, [r.id for r in rads], days, rt.recorder, set(rt.house.radiators)
    )
    basis, notes = en.room_energy_basis(body)
    # Spec 2026-10-18 §8.3: the room's heating model (its own 365 days), null without a place.
    body["weather"] = await asyncio.to_thread(
        linky.room_weather, room_id, rt.recorder, views.radiator_rooms(rt)
    )
    return shape.envelope(
        "get_room_energy",
        shape.neutral(body),
        ctx=ctx,
        sources=["radiator_meters", "tariff"],
        basis=basis,
        notes=notes,
    )


async def weather_model(
    ctx: Any, start: date | None, end: date | None, include_days: bool
) -> dict[str, Any]:
    """Spec 2026-10-18 §8.6: Kelvin's heating model of the home (memory memo + store reads)."""
    rt = ctx.rt
    linky = views.linky_of(rt)
    if (start is None) != (end is None):
        raise UserError("period_invalid")
    period = None
    if start is not None and end is not None:
        bounds.check_days(linky, start, end)
        if end <= start or (end - start).days > bounds.MAX_REPORT_DAYS:
            raise UserError("period_invalid")
        period = (start, end)
    view = await asyncio.to_thread(
        linky.weather_model, rt.recorder, views.radiator_rooms(rt), period
    )
    names = {rid: room.name for rid, room in rt.house.rooms.items()}
    located = rt.weather is not None and rt.weather.location() is not None
    ok = view["house"]["state"] == "ok" or view["forecast"]["state"] == "ok"
    return shape.envelope(
        "get_weather_model",
        en.weather_model_view(view, names, include_days, located),
        ctx=ctx,
        sources=["linky", "radiator_meters", "weather", "tariff"],
        basis="estimated" if ok else "unknown",
        notes=[
            "model: daily kWh = baseload + kwh_per_degree_c x max(0, balance_point_c - daily"
            " outdoor mean); fitted on the last 365 days of measured Linky days, absences and"
            " outliers excluded",
            "rooms: the same model on each room's radiator meters, only days every radiator"
            " measured whole; the balance point is shared",
            "ranges are 80% intervals, conditional on the balance point; forecast ranges add an"
            " assumed forecast error (1.0 C tomorrow to 2.7 C at day 7)",
            "euros: per degree and forecasts at today's prices; past days as billed by the report",
            "an estimate, never a saving the owner will get",
            "Weather data by Open-Meteo.com (CC BY 4.0): Meteo-France AROME, ECMWF IFS",
        ],
    )


async def day_detail(ctx: Any, day: date) -> dict[str, Any]:
    rt = ctx.rt
    linky = views.linky_of(rt)
    bounds.check_days(linky, day)
    body = await asyncio.to_thread(linky.day_detail, day, rt.recorder, views.radiator_rooms(rt))
    body.pop("room", None)
    return shape.envelope(
        "get_day_detail",
        shape.neutral(body),
        ctx=ctx,
        sources=["linky", "radiator_meters", "tariff"],
        basis="computed",
        notes=[
            "an interval's € is its measured Wh at its price: intervals need not add up to"
            " the day's billed €, which follows the daily reading"
        ],
    )


PROPOSAL_DAYS_MIN, PROPOSAL_DAYS_MAX = 7, 31
EVALUATE_DAYS = 30  # evaluate_programme's measured window: the last 30 elapsed days


def _room_facts(
    ctx: Any, progs: list[dict[str, Any]], by_radiator: list[dict[str, Any]]
) -> list[pr.RoomFacts]:
    """Every room figure from the report's own `by_radiator` rows, so it covers exactly the
    window the result declares (review I-2), never the last days with today running."""
    rt = ctx.rt
    stats = {r["radiator_id"]: r for r in by_radiator}
    totals = en.room_totals(by_radiator)
    empty = dict.fromkeys(
        ("peak_kwh", "offpeak_kwh", "cost_eur", "coverage_share", "heating_hours")
    )
    facts = []
    for room_id, room in rt.house.rooms.items():
        rads = rt.house.room_radiators(room_id)
        if not any(r.capabilities.energy for r in rads):
            continue
        body = totals.get(room_id, empty)
        v = rt.house.room_view(room_id)
        mine = [p for p in progs if p["room_id"] == room_id and p["comfort_peak_share"] is not None]
        top = max(mine, key=lambda p: p["comfort_peak_share"], default=None)
        facts.append(
            pr.RoomFacts(
                room_id=room_id,
                name=room.name,
                peak_kwh=body["peak_kwh"],
                offpeak_kwh=body["offpeak_kwh"],
                cost_eur=body["cost_eur"],
                coverage_share=body["coverage_share"],
                comfort_c=v["comfort"],
                eco_c=v["eco"],
                heating_hours=body["heating_hours"],
                radiators=[
                    {
                        "radiator_id": r.id,
                        "temp_avg_c": stats.get(r.id, {}).get("temp_avg"),
                        "setpoint_avg_c": stats.get(r.id, {}).get("setpoint_avg"),
                    }
                    for r in rads
                ],
                manual_setpoint=any(r.mode == "manual" for r in rads),
                in_programme=any(p["programme_applies"] for p in mine),
                peak_share=top["comfort_peak_share"] if top else None,
                comfort_minutes=top["comfort_minutes_per_week"] if top else None,
            )
        )
    return facts


async def savings(ctx: Any, days: int) -> dict[str, Any]:
    rt = ctx.rt
    linky = views.linky_of(rt)
    today = linky.today()
    first = today - timedelta(days=days)
    report = await asyncio.to_thread(
        linky.report, first, today, "day", rt.recorder, views.radiator_rooms(rt), (first, today)
    )
    tariff = linky.tariffs.get()
    row = tariff.prices_on(today) if tariff else None
    progs = (await programmes(ctx, None))["data"]["radiators"]
    lens = report.get("tempo_lens") or {}
    grid = rt.grid.view() if rt.grid else None
    tomorrow = ((grid or {}).get("tempo") or {}).get("tomorrow") or {}
    total = report["total"]
    h = pr.HouseFacts(
        days=days,
        option=row.option if row else None,
        rates=dict(row.rates) if row else {},
        tempo_rows=lens.get("rows"),
        tempo_days=lens.get("days"),
        tomorrow_colour=tomorrow.get("colour"),
        tempo_hours=tariff.view().get("tempo_hours") if tariff else None,
        coverage_share=(total.get("radiators") or {}).get("coverage"),
        missing_days=total.get("missing_days") or 0,
        linky_last_day=report["last_day"],
    )
    rooms = _room_facts(ctx, progs, report["by_radiator"])
    found = pr.build_proposals(h, rooms)
    data = {
        "window_days": days,
        "from_date": first.isoformat(),
        "to_date_exclusive": today.isoformat(),
        "tariff_option_today": h.option,
        "applies_nothing": True,
        "proposals": found,
    }
    return shape.envelope(
        "propose_savings",
        shape.neutral(data),
        ctx=ctx,
        sources=["linky", "radiator_meters", "tariff", "grid", "cozytouch"],
        basis=shape.combine(*[p["basis"] for p in found]) if found else "unknown",
        notes=[
            "estimates are upper bounds or proportional estimates at equal consumption, not"
            " outcomes; setpoint changes get no estimate (no thermal model)",
            "Kelvin applies nothing: each proposal names where the owner can apply it",
        ],
    )


async def evaluate(ctx: Any, room_id: str, week: dict[str, list[dict[str, str]]]) -> dict[str, Any]:
    rt = ctx.rt
    name, rads = views.room_radiators(rt, room_id)
    progs = [r for r in rads if r.capabilities.program]
    if not progs:
        raise tool_error("invalid_argument")
    locked = {d: why for r in progs for d, why in r.program_locked.items()}
    step = max(r.capabilities.program_step_minutes or pr.DEFAULT_STEP for r in progs)
    problems = pr.check_week(week, locked, step)
    tariff = rt.linky.tariffs.get() if rt.linky else None
    today = _today(ctx)
    monday = today - timedelta(days=today.weekday())
    rows, before_peak, after_peak = [], 0, 0
    for r in progs:
        proposed = {
            **r.program,
            **{d: s for d, s in week.items() if d in DAY_ORDER and d not in r.program_locked},
        }
        before = week_overlap(monday, r.program, tariff) if tariff else None
        after = week_overlap(monday, proposed, tariff) if tariff else None
        if r.mode == "program" and before and after:
            before_peak += before.hp_minutes
            after_peak += after.hp_minutes
        rows.append(
            {
                "radiator_id": r.id,
                "name": r.name,
                "programme_applies": r.mode == "program",
                "before": before.view() if before else None,
                "after": after.view() if after else None,
            }
        )
    measured: dict[str, Any] | None = None
    if rt.linky is not None:
        # The room's measured peak kWh over the last 30 elapsed days, from the report's own
        # by_radiator rows (review I-2): a declared window, today never in it.
        last = rt.linky.today()
        first = last - timedelta(days=EVALUATE_DAYS)
        report = await asyncio.to_thread(
            rt.linky.report,
            first,
            last,
            "day",
            rt.recorder,
            views.radiator_rooms(rt),
            (first, last),
        )
        mine = en.room_totals(report["by_radiator"]).get(room_id, {})
        measured = {
            "from_date": first.isoformat(),
            "to_date_exclusive": last.isoformat(),
            "days": EVALUATE_DAYS,
            "peak_kwh": mine.get("peak_kwh"),
            "coverage_share": mine.get("coverage_share"),
        }
    row = tariff.prices_on(today) if tariff else None
    estimate = pr.programme_estimate(
        option=row.option if row else None,
        rates=dict(row.rates) if row else {},
        peak_kwh=measured["peak_kwh"] if measured else None,
        before_peak_minutes=before_peak or None,
        after_peak_minutes=after_peak,
        days=EVALUATE_DAYS,
    )
    data = {
        "room_id": room_id,
        "name": name,
        "valid": not [p for p in problems if p["code"] != "day_locked"],
        "problems": problems,
        "radiators": rows,
        "measured": measured,
        "estimate": estimate,
        "sent": False,
        "apply_in_app": {"path": "/schedule", "what": "enter this week in the room's programme"},
    }
    return shape.envelope(
        "evaluate_programme",
        shape.neutral(data),
        ctx=ctx,
        sources=["cozytouch", "tariff", "radiator_meters"],
        basis="estimated" if estimate.get("estimated_eur") is not None else "static",
        notes=["nothing was sent or stored", "a locked day is kept as the radiator holds it"],
    )


def register_tools(server: MCPServer, run: Runner) -> None:
    @server.tool(
        annotations=READ_ONLY,
        description=(
            "How fresh and complete Kelvin's data is: Kelvin's mode, Cozytouch connection, Linky"
            " sync state and last day, MyElectricalData calls, Tempo/EcoWatt fetches, and each"
            " radiator meter's first and last reading. Call it first."
        ),
    )
    async def get_data_status() -> dict[str, Any]:
        return await run("tool", "get_data_status", {}, data_status, needs_runtime=False)

    @server.tool(
        annotations=READ_ONLY,
        description=(
            "The house now: each room's temperature, mode, setpoints, whether it heats, window and"
            " presence; boosts and aways in progress; active alerts; today's Tempo and EcoWatt."
            " Gives the room ids the other tools take."
        ),
    )
    async def get_overview() -> dict[str, Any]:
        return await run("tool", "get_overview", {}, overview)

    @server.tool(
        annotations=READ_ONLY,
        description=(
            "One room in detail: each radiator's state, setpoints, power and capabilities; the"
            " share"
            " of the last 24 h spent heating; today's window-open and presence periods."
        ),
    )
    async def get_room(room_id: str) -> dict[str, Any]:
        return await run("tool", "get_room", {"room_id": room_id}, lambda c: room(c, room_id))

    @server.tool(
        annotations=READ_ONLY,
        description=(
            "Weekly programmes (comfort periods per day) per radiator, locked days, comfort and eco"
            " temperatures, this week's off-peak hours per day, and the share of comfort time that"
            " falls in peak hours. Optionally for one room."
        ),
    )
    async def get_programmes(room_id: str | None = None) -> dict[str, Any]:
        return await run(
            "tool", "get_programmes", {"room_id": room_id}, lambda c: programmes(c, room_id)
        )

    @server.tool(
        annotations=READ_ONLY,
        description=(
            "Temperature, effective setpoint and target per radiator over a period, as means per"
            " step. Give room_id or radiator_ids; start/end are local ISO date-times; at most 2000"
            " points per radiator and 20000 per call."
        ),
    )
    async def get_temperature_history(
        start: datetime,
        end: datetime,
        room_id: str | None = None,
        radiator_ids: list[str] | None = None,
        step_minutes: Annotated[int, Field(ge=5, le=1440)] = 60,
    ) -> dict[str, Any]:
        args = {
            "start": start.isoformat(),
            "end": end.isoformat(),
            "room_id": room_id,
            "radiator_ids": radiator_ids,
            "step_minutes": step_minutes,
        }
        return await run(
            "tool",
            "get_temperature_history",
            args,
            lambda c: history(c, start, end, room_id, radiator_ids, step_minutes),
        )

    @server.tool(
        annotations=READ_ONLY,
        description=(
            "Kelvin's alerts (unreachable radiator, failed command, Linky stalled, Tempo red"
            " tomorrow,"
            " EcoWatt, price change, consent expiring, off-peak hours changed): active or all."
        ),
    )
    async def get_alerts(state: Literal["active", "all"] = "active") -> dict[str, Any]:
        return await run("tool", "get_alerts", {"state": state}, lambda c: alerts(c, state))

    @server.tool(
        annotations=READ_ONLY,
        description=(
            "Tempo colours (when the tariff has a Tempo row) and EcoWatt levels stored by Kelvin"
            " for"
            " a date window (default: the last 30 days to tomorrow), with today's and tomorrow's"
            " signals. Never fetches anything."
        ),
    )
    async def get_grid_signals(
        start: date | None = None, end: date | None = None
    ) -> dict[str, Any]:
        args = {"start": start and start.isoformat(), "end": end and end.isoformat()}
        return await run("tool", "get_grid_signals", args, lambda c: grid_signals(c, start, end))

    @server.tool(
        annotations=READ_ONLY,
        description=(
            "Outdoor temperature at the home for a period (start inclusive, end exclusive, local"
            " ISO dates): granularity 'daily' (mean, min, max and heating degree days base 18 °C;"
            " up to 1464 days) or 'hourly' (temperature, feels-like, humidity; up to 31 days)."
            " Model data (Meteo-France AROME HD via Open-Meteo; ERA5-Land for older days)."
            " location_set is false when the owner has chosen no place. Reads Kelvin's store only;"
            " never returns the place."
        ),
    )
    async def get_weather(
        start: date, end: date, granularity: Literal["daily", "hourly"] = "daily"
    ) -> dict[str, Any]:
        args = {"start": start.isoformat(), "end": end.isoformat(), "granularity": granularity}
        return await run("tool", "get_weather", args, lambda c: weather(c, start, end, granularity))

    @server.tool(
        annotations=READ_ONLY,
        description=(
            "The home's heating model against the outdoor temperature: baseload, kWh and euros per"
            " degree colder, each room's sensitivity, the next 7 days' forecast cost with 80%"
            " ranges, and why a figure is missing. start/end (ISO dates, end exclusive, both or"
            " neither): the period for period_share_due_to_cold. include_days adds the daily"
            " points."
        ),
    )
    async def get_weather_model(
        start: date | None = None, end: date | None = None, include_days: bool = False
    ) -> dict[str, Any]:
        args = {
            "start": start.isoformat() if start else None,
            "end": end.isoformat() if end else None,
            "include_days": include_days,
        }
        return await run(
            "tool",
            "get_weather_model",
            args,
            lambda c: weather_model(c, start, end, include_days),
        )

    @server.tool(
        annotations=READ_ONLY,
        description=(
            "The electricity tariff: price rows by date (option base, offpeak/peak or tempo;"
            " subscription and per-kWh prices), off-peak schedules, Tempo hours, and the last"
            " contract"
            " read from Enedis (subscribed kVA, off-peak hours)."
        ),
    )
    async def get_tariff() -> dict[str, Any]:
        return await run("tool", "get_tariff", {}, tariff_view)

    @server.tool(
        annotations=READ_ONLY,
        description=(
            "Electricity use and cost for a period (start inclusive, end exclusive, ISO dates),"
            " grouped by day, week, month or year: meter kWh and € (energy, subscription), kWh by"
            " rate (offpeak/peak, Tempo colours), radiators' kWh and € with coverage, per room and"
            " per radiator, heating share, comparisons with the previous period and last year, the"
            " month projection. At most 93 buckets."
        ),
    )
    async def get_energy(
        start: date, end: date, group: Literal["day", "week", "month", "year"] = "month"
    ) -> dict[str, Any]:
        args = {"start": start.isoformat(), "end": end.isoformat(), "group": group}
        return await run("tool", "get_energy", args, lambda c: energy(c, start, end, group))

    @server.tool(
        annotations=READ_ONLY,
        description=(
            "One room's radiator energy over the last `days` days (today included): kWh, offpeak"
            " and"
            " peak kWh, € (the sum of its radiators' shares), heating hours, coverage."
        ),
    )
    async def get_room_energy(
        room_id: str, days: Annotated[int, Field(ge=1, le=MAX_ROOM_DAYS)] = 7
    ) -> dict[str, Any]:
        return await run(
            "tool",
            "get_room_energy",
            {"room_id": room_id, "days": days},
            lambda c: room_energy(c, room_id, days),
        )

    @server.tool(
        annotations=READ_ONLY,
        description=(
            "One day by half-hour: kWh, mean power, rate, price, €, Tempo colour, radiators' Wh;"
            " the day's billed totals; peak power, base load and night minimum."
        ),
    )
    async def get_day_detail(date: date) -> dict[str, Any]:  # noqa: A002 — the API's name
        return await run(
            "tool", "get_day_detail", {"date": date.isoformat()}, lambda c: day_detail(c, date)
        )

    @server.tool(
        annotations=READ_ONLY,
        description=(
            "Ways to pay less for heating, as data: per room and for the house, what was consumed"
            " and paid where a change would act (peak hours, Tempo red days, setpoints,"
            " programmes),"
            " with an upper-bound estimate only when Kelvin's prices give one at equal consumption."
            " Kelvin applies nothing; each proposal says where the owner can apply it."
        ),
    )
    async def propose_savings(
        days: Annotated[int, Field(ge=PROPOSAL_DAYS_MIN, le=PROPOSAL_DAYS_MAX)] = 30,
    ) -> dict[str, Any]:
        return await run("tool", "propose_savings", {"days": days}, lambda c: savings(c, days))

    @server.tool(
        annotations=READ_ONLY,
        description=(
            "Check a draft weekly programme for a room without sending it: Kelvin's rules (at most"
            " 3 comfort periods a day, no overlap, times on the radiators' step (30 min on Sauter),"
            " ends one step before midnight, locked days), the"
            " comfort time in peak hours before and after, and an estimate of the cost moved."
            ' week: {"monday": [{"start": "06:30", "end": "08:00"}], …}; days left out'
            " stay as they are."
        ),
    )
    async def evaluate_programme(
        room_id: str, week: dict[str, list[dict[str, str]]]
    ) -> dict[str, Any]:
        return await run(
            "tool",
            "evaluate_programme",
            {"room_id": room_id, "week": week},
            lambda c: evaluate(c, room_id, week),
        )
