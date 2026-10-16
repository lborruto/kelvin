import asyncio
import logging
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from kelvin.linky.fake import FakeLinkySource
from kelvin.linky.models import (
    CurvePoint,
    LinkyAuthError,
    LinkyError,
    LinkyThrottled,
    curve_complete,
)
from kelvin.linky.store import LinkyStore
from kelvin.linky.sync import (
    CURVE_EXTRA_CHUNKS_PER_DAY,
    CURVE_HISTORY_DAYS,
    GIVE_UP_AFTER,
    LinkySync,
    Request,
)
from kelvin.recorder.db import Database
from tests.conftest import ManualClock

PARIS = ZoneInfo("Europe/Paris")


def at(y, m, d, h=8, mi=0):
    return datetime(y, m, d, h, mi, tzinfo=PARIS).timestamp()


async def until(cond):
    """Yield to the loop until cond() holds; fail after 2 s or 10 000 yields."""
    async with asyncio.timeout(2):
        for _ in range(10_000):
            if cond():
                return
            await asyncio.sleep(0)
    pytest.fail("condition never held")


class FlakyCurve(FakeLinkySource):
    """Fails every curve request that covers one given day."""

    def __init__(self, bad: date, **kw):
        super().__init__(**kw)
        self.bad = bad

    async def fetch_curve(self, start, end):
        if start <= self.bad < end:
            self.calls.append(f"curve:{start}:{end}")
            raise LinkyError("boom")
        return await super().fetch_curve(start, end)


@pytest.fixture
def env():
    clock = ManualClock(at(2026, 10, 14))
    db = Database(":memory:")
    store = LinkyStore(db)
    fake = FakeLinkySource(wall=clock)
    sync = LinkySync(store, db, fake, wall=clock)
    return clock, db, store, fake, sync


def test_store_curve_days_and_completeness():
    db = Database(":memory:")
    store = LinkyStore(db)
    fake = FakeLinkySource(wall=lambda: at(2026, 10, 30))

    pts = asyncio.run(fake.fetch_curve(date(2026, 10, 24), date(2026, 10, 27)))
    store.upsert_curve(pts[:-1])  # the 26th misses its last half hour
    assert store.complete_curve_days(date(2026, 10, 24), date(2026, 10, 27)) == {
        date(2026, 10, 24),
        date(2026, 10, 25),  # 25th is the 25-hour day
    }
    assert len(store.curve(date(2026, 10, 25), date(2026, 10, 26))[date(2026, 10, 25)]) == 50


def test_curve_complete_counts_minutes_against_the_local_day():
    a = int(datetime(2026, 3, 29, tzinfo=PARIS).timestamp())
    spring = [CurvePoint(a + i * 1800, 30, 100.0) for i in range(46)]  # 23-hour day
    assert curve_complete(date(2026, 3, 29), spring, PARIS)
    assert not curve_complete(date(2026, 3, 29), spring[:-1], PARIS)
    assert not curve_complete(date(2026, 3, 29), [], PARIS)
    assert not curve_complete(date(2026, 3, 29), None, PARIS)


async def test_first_run_backfills_within_the_budget_newest_curve_first(env):
    clock, _, store, fake, sync = env
    made = await sync.run_once()
    assert made == 8 and sync.calls_today() == 8
    assert fake.calls[0] == "daily:2025-10-14:2026-10-14"
    assert fake.calls[1:] == [
        "curve:2026-10-07:2026-10-14",
        "curve:2026-09-30:2026-10-07",
        "curve:2026-09-23:2026-09-30",
        "curve:2026-09-16:2026-09-23",
        "curve:2026-09-14:2026-09-16",
        # spare budget extends the curve backwards, two chunks a day
        "curve:2026-09-07:2026-09-14",
        "curve:2026-08-31:2026-09-07",
    ]
    assert len(store.daily()) == 365 and store.last_day() == date(2026, 10, 13)
    assert len(store.complete_curve_days(date(2026, 9, 14), date(2026, 10, 14))) == 30
    assert len(store.complete_curve_days(date(2026, 8, 31), date(2026, 9, 14))) == 14
    assert sync.status()["state"] == "ok"
    assert await sync.run_once() == 0  # nothing missing, and today's extra chunks are spent


async def test_next_day_costs_two_calls_plus_two_extra_chunks(env):
    clock, _, _, fake, sync = env
    await sync.run_once()
    clock.advance(86400)
    fake.calls.clear()
    assert await sync.run_once() == 4
    assert fake.calls == [
        "daily:2026-10-14:2026-10-15",
        "curve:2026-10-14:2026-10-15",
        "curve:2026-08-24:2026-08-31",
        "curve:2026-08-17:2026-08-24",
    ]


async def test_extra_chunks_are_capped_per_local_day(env):
    clock, _, store, fake, sync = env
    await sync.run_once()
    extra = [c for c in fake.calls if c < "curve:2026-09-14"]
    assert len(extra) == CURVE_EXTRA_CHUNKS_PER_DAY
    clock.t = at(2026, 10, 14, 14)  # the 14:00 retry, same day
    assert sync.plan() == []
    assert await sync.run_once() == 0
    restarted = LinkySync(store, sync.db, fake, wall=clock)  # the cap survives a restart
    assert restarted.plan() == []
    clock.t = at(2026, 10, 15, 8)
    extra_next = [r for r in restarted.plan() if r.end <= date(2026, 9, 15)]
    assert len(extra_next) == CURVE_EXTRA_CHUNKS_PER_DAY


async def test_extra_chunks_only_use_spare_budget(env):
    clock, db, store, fake, _ = env
    sync = LinkySync(store, db, fake, wall=clock, budget=7)
    assert await sync.run_once() == 7
    assert fake.calls[-1] == "curve:2026-09-07:2026-09-14"  # one extra chunk fitted
    assert sync.status()["state"] == "quota"
    clock.advance(86400)
    fake.calls.clear()
    await sync.run_once()
    assert fake.calls == [
        "daily:2026-10-14:2026-10-15",
        "curve:2026-10-14:2026-10-15",
        "curve:2026-08-31:2026-09-07",
        "curve:2026-08-24:2026-08-31",
    ]


async def test_extra_chunks_stop_at_the_contract_start(env):
    clock, db, store, _, _ = env
    fake = FakeLinkySource(wall=clock, activation=date(2026, 8, 5))
    sync = LinkySync(store, db, fake, wall=clock)
    sync.set_not_before(date(2026, 8, 5))
    for _ in range(5):
        await sync.run_once()
        clock.advance(86400)
    curve = [c for c in fake.calls if c.startswith("curve:")]
    assert any(c.startswith("curve:2026-08-05:") for c in curve)
    assert min(c.split(":")[1] for c in curve) == "2026-08-05"
    assert len(store.complete_curve_days(date(2026, 8, 5), date(2026, 10, 18))) == 74
    assert all(r.start == date(2026, 10, 18) for r in sync.plan())  # only D-1 is left


async def test_extra_window_is_bounded_by_the_daily_window_without_a_contract_start(env):
    _, _, store, fake, sync = env
    day = date(2025, 10, 20)
    while day < date(2026, 10, 14):  # everything but the six oldest days of the daily window
        end = min(day + timedelta(days=7), date(2026, 10, 14))
        store.upsert_curve(await fake.fetch_curve(day, end))
        day = end
    curve = [r for r in sync.plan() if r.kind == "curve"]
    assert curve == [Request("curve", date(2025, 10, 14), date(2025, 10, 20))]


async def test_extension_never_goes_past_the_curve_history(env):
    _, _, store, fake, sync = env
    today = date(2026, 10, 14)
    oldest = today - timedelta(days=CURVE_HISTORY_DAYS)
    sync.set_not_before(date(2023, 10, 1))  # a contract three years old
    day = oldest + timedelta(days=6)
    while day < today:  # everything but the six oldest days Enedis still keeps
        end = min(day + timedelta(days=7), today)
        store.upsert_curve(await fake.fetch_curve(day, end))
        day = end
    curve = [r for r in sync.plan() if r.kind == "curve"]
    assert curve == [Request("curve", oldest, oldest + timedelta(days=6))]


async def test_failing_chunk_is_given_up_and_does_not_starve_the_others(env):
    clock, db, store, _, _ = env
    bad = date(2026, 9, 20)
    fake = FlakyCurve(bad, wall=clock)
    sync = LinkySync(store, db, fake, wall=clock)
    assert await sync.run_once() == 8
    assert "curve:2026-09-14:2026-09-16" in fake.calls  # the run went on past the failure
    assert sync.status()["state"] == "error"
    for _ in range(GIVE_UP_AFTER - 1):
        clock.advance(86400)
        await sync.run_once()
        assert store.last_day() == sync.today() - timedelta(days=1)  # D-1 still syncs
    clock.advance(86400)
    assert not any(r.start <= bad < r.end for r in sync.plan())
    fake.calls.clear()
    await sync.run_once()
    assert fake.calls[:2] == ["daily:2026-10-16:2026-10-17", "curve:2026-10-16:2026-10-17"]
    assert sync.status()["state"] == "ok"


async def test_an_outage_gives_nothing_up(env):
    clock, _, _, fake, sync = env
    fake.fail["daily"] = LinkyError("down")
    fake.fail["curve"] = LinkyError("down")
    for _ in range(GIVE_UP_AFTER + 1):  # every request of every run fails
        await sync.run_once()
        assert sync.status()["state"] == "error"
        clock.advance(86400)
    assert sync.state.tries == {}
    today = sync.today()
    plan = sync.plan()
    assert plan[0] == Request("daily", today - timedelta(days=365), today)
    covered = {
        r.start + timedelta(days=i)
        for r in plan
        if r.kind == "curve"
        for i in range((r.end - r.start).days)
    }
    assert {today - timedelta(days=n) for n in range(1, 31)} <= covered


async def test_new_token_keeps_given_up_holes(env):
    clock, _, _, fake, sync = env
    hole = date(2026, 9, 20)
    fake.missing = {hole}
    await sync.run_once()
    for _ in range(GIVE_UP_AFTER - 1):
        clock.advance(86400)
        await sync.run_once()
    sync.set_source(FakeLinkySource(wall=clock, activation=date(2020, 1, 1)))
    assert not any(r.start <= hole < r.end for r in sync.plan())


async def test_extra_counter_is_saved_before_the_call(env):
    clock, db, store, _, _ = env
    seen = []

    class Spy(FakeLinkySource):
        async def fetch_curve(self, start, end):
            if end <= date(2026, 9, 14):  # an extra chunk: what a hard kill now would keep
                saved = db.get_setting("linky_sync")
                seen.append((saved["calls"], saved["extra"]))
            return await super().fetch_curve(start, end)

    sync = LinkySync(store, db, Spy(wall=clock), wall=clock)
    await sync.run_once()
    assert seen == [(7, 1), (8, 2)]


async def test_quota_does_not_charge_an_extra_chunk(env):
    clock, db, store, fake, _ = env
    sync = LinkySync(store, db, fake, wall=clock, budget=6)
    assert await sync.run_once() == 6  # daily and the five 30-day chunks, no extra fits
    assert db.get_setting("linky_sync")["extra"] == 0


async def test_unpublished_yesterday_is_retried(env):
    clock, _, store, fake, sync = env
    fake.missing = {date(2026, 10, 13)}
    await sync.run_once()
    assert store.last_day() == date(2026, 10, 12)
    for hour in (14, 32, 38, 56):  # 14:00, next day 08:00 and 14:00, the day after 08:00
        clock.t = at(2026, 10, 14) + (hour - 8) * 3600
        assert any(r.start <= date(2026, 10, 13) < r.end for r in sync.plan())
    fake.missing = set()
    clock.t = at(2026, 10, 15, 14)
    await sync.run_once()
    assert date(2026, 10, 13) in store.daily()


async def test_old_hole_given_up_after_three_tries(env):
    clock, _, _, fake, sync = env
    hole = date(2026, 9, 20)
    fake.missing = {hole}
    await sync.run_once()
    for _ in range(GIVE_UP_AFTER - 1):
        clock.advance(86400)
        await sync.run_once()
    assert not any(r.kind == "curve" and r.start <= hole < r.end for r in sync.plan())
    assert not any(r.kind == "daily" and r.start <= hole < r.end for r in sync.plan())


async def test_hole_near_an_old_contract_start_stays_given_up(env):
    clock, db, store, _, _ = env
    start = date(2025, 1, 6)  # older than the 395-day pruning horizon
    fake = FakeLinkySource(wall=clock, activation=start)
    sync = LinkySync(store, db, fake, wall=clock)
    sync.set_not_before(start)
    hole = date(2025, 1, 8)
    key = f"curve:{hole}"
    sync.state.tries[key] = GIVE_UP_AFTER
    sync.state.tries["curve:2024-12-01"] = 1  # before the contract start: pruned
    await sync.run_once()
    assert sync.state.tries.get(key) == GIVE_UP_AFTER
    assert "curve:2024-12-01" not in sync.state.tries


async def test_budget_exhaustion_keeps_progress_and_resumes(env):
    clock, db, store, fake, _ = env
    sync = LinkySync(store, db, fake, wall=clock, budget=3)
    assert await sync.run_once() == 3
    assert sync.status()["state"] == "quota"
    assert sync.status()["message"] == "Quota Linky du jour atteint : reprise demain."
    assert len(store.daily()) == 365
    newest = store.complete_curve_days(date(2026, 9, 14), date(2026, 10, 14))
    assert len(newest) == 14 and max(newest) == date(2026, 10, 13)  # the two newest chunks
    assert await sync.run_once() == 0  # same day: no budget left
    clock.advance(86400)
    fake.calls.clear()
    await sync.run_once()
    assert fake.calls[0].startswith("daily:2026-10-14")
    assert all(not c.startswith("curve:2026-10-07") for c in fake.calls)  # not refetched
    clock.advance(86400)
    await sync.run_once()  # 2026-10-16: the 30-day window is now 09-16 … 10-15
    assert len(store.complete_curve_days(date(2026, 9, 16), date(2026, 10, 16))) == 30


async def test_throttled_waits_for_next_access_time(env):
    clock, _, store, fake, sync = env
    fake.fail["curve"] = LinkyThrottled(retry_at=clock() + 1800)
    made = await sync.run_once()
    assert made == 2  # daily ok, first curve chunk throttled
    st = sync.status()
    assert st["state"] == "throttled" and st["retry_at"] == clock() + 1800
    assert "nouvel essai à 08:30" in st["message"]
    assert len(store.daily()) == 365  # kept
    del fake.fail["curve"]
    clock.advance(600)
    assert await sync.run_once() == 0  # still before nextAccessTime
    assert sync.next_wake(clock()) == clock() + 1200  # retry_at is before 14:00
    clock.advance(1200)
    assert await sync.run_once() == 7  # five 30-day chunks and two extra ones
    assert sync.status()["state"] == "ok"


async def test_throttled_without_a_time_waits_an_hour(env):
    clock, _, _, fake, sync = env
    fake.fail["daily"] = LinkyThrottled(retry_at=None)
    await sync.run_once()
    assert sync.state.retry_at == clock() + 3600


async def test_auth_error_stops_until_a_new_source(env):
    clock, _, _, fake, sync = env
    fake.fail["daily"] = LinkyAuthError("HTTP 401")
    await sync.run_once()
    assert sync.status()["state"] == "auth"
    assert (
        sync.status()["message"]
        == "MyElectricalData refuse le jeton : renouvelez-le dans Maison › Linky."
    )
    clock.advance(86400)
    fake.calls.clear()
    assert await sync.run_once() == 0 and fake.calls == []
    sync.set_source(FakeLinkySource(wall=clock))
    assert await sync.run_once() > 0


async def test_linky_error_is_logged_by_type_and_keeps_progress(env, caplog):
    clock, _, store, fake, sync = env
    fake.fail["curve"] = LinkyError("secret-token-in-message")
    with caplog.at_level(logging.WARNING, logger="kelvin.linky.sync"):
        assert await sync.run_once() == 8  # each failing chunk counted, none stops the run
    assert sync.status()["state"] == "error"
    assert len(store.daily()) == 365
    assert "secret-token-in-message" not in caplog.text
    assert "LinkyError" in caplog.text


async def test_run_loop_survives_errors(env, caplog):
    clock, _, _, fake, sync = env
    fake.fail["daily"] = RuntimeError("secret-token-in-message")
    task = asyncio.create_task(sync.run())
    await until(lambda: sync.status()["state"] == "error")
    assert fake.calls == ["daily:2025-10-14:2026-10-14"]
    assert not task.done()
    del fake.fail["daily"]
    fake.fail["curve"] = LinkyError("boom")
    sync.wake()
    await until(lambda: len(fake.calls) == 9)  # daily, then all seven curve chunks fail
    assert not task.done() and sync.status()["state"] == "error"
    assert sync.calls_today() == 9  # every call counted, failed ones too
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert "secret-token-in-message" not in caplog.text


async def test_contract_activation_bounds_the_backfill(env):
    _, _, _, fake, sync = env
    sync.set_not_before(date(2026, 8, 5))
    await sync.run_once()
    assert fake.calls[0] == "daily:2026-08-05:2026-10-14"


async def test_no_source_means_off(env):
    clock, db, store, _, _ = env
    sync = LinkySync(store, db, None, wall=clock)
    assert await sync.run_once() == 0
    assert sync.status()["state"] == "off"


def test_state_survives_a_restart(env):
    clock, db, store, fake, sync = env
    assert sync.spend() and sync.spend()
    again = LinkySync(store, db, fake, wall=clock)
    assert again.calls_today() == 2
    clock.advance(86400)
    assert again.calls_today() == 0


@pytest.mark.parametrize(
    ("now", "expected"),
    [
        (at(2026, 10, 14, 7), at(2026, 10, 14, 8)),
        (at(2026, 10, 14, 9), at(2026, 10, 14, 14)),
        (at(2026, 10, 14, 15), at(2026, 10, 15, 8)),
        (at(2026, 3, 28, 15), at(2026, 3, 29, 8)),  # across the spring DST change
        (at(2026, 10, 24, 15), at(2026, 10, 25, 8)),  # across the autumn DST change
        (at(2026, 10, 25, 9), at(2026, 10, 25, 14)),  # on the 25-hour day itself
    ],
)
def test_next_wake_at_8_and_14_local(env, now, expected):
    *_, sync = env
    assert sync.next_wake(now) == expected


async def test_a_broken_daily_endpoint_gives_no_daily_history_up(env):
    """Only the daily endpoint fails while the curve works: the year of daily backfill must
    not be given up, because no daily request succeeded to prove the service answers it."""
    clock, _, _, fake, sync = env
    fake.fail["daily"] = LinkyError("bad request")
    for _ in range(GIVE_UP_AFTER + 1):
        await sync.run_once()
        clock.advance(86400)
    daily = [r for r in sync.plan() if r.kind == "daily"]
    assert daily and daily[0].end - daily[0].start >= timedelta(days=300)


async def test_saving_the_same_source_keeps_the_enedis_retry_time(env):
    """Réglages saved while Enedis throttles: no immediate request that would be 429 again."""
    clock, _, _, fake, sync = env
    fake.fail["curve"] = LinkyThrottled(retry_at=clock() + 1800)
    await sync.run_once()
    del fake.fail["curve"]
    sync.set_source(FakeLinkySource(wall=clock))
    assert sync.state.retry_at == clock() + 1800
    assert sync.status()["state"] == "throttled"
    assert await sync.run_once() == 0
    clock.advance(1800)
    assert await sync.run_once() > 0


async def test_a_past_retry_time_is_dropped_on_a_new_source(env):
    clock, _, _, fake, sync = env
    fake.fail["curve"] = LinkyThrottled(retry_at=clock() + 1800)
    await sync.run_once()
    clock.advance(3600)
    sync.set_source(FakeLinkySource(wall=clock))
    assert sync.state.retry_at is None and sync.status()["state"] != "throttled"


def _service(db, token):
    from kelvin.linky.service import LinkyService

    return LinkyService(
        db,
        make_source=lambda prm, tok: FakeLinkySource(),
        credentials=("12345678901234", token),
    )


def test_a_stored_auth_error_is_cleared_by_a_new_token_at_start():
    """MED_TOKEN changed and Kelvin restarted: the old token's auth error must not stop the
    sync forever. The same token keeps it. Only a fingerprint is stored, never the token."""
    db = Database(":memory:")
    svc = _service(db, "token-a")
    svc.sync.state.error = "auth"
    svc.sync._save()
    assert _service(db, "token-a").sync.state.error == "auth"
    fresh = _service(db, "token-b")
    assert fresh.sync.state.error is None
    dump = "\n".join(db.conn.iterdump())
    assert "token-a" not in dump and "token-b" not in dump
