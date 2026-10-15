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
from kelvin.errors import UserError
from kelvin.house.model import DAY_ORDER
from kelvin.mcp import shape
from kelvin.mcp.runner import Runner

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
            data["grid_sources"] = {k: _source(v, tz) for k, v in src.items() if k != "med"}
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
        sources=["cozytouch", "linky", "grid", "recorder"],
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
        notes=["capabilities are what Kelvin's app can drive; nothing here drives them"],
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
MAX_GRID_DAYS = 366


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
    if (b - a) / step > MAX_MCP_POINTS:
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
            " points per radiator."
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
            "The electricity tariff: price rows by date (option base, offpeak/peak or tempo;"
            " subscription and per-kWh prices), off-peak schedules, Tempo hours, and the last"
            " contract"
            " read from Enedis (subscribed kVA, off-peak hours)."
        ),
    )
    async def get_tariff() -> dict[str, Any]:
        return await run("tool", "get_tariff", {}, tariff_view)
