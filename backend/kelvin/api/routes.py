from __future__ import annotations

import asyncio
import re
import time
from collections.abc import Callable
from dataclasses import replace
from datetime import date
from functools import reduce
from operator import add
from typing import Annotated, Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse
from sse_starlette.sse import EventSourceResponse

from kelvin.account import linky_credentials
from kelvin.api.auth_routes import status_word
from kelvin.api.guards import LoginRequired, require_kelvin_header, require_session
from kelvin.api.runtime import Runtime
from kelvin.api.schemas import (
    AwayBody,
    BoostBody,
    FeaturesBody,
    LightBody,
    LinkyBody,
    ModeBody,
    ProgramBody,
    SetpointBody,
    SettingsBody,
)
from kelvin.api.sse import event_stream
from kelvin.auth.sessions import COOKIE_NAME
from kelvin.billing.report import next_unit, unit_start
from kelvin.billing.room_energy import MAX_ROOM_DAYS
from kelvin.commands.translate import (
    Planned,
    plan_feature,
    plan_identify,
    plan_light,
    plan_mode,
    plan_program,
    plan_rename,
    plan_setpoint,
)
from kelvin.errors import UserError
from kelvin.house.model import Radiator
from kelvin.labels import Label
from kelvin.linky.models import LinkyAuthError, LinkyError, LinkyThrottled, day_bounds
from kelvin.linky.service import LinkyService
from kelvin.linky.sync import BudgetExceeded
from kelvin.overkiz.budget import QuotasUnavailable
from kelvin.overkiz.errors import GatewayError

router = APIRouter(dependencies=[Depends(require_kelvin_header), Depends(require_session)])
MAX_REPORT_DAYS = 4 * 366
MAX_HOUR_DAYS = 62  # hourly radiator buckets: two months at most
MAX_HISTORY_POINTS = 10_000  # per radiator
MAX_RADIATORS = 50
_RADIATOR_ID = re.compile(r"[A-Za-z0-9_.-]{1,64}")
FIRST_TS = 946_684_800  # 2000-01-01T00:00:00Z
_PRM = re.compile(r"[0-9]{14}")  # ASCII digits only
FIRST_DAY = date(2000, 1, 1)


def _rt(request: Request) -> Runtime:
    rt = request.app.state.ctx.rt
    if rt is None:
        raise LoginRequired()
    return rt


def _radiator(rt: Runtime, rid: str) -> Radiator:
    r = rt.house.radiators.get(rid)
    if r is None:
        raise UserError("radiator_unknown", 404)
    return r


def _room_radiators(rt: Runtime, room_id: str) -> tuple[str, list[Radiator]]:
    room = rt.house.rooms.get(room_id)
    if room is None:
        raise UserError("room_unknown", 404)
    return room.name, rt.house.room_radiators(room_id)


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
    }


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


@router.post("/rooms/{room_id}/mode")
async def room_mode(room_id: str, body: ModeBody, request: Request):
    rt = _rt(request)
    name, rads = _room_radiators(rt, room_id)
    return await _submit(
        rt, Label.of("mode", name=name, mode=body.mode), rads, lambda r: plan_mode(r, body.mode)
    )


@router.post("/rooms/{room_id}/setpoint")
async def room_setpoint(room_id: str, body: SetpointBody, request: Request):
    rt = _rt(request)
    name, rads = _room_radiators(rt, room_id)
    return await _submit(
        rt,
        Label.of("setpoint", name=name, kind=body.kind, value=body.value),
        rads,
        lambda r: plan_setpoint(r, body.kind, body.value),
    )


@router.put("/rooms/{room_id}/program")
async def room_program(room_id: str, body: ProgramBody, request: Request):
    rt = _rt(request)
    name, rads = _room_radiators(rt, room_id)
    week = body.week()
    return await _submit(rt, Label.of("program", name=name), rads, lambda r: plan_program(r, week))


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
    week = body.week()
    return await _submit(rt, Label.of("program", name=r.name), [r], lambda x: plan_program(x, week))


@router.patch("/radiators/{rid}/features")
async def radiator_features(rid: str, body: FeaturesBody, request: Request):
    rt = _rt(request)
    r = _radiator(rt, rid)
    parts: list[Callable[[Radiator], Planned]] = []
    if body.window_detection is not None:
        parts.append(lambda x: plan_feature(x, "window_detection", body.window_detection))
    if body.presence_detection is not None:
        parts.append(lambda x: plan_feature(x, "presence_detection", body.presence_detection))
    if body.name is not None:
        parts.append(lambda x: plan_rename(x, body.name))
    if not parts:
        raise UserError("nothing_to_change")
    return await _submit(
        rt, Label.of("settings", name=r.name), [r], lambda x: reduce(add, [f(x) for f in parts])
    )


@router.post("/radiators/{rid}/light")
async def radiator_light(rid: str, body: LightBody, request: Request):
    rt = _rt(request)
    r = _radiator(rt, rid)
    label = Label.of("night_light", name=r.name, on=body.on)
    return await _submit(rt, label, [r], lambda x: plan_light(x, body.on, body.intensity))


@router.post("/radiators/{rid}/identify")
async def radiator_identify(rid: str, request: Request):
    rt = _rt(request)
    r = _radiator(rt, rid)
    return await _submit(rt, Label.of("identify", name=r.name), [r], plan_identify)


@router.post("/rooms/{room_id}/boost")
async def room_boost(room_id: str, body: BoostBody, request: Request):
    rt = _rt(request)
    name, rads = _room_radiators(rt, room_id)
    ends_at = time.time() + body.duration_min * 60
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
        list(rt.house.radiators),
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
        list(rt.house.radiators.values()),
        lambda r: plan_mode(r, "off"),
    )


@router.post("/house/program")
async def house_program(request: Request):
    rt = _rt(request)
    return await _submit(
        rt,
        Label.of("all_program"),
        list(rt.house.radiators.values()),
        lambda r: plan_mode(r, "program"),
    )


def _check_span(start: float, end: float, max_days: int = MAX_REPORT_DAYS) -> None:
    """Epoch windows get the same bounds as the dated reports: from 2000-01-01 to two years
    ahead, `end` after `start`, at most `max_days` long. Every query below is bounded."""
    hi = time.time() + 2 * 366 * 86400
    if not (FIRST_TS <= start < end <= hi) or end - start > max_days * 86400:
        raise UserError("period_invalid")


def _ids(raw: str | None) -> list[str]:
    ids = list(dict.fromkeys(i for i in (raw or "").split(",") if i))
    if len(ids) > MAX_RADIATORS:
        raise UserError("too_many_radiators")
    if not all(_RADIATOR_ID.fullmatch(i) for i in ids):
        raise UserError("radiator_unknown")
    return ids


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


def _linky(rt: Runtime) -> LinkyService:
    if rt.linky is None:
        raise UserError("linky_unavailable", 503)
    return rt.linky


def _check_days(linky: LinkyService, *days: date) -> None:
    """Dates from 2000-01-01 to two years ahead: no overflow near date.max."""
    today = linky.today()
    try:
        last = today.replace(year=today.year + 2)
    except ValueError:  # 29 February
        last = today.replace(year=today.year + 2, day=28)
    if any(not FIRST_DAY <= d <= last for d in days):
        raise UserError("period_invalid")


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
    linky = _linky(_rt(request))
    try:
        linky.tariffs.update(body.tariff.to_update())
    except UserError:  # coded: prices, power, option, slots
        raise
    except ValueError as e:  # anything the codes do not cover is still a 422, never a 500
        raise UserError("invalid_request") from e
    return linky.settings_view()


@router.get("/settings/linky")
async def get_linky(request: Request) -> dict:
    return _linky(_rt(request)).status()


@router.put("/settings/linky")
async def put_linky(body: LinkyBody, request: Request) -> dict:
    """The token is write-only: never in a response, a log or an error. Left out (or blank), the
    stored one is reused."""
    ctx = request.app.state.ctx
    linky = _linky(_rt(request))
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
    return linky.status()
