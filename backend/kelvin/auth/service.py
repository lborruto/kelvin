"""The login decision (spec §3.7). Login = the home's Cozytouch account."""

from __future__ import annotations

import hmac
import logging
from dataclasses import replace
from typing import TYPE_CHECKING, Any

from kelvin.account import Account
from kelvin.api.runtime import SERVER_KEY, stop_runtime
from kelvin.auth.throttle import retry_minutes
from kelvin.errors import TEMPLATES, UserError
from kelvin.overkiz.errors import AuthError, BadCredentialsError, GatewayError, QuotaError
from kelvin.overkiz.servers import DEFAULT_SERVER, SERVERS, is_cozytouch, server_name

if TYPE_CHECKING:
    from kelvin.api.context import AppContext

log = logging.getLogger(__name__)

WRONG_ACCOUNT = TEMPLATES["wrong_account"]
BAD_CREDENTIALS = TEMPLATES["bad_credentials"]
UNREACHABLE = TEMPLATES["cozytouch_unreachable"]


class LoginRefused(UserError):
    """A refused login: HTTP status, code and params; `message` is the French detail."""

    def __init__(self, status: int, code: str, **params: Any) -> None:
        super().__init__(code, status, **params)

    @property
    def message(self) -> str:
        return self.detail


def _cozytouch_answered(e: GatewayError) -> bool:
    """A ban/quota or auth answer is a real Cozytouch round trip: it counts like a refusal, so
    logins cannot keep extending a lockout. Transport errors and timeouts do not."""
    return isinstance(e, (QuotaError, AuthError))


def _same_password(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode(), b.encode())


def _bad_credentials(server: str) -> LoginRefused:
    """The Cozytouch servers keep their message; other servers are named (Plan 12)."""
    if is_cozytouch(server):
        return LoginRefused(401, "bad_credentials")
    return LoginRefused(401, "bad_credentials_server", server=server_name(server))


async def login(
    ctx: AppContext, email: str, password: str, ip: str, server: str | None = None
) -> Account:
    email = email.strip()
    async with ctx.lock:
        wait = ctx.throttle.ip_retry_after(ip)  # first: nothing is compared from a blocked IP
        if wait is not None:
            raise LoginRefused(429, "too_many_attempts", minutes=retry_minutes(wait))
        account = ctx.account
        if server is None:  # the login screen names no server once the home is claimed
            server = account.server if account is not None else DEFAULT_SERVER
        if server not in SERVERS:
            raise LoginRefused(422, "server_unknown")
        if account is not None and not account.same_email(email):
            ctx.throttle.failure(ip, reached_overkiz=False)
            raise LoginRefused(401, "wrong_account")
        if account is not None and account.server != server:
            # The home's account is (server, email): switching server is a fresh install.
            ctx.throttle.failure(ip, reached_overkiz=False)
            raise LoginRefused(409, "server_mismatch", server=server_name(account.server))
        if account is None:
            held = ctx.db.get_setting(SERVER_KEY)
            if held is not None and held != server:
                # Like the simulator-data guard: this folder holds another server's home.
                ctx.throttle.failure(ip, reached_overkiz=False)
                raise LoginRefused(409, "data_other_server", server=server_name(held))
        rt = ctx.rt
        # Cozytouch refused the stored password (pump or boot): every password, the old one
        # included, then goes to Cozytouch. Answering the old one locally would be a timing
        # oracle for it; the global gate already bounds the lockout risk.
        rejected = account is not None and (rt is None or rt.pump.auth_rejected)
        # The stored password is compared locally only while the runtime trusts it. From here
        # on, a miss against it is a local guess: it counts against the IP unless Cozytouch
        # itself accepts the password (a changed password), so no outcome below can serve as
        # an unthrottled oracle for the stored password.
        compared = account is not None and not rejected
        if compared and _same_password(password, account.password):
            return account  # no Overkiz call: works while Cozytouch is down
        wait = ctx.throttle.global_retry_after()  # before any Overkiz call
        if wait is not None:
            if compared:
                ctx.throttle.failure(ip, reached_overkiz=False)
            raise LoginRefused(429, "too_many_attempts", minutes=retry_minutes(wait))
        if rt is None or account is None:
            new = (
                replace(account, password=password)
                if account is not None
                else Account(email, password, server=server)
            )
            try:
                await ctx.start(new)
            except BadCredentialsError:
                ctx.throttle.failure(ip, reached_overkiz=True)
                raise _bad_credentials(server) from None
            except GatewayError as e:
                if _cozytouch_answered(e):
                    ctx.throttle.failure(ip, reached_overkiz=True)
                raise LoginRefused(503, "cozytouch_unreachable") from None
            try:
                ctx.accounts.save(new)
            except BaseException:
                started, ctx.rt = ctx.rt, None  # no orphan runtime without a stored account
                if started is not None:
                    await stop_runtime(started)
                raise
            ctx.account = new
            ctx.offline = False
            if ctx.retry_task is not None:  # the runtime runs: stop the background retry now
                ctx.retry_task.cancel()
            ctx.throttle.success(ip)
            log.info("Cozytouch account accepted; runtime started")
            return new
        try:
            await rt.gateway.check_credentials(account.email, password)
        except BadCredentialsError:
            ctx.throttle.failure(ip, reached_overkiz=True)
            raise _bad_credentials(server) from None
        except GatewayError as e:
            if _cozytouch_answered(e):
                ctx.throttle.failure(ip, reached_overkiz=True)
            elif compared:
                ctx.throttle.failure(ip, reached_overkiz=False)
            raise LoginRefused(503, "cozytouch_unreachable") from None
        new = replace(account, password=password)
        ctx.accounts.save(new)
        ctx.account = new
        await rt.gateway.set_credentials(new.email, password)
        try:
            await rt.gateway.login()
        except GatewayError as e:
            log.warning(
                "overkiz re-login with the new password failed (%s); the pump retries",
                type(e).__name__,
            )
        rt.pump.credentials_changed()
        ctx.throttle.success(ip)
        log.info("Cozytouch password updated from a login")
        return new
