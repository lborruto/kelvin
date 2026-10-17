"""The simulator's Cozytouch setup (spec §2.7, §10.2)."""

import pytest

from kelvin.api.runtime import make_gateway
from kelvin.config import Settings
from kelvin.overkiz.errors import GatewayError, SetupNotFoundError
from kelvin.overkiz.fake import FakeGateway, setup_failures
from kelvin.overkiz.models import DeviceUpdate, PlaceEvent, SetupDevice, SetupPlace
from kelvin.overkiz.sample import ROOM_TYPE, SAMPLE_GATEWAY
from kelvin.setup.client import SetupNotAllowed
from tests.conftest import ManualClock

HEATER = f"{SAMPLE_GATEWAY}/9500003#1"


def _gw() -> tuple[FakeGateway, ManualClock]:
    clock = ManualClock(0.0)
    return FakeGateway(clock=clock), clock


async def test_a_created_room_appears_after_two_seconds_with_a_payload_less_event():
    gw, clock = _gw()
    oid = await gw.create_place("p-house", "Bureau", ROOM_TYPE)
    with pytest.raises(SetupNotFoundError):
        await gw.read_place(oid)
    assert await gw.fetch_events() == []
    clock.advance(2.0)
    assert await gw.fetch_events() == [PlaceEvent("created")]
    assert await gw.read_place(oid) == SetupPlace(oid, "Bureau", ROOM_TYPE, None, ())
    root, _ = await gw.snapshot()
    assert root.children[-1].label == "Bureau" and root.children[-1].type == ROOM_TYPE
    assert gw.setup_writes == [("create_place", "p-house", "Bureau", ROOM_TYPE)]


async def test_place_events_carry_the_payload_when_asked():
    gw, clock = _gw()
    gw.place_event_payload = True
    oid = await gw.create_place("p-house", "Bureau", ROOM_TYPE)
    clock.advance(2.0)
    assert await gw.fetch_events() == [PlaceEvent("created", oid, "Bureau")]


async def test_rename_then_delete_an_empty_room_ends_in_a_404():
    gw, clock = _gw()
    await gw.update_place("p-ch1", "Chambre d’amis", ROOM_TYPE, None)
    clock.advance(2.0)
    assert await gw.fetch_events() == [PlaceEvent("updated")]
    assert (await gw.read_place("p-ch1")).label == "Chambre d’amis"
    oid = await gw.create_place("p-house", "Bureau", ROOM_TYPE)
    clock.advance(2.0)
    await gw.delete_place(oid)
    assert (await gw.read_place(oid)).label == "Bureau"  # not yet
    clock.advance(2.0)
    with pytest.raises(SetupNotFoundError):
        await gw.read_place(oid)
    assert PlaceEvent("deleted") in await gw.fetch_events()


async def test_a_room_with_devices_and_the_root_are_refused():
    gw, _ = _gw()
    for oid in ("p-salon", "p-house"):
        with pytest.raises(GatewayError) as e:
            await gw.delete_place(oid)
        assert not isinstance(e.value, SetupNotFoundError)
    assert gw.setup_writes == []


async def test_relocate_and_rename_emit_device_updates():
    gw, clock = _gw()
    await gw.relocate_device(HEATER, "p-ch1")
    clock.advance(2.0)
    assert await gw.fetch_events() == [DeviceUpdate(HEATER, "p-ch1", "Radiateur")]
    assert await gw.read_device(HEATER) == SetupDevice(HEATER, "Radiateur", "p-ch1")
    await gw.rename_device(HEATER, "Radiateur salon")
    clock.advance(2.0)
    assert await gw.fetch_events() == [DeviceUpdate(HEATER, "p-ch1", "Radiateur salon")]
    assert gw.devices[HEATER].states["core:NameState"] == "Radiateur"  # the label only


async def test_unknown_targets_are_404():
    gw, _ = _gw()
    with pytest.raises(SetupNotFoundError):
        await gw.read_place("p-nope")
    with pytest.raises(SetupNotFoundError):
        await gw.read_device(f"{SAMPLE_GATEWAY}/1#1")
    with pytest.raises(SetupNotFoundError):
        await gw.relocate_device(HEATER, "p-nope")
    with pytest.raises(SetupNotFoundError):
        await gw.update_place("p-nope", "X", ROOM_TYPE, None)


async def test_failures_and_refusals_are_injected_and_nothing_is_recorded():
    gw, _ = _gw()
    gw.fail_setup = setup_failures("create_place, rename_device")
    with pytest.raises(GatewayError):
        await gw.create_place("p-house", "Bureau", ROOM_TYPE)
    with pytest.raises(GatewayError):
        await gw.rename_device(HEATER, "Salon")
    gw.refuse_relocate[HEATER] = GatewayError("refused")
    with pytest.raises(GatewayError):
        await gw.relocate_device(HEATER, "p-ch1")
    await gw.relocate_device(f"{SAMPLE_GATEWAY}/9500003#2", "p-ch1")
    assert gw.setup_writes == [("relocate_device", f"{SAMPLE_GATEWAY}/9500003#2", "p-ch1")]


def test_setup_failures_rejects_unknown_operations():
    assert setup_failures("") == {}
    with pytest.raises(ValueError):
        setup_failures("delete_device")


async def test_the_simulator_obeys_the_same_allowlist():
    gw, _ = _gw()
    with pytest.raises(SetupNotAllowed):
        await gw.rename_device(HEATER, "metadata")
    with pytest.raises(SetupNotAllowed):
        await gw.read_place("..")
    assert gw.setup_writes == []


async def test_silent_setup_applies_without_events():
    gw, clock = _gw()
    gw.silent_setup = True
    await gw.relocate_device(HEATER, "p-ch1")
    clock.advance(2.0)
    assert await gw.fetch_events() == []
    assert (await gw.read_device(HEATER)).place_oid == "p-ch1"


async def test_changes_made_in_the_cozytouch_app_arrive_as_the_listener_delivers_them():
    gw, _ = _gw()
    gw.outside_move(HEATER, "p-ch1")
    gw.outside_rename_place("p-salon", "Séjour")
    oid = gw.outside_create_place("Bureau")
    gw.outside_delete_place(oid)
    assert await gw.fetch_events() == [
        DeviceUpdate(HEATER, "p-ch1", "Radiateur"),
        PlaceEvent("updated"),
        PlaceEvent("created"),
        PlaceEvent("deleted"),
    ]
    assert gw.places["p-salon"]["label"] == "Séjour" and oid not in gw.places
    assert gw.setup_writes == []  # not Kelvin's writes


def test_make_gateway_injects_the_setup_failures(tmp_path):
    s = Settings(
        _env_file=None,
        kelvin_data=tmp_path,
        kelvin_fake=True,
        kelvin_fake_setup_fail="delete_place",
    )
    gw = make_gateway(s, "demo@kelvin.local", "kelvin")
    assert set(gw.fail_setup) == {"delete_place"}


async def test_a_device_removed_before_its_write_applies_is_skipped():
    gw, clock = _gw()
    await gw.relocate_device(HEATER, "p-ch1")
    await gw.rename_device(f"{SAMPLE_GATEWAY}/9500003#2", "Sonde")
    del gw.devices[HEATER]
    del gw.devices[f"{SAMPLE_GATEWAY}/9500003#2"]
    clock.advance(2.0)
    assert await gw.fetch_events() == []
