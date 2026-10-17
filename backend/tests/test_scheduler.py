"""The wall-clock job loop (spec §2.8)."""

from datetime import datetime, time
from zoneinfo import ZoneInfo

from kelvin.grid.models import BudgetSpent, GridThrottled
from kelvin.recorder.db import Database
from kelvin.scheduler import BACKOFF_MAX_S, Job, Scheduler
from tests.conftest import ManualClock

PARIS = ZoneInfo("Europe/Paris")


def at(h, mi=0, d=14):
    return datetime(2026, 10, d, h, mi, tzinfo=PARIS).timestamp()


class Counter:
    def __init__(self, fail=None):
        self.n = 0
        self.fail = fail

    async def __call__(self):
        self.n += 1
        if self.fail is not None:
            raise self.fail


def make(clock, run, *, times=(time(7, 15), time(17, 15)), enabled=lambda: True, db=None):
    job = Job("ecowatt", times, run, enabled, jitter_s=120)
    return job, Scheduler(db or Database(":memory:"), [job], wall=clock)


async def test_jobs_run_at_their_wall_clock_times_with_jitter():
    clock = ManualClock(at(5))
    run = Counter()
    job, s = make(clock, run)
    s.state["ecowatt"] = {"slot": at(4)}  # nothing missed
    due = s.due_at(job, clock())
    assert at(7, 13) <= due <= at(7, 17)
    assert await s.run_due() == [] and run.n == 0
    clock.t = at(7, 18)
    assert await s.run_due() == ["ecowatt"] and run.n == 1
    assert await s.run_due() == [] and run.n == 1
    assert at(17, 13) <= s.due_at(job, clock()) <= at(17, 17)
    assert s.status("ecowatt")["state"] == "ok" and s.status("ecowatt")["last_ok"] == at(7, 18)


async def test_a_missed_slot_runs_once_at_start_and_the_state_persists():
    clock = ManualClock(at(9))
    db = Database(":memory:")
    run = Counter()
    _, s = make(clock, run, db=db)
    assert await s.run_due() == ["ecowatt"]
    _, again = make(clock, run, db=db)  # a restart
    assert await again.run_due() == [] and run.n == 1


async def test_retry_after_is_honoured():
    clock = ManualClock(at(7, 18))
    run = Counter(GridThrottled(at(7, 28)))
    job, s = make(clock, run)
    await s.run_due()
    st = s.status("ecowatt")
    assert st["state"] == "error" and st["error_since"] == at(7, 18) and st["next"] == at(7, 28)
    run.fail = None
    clock.t = at(7, 28)
    assert await s.run_due() == ["ecowatt"] and s.status("ecowatt")["state"] == "ok"


async def test_failures_back_off_up_to_six_hours():
    clock = ManualClock(at(7, 18))
    run = Counter(RuntimeError("boom"))
    job, s = make(clock, run, times=(time(7, 15),))
    waits = []
    for _ in range(9):
        await s.run_due()
        nxt = s.due_at(job, clock())
        waits.append(nxt - clock())
        clock.t = nxt
    assert waits[:3] == [300, 600, 1200] and max(waits) <= BACKOFF_MAX_S


async def test_a_spent_budget_waits_for_the_next_slot_and_says_quota():
    clock = ManualClock(at(7, 18))
    job, s = make(clock, Counter(BudgetSpent("budget")))
    await s.run_due()
    assert s.status("ecowatt")["state"] == "quota"
    assert at(17, 13) <= s.due_at(job, clock()) <= at(17, 17)


async def test_disabled_jobs_cost_nothing_and_a_request_runs_one_soon():
    clock = ManualClock(at(9))
    run = Counter()
    on = {"v": False}
    job, s = make(clock, run, enabled=lambda: on["v"])
    assert (
        await s.run_due() == []
        and s.status("ecowatt")["state"] == "off"
        and s.due_at(job, clock()) is None
    )
    on["v"] = True
    s.state["ecowatt"] = {"slot": at(8)}
    s.request("ecowatt")
    assert await s.run_due() == ["ecowatt"]


async def test_a_failure_with_retry_after_does_not_double_the_backoff():
    clock = ManualClock(at(7, 18))
    run = Counter(GridThrottled(at(7, 28)))
    job, s = make(clock, run, times=(time(7, 15),))
    await s.run_due()
    clock.t = at(7, 28)
    run.fail = RuntimeError("boom")
    await s.run_due()
    assert s.due_at(job, clock()) - clock() == 300


async def test_the_loop_survives_an_error_computing_what_is_due():
    import asyncio

    clock = ManualClock(at(9))
    calls = {"n": 0}

    def enabled():
        calls["n"] += 1
        if calls["n"] == 2:  # the loop's own computation of the next wake-up
            raise RuntimeError("db")
        return True

    run = Counter()
    job, s = make(clock, run, enabled=enabled)
    s.state["ecowatt"] = {"slot": at(8)}
    task = asyncio.create_task(s.run())
    await asyncio.sleep(0.05)
    assert not task.done()
    task.cancel()


async def test_a_run_that_called_nothing_keeps_the_last_fetch_time():
    clock = ManualClock(at(7, 18))
    fetched = {"v": True}

    async def run():
        return fetched["v"]

    job, s = make(clock, run)
    await s.run_due()
    assert s.status("ecowatt")["last_ok"] == at(7, 18)
    fetched["v"] = False
    clock.t = at(17, 20)
    assert await s.run_due() == ["ecowatt"]
    st = s.status("ecowatt")
    assert st["state"] == "ok" and st["last_ok"] == at(7, 18)


async def test_reset_forgets_a_job(tmp_path):
    db = Database(tmp_path / "k.db")
    clock = ManualClock(1_000_000.0)

    async def ok():
        return True

    s = Scheduler(db, [Job("x", (time(4, 0),), ok)], wall=clock)
    await s.run_due()
    assert s.status("x")["last_ok"] is not None
    s.reset("x")
    assert s.status("x")["last_ok"] is None
    assert Scheduler(db, [Job("x", (time(4, 0),), ok)], wall=clock).status("x")["last_ok"] is None
