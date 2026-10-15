"""Setup writes are done only when Cozytouch reports them (spec §2.7, §9.1 rule 9)."""

import pytest

from kelvin.errors import UserError
from kelvin.house.model import build_house
from kelvin.overkiz.errors import GatewayError, QuotaError
from kelvin.overkiz.fake import FakeGateway, setup_failures
from kelvin.overkiz.models import DeviceUpdate, PlaceEvent
from kelvin.overkiz.sample import ROOM_TYPE, SAMPLE_GATEWAY
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


async def test_nothing_confirms_within_60_s_and_the_write_ends_unconfirmed(env):
    """Sent but not confirmed is not a refusal: Cozytouch may still apply it."""
    clock, gw, house, svc, updates = env
    written: list[int] = []
    svc.on_written = lambda: written.append(1)
    gw.silent_setup = True
    gw.setup_delay = 10_000.0  # Cozytouch never applies it
    p = await svc.create_room("Bureau")
    await pump(clock, gw, svc, 59)
    assert p.status == "pending" and gw.place_reads == 3  # at +5, +15 and +30 s
    await pump(clock, gw, svc, 1)
    assert p.status == "unconfirmed" and p.error_code == "setup_no_confirmation"
    assert not p.active and not svc.has_active
    assert updates[-1]["error"] == (
        "Cozytouch n’a pas confirmé la modification : Kelvin vérifie au prochain relevé."
    )
    assert written == [1]  # the refresher reconciles it
    assert len(house.places) == 4
    assert gw.place_reads == 4  # one settle read at the timeout: still 404, so kept
    with pytest.raises(UserError) as e:  # its label stays reserved until that refresh
        await svc.create_room("bureau")
    assert (e.value.code, e.value.status) == ("room_label_reserved", 409)
    assert e.value.params["label"] == "bureau" and len(gw.setup_writes) == 1
    svc.reconciled()  # the full read showed it did not apply
    await svc.create_room("Bureau")
    assert len(gw.setup_writes) == 2


async def test_a_write_applied_after_the_timeout_is_not_lost(env):
    """Reviewer probe E: Cozytouch applies the create at +70 s."""
    clock, gw, house, svc, _ = env
    outside: list[int] = []
    written: list[int] = []
    svc.on_outside_change = lambda: outside.append(1)
    svc.on_written = lambda: written.append(1)
    gw.setup_delay = 70.0
    p = await svc.create_room("Bureau")
    await pump(clock, gw, svc, 60)
    assert p.status == "unconfirmed" and written == [1]
    with pytest.raises(UserError) as e:
        await svc.create_room("Bureau")  # no duplicate room while it may exist
    assert e.value.code == "room_label_reserved"
    await pump(clock, gw, svc, 10)  # the bare PlaceCreatedEvent at +70 s
    assert outside == [1]  # not swallowed as an echo: the refresher reads the tree
    root, devices = await gw.snapshot()
    house.sync_setup(root, devices)
    svc.reconciled()
    assert any(pl.label == "Bureau" for pl in house.places.values())
    with pytest.raises(UserError) as e:
        await svc.create_room("Bureau")  # it exists now: taken for real
    assert e.value.code == "room_label_taken" and len(gw.setup_writes) == 1


async def test_a_create_that_errored_keeps_its_label_until_the_refresh(env):
    """A dropped connection may hide a create that reached Cozytouch."""
    _, gw, _, svc, _ = env
    written: list[int] = []
    svc.on_written = lambda: written.append(1)
    gw.fail_setup = setup_failures("create_place")
    p = await svc.create_room("Bureau")
    assert (p.status, p.error_code) == ("failed", "setup_failed")
    assert written == [1]
    gw.fail_setup = {}
    with pytest.raises(UserError) as e:
        await svc.create_room("bureau")
    assert e.value.code == "room_label_reserved"
    svc.reconciled()
    await svc.create_room("Bureau")
    assert len(gw.setup_writes) == 1


async def test_a_create_refused_for_quota_releases_its_label_at_once(env):
    _, gw, _, svc, _ = env
    gw.fail_setup = {"create_place": QuotaError("QUOTA_EXCEEDED")}
    await svc.create_room("Bureau")
    gw.fail_setup = {}
    await svc.create_room("Bureau")
    assert len(gw.setup_writes) == 1


async def test_a_place_that_answers_404_is_not_looked_up_again_and_again(env):
    clock, gw, _, svc, _ = env
    for n in (2, 3, 4, 5, 6):
        gw.outside_move(f"{SAMPLE_GATEWAY}/8370011#{n}", "p-ghost")
        await pump(clock, gw, svc, 1)
    assert gw.place_reads == 1
    svc.reconciled()  # a full read: the next unknown-place event may look again
    gw.outside_move(f"{SAMPLE_GATEWAY}/8370011#2", "p-ghost")
    await pump(clock, gw, svc, 1)
    assert gw.place_reads == 2


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
    # « Bureau » stays reserved: that create may have reached Cozytouch (review T4-2).
    p = await svc.rename_room("p-ch1", "Studio")
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


S = SAMPLE_GATEWAY
RAD = "8370011"  # alone in « Chambre 1 »
HEATER = f"{S}/{RAD}#1"


def _order(rid: str) -> list[str]:
    return [f"{S}/{rid}#{n}" for n in (2, 3, 4, 5, 6, 1)]


async def test_a_move_relocates_the_sub_devices_then_the_heater(env):
    clock, gw, house, svc, updates = env
    p = await svc.move_radiator(RAD, "p-salon")
    assert [w[1] for w in gw.setup_writes] == _order(RAD)
    assert house.radiators[RAD].room_id == "p-ch1"  # nothing applied before Cozytouch says so
    await pump(clock, gw, svc, 2)
    assert p.status == "confirmed" and house.radiators[RAD].room_id == "p-salon"
    assert "p-ch1" not in house.rooms and "p-ch1" in house.places
    assert updates[-1]["progress"] == {"done": 6, "total": 6}
    assert updates[-1]["label_params"] == {"name": "Radiateur", "room": "Salon"}
    assert gw.device_reads == 0  # the events confirmed every step


async def test_a_move_is_confirmed_by_re_reads_when_events_are_lost(env):
    clock, gw, house, svc, _ = env
    gw.silent_setup = True
    p = await svc.move_radiator(RAD, "p-salon")
    await pump(clock, gw, svc, 5)
    assert p.status == "confirmed" and gw.device_reads == 6
    assert house.radiators[RAD].room_id == "p-salon"


async def test_a_heater_that_refuses_leaves_a_partial_move_and_the_radiator_where_it_was(env):
    clock, gw, house, svc, updates = env
    gw.refuse_relocate[HEATER] = GatewayError("refused")
    p = await svc.move_radiator(RAD, "p-salon")
    assert len(gw.setup_writes) == 5
    await pump(clock, gw, svc, 2)
    assert (p.status, p.error_code, p.error_params) == (
        "failed",
        "setup_move_partial",
        {"done": 5, "total": 6},
    )
    assert updates[-1]["error"] == "Déplacement partiel (5 sur 6)."
    assert house.radiators[RAD].room_id == "p-ch1"
    rad = next(r for r in house.setup_view()["radiators"] if r["id"] == RAD)
    assert sum(d["misplaced"] for d in rad["devices"]) == 5


async def test_retry_moves_only_what_is_still_elsewhere(env):
    clock, gw, house, svc, updates = env
    gw.refuse_relocate[HEATER] = GatewayError("refused")
    await svc.move_radiator(RAD, "p-salon")
    await pump(clock, gw, svc, 2)
    del gw.refuse_relocate[HEATER]
    gw.setup_writes.clear()
    p = await svc.move_radiator(RAD, "p-salon")
    assert gw.setup_writes == [("relocate_device", HEATER, "p-salon")]
    await pump(clock, gw, svc, 2)
    assert p.status == "confirmed" and updates[-1]["progress"] == {"done": 6, "total": 6}
    assert house.radiators[RAD].room_id == "p-salon"


async def test_nothing_accepted_fails_at_once(env):
    _, gw, house, svc, _ = env
    gw.fail_setup = setup_failures("relocate_device")
    p = await svc.move_radiator(RAD, "p-salon")
    assert (p.status, p.error_code, p.reason_code) == ("failed", "setup_failed", "network")
    assert house.radiators[RAD].room_id == "p-ch1"


@pytest.mark.parametrize(
    ("rid", "room", "code", "status"),
    [
        (RAD, "p-ch1", "radiator_in_room", 409),
        (RAD, "p-house", "room_protected", 409),
        (RAD, "p-nope", "room_unknown", 404),
        ("nope", "p-salon", "radiator_unknown", 404),
    ],
)
async def test_impossible_moves_are_refused_before_anything_is_sent(env, rid, room, code, status):
    _, gw, _, svc, _ = env
    with pytest.raises(UserError) as e:
        await svc.move_radiator(rid, room)
    assert (e.value.code, e.value.status) == (code, status)
    assert gw.setup_writes == []


async def test_a_room_being_moved_into_cannot_be_deleted(env):
    clock, gw, _, svc, _ = env
    created = await svc.create_room("Bureau")
    await pump(clock, gw, svc, 2)
    await svc.move_radiator(RAD, created.room_id)
    with pytest.raises(UserError) as e:
        await svc.delete_room(created.room_id)
    assert e.value.code in ("setup_busy", "room_not_empty")


async def test_rename_radiator_sets_the_cozytouch_label_only(env):
    clock, gw, house, svc, _ = env
    heater = f"{S}/9312063#1"
    p = await svc.rename_radiator("9312063", " Radiateur fenêtre ")
    assert gw.setup_writes == [("rename_device", heater, "Radiateur fenêtre")]
    await pump(clock, gw, svc, 2)
    assert p.status == "confirmed" and house.radiators["9312063"].name == "Radiateur fenêtre"
    assert gw.devices[heater].states["core:NameState"] == "Radiateur"
    assert gw.executed == []  # no device command (setName is no longer used)
    for raw in ("metadata", "..", ""):
        with pytest.raises(UserError) as e:
            await svc.rename_radiator("9312063", raw)
        assert e.value.code == "device_label_invalid"


async def test_tidy_relocates_a_stray_to_its_heater_s_room(env):
    clock, gw, house, svc, _ = env
    stray = f"{S}/{RAD}#3"
    gw.outside_move(stray, "p-salon")
    await pump(clock, gw, svc, 1)
    with pytest.raises(UserError) as e:
        await svc.tidy(f"{RAD}#2")
    assert (e.value.code, e.value.status) == ("device_in_place", 409)
    for unknown in ("nope#9", "bridge-1"):
        with pytest.raises(UserError) as e:
            await svc.tidy(unknown)
        assert (e.value.code, e.value.status) == ("device_unknown", 404)
    p = await svc.tidy(f"{RAD}#3")
    assert gw.setup_writes == [("relocate_device", stray, "p-ch1")]
    await pump(clock, gw, svc, 2)
    assert p.status == "confirmed" and p.label.code == "setup_tidy"
    rad = next(r for r in house.setup_view()["radiators"] if r["id"] == RAD)
    assert not any(d["misplaced"] for d in rad["devices"])


async def test_a_device_moved_in_the_cozytouch_app_updates_the_rooms(env):
    clock, gw, house, svc, _ = env
    for url in _order(RAD):
        gw.outside_move(url, "p-salon")
    await pump(clock, gw, svc, 1)
    assert house.radiators[RAD].room_id == "p-salon" and "p-ch1" not in house.rooms
    assert gw.place_reads == gw.device_reads == gw.snapshots == 0


async def test_a_device_moved_to_an_unknown_place_reads_that_place_only(env):
    clock, gw, house, svc, _ = env
    outside: list[int] = []
    svc.on_outside_change = lambda: outside.append(1)
    oid = gw.outside_create_place("Bureau")
    for url in _order(RAD):
        gw.outside_move(url, oid)
    await pump(clock, gw, svc, 1)
    assert house.radiators[RAD].room_id == oid and house.rooms[oid].name == "Bureau"
    assert gw.place_reads == 1 and gw.snapshots == 0
    assert outside == [1]  # the bare PlaceCreatedEvent: the refresher decides (Task 6)


async def test_rename_radiator_compares_with_the_cozytouch_label(env):
    _, gw, house, svc, _ = env
    heater = f"{S}/9312063#1"
    house.apply_device_update(DeviceUpdate(heater, None, "IO (9312063#1)"))
    assert house.radiators["9312063"].name == "Radiateur"  # the generic label falls back
    await svc.rename_radiator("9312063", "Radiateur")  # the Cozytouch label does change
    assert gw.setup_writes == [("rename_device", heater, "Radiateur")]


async def test_rename_radiator_to_its_current_label_changes_nothing(env):
    _, gw, _, svc, _ = env
    with pytest.raises(UserError) as e:
        await svc.rename_radiator("9312063", "Radiateur")
    assert e.value.code == "nothing_to_change" and gw.setup_writes == []


async def test_tidy_when_the_heater_s_place_is_unknown_is_room_unknown(env):
    _, gw, house, svc, _ = env
    house.apply_device_update(DeviceUpdate(HEATER, "p-ghost", None))
    with pytest.raises(UserError) as e:
        await svc.tidy(f"{RAD}#3")
    assert (e.value.code, e.value.status) == ("room_unknown", 404)
    assert gw.setup_writes == []


async def test_the_settle_read_at_the_timeout_applies_a_write_that_landed_silently(env):
    clock, gw, house, svc, _ = env
    gw.silent_setup = True
    gw.setup_delay = 40.0  # after the +30 s read, before the timeout
    p = await svc.create_room("Bureau")
    await pump(clock, gw, svc, 60)
    assert p.status == "unconfirmed"
    assert house.places[p.room_id].label == "Bureau"  # the one settle read found it
    with pytest.raises(UserError) as e:
        await svc.create_room("Bureau")
    assert e.value.code == "room_label_taken"  # it exists: taken for real, not « reserved »


async def test_a_withheld_refresh_settles_the_reservation_with_one_targeted_read(env):
    """Review R1: never reserved for a day because no full read is free."""
    clock, gw, _, svc, _ = env
    gw.silent_setup = True
    gw.setup_delay = 10_000.0  # never applied
    await svc.create_room("Bureau")
    await pump(clock, gw, svc, 60)
    reads = gw.place_reads
    svc.settle_soon()  # the refresher withheld or failed its after-write read
    await pump(clock, gw, svc, 1)
    assert gw.place_reads == reads + 1 and gw.snapshots == 0
    await svc.create_room("Bureau")  # released: the targeted read says it is not there
    assert len(gw.setup_writes) == 2


async def test_an_unconfirmed_rename_is_settled_by_its_read(env):
    clock, gw, house, svc, _ = env
    gw.silent_setup = True
    gw.setup_delay = 10_000.0
    await svc.rename_room("p-ch1", "Studio")
    await pump(clock, gw, svc, 60)
    with pytest.raises(UserError) as e:
        await svc.create_room("studio")
    assert e.value.code == "room_label_reserved"
    svc.settle_soon()
    await pump(clock, gw, svc, 1)
    assert house.places["p-ch1"].label == "Chambre 1 "
    await svc.create_room("Studio")
    assert [w[0] for w in gw.setup_writes] == ["update_place", "create_place"]


async def test_the_reserved_answer_carries_the_next_sync_time(env):
    _, gw, _, svc, _ = env
    svc.next_sync_text = lambda: "14:30"
    gw.fail_setup = setup_failures("create_place")
    await svc.create_room("Bureau")
    with pytest.raises(UserError) as e:
        await svc.create_room("Bureau")
    assert e.value.params == {"label": "Bureau", "at": "14:30"}
