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

from fastapi import APIRouter, Depends, HTTPException, Query, Request
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
from kelvin.commands.translate import (
    MODE_LABELS,
    CommandError,
    Planned,
    plan_feature,
    plan_identify,
    plan_light,
    plan_mode,
    plan_program,
    plan_rename,
    plan_setpoint,
)
from kelvin.house.model import Radiator
from kelvin.linky.models import LinkyAuthError, LinkyError, LinkyThrottled
from kelvin.linky.service import LinkyService
from kelvin.linky.sync import BudgetExceeded
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
KIND_LABELS = {"manual": "consigne", "comfort": "confort", "eco": "abaissement éco"}


def _rt(request: Request) -> Runtime:
    rt = request.app.state.ctx.rt
    if rt is None:
        raise LoginRequired()
    return rt


def _radiator(rt: Runtime, rid: str) -> Radiator:
    r = rt.house.radiators.get(rid)
    if r is None:
        raise HTTPException(404, "Radiateur inconnu.")
    return r


def _room_radiators(rt: Runtime, room_id: str) -> tuple[str, list[Radiator]]:
    room = rt.house.rooms.get(room_id)
    if room is None:
        raise HTTPException(404, "Pièce inconnue.")
    return room.name, rt.house.room_radiators(room_id)


async def _submit(
    rt: Runtime, label: str, rads: list[Radiator], build: Callable[[Radiator], Planned]
) -> JSONResponse:
    try:
        planned = reduce(add, [build(r) for r in rads])
    except CommandError as e:
        raise HTTPException(422, str(e)) from e
    p = await rt.commands.submit(label, tuple(r.id for r in rads), planned)
    return JSONResponse(status_code=202, content={"pending": p.view()})


def _fmt(v: float) -> str:
    return f"{v:g}".replace(".", ",")


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
        raise HTTPException(503, "Quotas indisponibles.")
    try:
        return await rt.quotas.get()
    except GatewayError:
        raise HTTPException(503, "Cozytouch injoignable, réessayez plus tard.") from None


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
        rt, f"{name} : {MODE_LABELS[body.mode]}", rads, lambda r: plan_mode(r, body.mode)
    )


@router.post("/rooms/{room_id}/setpoint")
async def room_setpoint(room_id: str, body: SetpointBody, request: Request):
    rt = _rt(request)
    name, rads = _room_radiators(rt, room_id)
    return await _submit(
        rt,
        f"{name} : {KIND_LABELS[body.kind]} {_fmt(body.value)} °C",
        rads,
        lambda r: plan_setpoint(r, body.kind, body.value),
    )


@router.put("/rooms/{room_id}/program")
async def room_program(room_id: str, body: ProgramBody, request: Request):
    rt = _rt(request)
    name, rads = _room_radiators(rt, room_id)
    week = body.week()
    return await _submit(rt, f"{name} : programme", rads, lambda r: plan_program(r, week))


@router.post("/radiators/{rid}/mode")
async def radiator_mode(rid: str, body: ModeBody, request: Request):
    rt = _rt(request)
    r = _radiator(rt, rid)
    return await _submit(
        rt, f"{r.name} : {MODE_LABELS[body.mode]}", [r], lambda x: plan_mode(x, body.mode)
    )


@router.post("/radiators/{rid}/setpoint")
async def radiator_setpoint(rid: str, body: SetpointBody, request: Request):
    rt = _rt(request)
    r = _radiator(rt, rid)
    return await _submit(
        rt,
        f"{r.name} : {KIND_LABELS[body.kind]} {_fmt(body.value)} °C",
        [r],
        lambda x: plan_setpoint(x, body.kind, body.value),
    )


@router.put("/radiators/{rid}/program")
async def radiator_program(rid: str, body: ProgramBody, request: Request):
    rt = _rt(request)
    r = _radiator(rt, rid)
    week = body.week()
    return await _submit(rt, f"{r.name} : programme", [r], lambda x: plan_program(x, week))


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
        raise HTTPException(422, "Rien à modifier.")
    return await _submit(
        rt, f"{r.name} : réglages", [r], lambda x: reduce(add, [f(x) for f in parts])
    )


@router.post("/radiators/{rid}/light")
async def radiator_light(rid: str, body: LightBody, request: Request):
    rt = _rt(request)
    r = _radiator(rt, rid)
    label = f"{r.name} : veilleuse {'allumée' if body.on else 'éteinte'}"
    return await _submit(rt, label, [r], lambda x: plan_light(x, body.on, body.intensity))


@router.post("/radiators/{rid}/identify")
async def radiator_identify(rid: str, request: Request):
    rt = _rt(request)
    r = _radiator(rt, rid)
    return await _submit(rt, f"{r.name} : identification", [r], plan_identify)


@router.post("/rooms/{room_id}/boost")
async def room_boost(room_id: str, body: BoostBody, request: Request):
    rt = _rt(request)
    name, rads = _room_radiators(rt, room_id)
    ends_at = time.time() + body.duration_min * 60
    try:
        _, p = await rt.overrides.start(
            "boost",
            [r.id for r in rads],
            body.temperature,
            ends_at,
            label=f"{name} : forcé à {_fmt(body.temperature)} °C",
            room_id=room_id,
        )
    except CommandError as e:
        raise HTTPException(422, str(e)) from e
    rt.publish_overrides()
    return JSONResponse(status_code=202, content={"pending": p.view()})


@router.post("/house/away")
async def house_away(body: AwayBody, request: Request):
    rt = _rt(request)
    until = body.until
    if until.tzinfo is None:
        until = until.replace(tzinfo=ZoneInfo(rt.settings.tz))
    try:
        _, p = await rt.overrides.start(
            "away",
            list(rt.house.radiators),
            body.temperature,
            until.timestamp(),
            label=f"Absence à {_fmt(body.temperature)} °C",
        )
    except CommandError as e:
        raise HTTPException(422, str(e)) from e
    rt.publish_overrides()
    return JSONResponse(status_code=202, content={"pending": p.view()})


@router.delete("/overrides/{override_id}")
async def cancel_override(override_id: str, request: Request):
    rt = _rt(request)
    try:
        p = await rt.overrides.cancel(override_id)
    except KeyError as e:
        raise HTTPException(404, "Forçage ou absence introuvable.") from e
    rt.publish_overrides()
    return JSONResponse(status_code=202, content={"pending": p.view() if p else None})


@router.post("/house/off")
async def house_off(request: Request):
    rt = _rt(request)
    return await _submit(
        rt, "Tout éteindre", list(rt.house.radiators.values()), lambda r: plan_mode(r, "off")
    )


@router.post("/house/program")
async def house_program(request: Request):
    rt = _rt(request)
    return await _submit(
        rt,
        "Tout en programme",
        list(rt.house.radiators.values()),
        lambda r: plan_mode(r, "program"),
    )


def _check_span(start: float, end: float, max_days: int = MAX_REPORT_DAYS) -> None:
    """Epoch windows get the same bounds as the dated reports: from 2000-01-01 to two years
    ahead, `end` after `start`, at most `max_days` long. Every query below is bounded."""
    hi = time.time() + 2 * 366 * 86400
    if not (FIRST_TS <= start < end <= hi) or end - start > max_days * 86400:
        raise HTTPException(422, "Période invalide.")


def _ids(raw: str | None) -> list[str]:
    ids = list(dict.fromkeys(i for i in (raw or "").split(",") if i))
    if len(ids) > MAX_RADIATORS:
        raise HTTPException(422, "Trop de radiateurs dans la demande.")
    if not all(_RADIATOR_ID.fullmatch(i) for i in ids):
        raise HTTPException(422, "Radiateur inconnu.")
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
        raise HTTPException(422, "Période invalide.")
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
        raise HTTPException(503, "Linky indisponible.")
    return rt.linky


def _check_days(linky: LinkyService, *days: date) -> None:
    """Dates from 2000-01-01 to two years ahead: no overflow near date.max."""
    today = linky.today()
    try:
        last = today.replace(year=today.year + 2)
    except ValueError:  # 29 February
        last = today.replace(year=today.year + 2, day=28)
    if any(not FIRST_DAY <= d <= last for d in days):
        raise HTTPException(422, "Période invalide.")


@router.get("/energy")
async def energy(
    request: Request,
    start: Annotated[date, Query(alias="from")],
    end: Annotated[date, Query(alias="to")],
    group: Literal["day", "month", "year"] = "day",
) -> dict:
    rt = _rt(request)
    linky = _linky(rt)
    _check_days(linky, start, end)
    if end <= start or (end - start).days > MAX_REPORT_DAYS:
        raise HTTPException(422, "Période invalide.")
    radiator_ids = list(rt.house.radiators)
    return await asyncio.to_thread(linky.report, start, end, group, rt.recorder, radiator_ids)


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
    except ValueError as e:  # French messages: prices, power, option, slots
        raise HTTPException(422, str(e)) from e
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
        raise HTTPException(422, "Le PDL compte 14 chiffres.")
    token = (body.token or "").strip() or None
    if token is None:
        stored = linky_credentials(ctx.account, ctx.settings)
        token = stored[1] if stored else None
    if not token:
        raise HTTPException(422, "Collez le jeton MyElectricalData.")
    try:
        await linky.configure(prm, token)
    except BudgetExceeded:
        raise HTTPException(429, "Quota Linky du jour atteint : réessayez demain.") from None
    except LinkyAuthError:
        raise HTTPException(422, "MyElectricalData refuse ce PDL ou ce jeton.") from None
    except LinkyThrottled:
        raise HTTPException(503, "Enedis limite les requêtes : réessayez plus tard.") from None
    except LinkyError:
        raise HTTPException(503, "MyElectricalData injoignable, réessayez plus tard.") from None
    async with ctx.lock:  # a login may replace the account (new password) at the same time
        if ctx.account is not None:
            ctx.account = replace(ctx.account, med_prm=prm, med_token=token)
            ctx.accounts.save(ctx.account)
    return linky.status()
