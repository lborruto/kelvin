from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.types import ASGIApp

from kelvin.api.auth_routes import public
from kelvin.api.context import boot, open_context
from kelvin.api.guards import LOGIN_REQUIRED_BODY, LoginRequired
from kelvin.api.headers import SecurityHeaders
from kelvin.api.routes import router
from kelvin.api.web import mount_web
from kelvin.config import Settings, split_list
from kelvin.overkiz.gateway import Gateway


class KelvinApp(FastAPI):
    """FastAPI with the security headers wrapped around the whole stack.

    Starlette's ServerErrorMiddleware sits outside every user middleware, so a plain
    add_middleware would leave an unhandled-exception 500 without the headers.
    """

    def build_middleware_stack(self) -> ASGIApp:
        return SecurityHeaders(super().build_middleware_stack())


def create_app(
    settings: Settings | None = None, gateway: Gateway | None = None, *, start_tasks: bool = True
) -> FastAPI:
    settings = settings or Settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        ctx = open_context(settings, gateway, start_tasks=start_tasks)
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

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        errors = exc.errors()
        if errors:
            e = errors[0]
            loc = [str(x) for x in e.get("loc", ()) if x not in ("body", "query", "path")]
            field = ".".join(loc)
            msg = (
                f"Requête invalide : {field} — {e.get('msg', '')}" if field else "Requête invalide."
            )
        else:
            msg = "Requête invalide."
        return JSONResponse(status_code=422, content={"detail": msg})

    app.include_router(public, prefix="/api")
    app.include_router(router, prefix="/api")
    mount_web(app, settings.kelvin_web)
    # SecurityHeaders wraps the whole stack (KelvinApp), so a 400 for a wrong Host and an
    # unhandled 500 carry the security headers too.
    hosts = split_list(settings.kelvin_allowed_hosts)
    if hosts:  # the container healthcheck and a local shell reach Kelvin as localhost
        app.add_middleware(TrustedHostMiddleware, allowed_hosts=[*hosts, "localhost", "127.0.0.1"])
    return app
