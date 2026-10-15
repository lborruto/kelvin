"""Routes open without a session: health and the Cozytouch login (spec §3.7)."""

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from kelvin.api.guards import require_kelvin_header
from kelvin.api.schemas import LoginBody
from kelvin.auth.service import LoginRefused
from kelvin.auth.service import login as auth_login
from kelvin.auth.sessions import COOKIE_NAME, SESSION_TTL_S
from kelvin.auth.throttle import client_key
from kelvin.overkiz.servers import SERVERS

public = APIRouter(dependencies=[Depends(require_kelvin_header)])


def status_word(ctx) -> str:
    rt = ctx.rt
    if rt is None:
        return ctx.mode
    return "ok" if rt.pump.connected else "degraded"


def _client_ip(request: Request) -> str:
    return client_key(request.client.host) if request.client else "unknown"


def _set_cookie(response: JSONResponse, request: Request, token: str) -> None:
    response.set_cookie(
        COOKIE_NAME,
        token,
        max_age=SESSION_TTL_S,
        path="/",
        httponly=True,
        samesite="lax",
        secure=request.url.scheme == "https",
    )


@public.get("/health")
async def health(request: Request) -> dict:
    """Open to anyone: the status word only. The details are GET /api/status (session)."""
    return {"status": status_word(request.app.state.ctx)}


@public.post("/auth/login")
async def login(body: LoginBody, request: Request) -> JSONResponse:
    ctx = request.app.state.ctx
    try:
        account = await auth_login(
            ctx,
            body.email,
            body.password,
            _client_ip(request),
            body.chosen_server(),
        )
    except LoginRefused as e:
        return JSONResponse(status_code=e.status, content=e.body())
    token = ctx.sessions.create(request.headers.get("user-agent"))
    response = JSONResponse({"email": account.email, "logged_in": True})
    _set_cookie(response, request, token)
    return response


@public.post("/auth/logout")
async def logout(request: Request) -> JSONResponse:
    ctx = request.app.state.ctx
    ctx.sessions.delete(request.cookies.get(COOKIE_NAME))
    response = JSONResponse({"email": None, "logged_in": False})
    response.delete_cookie(COOKIE_NAME, path="/", httponly=True, samesite="lax")
    return response


@public.get("/auth/servers")
async def servers(request: Request) -> dict:
    """Open: the servers Kelvin offers, and the home's server once claimed (never its email)."""
    ctx = request.app.state.ctx
    return {
        "servers": [s.view() for s in SERVERS.values()],
        "current": ctx.account.server if ctx.account is not None else None,
    }


@public.get("/auth/me")
async def me(request: Request) -> JSONResponse:
    ctx = request.app.state.ctx
    token = request.cookies.get(COOKIE_NAME)
    logged_in = ctx.rt is not None and ctx.sessions.validate(token)
    rejected = ctx.rt is not None and ctx.rt.pump.auth_rejected
    response = JSONResponse(
        {
            "email": ctx.account.email if logged_in and ctx.account else None,
            "logged_in": logged_in,
            "setup": ctx.mode == "setup",
            "reauth": ctx.mode == "reauth" or rejected,
            "simulator": ctx.settings.kelvin_fake,
            "server": SERVERS[ctx.account.server].view() if logged_in and ctx.account else None,
        }
    )
    if logged_in and token:
        _set_cookie(response, request, token)  # sliding: every app start renews the year
    return response
