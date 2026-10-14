"""The login decision (spec §3.7). Login = the home's Cozytouch account."""

from __future__ import annotations

import hmac
import logging
from dataclasses import replace
from typing import TYPE_CHECKING

from kelvin.account import Account
from kelvin.api.runtime import stop_runtime
from kelvin.auth.throttle import retry_message
from kelvin.overkiz.errors import AuthError, BadCredentialsError, GatewayError, QuotaError

if TYPE_CHECKING:
    from kelvin.api.context import AppContext

log = logging.getLogger(__name__)

WRONG_ACCOUNT = "Ce compte Cozytouch n’est pas celui de cette maison."
BAD_CREDENTIALS = "Email ou mot de passe Cozytouch incorrect."
UNREACHABLE = "Cozytouch injoignable, réessayez dans un instant."


class LoginRefused(Exception):
    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message


def _cozytouch_answered(e: GatewayError) -> bool:
    """A ban/quota or auth answer is a real Cozytouch round trip: it counts like a refusal, so
    logins cannot keep extending a lockout. Transport errors and timeouts do not."""
    return isinstance(e, (QuotaError, AuthError))


def _same_password(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode(), b.encode())


async def login(ctx: AppContext, email: str, password: str, ip: str) -> Account:
    email = email.strip()
    async with ctx.lock:
        wait = ctx.throttle.ip_retry_after(ip)  # first: nothing is compared from a blocked IP
        if wait is not None:
            raise LoginRefused(429, retry_message(wait))
        account = ctx.account
        if account is not None and not account.same_email(email):
            ctx.throttle.failure(ip, reached_overkiz=False)
            raise LoginRefused(401, WRONG_ACCOUNT)
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
            raise LoginRefused(429, retry_message(wait))
        if rt is None or account is None:
            new = (
                replace(account, password=password)
                if account is not None
                else Account(email, password)
            )
            try:
                await ctx.start(new)
            except BadCredentialsError:
                ctx.throttle.failure(ip, reached_overkiz=True)
                raise LoginRefused(401, BAD_CREDENTIALS) from None
            except GatewayError as e:
                if _cozytouch_answered(e):
                    ctx.throttle.failure(ip, reached_overkiz=True)
                raise LoginRefused(503, UNREACHABLE) from None
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
            raise LoginRefused(401, BAD_CREDENTIALS) from None
        except GatewayError as e:
            if _cozytouch_answered(e):
                ctx.throttle.failure(ip, reached_overkiz=True)
            elif compared:
                ctx.throttle.failure(ip, reached_overkiz=False)
            raise LoginRefused(503, UNREACHABLE) from None
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
