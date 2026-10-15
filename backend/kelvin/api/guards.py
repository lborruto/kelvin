"""Route guards: the X-Kelvin header on mutations, and a session on everything but auth/health."""

from fastapi import Request

from kelvin.auth.sessions import COOKIE_NAME
from kelvin.errors import UserError

MUTATING_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})
LOGIN_REQUIRED_BODY = UserError("login_required", 401).body()


class LoginRequired(Exception):
    """No valid session, or Kelvin is waiting for the home's Cozytouch login (no runtime)."""


def require_kelvin_header(request: Request) -> None:
    """Block drive-by cross-site form posts: browsers cannot add a custom header to those."""
    if request.method in MUTATING_METHODS and request.headers.get("x-kelvin") != "1":
        raise UserError("header_missing", 403)


def require_session(request: Request) -> None:
    ctx = request.app.state.ctx
    if ctx.rt is None or not ctx.sessions.validate(request.cookies.get(COOKIE_NAME)):
        raise LoginRequired()
