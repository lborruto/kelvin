"""One MyElectricalData ledger (owner rule: Kelvin never spends more than 10 of the 50 daily
calls): Linky, the contract re-read and the grid all draw from it."""

from datetime import date, datetime
from zoneinfo import ZoneInfo

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from kelvin.linky.fake import FakeLinkySource
from kelvin.linky.models import LinkyError
from kelvin.linky.service import LinkyService
from kelvin.linky.store import LinkyStore
from kelvin.linky.sync import GRID_DAILY_MAX, LinkySync
from kelvin.recorder.db import Database
from tests.conftest import ManualClock

PARIS = ZoneInfo("Europe/Paris")


def at(y, m, d, h=8, mi=0):
    return datetime(y, m, d, h, mi, tzinfo=PARIS).timestamp()


@pytest.fixture
def env():
    clock = ManualClock(at(2026, 10, 14))
    db = Database(":memory:")
    store = LinkyStore(db)
    fake = FakeLinkySource(wall=clock, activation=date(2024, 1, 1))
    return clock, db, store, fake


def test_every_med_call_counts_and_ten_is_the_ceiling(env):
    clock, db, store, fake = env
    sync = LinkySync(store, db, fake, wall=clock)
    assert [sync.spend(kind="grid") for _ in range(GRID_DAILY_MAX + 1)] == [True] * 4 + [False]
    assert all(sync.spend() for _ in range(6)) and not sync.spend() and not sync.spend(kind="grid")
    assert (sync.calls_today(), sync.grid_calls_today()) == (10, 4)
    clock.t = at(2026, 10, 15, 0, 1)  # a new Paris day
    assert sync.spend(kind="grid") and (sync.calls_today(), sync.grid_calls_today()) == (1, 1)


async def test_backfill_leaves_the_planned_grid_calls(env):
    clock, db, store, fake = env
    sync = LinkySync(store, db, fake, wall=clock)
    sync.reserve = lambda: 3
    made = await sync.run_once()
    assert (
        made == 7 and sync.state.error == "quota"
    )  # daily + newest curve, then backfill up to 10 − 3
    assert fake.calls[0].startswith("daily:") and fake.calls[1] == "curve:2026-10-07:2026-10-14"
    assert [sync.spend(kind="grid") for _ in range(4)] == [True, True, True, False]
    assert sync.calls_today() == 10


async def test_essential_requests_ignore_the_reserve(env):
    clock, db, store, fake = env
    sync = LinkySync(store, db, fake, wall=clock)
    sync.reserve = lambda: 10
    assert await sync.run_once() == 2  # the daily window and the newest curve chunk only
    assert sync.state.error == "quota"


async def test_the_contract_is_read_once_a_month(env):
    clock, db, store, fake = env
    sync = LinkySync(store, db, fake, wall=clock)
    got = []
    sync.on_contract = got.append
    await sync.run_once()
    assert fake.calls.index("contract") == 2  # after the daily window and the newest curve chunk
    assert got[0].offpeak == (("22:00", "06:00"),) and sync.state.contract_month == "2026-10"
    fake.calls.clear()
    clock.t = at(2026, 10, 15)
    await sync.run_once()
    assert "contract" not in fake.calls
    clock.t = at(2026, 11, 1)
    fake.contract_offpeak = "HC (23H00-7H00)"
    fake.calls.clear()
    await sync.run_once()
    assert fake.calls.count("contract") == 1 and got[-1].offpeak == (("23:00", "07:00"),)


async def test_a_failed_contract_read_is_retried_and_gives_up_no_day(env):
    clock, db, store, fake = env
    sync = LinkySync(store, db, fake, wall=clock)
    sync.on_contract = lambda c: None
    fake.fail["contract"] = LinkyError("boom")
    await sync.run_once()
    assert sync.state.contract_month is None and sync.state.error == "error"
    assert not any(k.startswith("contract") for k in sync.state.tries)


async def test_configure_is_the_month_s_contract_read_and_the_re_read_keeps_contract_last(env):
    clock, db, store, fake = env
    svc = LinkyService(db, make_source=lambda prm, token: fake, credentials=None, wall=clock)
    await svc.configure("12345678901234", "token")
    assert svc.sync.state.contract_month == "2026-10"
    assert svc.tariffs.contract_last()["offpeak"] == [{"start": "22:00", "end": "06:00"}]
    fake.calls.clear()
    await svc.sync.run_once()
    assert "contract" not in fake.calls
    clock.t = at(2026, 11, 1)
    fake.contract_offpeak = "HC (23H00-7H00)"
    await svc.sync.run_once()
    last = svc.tariffs.contract_last()
    assert last["offpeak"] == [{"start": "23:00", "end": "07:00"}] and last["fetched_at"] == clock()
    assert svc.status()["grid_calls_today"] == 0
    assert svc.spend_grid() and svc.status()["grid_calls_today"] == 1


@settings(max_examples=100, deadline=None)
@given(
    asks=st.lists(st.sampled_from(["essential", "backfill", "grid"]), max_size=40),
    reserve=st.integers(0, 12),
)
def test_no_mix_of_calls_passes_ten_a_day_nor_four_grid_calls(asks, reserve):
    clock = ManualClock(at(2026, 10, 14))
    db = Database(":memory:")
    sync = LinkySync(LinkyStore(db), db, None, wall=clock)
    sync.reserve = lambda: reserve
    granted = [k for k in asks if sync.spend(kind=k)]
    assert len(granted) == sync.calls_today() <= 10
    assert granted.count("grid") == sync.grid_calls_today() <= GRID_DAILY_MAX
    # A backfill call was only granted while the planned grid calls still had room.
    used = 0
    for k in granted:
        if k == "backfill":
            assert used < 10 - reserve
        used += 1
