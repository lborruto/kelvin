"""Setup writes are done only when Cozytouch reports them (spec §2.7, §9.1 rule 9)."""

import pytest

from kelvin.errors import UserError
from kelvin.house.model import build_house
from kelvin.overkiz.errors import QuotaError
from kelvin.overkiz.fake import FakeGateway, setup_failures
from kelvin.overkiz.models import DeviceUpdate, PlaceEvent
from kelvin.overkiz.sample import ROOM_TYPE
from kelvin.setup.service import SetupService
from kelvin.setup.validate import device_label
from tests.conftest import ManualClock


@pytest.fixture
def env():
    clock = ManualClock(0.0)
    gw = FakeGateway(clock=clock)
    house = build_house(gw.root, list(gw.devices.values()), wall=clock)
    updates: list[dict] = []
    svc = SetupService(
        gw, house, clock=clock, wall=clock, on_update=lambda p: updates.append(p.view())
    )
    return clock, gw, house, svc, updates


async def pump(clock, gw, svc, seconds: int) -> None:
    """What the event pump does, second by second: deliver setup events, then tick."""
    for _ in range(seconds):
        clock.advance(1.0)
        for ev in await gw.fetch_events():
            if isinstance(ev, DeviceUpdate | PlaceEvent):
                svc.on_event(ev)
        await svc.tick()


async def test_create_is_confirmed_by_a_re_read_when_the_event_has_no_payload(env):
    clock, gw, house, svc, updates = env
    p = await svc.create_room("Bureau")
    assert p.status == "pending" and p.room_id is not None
    assert gw.setup_writes == [("create_place", "p-house", "Bureau", ROOM_TYPE)]
    assert p.room_id not in house.places  # nothing is applied before Cozytouch reports it
    await pump(clock, gw, svc, 2)  # applied at +2 s; the bare event asks for a read at once
    assert p.status == "confirmed" and gw.place_reads == 1
    assert house.places[p.room_id].label == "Bureau"
    assert [u["status"] for u in updates] == ["sending", "pending", "confirmed"]
    assert updates[-1]["kind"] == "setup" and updates[-1]["label_code"] == "setup_room_create"


async def test_create_is_confirmed_by_the_scheduled_re_read_without_events(env):
    clock, gw, house, svc, _ = env
    gw.silent_setup = True
    p = await svc.create_room("Bureau")
    await pump(clock, gw, svc, 4)
    assert p.status == "pending" and gw.place_reads == 0
    await pump(clock, gw, svc, 1)  # +5 s
    assert p.status == "confirmed" and gw.place_reads == 1


async def test_payload_events_confirm_without_any_read(env):
    clock, gw, house, svc, _ = env
    gw.place_event_payload = True
    p = await svc.create_room("Bureau")
    await pump(clock, gw, svc, 2)
    assert p.status == "confirmed" and gw.place_reads == 0
    assert house.places[p.room_id].type == ROOM_TYPE


async def test_nothing_confirms_within_60_s_and_the_write_fails(env):
    clock, gw, house, svc, updates = env
    gw.silent_setup = True
    gw.setup_delay = 10_000.0  # Cozytouch never applies it
    p = await svc.create_room("Bureau")
    await pump(clock, gw, svc, 59)
    assert p.status == "pending" and gw.place_reads == 3  # at +5, +15 and +30 s
    await pump(clock, gw, svc, 1)
    assert p.status == "failed" and p.error_code == "setup_no_confirmation"
    assert updates[-1]["error"] == "Pas de confirmation de Cozytouch."
    assert len(house.places) == 4


async def test_rename_reads_the_place_and_sends_its_type_back(env):
    clock, gw, house, svc, updates = env
    p = await svc.rename_room("p-ch1", "  Chambre d’amis ")
    assert gw.setup_writes == [("update_place", "p-ch1", "Chambre d’amis", ROOM_TYPE)]
    assert gw.place_reads == 1  # the current type and metadata, before the write
    assert updates[0]["label_params"] == {"name": "Chambre 1", "label": "Chambre d’amis"}
    assert house.rooms["p-ch1"].name == "Chambre 1"
    await pump(clock, gw, svc, 2)
    assert p.status == "confirmed" and house.rooms["p-ch1"].name == "Chambre d’amis"


async def test_delete_is_confirmed_by_a_404(env):
    clock, gw, house, svc, _ = env
    created = await svc.create_room("Bureau")
    await pump(clock, gw, svc, 2)
    p = await svc.delete_room(created.room_id)
    await pump(clock, gw, svc, 2)
    assert p.status == "confirmed" and created.room_id not in house.places


@pytest.mark.parametrize(
    ("raw", "code"),
    [
        ("", "room_label_invalid"),
        ("   ", "room_label_invalid"),
        ("x" * 33, "room_label_invalid"),
        ("Bu​reau", "room_label_invalid"),
        ("Bu\nreau", "room_label_invalid"),
        ("..", "room_label_invalid"),
        ("salon", "room_label_taken"),
        (" Salon ", "room_label_taken"),
    ],
)
async def test_room_labels_are_validated_and_unique(env, raw, code):
    _, gw, _, svc, _ = env
    with pytest.raises(UserError) as e:
        await svc.create_room(raw)
    assert e.value.code == code
    assert e.value.status == (409 if code == "room_label_taken" else 422)
    assert gw.setup_writes == []


@pytest.mark.parametrize("raw", ["Salle d’eau / bureau", "🛋 Salon", "x" * 32])
async def test_unusual_but_valid_labels_are_sent_as_typed(env, raw):
    _, gw, _, svc, _ = env
    await svc.create_room(f" {raw} ")
    assert gw.setup_writes == [("create_place", "p-house", raw, ROOM_TYPE)]


async def test_a_room_being_created_reserves_its_label(env):
    _, gw, _, svc, _ = env
    await svc.create_room("Bureau")
    with pytest.raises(UserError) as e:
        await svc.create_room("bureau")
    assert e.value.code == "room_label_taken"
    assert len(gw.setup_writes) == 1


async def test_delete_block_answers_before_anything_is_sent(env):
    _, gw, _, svc, _ = env
    for oid, code, status in [
        ("p-salon", "room_not_empty", 409),
        ("p-house", "room_protected", 409),
        ("p-nope", "room_unknown", 404),
    ]:
        with pytest.raises(UserError) as e:
            await svc.delete_room(oid)
        assert (e.value.code, e.value.status) == (code, status)
    assert gw.setup_writes == []


async def test_busy(env):
    clock, gw, _, svc, _ = env
    created = await svc.create_room("Bureau")
    await pump(clock, gw, svc, 2)
    await svc.rename_room(created.room_id, "Bureau 2")
    with pytest.raises(UserError) as e:
        await svc.delete_room(created.room_id)
    assert (e.value.code, e.value.status) == ("setup_busy", 409)


async def test_a_refused_write_fails_at_once_with_its_reason(env):
    _, gw, house, svc, updates = env
    gw.fail_setup = setup_failures("create_place")
    p = await svc.create_room("Bureau")
    assert (p.status, p.error_code, p.reason_code) == ("failed", "setup_failed", "network")
    assert not svc.has_active and len(house.places) == 4
    gw.fail_setup = {"update_place": QuotaError("QUOTA_EXCEEDED")}
    p = await svc.rename_room("p-ch1", "Bureau")
    assert (p.status, p.reason_code) == ("failed", "quota")


async def test_rename_of_a_room_deleted_meanwhile_is_setup_not_found(env):
    _, gw, _, svc, _ = env
    gw.outside_delete_place("p-ch2")  # only allowed in the app for this test's sake
    p = await svc.rename_room("p-ch2", "Chambre bleue")
    assert (p.status, p.error_code) == ("failed", "setup_not_found")


async def test_without_any_room_type_creation_is_refused(env):
    _, gw, house, svc, _ = env
    for place in house.places.values():
        place.type = None
    with pytest.raises(UserError) as e:
        await svc.create_room("Bureau")
    assert e.value.code == "room_type_unknown" and gw.setup_writes == []


async def test_an_echo_of_a_confirmed_write_is_not_an_outside_change(env):
    clock, gw, _, svc, _ = env
    outside: list[int] = []
    svc.on_outside_change = lambda: outside.append(1)
    await svc.create_room("Bureau")
    await pump(clock, gw, svc, 2)
    svc.on_event(PlaceEvent("created"))  # a second, late event for the same write
    assert outside == []
    clock.advance(91)
    svc.on_event(PlaceEvent("updated"))  # nothing of Kelvin's: a change made in the app
    assert outside == [1]


@pytest.mark.parametrize("raw", ["metadata", "UpdateFirmware", "..", "", "x" * 33])
def test_device_labels_refuse_operation_words(raw):
    with pytest.raises(UserError) as e:
        device_label(raw)
    assert e.value.code == "device_label_invalid"
    assert device_label("  Radiateur fenêtre ") == "Radiateur fenêtre"
