from __future__ import annotations

import asyncio
import re
import time
from collections.abc import Callable
from dataclasses import asdict, replace
from datetime import date
from functools import reduce
from operator import add
from typing import Annotated, Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query, Request, Response
from fastapi.responses import JSONResponse
from sse_starlette.sse import EventSourceResponse

from kelvin.account import linky_credentials
from kelvin.api import views
from kelvin.api.auth_routes import status_word
from kelvin.api.bounds import (
    FIRST_TS,
    MAX_HISTORY_POINTS,
    MAX_HOUR_DAYS,
    MAX_REPORT_DAYS,
    check_ids,
)
from kelvin.api.bounds import check_days as _check_days
from kelvin.api.bounds import check_span as _check_span
from kelvin.api.guards import LoginRequired, require_kelvin_header, require_session
from kelvin.api.runtime import Runtime, sources, weather_view
from kelvin.api.schemas import (
    AwayBody,
    BoostBody,
    DryerBody,
    FeaturesBody,
    LabelBody,
    LevelBody,
    LightBody,
    LinkyBody,
    McpTokenBody,
    ModeBody,
    MoveBody,
    ProgramBody,
    SetpointBody,
    SettingsBody,
    TariffDocBody,
    WeatherLocationBody,
    WeatherSearchBody,
)
from kelvin.api.sse import event_stream
from kelvin.api.views import linky_of as _linky
from kelvin.api.views import radiator as _radiator
from kelvin.api.views import room_radiators as _room_radiators
from kelvin.auth.sessions import COOKIE_NAME, SessionIsCurrent
from kelvin.billing.report import next_unit, unit_start
from kelvin.billing.room_energy import MAX_ROOM_DAYS
from kelvin.commands.translate import (
    CommandError,
    Planned,
    plan_dryer,
    plan_feature,
    plan_identify,
    plan_level,
    plan_light,
    plan_mode,
    plan_off,
    plan_program,
    plan_setpoint,
)
from kelvin.devices.capabilities import Capabilities
from kelvin.errors import UserError
from kelvin.grid.models import BudgetSpent, GridError
from kelvin.house.model import DAY_ORDER, Radiator
from kelvin.labels import Label
from kelvin.linky.models import LinkyAuthError, LinkyError, LinkyThrottled, day_bounds
from kelvin.linky.sync import BudgetExceeded
from kelvin.overkiz.budget import QuotasUnavailable
from kelvin.overkiz.errors import GatewayError
from kelvin.recorder.activity import DUTY_WINDOW_S, MAX_SPAN_S
from kelvin.setup.refresh import SyncSpent
from kelvin.setup.service import SetupPending, SetupService
from kelvin.weather.service import WeatherService

router = APIRouter(dependencies=[Depends(require_kelvin_header), Depends(require_session)])
_DEVICE_ID = re.compile(r"[A-Za-z0-9_.-]{1,64}#[0-9]{1,2}|bridge-[0-9]{1,3}")
_PRM = re.compile(r"[0-9]{14}")  # ASCII digits only


def _rt(request: Request) -> Runtime:
    rt = request.app.state.ctx.rt
    if rt is None:
        raise LoginRequired()
    return rt


def _capable(rads: list[Radiator], pred: Callable[[Capabilities], bool]) -> list[Radiator]:
    """Plan 12: a room or house command goes to the radiators that support it and skips the
    others (a towel dryer has no comfort temperature, a pilot-wire heater no mode)."""
    out = [r for r in rads if pred(r.capabilities)]
    if not out:
        raise CommandError("unsupported_in_room")
    return out


async def _submit(
    rt: Runtime, label: Label, rads: list[Radiator], build: Callable[[Radiator], Planned]
) -> JSONResponse:
    planned = reduce(add, [build(r) for r in rads])  # a CommandError answers 422 with its code
    p = await rt.commands.submit(label, tuple(r.id for r in rads), planned)
    return JSONResponse(status_code=202, content={"pending": p.view()})


@router.get("/status")
async def status(request: Request) -> dict:
    rt = _rt(request)
    return {
        "status": status_word(request.app.state.ctx),
        "overkiz": rt.pump.status(),
        "linky": rt.linky.status()["state"] if rt.linky else None,
        "sources": sources(rt),
    }


@router.get("/grid")
async def grid_view(request: Request) -> dict:
    """The grid strip's data (spec §5.1 QW1): Tempo only when today's price row is Tempo
    (ruling 1), EcoWatt for every option."""
    rt = _rt(request)
    if rt.grid is None:
        return {
            "tempo": None,
            "ecowatt": {"days": [], "fetched_at": None},
            "source": "MyElectricalData",
        }
    return rt.grid.view()


MAX_WEATHER_SPAN_S = 31 * 86400


def _weather(rt: Runtime) -> WeatherService:
    if rt.weather is None:
        raise UserError("weather_unavailable", 503)
    return rt.weather


@router.get("/weather")
async def weather_now(request: Request) -> dict | None:
    """The outdoor temperature now and today's range (spec §7.2); null without a place."""
    return weather_view(_rt(request))


@router.get("/weather/hourly")
async def weather_hourly(request: Request, start: int, end: int) -> dict:
    """Past hourly outdoor temperatures for a chart window (≤ 31 days; never forecasts)."""
    w = _weather(_rt(request))
    if start < FIRST_TS or end <= start or end - start > MAX_WEATHER_SPAN_S:
        raise UserError("period_invalid")  # the window asked, before it is cut at now
    return w.hourly(start, min(end, int(w.wall()) + 3600))


@router.post("/weather/search")
async def weather_search(body: WeatherSearchBody, request: Request) -> dict:
    """Open-Meteo geocoding (GeoNames), French places first; coordinates already rounded. A POST:
    the typed text stays out of URLs and access logs."""
    places = await _weather(_rt(request)).search_places(body.q, body.lang)
    return {"results": [asdict(p) for p in places]}


@router.get("/settings/weather")
async def get_weather_settings(request: Request) -> dict:
    return _weather(_rt(request)).settings_view()


@router.put("/settings/weather")
async def put_weather_settings(body: WeatherLocationBody, request: Request) -> dict:
    rt = _rt(request)
    w = _weather(rt)
    w.set_location(**body.model_dump())
    if rt.scheduler is not None:
        rt.scheduler.request("weather_forecast")
        rt.scheduler.request("weather_backfill")
    return w.settings_view()


@router.delete("/settings/weather", status_code=204)
async def delete_weather_settings(request: Request) -> Response:
    rt = _rt(request)
    _weather(rt).clear_location()
    if rt.scheduler is not None:
        rt.scheduler.reset("weather_forecast")
        rt.scheduler.reset("weather_backfill")
    return Response(status_code=204)


@router.get("/overkiz/quotas")
async def overkiz_quotas(request: Request) -> dict:
    """Remaining Overkiz quotas (`GET /setup/quotas`), read at most once an hour."""
    rt = _rt(request)
    if rt.quotas is None:
        raise UserError("quotas_unavailable", 503)
    try:
        return await rt.quotas.get()
    except GatewayError:
        raise UserError("cozytouch_unavailable", 503) from None
    except QuotasUnavailable:
        raise UserError("quotas_unavailable", 503) from None


@router.get("/house")
async def house(request: Request) -> dict:
    return _rt(request).snapshot()


@router.get("/stream")
async def stream(request: Request) -> EventSourceResponse:
    ctx = request.app.state.ctx
    rt = _rt(request)
    token = request.cookies.get(COOKIE_NAME)
    return EventSourceResponse(
        event_stream(rt, request, alive=lambda: ctx.rt is rt and ctx.sessions.validate(token)),
        ping=15,
    )


@router.get("/rooms/duty")
async def rooms_duty(request: Request, since: float | None = None) -> dict:
    """Each room's share of time heating over the last 24 h (spec QW5), or since `since` (the room
    panel's « Aujourd’hui »: local midnight), at most 25 h back (a DST day)."""
    rt = _rt(request)
    end = int(rt.recorder.wall())  # the runtime's injected clock
    if since is None:
        start = end - DUTY_WINDOW_S
    else:
        start = max(int(since), end - DUTY_WINDOW_S - 3600)
        if start >= end:
            raise UserError("period_invalid")
    return await asyncio.to_thread(views.rooms_duty, rt, end, start)


@router.post("/rooms/{room_id}/mode")
async def room_mode(room_id: str, body: ModeBody, request: Request):
    rt = _rt(request)
    name, rads = _room_radiators(rt, room_id)
    label = Label.of("mode", name=name, mode=body.mode)
    if body.mode == "off":  # same rule as « Tout éteindre »: a pilot-wire heater's level off
        rads = _capable(rads, lambda c: "off" in c.modes or "off" in c.levels)
        return await _submit(rt, label, rads, plan_off)
    rads = _capable(rads, lambda c: body.mode in c.modes)
    return await _submit(rt, label, rads, lambda r: plan_mode(r, body.mode))


@router.post("/rooms/{room_id}/setpoint")
async def room_setpoint(room_id: str, body: SetpointBody, request: Request):
    rt = _rt(request)
    name, rads = _room_radiators(rt, room_id)
    rads = _capable(rads, lambda c: getattr(c, body.kind) is not None)  # manual | comfort | eco
    return await _submit(
        rt,
        Label.of("setpoint", name=name, kind=body.kind, value=body.value),
        rads,
        lambda r: plan_setpoint(r, body.kind, body.value),
    )


def _check_base(body: ProgramBody, rads: list[Radiator]) -> None:
    """Refuse to overwrite a programme that changed since the editor loaded it."""
    base = body.base_programs()
    if base is None or body.force:
        return
    changed = [r for r in rads if base.get(r.id) != r.program]
    if not changed:
        return
    days = [
        d
        for d in DAY_ORDER
        if any((base.get(r.id) or {}).get(d) != r.program.get(d) for r in changed)
    ]
    raise UserError("program_changed_elsewhere", 409, days=days)  # day keys only, never an id


@router.put("/rooms/{room_id}/program")
async def room_program(room_id: str, body: ProgramBody, request: Request):
    rt = _rt(request)
    name, rads = _room_radiators(rt, room_id)
    rads = _capable(rads, lambda c: c.program)
    _check_base(body, rads)
    week, keep = body.week(), body.kept()
    return await _submit(
        rt, Label.of("program", name=name), rads, lambda r: plan_program(r, week, keep=keep)
    )


@router.get("/rooms/{room_id}/energy")
async def room_energy_route(
    room_id: str, request: Request, days: int = Query(default=1, ge=1, le=MAX_ROOM_DAYS)
) -> dict:
    """The room's radiator energy over the last `days` local days, today included (spec QW3):
    the Énergie report's own figures and € rule, never a bucket rounded on its own."""
    rt = _rt(request)
    _, rads = _room_radiators(rt, room_id)
    linky = _linky(rt)
    ids = [r.id for r in rads]
    # Off the event loop: the first request of a year replays the half-hours since 1 January.
    return await asyncio.to_thread(
        linky.room_energy, ids, days, rt.recorder, set(rt.house.radiators)
    )


def _window(start: float, end: float, now: float) -> tuple[int, int]:
    """An epoch window for the activity routes: from 2000-01-01, `end` after `start` (clamped to
    now), at most MAX_SPAN_S long; `422 period_invalid` otherwise, as `_check_span`."""
    end = min(end, now)
    if not FIRST_TS <= start < end or end - start > MAX_SPAN_S:
        raise UserError("period_invalid")
    return int(start), int(end)


@router.get("/rooms/{room_id}/activity")
async def room_activity(room_id: str, request: Request, start: float, end: float) -> dict:
    """Window-open and presence runs the radiators reported (spec QW4)."""
    rt = _rt(request)
    _, rads = _room_radiators(rt, room_id)
    a, z = _window(start, end, rt.recorder.wall())
    return await asyncio.to_thread(views.room_activity, rt, [r.id for r in rads], a, z)


@router.post("/radiators/{rid}/mode")
async def radiator_mode(rid: str, body: ModeBody, request: Request):
    rt = _rt(request)
    r = _radiator(rt, rid)
    return await _submit(
        rt, Label.of("mode", name=r.name, mode=body.mode), [r], lambda x: plan_mode(x, body.mode)
    )


@router.post("/radiators/{rid}/setpoint")
async def radiator_setpoint(rid: str, body: SetpointBody, request: Request):
    rt = _rt(request)
    r = _radiator(rt, rid)
    return await _submit(
        rt,
        Label.of("setpoint", name=r.name, kind=body.kind, value=body.value),
        [r],
        lambda x: plan_setpoint(x, body.kind, body.value),
    )


@router.put("/radiators/{rid}/program")
async def radiator_program(rid: str, body: ProgramBody, request: Request):
    rt = _rt(request)
    r = _radiator(rt, rid)
    _check_base(body, [r])
    week, keep = body.week(), body.kept()
    return await _submit(
        rt, Label.of("program", name=r.name), [r], lambda x: plan_program(x, week, keep=keep)
    )


@router.patch("/radiators/{rid}/features")
async def radiator_features(rid: str, body: FeaturesBody, request: Request):
    rt = _rt(request)
    r = _radiator(rt, rid)
    if body.name is not None:
        # The rename is a Cozytouch setup write (the label, ruling 4), not a device command.
        if body.window_detection is not None or body.presence_detection is not None:
            raise UserError("rename_alone")
        if r.support == "readonly":  # Plan 12: a read-only device is never renamed by Kelvin
            raise CommandError("read_only_device")
        return _setup_accepted(rt, await _setup(rt).rename_radiator(r.id, body.name))
    parts: list[Callable[[Radiator], Planned]] = []
    if body.window_detection is not None:
        parts.append(lambda x: plan_feature(x, "window_detection", body.window_detection))
    if body.presence_detection is not None:
        parts.append(lambda x: plan_feature(x, "presence_detection", body.presence_detection))
    if not parts:
        raise UserError("nothing_to_change")
    return await _submit(
        rt, Label.of("settings", name=r.name), [r], lambda x: reduce(add, [f(x) for f in parts])
    )


@router.post("/radiators/{rid}/light")
async def radiator_light(rid: str, body: LightBody, request: Request):
    rt = _rt(request)
    r = _radiator(rt, rid)
    label = (
        Label.of("night_light_intensity", name=r.name, intensity=body.intensity)
        if body.intensity is not None
        else Label.of("night_light", name=r.name, on=body.on)
    )
    return await _submit(rt, label, [r], lambda x: plan_light(x, body.on, body.intensity))


@router.post("/radiators/{rid}/identify")
async def radiator_identify(rid: str, request: Request):
    rt = _rt(request)
    r = _radiator(rt, rid)
    return await _submit(rt, Label.of("identify", name=r.name), [r], plan_identify)


@router.post("/radiators/{rid}/level")
async def radiator_level(rid: str, body: LevelBody, request: Request):
    rt = _rt(request)
    r = _radiator(rt, rid)
    label = Label.of("level", name=r.name, level=body.level)
    return await _submit(rt, label, [r], lambda x: plan_level(x, body.level))


@router.post("/radiators/{rid}/dryer")
async def radiator_dryer(rid: str, body: DryerBody, request: Request):
    rt = _rt(request)
    r = _radiator(rt, rid)
    label = Label.of("dryer", name=r.name, action=body.action)
    return await _submit(rt, label, [r], lambda x: plan_dryer(x, body.action))


@router.post("/rooms/{room_id}/boost")
async def room_boost(room_id: str, body: BoostBody, request: Request):
    rt = _rt(request)
    name, rads = _room_radiators(rt, room_id)
    rads = _capable(rads, lambda c: c.boost)
    # The override manager judges the end with its injected wall clock: compute it there too.
    ends_at = rt.overrides.wall() + body.duration_min * 60
    _, p = await rt.overrides.start(
        "boost",
        [r.id for r in rads],
        body.temperature,
        ends_at,
        label=Label.of("boost", name=name, temperature=body.temperature),
        room_id=room_id,
    )
    rt.publish_overrides()
    return JSONResponse(status_code=202, content={"pending": p.view()})


@router.post("/house/away")
async def house_away(body: AwayBody, request: Request):
    rt = _rt(request)
    until = body.until
    if until.tzinfo is None:
        until = until.replace(tzinfo=ZoneInfo(rt.settings.tz))
    _, p = await rt.overrides.start(
        "away",
        # An away is a temperature: the radiators with a manual setpoint; the others stay as
        # they are.
        [r.id for r in _capable(list(rt.house.radiators.values()), lambda c: c.boost)],
        body.temperature,
        until.timestamp(),
        label=Label.of("away", temperature=body.temperature),
    )
    rt.publish_overrides()
    return JSONResponse(status_code=202, content={"pending": p.view()})


@router.delete("/overrides/{override_id}")
async def cancel_override(override_id: str, request: Request):
    rt = _rt(request)
    try:
        p = await rt.overrides.cancel(override_id)
    except KeyError as e:
        raise UserError("override_not_found", 404) from e
    rt.publish_overrides()
    return JSONResponse(status_code=202, content={"pending": p.view() if p else None})


@router.post("/house/off")
async def house_off(request: Request):
    rt = _rt(request)
    return await _submit(
        rt,
        Label.of("all_off"),
        _capable(
            list(rt.house.radiators.values()), lambda c: "off" in c.modes or "off" in c.levels
        ),
        plan_off,
    )


@router.post("/house/program")
async def house_program(request: Request):
    rt = _rt(request)
    return await _submit(
        rt,
        Label.of("all_program"),
        _capable(list(rt.house.radiators.values()), lambda c: "program" in c.modes),
        lambda r: plan_mode(r, "program"),
    )


def _ids(raw: str | None) -> list[str]:
    return check_ids((raw or "").split(","))


@router.get("/history")
async def history(
    request: Request,
    radiators: str,
    start: float | None = None,
    end: float | None = None,
    step: int = Query(default=300, ge=300, le=MAX_REPORT_DAYS * 86400),
) -> list[dict]:
    rt = _rt(request)
    ids = _ids(radiators)
    for i in ids:
        _radiator(rt, i)
    end = end or time.time()
    start = start or end - 86400
    _check_span(start, end)
    if (end - start) / step > MAX_HISTORY_POINTS:
        raise UserError("period_invalid")
    return rt.recorder.history(ids, start, end, step)


@router.get("/energy/radiators")
async def energy_radiators(
    request: Request,
    start: float,
    end: float,
    group: str = Query(default="day", pattern="^(hour|day|month)$"),
    radiators: str | None = None,
) -> list[dict]:
    """Radiators no longer in the house can be asked for by id: their history stays (L8)."""
    rt = _rt(request)
    _check_span(start, end, MAX_HOUR_DAYS if group == "hour" else MAX_REPORT_DAYS)
    ids = _ids(radiators) or list(rt.house.radiators)
    # Off the event loop: years of readings take a moment to bucket.
    return await asyncio.to_thread(rt.recorder.radiator_energy, ids, start, end, group)  # type: ignore[arg-type]


@router.get("/sessions")
async def sessions_list(request: Request) -> list[dict]:
    """The household's signed-in devices (spec §2.5): no hash, no raw user agent."""
    ctx = request.app.state.ctx
    return ctx.sessions.listing(request.cookies.get(COOKIE_NAME))


@router.delete("/sessions/{sid}", status_code=204)
async def session_revoke(sid: str, request: Request) -> Response:
    ctx = request.app.state.ctx
    try:
        ok = ctx.sessions.revoke(sid, request.cookies.get(COOKIE_NAME))
    except SessionIsCurrent:
        raise UserError("session_is_current", 409) from None
    if not ok:
        raise UserError("session_unknown", 404)
    return Response(status_code=204)


@router.post("/sessions/revoke-others")
async def sessions_revoke_others(request: Request) -> dict:
    ctx = request.app.state.ctx
    return {"revoked": ctx.sessions.revoke_others(request.cookies.get(COOKIE_NAME))}


@router.get("/mcp/tokens")
async def mcp_tokens_list(request: Request) -> dict:
    """Réglages › Compte › Accès MCP: the tokens, never a secret (spec MCP §5.4)."""
    ctx = request.app.state.ctx
    return {
        "enabled": ctx.settings.kelvin_mcp,
        "endpoint_path": "/mcp",
        "tokens": ctx.mcp_tokens.listing(),
    }


@router.post("/mcp/tokens", status_code=201)
async def mcp_token_create(body: McpTokenBody, request: Request) -> JSONResponse:
    """The only response that ever carries a token's secret: not cached anywhere."""
    ctx = request.app.state.ctx
    if not ctx.settings.kelvin_mcp:
        raise UserError("mcp_disabled", 409)
    view, secret = ctx.mcp_tokens.create(body.name)
    return JSONResponse(
        status_code=201,
        content={"token": view, "secret": secret},
        headers={"Cache-Control": "no-store"},
    )


@router.delete("/mcp/tokens/{tid}", status_code=204)
async def mcp_token_revoke(tid: str, request: Request) -> Response:
    if not request.app.state.ctx.mcp_tokens.revoke(tid):
        raise UserError("mcp_token_unknown", 404)
    return Response(status_code=204)


@router.get("/mcp/audit")
async def mcp_audit_recent(
    request: Request, limit: int = Query(default=20, ge=1, le=200)
) -> list[dict]:
    ctx = request.app.state.ctx
    return ctx.mcp_audit.recent(limit, ctx.mcp_tokens.names())


_ALERT_ID = re.compile(r"[0-9]{1,12}")  # ASCII digits only


def _alerts(rt: Runtime):
    if rt.alerts is None:
        raise UserError("alert_unknown", 404)
    return rt.alerts


@router.get("/alerts")
async def alerts_list(request: Request, state: Literal["active", "all"] = "active") -> list[dict]:
    """Kinds and params only: the web writes the words (spec §2.4)."""
    return _alerts(_rt(request)).store.listing(state)


@router.post("/alerts/{aid}/dismiss", status_code=204)
async def alert_dismiss(aid: str, request: Request) -> Response:
    svc = _alerts(_rt(request))
    if not _ALERT_ID.fullmatch(aid) or not svc.dismiss(int(aid)):
        raise UserError("alert_unknown", 404)
    return Response(status_code=204)


@router.get("/energy")
async def energy(
    request: Request,
    start: Annotated[date, Query(alias="from")],
    end: Annotated[date, Query(alias="to")],
    group: Literal["day", "week", "month", "year"] = "day",
    focus: date | None = None,
    period_from: date | None = None,
    period_to: date | None = None,
) -> dict:
    """`from`/`to`: the chart window. `focus` (a day inside the selected period) or
    `period_from`/`period_to`: the period the hero and per-radiator figures describe."""
    rt = _rt(request)
    linky = _linky(rt)
    _check_days(linky, start, end)
    if end <= start or (end - start).days > MAX_REPORT_DAYS:
        raise UserError("period_invalid")
    period: tuple[date, date] | None = None
    if period_from is not None or period_to is not None:
        if period_from is None or period_to is None or focus is not None:
            raise UserError("period_invalid")
        _check_days(linky, period_from, period_to)
        if period_to <= period_from or (period_to - period_from).days > MAX_REPORT_DAYS:
            raise UserError("period_invalid")
        period = (period_from, period_to)
    elif focus is not None:
        _check_days(linky, focus)
        first = unit_start(focus, group)
        period = (first, next_unit(first, group))
    rooms = {r.id: r.room_id for r in rt.house.radiators.values()}
    return await asyncio.to_thread(linky.report, start, end, group, rt.recorder, rooms, period)


@router.get("/energy/day")
async def energy_day(
    request: Request,
    day: Annotated[date, Query(alias="date")],
    room: str | None = None,
) -> dict:
    """One day: half-hours with power, price, € and radiator energy; reconciled totals (M7);
    power figures; with `room`, that room's samples and current overrides."""
    rt = _rt(request)
    linky = _linky(rt)
    _check_days(linky, day)
    name, rads = _room_radiators(rt, room) if room is not None else ("", [])
    rooms = {r.id: r.room_id for r in rt.house.radiators.values()}
    body = await asyncio.to_thread(linky.day_detail, day, rt.recorder, rooms)
    body["room"] = None
    if room is not None:
        ids = [r.id for r in rads]
        a, b = day_bounds(day, ZoneInfo(rt.settings.tz))
        body["room"] = {
            "id": room,
            "name": name,
            "samples": await asyncio.to_thread(rt.recorder.room_samples, ids, a, b),
            "overrides": [
                {
                    "id": o["id"],
                    "kind": o["kind"],
                    "temperature": o["temperature"],
                    "ends_at": o["ends_at"],
                }
                for o in rt.overrides.active()
                if set(o["radiator_ids"]) & set(ids)
            ],
        }
    return body


@router.get("/linky/curve")
async def linky_curve(request: Request, day: Annotated[date, Query(alias="date")]) -> dict:
    linky = _linky(_rt(request))
    _check_days(linky, day)
    return linky.curve_day(day)


@router.get("/settings")
async def get_settings(request: Request) -> dict:
    return _linky(_rt(request)).settings_view()


@router.put("/settings")
async def put_settings(body: SettingsBody, request: Request) -> dict:
    rt = _rt(request)
    linky = _linky(rt)
    t = body.tariff
    try:
        if isinstance(t, TariffDocBody):
            linky.tariffs.replace(t.to_tariff())
        else:
            linky.tariffs.update(t.to_update())
    except UserError:
        raise
    except ValueError as e:  # anything the codes do not cover is still a 422, never a 500
        raise UserError("invalid_request") from e
    if rt.alerts:
        rt.alerts.request()  # a saved price row resolves price_change at once
    if rt.grid is not None:
        if rt.scheduler is not None and rt.grid.tempo_needed():
            rt.scheduler.request("tempo")  # a Tempo tariff needs its colours now
        rt.broadcaster.publish("grid", rt.grid.view())  # the strip follows the option at once
    return linky.settings_view()


@router.post("/grid/tempo-prices")
async def grid_tempo_prices(request: Request) -> dict:
    """The six published Tempo prices for the tariff form (spec §2.2): at most one MED call a
    week, from the shared ledger. Shown with their source and date; Kelvin never saves them."""
    rt = _rt(request)
    if rt.grid is None:
        raise UserError("tempo_prices_unavailable", 503)
    try:
        return await rt.grid.tempo_prices()
    except BudgetSpent:
        raise UserError("med_quota", 429) from None
    except GridError:
        raise UserError("tempo_prices_unavailable", 503) from None


@router.get("/settings/linky")
async def get_linky(request: Request) -> dict:
    return _linky(_rt(request)).status()


@router.put("/settings/linky")
async def put_linky(body: LinkyBody, request: Request) -> dict:
    """The token is write-only: never in a response, a log or an error. Left out (or blank), the
    stored one is reused."""
    ctx = request.app.state.ctx
    rt = _rt(request)
    linky = _linky(rt)
    prm = body.prm.strip()
    if not _PRM.fullmatch(prm):
        raise UserError("pdl_invalid")
    token = (body.token or "").strip() or None
    if token is None:
        stored = linky_credentials(ctx.account, ctx.settings)
        token = stored[1] if stored else None
    if not token:
        raise UserError("token_missing")
    try:
        await linky.configure(prm, token)
    except BudgetExceeded:
        raise UserError("linky_quota", 429) from None
    except LinkyAuthError:
        raise UserError("linky_refused") from None
    except LinkyThrottled:
        raise UserError("linky_throttled", 503) from None
    except LinkyError:
        raise UserError("med_unreachable", 503) from None
    async with ctx.lock:  # a login may replace the account (new password) at the same time
        if ctx.account is not None:
            ctx.account = replace(ctx.account, med_prm=prm, med_token=token)
            ctx.accounts.save(ctx.account)
    if rt.alerts:
        rt.alerts.request()  # a new token resolves linky_stalled after its sync
    return linky.status()


def _setup(rt: Runtime) -> SetupService:
    if rt.setup is None:
        raise UserError("cozytouch_unavailable", 503)
    return rt.setup


def _setup_accepted(rt: Runtime, p: SetupPending) -> JSONResponse:
    rt.pump.wake()  # poll fast until Cozytouch confirms
    return JSONResponse(status_code=202, content={"pending": p.view()})


@router.get("/setup/devices")
async def setup_devices(request: Request) -> dict:
    """Rooms, radiators with their sub-devices, bridge devices and the sync status (memory)."""
    return _rt(request).setup_view()


@router.post("/setup/rooms")
async def setup_create_room(body: LabelBody, request: Request):
    rt = _rt(request)
    return _setup_accepted(rt, await _setup(rt).create_room(body.label))


@router.patch("/setup/rooms/{room_id}")
async def setup_rename_room(room_id: str, body: LabelBody, request: Request):
    rt = _rt(request)
    return _setup_accepted(rt, await _setup(rt).rename_room(room_id, body.label))


@router.delete("/setup/rooms/{room_id}")
async def setup_delete_room(room_id: str, request: Request):
    rt = _rt(request)
    return _setup_accepted(rt, await _setup(rt).delete_room(room_id))


@router.post("/radiators/{rid}/move")
async def radiator_move(rid: str, body: MoveBody, request: Request):
    rt = _rt(request)
    return _setup_accepted(rt, await _setup(rt).move_radiator(rid, body.room_id))


@router.post("/setup/devices/{device_id}/tidy")
async def setup_tidy(device_id: str, request: Request):
    rt = _rt(request)
    if not _DEVICE_ID.fullmatch(device_id):
        raise UserError("device_unknown", 404)
    return _setup_accepted(rt, await _setup(rt).tidy(device_id))


@router.post("/setup/sync")
async def setup_sync(request: Request):
    """« Synchroniser »: one full setup read soon, if the daily budget has one left."""
    rt = _rt(request)
    if rt.refresher is None:
        raise UserError("cozytouch_unavailable", 503)
    try:
        rt.refresher.request_manual()
    except SyncSpent as e:
        raise UserError(
            "setup_sync_spent", 429, used=e.used, limit=e.limit, next_at=e.next_at
        ) from None
    rt.pump.wake()
    return JSONResponse(status_code=202, content={"sync": rt.refresher.view()})
