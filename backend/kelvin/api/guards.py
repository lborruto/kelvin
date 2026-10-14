"""Route guards: the X-Kelvin header on mutations, and a session on everything but auth/health."""

from fastapi import HTTPException, Request

from kelvin.auth.sessions import COOKIE_NAME

MUTATING_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})
LOGIN_REQUIRED_BODY = {"detail": "Connexion requise.", "code": "login_required"}


class LoginRequired(Exception):
    """No valid session, or Kelvin is waiting for the home's Cozytouch login (no runtime)."""


def require_kelvin_header(request: Request) -> None:
    """Block drive-by cross-site form posts: browsers cannot add a custom header to those."""
    if request.method in MUTATING_METHODS and request.headers.get("x-kelvin") != "1":
        raise HTTPException(403, "En-tête X-Kelvin manquant.")


def require_session(request: Request) -> None:
    ctx = request.app.state.ctx
    if ctx.rt is None or not ctx.sessions.validate(request.cookies.get(COOKIE_NAME)):
        raise LoginRequired()
