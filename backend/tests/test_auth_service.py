import asyncio
import stat

import pytest

from kelvin.account import Account, AccountStore
from kelvin.api.context import SETUP_READS_KEY, boot, open_context, retry_start
from kelvin.api.runtime import SETUP_KEY, start_runtime
from kelvin.auth.service import (
    BAD_CREDENTIALS,
    UNREACHABLE,
    WRONG_ACCOUNT,
    LoginRefused,
    login,
)
from kelvin.config import Settings
from kelvin.overkiz.budget import DAY_S, FULL_READS_PER_DAY
from kelvin.overkiz.errors import GatewayError, QuotaError
from kelvin.overkiz.fake import DEMO_EMAIL, DEMO_PASSWORD, FakeGateway
from kelvin.recorder.db import Database
from tests.conftest import ManualClock

IP = "192.168.1.20"


@pytest.fixture
async def env(tmp_path):
    gw = FakeGateway(clock=ManualClock())
    settings = Settings(_env_file=None, kelvin_data=tmp_path, kelvin_fake=True)
    ctx = open_context(settings, gw, start_tasks=False)
    try:
        yield ctx, gw, tmp_path
    finally:
        await ctx.close()


async def _running(ctx):
    await login(ctx, DEMO_EMAIL, DEMO_PASSWORD, IP)
    assert ctx.mode == "running"


async def test_boot_without_account_is_setup_mode(env):
    ctx, _, _ = env
    await boot(ctx)
    assert ctx.mode == "setup" and ctx.rt is None and ctx.account is None


async def test_first_login_starts_the_runtime_and_writes_the_account(env):
    ctx, _, tmp = env
    await boot(ctx)
    acc = await login(ctx, " demo@kelvin.local ", DEMO_PASSWORD, IP)
    assert acc == Account(DEMO_EMAIL, DEMO_PASSWORD)
    assert ctx.mode == "running" and ctx.rt is not None
    path = tmp / "account.json"
    assert stat.S_IMODE(path.stat().st_mode) == 0o600
    assert AccountStore(tmp).load() == acc


async def test_first_login_with_a_bad_password_stays_in_setup(env):
    ctx, _, tmp = env
    await boot(ctx)
    with pytest.raises(LoginRefused) as e:
        await login(ctx, DEMO_EMAIL, "wrong", IP)
    assert (e.value.status, e.value.message) == (401, BAD_CREDENTIALS)
    assert ctx.mode == "setup" and not (tmp / "account.json").exists()


async def test_first_login_while_cozytouch_is_down_is_503(env):
    ctx, gw, _ = env
    await boot(ctx)
    gw.fail_login = GatewayError("down")
    with pytest.raises(LoginRefused) as e:
        await login(ctx, DEMO_EMAIL, DEMO_PASSWORD, IP)
    assert (e.value.status, e.value.message) == (503, UNREACHABLE)
    assert ctx.mode == "setup"


async def test_another_cozytouch_account_is_refused(env):
    ctx, gw, _ = env
    await _running(ctx)
    checks = gw.checks
    with pytest.raises(LoginRefused) as e:
        await login(ctx, "someone@else.fr", DEMO_PASSWORD, IP)
    assert (e.value.status, e.value.message) == (401, WRONG_ACCOUNT)
    assert gw.checks == checks
    # same account, other case
    assert (await login(ctx, "DEMO@Kelvin.Local", DEMO_PASSWORD, IP)).email == DEMO_EMAIL


async def test_stored_password_works_while_cozytouch_is_down(env):
    ctx, gw, _ = env
    await _running(ctx)
    gw.fail_login = GatewayError("down")
    logins, checks = gw.logins, gw.checks
    assert (await login(ctx, DEMO_EMAIL, DEMO_PASSWORD, IP)).email == DEMO_EMAIL
    assert (gw.logins, gw.checks) == (logins, checks)  # no Overkiz call


async def test_new_password_accepted_by_cozytouch_is_stored(env):
    ctx, gw, tmp = env
    await _running(ctx)
    gw.cloud_password = "new-pw"
    acc = await login(ctx, DEMO_EMAIL, "new-pw", IP)
    assert acc.password == "new-pw" and ctx.account == acc
    assert AccountStore(tmp).load().password == "new-pw"
    assert gw.password == "new-pw"  # the gateway re-logs with it
    assert ctx.rt.pump.auth_rejected is False


async def test_wrong_new_password_is_refused_and_nothing_changes(env):
    ctx, gw, tmp = env
    await _running(ctx)
    with pytest.raises(LoginRefused) as e:
        await login(ctx, DEMO_EMAIL, "not-it", IP)
    assert e.value.status == 401 and e.value.message == BAD_CREDENTIALS
    assert AccountStore(tmp).load().password == DEMO_PASSWORD


async def test_new_password_while_cozytouch_is_down_is_503(env):
    ctx, gw, _ = env
    await _running(ctx)
    gw.fail_login = GatewayError("down")
    with pytest.raises(LoginRefused) as e:
        await login(ctx, DEMO_EMAIL, "other", IP)
    assert e.value.status == 503


async def _fail_five(ctx, ip=IP):
    for _ in range(5):
        with pytest.raises(LoginRefused):
            await login(ctx, DEMO_EMAIL, "wrong", ip)


async def test_blocked_ip_gets_429_even_with_the_stored_password_or_a_wrong_email(env):
    ctx, gw, _ = env
    await _running(ctx)
    await _fail_five(ctx)
    checks = gw.checks
    for email, pw in ((DEMO_EMAIL, DEMO_PASSWORD), ("someone@else.fr", "x"), (DEMO_EMAIL, "wrong")):
        with pytest.raises(LoginRefused) as e:
            await login(ctx, email, pw, IP)
        assert e.value.status == 429
        assert e.value.message == "Trop de tentatives. Réessayez dans 15 min."
        assert (e.value.code, e.value.params) == ("too_many_attempts", {"minutes": 15})
    assert gw.checks == checks


async def test_other_ip_keeps_the_stored_password_while_the_global_limit_is_reached(env):
    ctx, gw, _ = env
    await _running(ctx)
    for n in range(4):
        await _fail_five(ctx, f"10.0.0.{n}")
    checks = gw.checks
    with pytest.raises(LoginRefused) as e:  # global limit (20) reached: no Overkiz call
        await login(ctx, DEMO_EMAIL, "wrong", "10.0.1.1")
    assert e.value.status == 429 and gw.checks == checks
    acc = await login(ctx, DEMO_EMAIL, DEMO_PASSWORD, "10.0.1.1")
    assert acc.email == DEMO_EMAIL


async def test_wrong_email_counts_as_a_failure(env):
    ctx, _, _ = env
    await _running(ctx)
    for _ in range(5):
        with pytest.raises(LoginRefused) as e:
            await login(ctx, "someone@else.fr", DEMO_PASSWORD, IP)
        assert e.value.status == 401
    with pytest.raises(LoginRefused) as e:
        await login(ctx, DEMO_EMAIL, DEMO_PASSWORD, IP)
    assert e.value.status == 429


async def test_unreachable_cozytouch_does_not_count_when_nothing_was_compared(env):
    """Setup mode: there is no stored password to guess, so a 503 is not a failure."""
    ctx, gw, _ = env
    gw.fail_login = GatewayError("down")
    for _ in range(6):
        with pytest.raises(LoginRefused) as e:
            await login(ctx, DEMO_EMAIL, DEMO_PASSWORD, IP)
        assert e.value.status == 503
    gw.fail_login = None
    acc = await login(ctx, DEMO_EMAIL, DEMO_PASSWORD, IP)
    assert acc.email == DEMO_EMAIL


async def test_stored_password_misses_count_while_cozytouch_is_down(env):
    """A miss against the stored password is a local guess: it counts even when Cozytouch
    cannot be asked, or the stored password could be brute-forced during an outage."""
    ctx, gw, _ = env
    await _running(ctx)
    gw.fail_login = GatewayError("down")
    for _ in range(5):
        with pytest.raises(LoginRefused) as e:
            await login(ctx, DEMO_EMAIL, "guess", IP)
        assert e.value.status == 503
    with pytest.raises(LoginRefused) as e:
        await login(ctx, DEMO_EMAIL, DEMO_PASSWORD, IP)
    assert e.value.status == 429


async def test_stored_password_misses_count_while_the_global_limit_is_reached(env):
    """Once the global limit blocks Overkiz calls, a fresh IP must not get unlimited
    uncounted guesses at the stored password."""
    ctx, _, _ = env
    await _running(ctx)
    for n in range(4):
        await _fail_five(ctx, f"10.0.0.{n}")
    attacker = "10.0.1.2"
    for _ in range(5):
        with pytest.raises(LoginRefused) as e:
            await login(ctx, DEMO_EMAIL, "guess", attacker)
        assert e.value.status == 429
    with pytest.raises(LoginRefused) as e:
        await login(ctx, DEMO_EMAIL, DEMO_PASSWORD, attacker)
    assert e.value.status == 429


async def test_failed_account_save_leaves_no_orphan_runtime(env, monkeypatch):
    ctx, _, tmp = env
    await boot(ctx)

    def boom(_account):
        raise OSError("disk full")

    monkeypatch.setattr(ctx.accounts, "save", boom)
    with pytest.raises(OSError):
        await login(ctx, DEMO_EMAIL, DEMO_PASSWORD, IP)
    assert ctx.rt is None and ctx.account is None and ctx.mode == "setup"


async def test_failed_gateway_login_closes_the_gateway(tmp_path):
    class Failing(FakeGateway):
        closed = 0

        async def close(self):
            self.closed += 1

    gw = Failing(clock=ManualClock())
    gw.fail_login = GatewayError("down")
    settings = Settings(_env_file=None, kelvin_data=tmp_path, kelvin_fake=True)
    db = Database(tmp_path / "kelvin.db")
    try:
        with pytest.raises(GatewayError):
            await start_runtime(settings, gw, start_tasks=False, db=db)
        assert gw.closed == 1
        db.get_setting("x")  # the borrowed DB is still open
    finally:
        db.close()


async def test_rejected_stored_password_never_shortcuts(env):
    ctx, gw, _ = env
    await _running(ctx)
    ctx.rt.pump.auth_rejected = True
    gw.cloud_password = "changed"
    with pytest.raises(LoginRefused) as e:
        await login(ctx, DEMO_EMAIL, DEMO_PASSWORD, IP)  # the old one: Cozytouch must decide
    assert e.value.status == 401 and gw.checks == 1
    await login(ctx, DEMO_EMAIL, "changed", IP)
    assert ctx.rt.pump.auth_rejected is False


async def test_a_rejected_stored_password_retyped_still_goes_to_cozytouch(env):
    """No local answer for the old password (that would be a timing oracle): Cozytouch
    decides, and its refusal counts toward the global gate."""
    ctx, gw, _ = env
    await _running(ctx)
    ctx.rt.pump.auth_rejected = True
    gw.cloud_password = "changed"
    checks = gw.checks
    with pytest.raises(LoginRefused) as e:
        await login(ctx, DEMO_EMAIL, DEMO_PASSWORD, IP)
    assert (e.value.status, e.value.message) == (401, BAD_CREDENTIALS)
    assert gw.checks == checks + 1
    assert len(ctx.throttle._all) == 1


async def test_reauth_mode_sends_the_old_password_to_cozytouch(tmp_path):
    AccountStore(tmp_path).save(Account(DEMO_EMAIL, "old-password"))
    gw = FakeGateway(clock=ManualClock())
    ctx = open_context(
        Settings(_env_file=None, kelvin_data=tmp_path, kelvin_fake=True), gw, start_tasks=False
    )
    try:
        await boot(ctx)
        logins = gw.logins
        with pytest.raises(LoginRefused) as e:
            await login(ctx, DEMO_EMAIL, "old-password", IP)
        assert (e.value.status, e.value.message) == (401, BAD_CREDENTIALS)
        assert gw.logins == logins + 1
        assert len(ctx.throttle._all) == 1  # counts toward the global gate
        await login(ctx, DEMO_EMAIL, DEMO_PASSWORD, IP)
        assert ctx.mode == "running"
    finally:
        await ctx.close()


async def test_local_misses_never_block_other_clients_overkiz_logins(env):
    """Wrong emails and local stored-password misses stay per IP: another client can still
    log in with a new password (which needs Cozytouch)."""
    ctx, gw, _ = env
    await _running(ctx)
    for n in range(5):
        for _ in range(5):
            with pytest.raises(LoginRefused):
                await login(ctx, "someone@else.fr", "x", f"10.0.0.{n}")
    gw.fail_login = GatewayError("down")
    for _ in range(5):
        with pytest.raises(LoginRefused) as e:
            await login(ctx, DEMO_EMAIL, "guess", "10.0.0.9")
        assert e.value.status == 503
    gw.fail_login = None
    gw.cloud_password = "new-pw"
    assert (await login(ctx, DEMO_EMAIL, "new-pw", "10.0.1.1")).password == "new-pw"


async def test_boot_with_env_credentials_creates_the_account_and_runs(tmp_path):
    settings = Settings(
        _env_file=None,
        kelvin_data=tmp_path,
        kelvin_fake=True,
        cozy_user=DEMO_EMAIL,
        cozy_pass=DEMO_PASSWORD,
    )
    ctx = open_context(settings, FakeGateway(clock=ManualClock()), start_tasks=False)
    try:
        await boot(ctx)
        assert ctx.mode == "running"
        assert AccountStore(tmp_path).load() == Account(DEMO_EMAIL, DEMO_PASSWORD)
    finally:
        await ctx.close()


async def test_boot_with_a_rejected_stored_password_waits_for_a_login(tmp_path):
    AccountStore(tmp_path).save(Account(DEMO_EMAIL, "old-password"))
    gw = FakeGateway(clock=ManualClock())
    ctx = open_context(
        Settings(_env_file=None, kelvin_data=tmp_path, kelvin_fake=True), gw, start_tasks=False
    )
    try:
        await boot(ctx)
        assert ctx.mode == "reauth" and ctx.rt is None
        with pytest.raises(LoginRefused):
            await login(ctx, DEMO_EMAIL, "old-password", IP)  # no shortcut without a runtime
        await login(ctx, DEMO_EMAIL, DEMO_PASSWORD, IP)
        assert ctx.mode == "running"
        assert AccountStore(tmp_path).load().password == DEMO_PASSWORD
    finally:
        await ctx.close()


async def test_a_cozytouch_ban_answer_counts_toward_both_limits(env):
    """Cozytouch answering « too many attempts » is a real round trip: it must fill the IP and
    the global gate, or logins from many buckets would keep extending the ban."""
    ctx, gw, _ = env
    await _running(ctx)
    gw.fail_login = QuotaError("banned")
    for _ in range(5):
        with pytest.raises(LoginRefused) as e:
            await login(ctx, DEMO_EMAIL, "other", IP)
        assert e.value.status == 503
    with pytest.raises(LoginRefused) as e:
        await login(ctx, DEMO_EMAIL, DEMO_PASSWORD, IP)
    assert e.value.status == 429
    assert len(ctx.throttle._all) == 5


async def test_a_cozytouch_ban_during_setup_counts_too(env):
    ctx, gw, _ = env
    gw.fail_login = QuotaError("banned")
    for _ in range(5):
        with pytest.raises(LoginRefused) as e:
            await login(ctx, DEMO_EMAIL, DEMO_PASSWORD, IP)
        assert e.value.status == 503
    with pytest.raises(LoginRefused) as e:
        await login(ctx, DEMO_EMAIL, DEMO_PASSWORD, IP)
    assert e.value.status == 429


def _offline_ctx(tmp_path):
    AccountStore(tmp_path).save(Account(DEMO_EMAIL, DEMO_PASSWORD))
    gw = FakeGateway(clock=ManualClock())
    gw.fail_login = GatewayError("down")
    ctx = open_context(
        Settings(_env_file=None, kelvin_data=tmp_path, kelvin_fake=True), gw, start_tasks=False
    )
    return ctx, gw


async def test_boot_while_cozytouch_is_down_is_offline_not_a_crash(tmp_path):
    ctx, _ = _offline_ctx(tmp_path)
    try:
        await boot(ctx)  # used to raise and exit the process
        assert ctx.mode == "offline" and ctx.rt is None
        assert ctx.retry_task is None  # start_tasks=False: nothing runs in the background
    finally:
        await ctx.close()


async def test_retry_start_backs_off_then_starts(tmp_path):
    ctx, gw = _offline_ctx(tmp_path)
    delays: list[float] = []

    async def fake_sleep(seconds: float) -> None:
        delays.append(seconds)
        if len(delays) == 7:
            gw.fail_login = None  # Cozytouch is back before the 7th try

    try:
        await boot(ctx)
        await retry_start(ctx, sleep=fake_sleep)
        assert delays == [15.0, 30.0, 60.0, 120.0, 240.0, 300.0, 300.0]
        assert ctx.mode == "running" and ctx.rt is not None
    finally:
        await ctx.close()


async def test_retry_start_stops_on_a_refused_password(tmp_path):
    ctx, gw = _offline_ctx(tmp_path)

    async def fake_sleep(_seconds: float) -> None:
        gw.fail_login = None
        gw.cloud_password = "changed-on-cozytouch"

    try:
        await boot(ctx)
        await retry_start(ctx, sleep=fake_sleep)
        assert ctx.mode == "reauth" and ctx.rt is None
    finally:
        await ctx.close()


async def test_retry_start_ends_when_a_login_started_the_runtime(tmp_path):
    ctx, gw = _offline_ctx(tmp_path)
    logins_before = None

    async def fake_sleep(_seconds: float) -> None:
        nonlocal logins_before
        gw.fail_login = None
        await login(ctx, DEMO_EMAIL, DEMO_PASSWORD, IP)  # a user got there first
        logins_before = gw.logins

    try:
        await boot(ctx)
        await retry_start(ctx, sleep=fake_sleep)
        assert ctx.mode == "running"
        assert gw.logins == logins_before  # no second runtime, no extra Overkiz login
    finally:
        await ctx.close()


async def test_close_cancels_the_background_retry(tmp_path):
    AccountStore(tmp_path).save(Account(DEMO_EMAIL, DEMO_PASSWORD))
    gw = FakeGateway(clock=ManualClock())
    gw.fail_login = GatewayError("down")
    ctx = open_context(
        Settings(_env_file=None, kelvin_data=tmp_path, kelvin_fake=True), gw, start_tasks=True
    )
    await boot(ctx)
    task = ctx.retry_task
    assert task is not None and not task.done()
    await ctx.close()
    assert task.cancelled() and ctx.retry_task is None


async def test_retry_start_survives_an_unexpected_error_and_logs_only_its_type(tmp_path, caplog):
    ctx, gw = _offline_ctx(tmp_path)
    delays: list[float] = []

    async def fake_sleep(seconds: float) -> None:
        delays.append(seconds)
        if len(delays) == 1:
            gw.fail_login = RuntimeError("detail-that-must-not-be-logged")
        elif len(delays) == 3:
            gw.fail_login = None

    try:
        await boot(ctx)
        with caplog.at_level("WARNING", logger="kelvin.api.context"):
            await retry_start(ctx, sleep=fake_sleep)
        assert delays == [15.0, 30.0, 60.0]  # it kept backing off through the odd error
        assert ctx.mode == "running" and not ctx.offline
        assert "RuntimeError" in caplog.text
        assert "detail-that-must-not-be-logged" not in caplog.text
    finally:
        await ctx.close()


async def test_retry_start_never_counts_toward_the_login_throttle(tmp_path):
    ctx, gw = _offline_ctx(tmp_path)
    delays: list[float] = []

    async def fake_sleep(seconds: float) -> None:
        delays.append(seconds)
        if len(delays) == 2:
            gw.fail_login = QuotaError("banned")  # a Cozytouch answer, still not a login
        elif len(delays) == 4:
            gw.fail_login = None

    try:
        await boot(ctx)
        await retry_start(ctx, sleep=fake_sleep)
        assert ctx.mode == "running"
        assert ctx.throttle.global_retry_after() is None
        assert ctx.throttle.ip_retry_after(IP) is None
        assert not ctx.throttle._all and not ctx.throttle._ip
    finally:
        await ctx.close()


async def test_a_login_while_offline_goes_to_cozytouch_and_clears_offline(tmp_path):
    ctx, gw = _offline_ctx(tmp_path)
    try:
        await boot(ctx)
        assert ctx.mode == "offline"
        with pytest.raises(LoginRefused) as e:  # the stored password is not answered locally
            await login(ctx, DEMO_EMAIL, DEMO_PASSWORD, IP)
        assert (e.value.status, e.value.message) == (503, UNREACHABLE)
        assert ctx.mode == "offline"
        gw.fail_login = None
        retry = ctx.retry_task = asyncio.create_task(
            retry_start(ctx, sleep=lambda _d: asyncio.sleep(3600))
        )
        await login(ctx, DEMO_EMAIL, DEMO_PASSWORD, IP)
        assert ctx.mode == "running" and ctx.offline is False
        await asyncio.sleep(0)
        assert retry.cancelled()  # the background retry stops at once
    finally:
        await ctx.close()


class _DayOver(Exception):
    pass


def _quota_ctx(tmp_path, clock):
    """Logins work but every full setup read is refused with a quota answer."""
    AccountStore(tmp_path).save(Account(DEMO_EMAIL, DEMO_PASSWORD))
    gw = FakeGateway(clock=clock)
    gw.fail_snapshot = QuotaError("QUOTA_EXCEEDED")
    settings = Settings(_env_file=None, kelvin_data=tmp_path, kelvin_fake=True)
    return open_context(settings, gw, start_tasks=False, wall=clock), gw


async def test_retry_start_spends_at_most_the_daily_setup_read_budget(tmp_path):
    """Ruling 8: a runtime that cannot start must not hammer GET /setup (1 call a day)."""
    clock = ManualClock(0.0)
    ctx, gw = _quota_ctx(tmp_path, clock)

    async def fake_sleep(seconds: float) -> None:
        if clock.t + seconds >= DAY_S:  # the boot read is still inside the rolling 24 h
            raise _DayOver
        clock.advance(seconds)

    try:
        await boot(ctx)
        assert ctx.mode == "offline"
        with pytest.raises(_DayOver):
            await retry_start(ctx, sleep=fake_sleep)
        # boot + retries, then the one startup overdraft (no stored setup), never more in 24 h
        assert gw.snapshots == FULL_READS_PER_DAY + 1
        logins = gw.logins
        with pytest.raises(LoginRefused) as e:  # a login starting the runtime: same budget
            await login(ctx, DEMO_EMAIL, DEMO_PASSWORD, IP)
        assert (e.value.status, e.value.message) == (503, UNREACHABLE)
        assert gw.snapshots == FULL_READS_PER_DAY + 1 and gw.logins == logins  # no call
        assert not ctx.throttle._all and not ctx.throttle._ip  # a local refusal, not a guess
    finally:
        await ctx.close()


async def test_the_setup_read_budget_survives_a_restart(tmp_path):
    """A crash-looping container cannot reset the budget: the reads are stored."""
    clock = ManualClock(0.0)
    ctx, gw = _quota_ctx(tmp_path, clock)
    try:
        for _ in range(FULL_READS_PER_DAY):
            await boot(ctx)
            clock.advance(60)
    finally:
        await ctx.close()
    ctx, gw = _quota_ctx(tmp_path, clock)
    try:
        await boot(ctx)  # no stored setup: the startup overdraft, refused too
        assert gw.snapshots == 1 and ctx.mode == "offline"
        await boot(ctx)
        assert gw.snapshots == 1 and ctx.mode == "offline"
        assert ctx.setup_reads.used() == FULL_READS_PER_DAY + 1
        clock.t = DAY_S + 1  # the first stored read is a day old
        gw.fail_snapshot = None
        await boot(ctx)
        assert ctx.mode == "running" and gw.snapshots == 2
    finally:
        await ctx.close()


async def test_the_running_pump_spends_the_same_setup_read_budget(env):
    ctx, _, _ = env
    await _running(ctx)
    assert ctx.rt.pump.guard is ctx.setup_reads
    assert ctx.setup_reads.used() == 1


async def test_the_simulator_does_not_store_its_setup_read_budget(tmp_path):
    """Dev restarts of the simulator (no Overkiz call is ever made) must never go offline."""
    AccountStore(tmp_path).save(Account(DEMO_EMAIL, DEMO_PASSWORD))
    settings = Settings(_env_file=None, kelvin_data=tmp_path, kelvin_fake=True)
    for _ in range(FULL_READS_PER_DAY + 2):
        ctx = open_context(settings, start_tasks=False)  # the simulator's own FakeGateway
        try:
            await boot(ctx)
            assert ctx.mode == "running"
        finally:
            await ctx.close()
    assert Database(tmp_path / "kelvin.db").get_setting(SETUP_READS_KEY) is None


def _stored_ctx(tmp_path, clock):
    AccountStore(tmp_path).save(Account(DEMO_EMAIL, DEMO_PASSWORD))
    gw = FakeGateway(clock=clock)
    settings = Settings(_env_file=None, kelvin_data=tmp_path, kelvin_fake=True)
    return open_context(settings, gw, start_tasks=False, wall=clock), gw


async def test_a_spent_budget_starts_from_the_stored_setup_and_reads_device_by_device(tmp_path):
    """Final review I1: a restart after the day's full reads were spent is not offline."""
    clock = ManualClock(0.0)
    ctx, gw = _stored_ctx(tmp_path, clock)
    try:
        await boot(ctx)
        assert ctx.mode == "running" and gw.snapshots == 1
        for _ in range(FULL_READS_PER_DAY - 1):
            ctx.setup_reads.record()  # e.g. a flaky outage and a password change
    finally:
        await ctx.close()
    stored = Database(tmp_path / "kelvin.db")
    try:
        setup = stored.get_setting(SETUP_KEY)
    finally:
        stored.close()
    assert setup["devices"] and all(d["states"] == {} for d in setup["devices"])  # no states
    clock.advance(60)
    ctx, gw = _stored_ctx(tmp_path, clock)
    gw.fail_snapshot = QuotaError("QUOTA_EXCEEDED")
    gw.set_state_silently(next(iter(gw.devices)), "core:NameState", "Renamed")
    try:
        await boot(ctx)
        assert ctx.mode == "running" and gw.snapshots == 0
        house = ctx.rt.house
        assert len(house.radiators) == 4
        assert ctx.rt.pump.connected is False  # nothing read yet: no stale figure is recorded
        assert all(r.energy_wh is None for r in house.radiators.values())
        await ctx.rt.pump.run_once()  # reconcile device by device
        assert gw.snapshots == 0 and gw.state_reads == len(house.device_urls())
        assert ctx.rt.pump.connected is True
        # The state read landed (the name is the Cozytouch label now, ruling 4).
        assert "Renamed" in {r.get("heater", "core:NameState") for r in house.radiators.values()}
        assert all(r.energy_wh is not None for r in house.radiators.values())
    finally:
        await ctx.close()


async def test_a_spent_budget_without_a_stored_setup_reads_once_anyway(tmp_path, caplog):
    """No stored setup: one read over the budget beats a day offline, never two."""
    clock = ManualClock(0.0)
    ctx, gw = _stored_ctx(tmp_path, clock)
    try:
        for _ in range(FULL_READS_PER_DAY):
            ctx.setup_reads.record()
        await boot(ctx)
        assert ctx.mode == "running" and gw.snapshots == 1
        assert "over the daily budget" in caplog.text
        assert ctx.setup_reads.used() == FULL_READS_PER_DAY + 1
    finally:
        await ctx.close()


async def test_the_startup_overdraft_is_once_a_day(tmp_path):
    clock = ManualClock(0.0)
    ctx, gw = _quota_ctx(tmp_path, clock)
    try:
        for _ in range(FULL_READS_PER_DAY):
            ctx.setup_reads.record()
        await boot(ctx)  # the overdraft read, refused
        assert ctx.mode == "offline" and gw.snapshots == 1
        await boot(ctx)
        assert ctx.mode == "offline" and gw.snapshots == 1  # no second overdraft
    finally:
        await ctx.close()
