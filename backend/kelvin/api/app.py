import time
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exception_handlers import http_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.types import ASGIApp

from kelvin.api.auth_routes import public
from kelvin.api.context import boot, open_context
from kelvin.api.guards import LOGIN_REQUIRED_BODY, LoginRequired
from kelvin.api.headers import SecurityHeaders
from kelvin.api.routes import router
from kelvin.api.web import mount_web
from kelvin.config import Settings, split_list
from kelvin.errors import UserError, invalid_request_detail
from kelvin.overkiz.gateway import Gateway


class KelvinApp(FastAPI):
    """FastAPI with the security headers wrapped around the whole stack.

    Starlette's ServerErrorMiddleware sits outside every user middleware, so a plain
    add_middleware would leave an unhandled-exception 500 without the headers.
    """

    def build_middleware_stack(self) -> ASGIApp:
        return SecurityHeaders(super().build_middleware_stack())


def create_app(
    settings: Settings | None = None,
    gateway: Gateway | None = None,
    *,
    start_tasks: bool = True,
    wall: Callable[[], float] = time.time,
) -> FastAPI:
    """`wall`: the runtime's wall clock (tests pin it so the simulator's history does not
    depend on the hour they run at)."""
    settings = settings or Settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        ctx = open_context(settings, gateway, start_tasks=start_tasks, wall=wall)
        app.state.ctx = ctx
        try:
            await boot(ctx)
            yield
        finally:
            await ctx.close()

    docs = settings.kelvin_debug  # the API docs are off unless KELVIN_DEBUG=1
    app = KelvinApp(
        title="Kelvin",
        lifespan=lifespan,
        docs_url="/docs" if docs else None,
        redoc_url="/redoc" if docs else None,
        openapi_url="/openapi.json" if docs else None,
    )

    @app.exception_handler(LoginRequired)
    async def login_required(request: Request, exc: LoginRequired) -> JSONResponse:
        return JSONResponse(status_code=401, content=LOGIN_REQUIRED_BODY)

    @app.exception_handler(UserError)
    async def user_error(request: Request, exc: UserError) -> JSONResponse:
        return JSONResponse(status_code=exc.status, content=exc.body())

    @app.exception_handler(StarletteHTTPException)
    async def framework_error(request: Request, exc: StarletteHTTPException):
        """The router's own 404/405 (no SPA catch-all mounted) answer with codes too."""
        code = {404: "not_found", 405: "method_not_allowed"}.get(exc.status_code)
        if code is None:
            return await http_exception_handler(request, exc)
        return JSONResponse(
            status_code=exc.status_code,
            content=UserError(code, exc.status_code).body(),
            headers=getattr(exc, "headers", None),
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        field, msg = "", ""
        errors = exc.errors()
        if errors and errors[0].get("type") != "json_invalid":  # its loc is a byte offset
            e = errors[0]
            field = ".".join(
                str(x)
                for x in e.get("loc", ())
                if x not in ("body", "query", "path") and not isinstance(x, int)
            )
            msg = str(e.get("msg", ""))
        return JSONResponse(
            status_code=422,
            content={
                "detail": invalid_request_detail(field, msg),
                "code": "invalid_request",
                "params": {"field": field} if field else {},
            },
        )

    app.include_router(public, prefix="/api")
    app.include_router(router, prefix="/api")
    mount_web(app, settings.kelvin_web)
    # SecurityHeaders wraps the whole stack (KelvinApp), so a 400 for a wrong Host and an
    # unhandled 500 carry the security headers too.
    hosts = split_list(settings.kelvin_allowed_hosts)
    if hosts:  # the container healthcheck and a local shell reach Kelvin as localhost
        app.add_middleware(TrustedHostMiddleware, allowed_hosts=[*hosts, "localhost", "127.0.0.1"])
    return app
