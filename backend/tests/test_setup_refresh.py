"""Changes made in the Cozytouch app reach Kelvin within the full-read budget (owner question
« drift », ruling 8)."""

from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

from kelvin.commands.service import CommandService
from kelvin.house.model import build_house
from kelvin.overkiz.budget import DAY_S, SetupReadGuard
from kelvin.overkiz.errors import QuotaError
from kelvin.overkiz.fake import FakeGateway
from kelvin.overkiz.models import PlaceEvent
from kelvin.overkiz.poller import EventPump
from kelvin.overkiz.sample import SAMPLE_GATEWAY
from kelvin.setup.refresh import SetupRefresher, SyncSpent
from kelvin.setup.service import SetupService
from tests.conftest import ManualClock

PARIS = ZoneInfo("Europe/Paris")


def at(day: int, hour: int, minute: int = 0) -> float:
    return datetime(2026, 10, day, hour, minute, tzinfo=PARIS).timestamp()


def _refresher(start: float) -> tuple[ManualClock, SetupReadGuard, SetupRefresher]:
    clock = ManualClock(start)
    guard = SetupReadGuard(wall=clock)
    guard.record()  # the startup read
    ref = SetupRefresher(guard, wall=clock)
    ref.full_read_done()
    return clock, guard, ref


def test_the_daily_refresh_runs_once_at_04_30():
    clock, guard, ref = _refresher(at(14, 12))
    clock.t = at(15, 4, 29)
    assert ref.due() is None
    clock.t = at(15, 4, 30)
    assert ref.due() == "daily"
    guard.record()
    ref.full_read_done()
    assert ref.due() is None
    assert ref.next_daily_at == at(16, 4, 30)


def test_the_daily_refresh_is_skipped_after_a_recent_full_read():
    clock, _, ref = _refresher(at(15, 1))
    clock.t = at(15, 4, 30)
    assert ref.due() is None
    assert ref.next_daily_at == at(16, 4, 30)


def test_the_daily_refresh_waits_for_a_free_read():
    clock, guard, ref = _refresher(at(14, 5))
    guard.record()
    guard.record()  # three reads at 05:00 on the 14th
    clock.t = at(15, 4, 30)
    assert ref.due() is None  # due, but the budget is spent until 05:00
    clock.t = at(15, 5)
    assert ref.due() == "daily"


def test_after_write_refresh_is_coalesced_and_keeps_a_reserve():
    clock, guard, ref = _refresher(at(14, 12))
    ref.after_write()
    clock.advance(20)
    ref.after_write()  # a second write pushes it back
    clock.advance(29)
    assert ref.due() is None
    clock.advance(1)
    assert ref.due() == "after_write"
    guard.record()
    ref.full_read_done()  # 2 of 3 used: one left, the reserve
    ref.after_write()
    clock.advance(30)
    assert ref.due() is None  # the confirmed write, already applied, stands
    assert ref.due() is None


def test_an_outside_place_change_rereads_the_tree_while_a_read_is_in_reserve():
    clock, guard, ref = _refresher(at(14, 12))
    ref.outside_change()
    first = clock.t
    clock.advance(9)
    ref.outside_change()  # still changing: wait for 10 s of quiet
    clock.advance(9)
    assert ref.due() is None and ref.stale_since == first
    clock.advance(1)
    assert ref.due() == "outside"
    guard.record()
    ref.full_read_done()
    assert ref.stale_since is None
    guard.record()  # an outage resync spent another: one left
    ref.outside_change()
    clock.advance(10)
    assert ref.due() is None
    assert ref.view()["stale_since"] is not None  # the screen says Kelvin will re-read later


def test_manual_sync_spends_one_read_and_reports_the_next():
    start = at(14, 12)
    clock, guard, ref = _refresher(start)
    ref.request_manual()
    ref.request_manual()  # twice: still one read
    assert ref.due() == "manual" and ref.view()["requested"] is True
    guard.record()
    ref.full_read_done()
    assert ref.view()["requested"] is False and ref.due() is None
    guard.record()  # 3 used
    with pytest.raises(SyncSpent) as e:
        ref.request_manual()
    assert (e.value.used, e.value.limit, e.value.next_at) == (3, 3, start + DAY_S)
    assert ref.view()["next_possible_at"] == start + DAY_S


def test_a_failed_read_is_not_retried_until_asked_again():
    _, _, ref = _refresher(at(14, 12))
    ref.request_manual()
    ref.read_failed("manual")
    assert ref.due() is None


# --- through the pump ---


@pytest.fixture
def stack():
    clock = ManualClock(at(14, 12))
    gw = FakeGateway(clock=clock)
    house = build_house(gw.root, list(gw.devices.values()), wall=clock)
    commands = CommandService(gw, house, clock=clock, wall=clock)
    guard = SetupReadGuard(wall=clock)
    guard.record()  # the startup read
    refresher = SetupRefresher(guard, wall=clock)
    refresher.full_read_done()
    setup = SetupService(gw, house, clock=clock, wall=clock)
    setup.on_outside_change = refresher.outside_change
    setup.on_written = refresher.after_write
    layouts: list[int] = []
    pump = EventPump(
        gw,
        house,
        commands,
        clock=clock,
        wall=clock,
        guard=guard,
        setup=setup,
        refresher=refresher,
        on_layout=lambda: layouts.append(1),
    )
    pump.mark_ok()
    return clock, gw, house, setup, refresher, pump, layouts


async def run(pump: EventPump, clock: ManualClock, seconds: int) -> None:
    for _ in range(seconds):
        clock.advance(1.0)
        await pump.run_once()


async def test_an_outside_place_change_reaches_the_house_through_one_full_read(stack):
    clock, gw, house, _, _, pump, layouts = stack
    gw.outside_rename_place("p-salon", "Séjour")
    await run(pump, clock, 10)
    assert house.rooms["p-salon"].name == "Salon" and gw.snapshots == 0
    await run(pump, clock, 1)
    assert house.rooms["p-salon"].name == "Séjour" and gw.snapshots == 1
    assert layouts and pump.guard.used() == 2


async def test_an_echo_of_kelvin_s_own_write_does_not_cost_a_read(stack):
    clock, gw, _, setup, refresher, pump, _ = stack
    p = await setup.rename_room("p-ch1", "Chambre d’amis")
    await run(pump, clock, 3)
    assert p.status == "confirmed"
    gw._events.append(PlaceEvent("updated"))  # a late duplicate of Kelvin's own event
    await run(pump, clock, 1)
    assert refresher.stale_since is None
    await run(pump, clock, 30)
    assert gw.snapshots == 1  # only the after-write refresh


async def test_several_writes_cost_one_after_write_refresh(stack):
    clock, gw, _, setup, _, pump, _ = stack
    await setup.rename_room("p-ch1", "Chambre d’amis")
    await setup.create_room("Bureau")
    await run(pump, clock, 40)
    await run(pump, clock, 100)
    assert gw.snapshots == 1


async def test_a_full_resync_also_refreshes_places_and_labels(stack):
    clock, gw, house, _, refresher, pump, layouts = stack
    gw.places["p-salon"]["label"] = "Séjour"  # changed while Kelvin was not listening
    gw.devices[f"{SAMPLE_GATEWAY}/9312063#1"].label = "Radiateur fenêtre"
    pump.request_resync()
    await run(pump, clock, 1)
    assert house.rooms["p-salon"].name == "Séjour"
    assert house.radiators["9312063"].name == "Radiateur fenêtre"
    assert refresher.last_full_at == clock.t and layouts


async def test_the_daily_refresh_reads_the_setup_through_the_pump(stack):
    clock, gw, _, _, _, pump, _ = stack
    clock.t = at(15, 4, 30) - 1
    await run(pump, clock, 1)
    assert gw.snapshots == 1


async def test_manual_sync_through_the_pump(stack):
    clock, gw, _, _, refresher, pump, _ = stack
    refresher.request_manual()
    await run(pump, clock, 1)
    assert gw.snapshots == 1 and refresher.view()["requested"] is False


async def test_a_failed_full_read_is_not_retried_in_a_loop(stack):
    clock, gw, _, _, refresher, pump, _ = stack
    refresher.request_manual()
    gw.fail_snapshot = QuotaError("QUOTA_EXCEEDED")
    await run(pump, clock, 1)
    gw.fail_snapshot = None
    await run(pump, clock, 120)
    assert gw.snapshots == 1 and pump.guard.used() == 2


async def test_the_pump_polls_fast_while_a_setup_write_is_pending(stack):
    _, _, _, setup, _, pump, _ = stack
    await setup.create_room("Bureau")
    assert await pump.run_once() == pump.busy_interval


def test_no_refresh_ever_takes_the_last_read_a_restart_needs():
    """Plan 5's rule: a restart always finds one full read. Daily and « Synchroniser » too."""
    start = at(14, 12)
    clock, guard, ref = _refresher(start)
    guard.record()  # an outage resync: one read left
    clock.t = at(15, 4, 30)
    assert ref.due() is None
    with pytest.raises(SyncSpent) as e:
        ref.request_manual()
    assert e.value.next_at == start + DAY_S  # when a read beyond the reserve frees up
    assert ref.view()["next_possible_at"] == start + DAY_S
    clock.t = start + DAY_S
    assert ref.due() == "daily"  # still owed, now that a read is free


async def test_an_unconfirmed_write_is_reconciled_by_the_after_write_read(stack):
    clock, gw, _, setup, _, pump, _ = stack
    gw.silent_setup = True
    gw.setup_delay = 10_000.0  # Cozytouch never applies it
    p = await setup.create_room("Bureau")
    await run(pump, clock, 60)
    assert p.status == "unconfirmed" and gw.snapshots == 0
    await run(pump, clock, 31)  # 30 s after it settled
    assert gw.snapshots == 1
    await setup.create_room("Bureau")  # the read showed it did not apply: the label is free
    assert len(gw.setup_writes) == 2


def test_a_withheld_or_failed_after_write_read_asks_for_targeted_settling():
    clock, guard, ref = _refresher(at(14, 12))
    withheld: list[int] = []
    ref.on_withheld = lambda: withheld.append(1)
    ref.after_write()
    ref.read_failed("after_write")  # a quota answer
    assert withheld == [1]
    guard.record()  # only the restart's read left
    ref.after_write()
    clock.advance(30)
    assert ref.due() is None and withheld == [1, 1]


async def test_a_reservation_never_waits_a_day_for_a_full_read(stack):
    """Review R1, probe G2: the write times out while only the reserve is left."""
    clock, gw, _, setup, refresher, pump, _ = stack
    refresher.on_withheld = setup.settle_soon
    pump.guard.record()  # an outage resync: one read left, the restart's
    gw.silent_setup = True
    gw.setup_delay = 10_000.0
    await setup.create_room("Bureau")
    await run(pump, clock, 92)  # timeout at 60, after-write due at 90 and withheld
    assert gw.snapshots == 0
    await setup.create_room("Bureau")  # settled by one targeted read: free again
    assert len(gw.setup_writes) == 2
