"""Device signal (spec QW3, §11 Plan 8): last event per device, reachability, room presence."""

from kelvin.house.model import build_house
from kelvin.overkiz.fake import FakeGateway
from kelvin.overkiz.models import StateChange
from kelvin.overkiz.sample import DEMO_OUTAGE_RID, SAMPLE_GATEWAY, sample_house
from tests.conftest import ManualClock

RID = "8370011"  # Chambre 1, invented
HEATER = f"{SAMPLE_GATEWAY}/{RID}#1"
TEMP = f"{SAMPLE_GATEWAY}/{RID}#2"


def make(clock=None, mutate=None):
    root, devices = sample_house()
    if mutate:
        mutate(devices)
    return build_house(root, devices, wall=clock or ManualClock(10_000.0))


def test_an_event_sets_last_event_ts_even_when_the_value_is_unchanged():
    clock = ManualClock(10_000.0)
    house = make(clock)
    assert house.last_event_ts == {}
    value = house.device_state(TEMP, "core:TemperatureState")
    clock.advance(60)
    assert house.apply(StateChange(TEMP, "core:TemperatureState", value)) == RID
    assert house.last_event_ts[TEMP] == 10_060.0
    assert house.radiators[RID].last_event_at == 10_060.0


def test_a_reload_is_not_an_event():
    house = make()
    assert house.apply(StateChange(TEMP, "core:TemperatureState", 3.0), event=False) == RID
    assert house.apply(StateChange(TEMP, "core:TemperatureState", 3.0), event=False) is None
    assert house.last_event_ts == {}
    assert house.radiators[RID].last_event_at is None


def test_the_latest_event_of_any_sub_device_counts():
    clock = ManualClock(10_000.0)
    house = make(clock)
    house.apply(StateChange(TEMP, "core:TemperatureState", 19.0))
    clock.advance(120)
    house.apply(StateChange(HEATER, "io:CurrentWorkingRateState", 40.0))
    assert house.radiators[RID].last_event_at == 10_120.0


def test_reachability_and_since():
    clock = ManualClock(10_000.0)
    house = make(clock)
    r = house.radiators[RID]
    assert (r.reachable, r.unreachable_since) == (True, None)
    clock.advance(300)
    house.apply(StateChange(HEATER, "core:StatusState", "unavailable"))
    assert (r.reachable, r.unreachable_since) == (False, 10_300.0)
    clock.advance(1800)
    assert house.unreachable_for(RID, clock()) == 1800.0
    house.apply(StateChange(HEATER, "core:StatusState", "unavailable"))  # repeated: same run
    assert r.unreachable_since == 10_300.0
    house.apply(StateChange(HEATER, "core:StatusState", "available"))
    assert (r.reachable, r.unreachable_since) == (True, None)
    assert house.unreachable_for(RID, clock()) is None


def test_already_unavailable_at_start_has_no_since_but_counts_from_start():
    def mutate(devices):
        next(d for d in devices if d.device_url == HEATER).states["core:StatusState"] = (
            "unavailable"
        )

    clock = ManualClock(10_000.0)
    house = make(clock, mutate)
    r = house.radiators[RID]
    assert (r.reachable, r.unreachable_since) == (False, None)
    clock.advance(600)
    assert house.unreachable_for(RID, clock()) == 600.0


def test_view_has_null_reachability_and_signal_when_unknown():
    def mutate(devices):
        heater = next(d for d in devices if d.device_url == HEATER)
        del heater.states["core:StatusState"]
        del heater.states["core:RSSILevelState"]

    house = make(mutate=mutate)
    v = house.radiators[RID].view()
    assert (v["reachable"], v["unreachable_since"], v["last_event_at"], v["rssi"]) == (
        None,
        None,
        None,
        None,
    )
    assert house.unreachable_for(RID, 99_999.0) is None


def test_room_presence_is_null_when_no_radiator_reports_it_else_any():
    def mutate(devices):
        for d in devices:
            d.states.pop("core:OccupancyState", None)

    house = make(mutate=mutate)
    assert all(house.room_view(r)["presence"] is None for r in house.rooms)
    house = make()
    room = house.radiators[RID].room_id
    assert house.room_view(room)["presence"] is False
    house.apply(StateChange(f"{SAMPLE_GATEWAY}/{RID}#4", "core:OccupancyState", "personInside"))
    assert house.room_view(room)["presence"] is True


async def test_demo_outage_flips_back_after_its_delay():
    clock = ManualClock(0.0)
    gw = FakeGateway(clock=clock)
    url = f"{SAMPLE_GATEWAY}/{DEMO_OUTAGE_RID}#1"
    gw.demo_outage(DEMO_OUTAGE_RID, before_s=2700, after_s=7200, wall=50_000.0)
    assert gw.devices[url].states["core:StatusState"] == "unavailable"
    assert gw.sim_status_since == {url: 47_300.0}
    clock.advance(7199)
    assert not [e for e in await gw.fetch_events() if isinstance(e, StateChange)]
    clock.advance(1)
    events = [e for e in await gw.fetch_events() if isinstance(e, StateChange)]
    assert events == [StateChange(url, "core:StatusState", "available")]


def test_backdated_outage_is_known_and_long_enough():
    clock = ManualClock(50_000.0)
    root, devices = sample_house()
    url = f"{SAMPLE_GATEWAY}/{DEMO_OUTAGE_RID}#1"
    next(d for d in devices if d.device_url == url).states["core:StatusState"] = "unavailable"
    house = build_house(root, devices, wall=clock)
    house.backdate_status({url: 47_300.0})
    r = house.radiators[DEMO_OUTAGE_RID]
    assert r.unreachable_since == 47_300.0
    assert house.unreachable_for(DEMO_OUTAGE_RID, clock()) == 2700.0
