"""Process-wide state (spec §3.7): DB, account, sessions, throttle and an optional runtime.

Setup mode has no runtime: nothing talks to Overkiz until the home's account logs in. A Cozytouch
outage at startup is mode "offline": Kelvin keeps serving and retries in the background.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Literal

from kelvin.account import Account, AccountStore, bootstrap_account, linky_credentials
from kelvin.api.runtime import Runtime, make_gateway, start_runtime, stop_runtime
from kelvin.auth.sessions import SessionStore
from kelvin.auth.throttle import LoginThrottle
from kelvin.config import Settings
from kelvin.overkiz.budget import SetupReadGuard
from kelvin.overkiz.errors import BadCredentialsError, GatewayError
from kelvin.overkiz.gateway import Gateway
from kelvin.recorder.db import Database

log = logging.getLogger(__name__)

Mode = Literal["setup", "reauth", "offline", "running"]

# Startup while Cozytouch is down: retry after 15 s, then 30, 60, … at most every 5 minutes.
START_RETRY_FIRST_S = 15.0
START_RETRY_MAX_S = 300.0
# The times of the last full setup reads (spec ruling 8), so a restart cannot reset the budget.
SETUP_READS_KEY = "overkiz_setup_reads"


@dataclass
class AppContext:
    settings: Settings
    db: Database
    accounts: AccountStore
    sessions: SessionStore
    throttle: LoginThrottle
    make_gateway: Callable[[str, str], Awaitable[Gateway]]
    # One budget of full setup reads for the whole process: boot, retries, logins and the pump.
    setup_reads: SetupReadGuard
    start_tasks: bool = True
    account: Account | None = None
    rt: Runtime | None = None
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    # The account is known but Cozytouch was unreachable at startup: retry_start is trying.
    offline: bool = False
    retry_task: asyncio.Task | None = None

    @property
    def mode(self) -> Mode:
        if self.rt is not None:
            return "running"
        if self.account is None:
            return "setup"
        return "offline" if self.offline else "reauth"

    async def start(self, account: Account) -> Runtime:
        """Log in to Overkiz with this account and start gateway, pump, recorder and overrides."""
        gateway = await self.make_gateway(account.email, account.password)
        self.rt = await start_runtime(
            self.settings,
            gateway,
            start_tasks=self.start_tasks,
            db=self.db,
            linky=linky_credentials(account, self.settings),
            guard=self.setup_reads,
        )
        return self.rt

    async def close(self) -> None:
        task, self.retry_task = self.retry_task, None
        if task is not None:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task
        try:
            if self.rt is not None:
                rt, self.rt = self.rt, None
                await stop_runtime(rt)
        finally:
            self.db.close()


def open_context(
    settings: Settings,
    gateway: Gateway | None = None,
    *,
    start_tasks: bool = True,
    wall: Callable[[], float] = time.time,
) -> AppContext:
    settings.kelvin_data.mkdir(parents=True, exist_ok=True)
    db = Database(settings.kelvin_data / "kelvin.db")
    if settings.kelvin_fake and gateway is None:
        # The simulator's own FakeGateway never calls Overkiz: its budget lives in memory only,
        # so a developer's restarts never leave it offline.
        setup_reads = SetupReadGuard(wall=wall)
    else:
        stored = db.get_setting(SETUP_READS_KEY, [])
        setup_reads = SetupReadGuard(
            wall=wall,
            reads=stored if isinstance(stored, list) else [],
            on_record=lambda reads: db.set_setting(SETUP_READS_KEY, reads),
        )

    async def factory(username: str, password: str) -> Gateway:
        if gateway is not None:  # injected (tests): the same fake, given these credentials
            await gateway.set_credentials(username, password)
            return gateway
        return make_gateway(settings, username, password)

    return AppContext(
        settings=settings,
        db=db,
        accounts=AccountStore(settings.kelvin_data),
        sessions=SessionStore(db),
        throttle=LoginThrottle(),
        make_gateway=factory,
        setup_reads=setup_reads,
        start_tasks=start_tasks,
    )


async def boot(ctx: AppContext) -> None:
    """Startup (§3.7): account file, else COZY_* env, else setup mode.

    A stored password that Cozytouch refuses leaves Kelvin waiting for a login (mode "reauth").
    Any other Overkiz failure (outage, timeout, quota) is mode "offline": Kelvin serves the app
    and its health, and retry_start keeps trying in the background.
    """
    ctx.account = bootstrap_account(ctx.settings, ctx.accounts)
    if ctx.account is None:
        log.info("no Cozytouch account yet: setup mode, waiting for the first login")
        return
    try:
        await ctx.start(ctx.account)
    except BadCredentialsError:
        log.warning("the stored Cozytouch password was refused: waiting for a login")
    except GatewayError as e:
        log.warning(
            "Cozytouch unreachable at startup (%s); retrying in the background",
            type(e).__name__,
        )
        ctx.offline = True
        if ctx.start_tasks:
            ctx.retry_task = asyncio.create_task(retry_start(ctx))


async def retry_start(
    ctx: AppContext, *, sleep: Callable[[float], Awaitable[None]] = asyncio.sleep
) -> None:
    """Start the runtime once Cozytouch answers. Ends when a runtime runs (a login may start it
    first) or when Cozytouch refuses the stored password (then mode "reauth").

    Any other failure, expected or not, is logged by its type only (never its message, which
    could carry account details) and the backoff goes on: this task never dies silently.
    Retries are not logins: they never touch the login throttle.
    """
    delay = START_RETRY_FIRST_S
    while True:
        await sleep(delay)
        next_delay = min(delay * 2, START_RETRY_MAX_S)
        async with ctx.lock:
            if ctx.rt is not None or ctx.account is None:
                ctx.offline = False
                return
            if not ctx.setup_reads.allowed():
                # Starting reads the whole setup: wait for the daily budget (ruling 8).
                log.info("full setup read budget spent; next try in %d s", int(next_delay))
                delay = next_delay
                continue
            try:
                await ctx.start(ctx.account)
            except BadCredentialsError:
                ctx.offline = False
                log.warning("the stored Cozytouch password was refused: waiting for a login")
                return
            except GatewayError as e:
                log.warning(
                    "Cozytouch still unreachable (%s); next try in %d s",
                    type(e).__name__,
                    int(next_delay),
                )
            except Exception as e:  # noqa: BLE001 — a retry loop must outlive any failure
                log.error(
                    "runtime start failed (%s), not a Cozytouch outage; next try in %d s",
                    type(e).__name__,
                    int(next_delay),
                )
            else:
                ctx.offline = False
                log.info("Cozytouch reachable again: runtime started")
                return
        delay = next_delay
