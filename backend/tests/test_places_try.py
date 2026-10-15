"""The real-account place check, run here on the simulator only (CLAUDE.md: scripts talk to a
real installation only when the owner asks and watches)."""

import asyncio
import copy
import importlib.util
import json
import sqlite3
import sys
import time
from pathlib import Path

import pytest

from kelvin.overkiz.budget import SetupReadGuard
from kelvin.overkiz.fake import FakeGateway
from kelvin.overkiz.models import PlaceEvent, SetupPlace
from tests.conftest import ManualClock

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "places_try.py"
spec = importlib.util.spec_from_file_location("places_try", SCRIPT)
places_try = importlib.util.module_from_spec(spec)
sys.modules["places_try"] = places_try
spec.loader.exec_module(places_try)


def _gw():
    clock = ManualClock(0.0)

    async def sleep(s: float) -> None:
        clock.advance(s)

    return FakeGateway(clock=clock), sleep


async def test_read_only_by_default_writes_nothing_and_prints_no_ids():
    gw, sleep = _gw()
    lines: list[str] = []
    report = await places_try.check(gw, write=False, sleep=sleep, out=lines.append)
    assert report["mode"] == "read-only" and report["places"] == 4
    assert gw.setup_writes == [] and gw.snapshots == 1
    text = "\n".join(lines)
    assert "p-" not in text and "io://" not in text and "Salon" not in text


async def test_write_creates_renames_and_deletes_only_the_test_place():
    gw, sleep = _gw()
    before = copy.deepcopy(gw.places)
    lines: list[str] = []
    report = await places_try.check(gw, write=True, sleep=sleep, out=lines.append)
    assert [w[0] for w in gw.setup_writes] == ["create_place", "update_place", "delete_place"]
    assert gw.setup_writes[0][2] == "Kelvin test" and gw.setup_writes[1][2] == "Kelvin test 2"
    assert report["create"]["ok"] and report["rename"]["ok"] and report["delete"]["ok"]
    assert report["events"] == ["created", "updated", "deleted"]
    assert report["unchanged"] is True and gw.places == before
    assert gw.snapshots == 1  # one bulk read; the end state is checked by targeted reads
    assert all(r["reads"] <= 3 for r in (report["create"], report["rename"], report["delete"]))
    text = "\n".join(lines)
    assert "p-" not in text and "Salon" not in text


async def test_it_stops_before_writing_when_a_test_place_already_exists():
    gw, sleep = _gw()
    gw.outside_create_place("Kelvin test")
    await gw.fetch_events()
    with pytest.raises(SystemExit):
        await places_try.check(gw, write=True, sleep=sleep, out=lambda s: None)
    assert gw.setup_writes == []


async def test_the_test_place_is_deleted_even_when_the_rename_fails():
    gw, sleep = _gw()
    gw.fail_setup = {"update_place": places_try.GatewayError("refused")}
    report = await places_try.check(gw, write=True, sleep=sleep, out=lambda s: None)
    assert [w[0] for w in gw.setup_writes] == ["create_place", "delete_place"]
    assert report["rename"]["ok"] is False and report["delete"]["ok"] and report["unchanged"]


def test_write_needs_the_watching_flag():
    with pytest.raises(SystemExit):
        places_try.parse_args(["--write"])
    assert places_try.parse_args(["--write", "--i-am-watching"]).write is True
    assert places_try.parse_args([]).write is False


async def test_it_never_renames_or_deletes_a_place_that_is_no_longer_the_test_place():
    """Someone renames the temporary place in the Cozytouch app meanwhile: hands off."""
    gw, sleep = _gw()
    created: list[str] = []
    real_create = gw.create_place

    async def create(parent: str, label: str, type_: int) -> str:
        oid = await real_create(parent, label, type_)
        created.append(oid)
        return oid

    real_fetch = gw.fetch_events

    async def fetch_and_meddle():
        events = await real_fetch()
        if created and gw.places.get(created[0], {}).get("label") == "Kelvin test":
            gw.outside_rename_place(created[0], "Bureau")
        return events

    gw.create_place = create
    gw.fetch_events = fetch_and_meddle
    report = await places_try.check(gw, write=True, sleep=sleep, out=lambda s: None)
    assert [w[0] for w in gw.setup_writes] == ["create_place"]
    assert report["rename"]["ok"] is False and report["delete"]["ok"] is False
    assert gw.places[created[0]]["label"] == "Bureau"


async def test_a_failed_delete_is_reported_not_raised():
    gw, sleep = _gw()
    gw.fail_setup = {"delete_place": places_try.GatewayError("refused")}
    report = await places_try.check(gw, write=True, sleep=sleep, out=lambda s: None)
    assert report["delete"]["ok"] is False and report["unchanged"] is False


def _leftovers(gw) -> list[str]:
    return [p["label"] for p in gw.places.values() if p["label"].startswith("Kelvin test")]


async def test_a_create_that_errors_after_reaching_cozytouch_still_reports_and_says_so():
    gw, sleep = _gw()
    real_create = gw.create_place

    async def create_then_drop(parent, label, type_):
        await real_create(parent, label, type_)  # reached Cozytouch...
        raise places_try.GatewayError("connection dropped")  # ...but the answer was lost

    gw.create_place = create_then_drop
    lines: list[str] = []
    report = await places_try.check(gw, write=True, sleep=sleep, out=lines.append)
    assert [w[0] for w in gw.setup_writes] == ["create_place"]  # never a delete of an unknown oid
    assert report["create"]["ok"] is False and report["unchanged"] is False
    assert report["ok"] is False and places_try.exit_code(report) == 1
    assert _leftovers(gw) == ["Kelvin test"]
    assert any("by hand" in line for line in lines) and '"unchanged": false' in lines[-1]


async def test_a_failing_read_during_the_create_confirm_still_cleans_up_and_reports():
    gw, sleep = _gw()
    real_fetch = gw.fetch_events
    calls = {"n": 0}

    async def fetch_failing_once():
        calls["n"] += 1
        if calls["n"] == 1:  # before the +2 s apply: the room is not there yet
            raise places_try.GatewayError("listener lost")
        return await real_fetch()

    gw.fetch_events = fetch_failing_once
    lines: list[str] = []
    report = await places_try.check(gw, write=True, sleep=sleep, out=lines.append)
    assert report["create"]["ok"] is False and report["rename"]["ok"] is False
    # The first DELETE came too early (a 404, which the simulator does not record); the room
    # appeared, so the same oid was deleted again.
    assert [w[0] for w in gw.setup_writes] == ["create_place", "delete_place"]
    assert report["delete"]["ok"] and report["delete"]["resent"] is True
    assert report["unchanged"] is True and _leftovers(gw) == []
    assert '"unchanged": true' in lines[-1]


async def test_ctrl_c_during_the_create_confirm_cleans_up_reports_and_re_raises():
    gw, sleep = _gw()
    calls = {"n": 0}

    async def sleep_interrupted(s: float) -> None:
        calls["n"] += 1
        if calls["n"] == 1:
            raise asyncio.CancelledError
        await sleep(s)

    lines: list[str] = []
    with pytest.raises(asyncio.CancelledError):
        await places_try.check(gw, write=True, sleep=sleep_interrupted, out=lines.append)
    assert [w[0] for w in gw.setup_writes] == ["create_place", "delete_place"]  # after a 404
    assert _leftovers(gw) == [] and '"unchanged": true' in lines[-1]


async def test_it_refuses_to_write_when_targeted_reads_do_not_match_the_bulk_read():
    gw, sleep = _gw()
    real_read = gw.read_place

    async def read_without_children(oid):
        p = await real_read(oid)
        return SetupPlace(p.oid, p.label, p.type, p.metadata, ()) if oid == "p-house" else p

    gw.read_place = read_without_children
    with pytest.raises(SystemExit):
        await places_try.check(gw, write=True, sleep=sleep, out=lambda s: None)
    assert gw.setup_writes == []


async def test_the_test_place_pre_check_ignores_case():
    gw, sleep = _gw()
    gw.outside_create_place("kelvin TEST")
    await gw.fetch_events()
    with pytest.raises(SystemExit):
        await places_try.check(gw, write=True, sleep=sleep, out=lambda s: None)
    assert gw.setup_writes == []


async def test_after_the_event_reads_wait_for_the_read_times():
    """The event may come before the place is readable: read once on it, then at READ_AT."""
    gw, sleep = _gw()
    gw.setup_delay = 8.0
    real_fetch = gw.fetch_events
    early = {"sent": False}

    async def fetch_with_an_early_event():
        out = await real_fetch()
        if not early["sent"] and gw.setup_writes:
            early["sent"] = True
            out.append(PlaceEvent("created"))
        return out

    gw.fetch_events = fetch_with_an_early_event
    report = await places_try.check(gw, write=True, sleep=sleep, out=lambda s: None)
    assert report["create"]["ok"] and report["create"]["reads"] <= 3
    assert report["ok"] is True and places_try.exit_code(report) == 0


async def test_the_bulk_read_is_debited_from_the_setup_read_guard():
    gw, sleep = _gw()
    guard = SetupReadGuard(wall=lambda: 1_000.0)
    await places_try.check(gw, write=False, sleep=sleep, out=lambda s: None, guard=guard)
    assert guard.used() == 1 and gw.snapshots == 1
    spent = SetupReadGuard(wall=lambda: 1_000.0, reads=[999.0, 999.0, 999.0])
    with pytest.raises(SystemExit):
        await places_try.check(gw, write=False, sleep=sleep, out=lambda s: None, guard=spent)
    assert gw.snapshots == 1


def test_the_exit_code_is_non_zero_when_any_step_failed():
    assert places_try.exit_code({"mode": "read-only"}) == 0
    assert places_try.exit_code({"mode": "write", "ok": True}) == 0
    assert places_try.exit_code({"mode": "write", "ok": False}) == 1


async def test_ctrl_c_while_the_create_is_in_flight_still_announces_a_leftover():
    gw, sleep = _gw()
    real_create = gw.create_place

    async def create_then_ctrl_c(parent, label, type_):
        await real_create(parent, label, type_)  # reached Cozytouch...
        raise asyncio.CancelledError  # ...and Ctrl-C before the answer

    gw.create_place = create_then_ctrl_c
    lines: list[str] = []
    with pytest.raises(asyncio.CancelledError):
        await places_try.check(gw, write=True, sleep=sleep, out=lines.append)
    assert [w[0] for w in gw.setup_writes] == ["create_place"]
    assert any("remove it by hand" in line for line in lines)
    assert '"unchanged": false' in lines[-1] and '"error": "cancelled"' in lines[-1]


async def test_ctrl_c_during_the_delete_confirm_keeps_delete_in_the_report_without_a_false_alarm():
    gw, sleep = _gw()

    async def sleep_cancelled_after_the_delete(s: float) -> None:
        if any(w[0] == "delete_place" for w in gw.setup_writes) and not gw.cancelled:
            gw.cancelled = True
            raise asyncio.CancelledError
        await sleep(s)

    gw.cancelled = False
    lines: list[str] = []
    with pytest.raises(asyncio.CancelledError):
        await places_try.check(
            gw, write=True, sleep=sleep_cancelled_after_the_delete, out=lines.append
        )
    report = json.loads(lines[-1])
    assert report["delete"]["error"] == "cancelled" and report["delete"]["sent"] is True
    assert not any("remove" in line for line in lines)
    assert any("delete sent, not confirmed" in line for line in lines)


async def test_a_delete_confirmed_by_a_late_read_is_no_alarm():
    gw, sleep = _gw()
    real_fetch = gw.fetch_events
    state = {"failed": False}

    async def fetch_failing_after_the_delete():
        if any(w[0] == "delete_place" for w in gw.setup_writes) and not state["failed"]:
            state["failed"] = True
            raise places_try.GatewayError("listener lost")
        return await real_fetch()

    gw.fetch_events = fetch_failing_after_the_delete
    lines: list[str] = []
    report = await places_try.check(gw, write=True, sleep=sleep, out=lines.append)
    assert report["delete"]["ok"] is True and report["unchanged"] is True
    assert not any("by hand" in line or "could not" in line for line in lines)


async def test_could_not_be_deleted_only_when_the_delete_itself_failed():
    gw, sleep = _gw()
    gw.fail_setup = {"delete_place": places_try.GatewayError("refused")}
    lines: list[str] = []
    report = await places_try.check(gw, write=True, sleep=sleep, out=lines.append)
    assert report["delete"]["ok"] is False and report["delete"]["sent"] is False
    assert any("could not be deleted" in line for line in lines)


async def test_ctrl_c_during_the_final_re_read_still_prints_the_report():
    gw, sleep = _gw()
    real_read = gw.read_place
    state = {"done": False}

    async def read_cancelled_at_the_end(oid):
        deleted = any(w[0] == "delete_place" for w in gw.setup_writes)
        if oid == "p-house" and deleted and not state["done"]:
            state["done"] = True
            raise asyncio.CancelledError
        return await real_read(oid)

    gw.read_place = read_cancelled_at_the_end
    lines: list[str] = []
    with pytest.raises(asyncio.CancelledError):
        await places_try.check(gw, write=True, sleep=sleep, out=lines.append)
    report = json.loads(lines[-1])
    assert report["unchanged"] is False and report["after_read"] == "cancelled"


async def test_a_spent_budget_stops_before_login_and_the_report_says_whether_it_was_debited():
    gw, sleep = _gw()
    spent = SetupReadGuard(wall=lambda: 1_000.0, reads=[999.0, 999.0, 999.0])
    with pytest.raises(SystemExit):
        await places_try.check(gw, write=False, sleep=sleep, out=lambda s: None, guard=spent)
    assert gw.logins == 0
    guard = SetupReadGuard(wall=lambda: 1_000.0)
    report = await places_try.check(gw, write=False, sleep=sleep, out=lambda s: None, guard=guard)
    assert report["budget"] == "debited"
    report = await places_try.check(gw, write=False, sleep=sleep, out=lambda s: None)
    assert report["budget"] == "not tracked"


def test_the_stored_budget_is_read_and_written_without_touching_the_schema(tmp_path):
    path = tmp_path / "kelvin.db"
    assert places_try.stored_guard(path) is None and not path.exists()
    with sqlite3.connect(path) as conn:
        conn.execute("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
        conn.execute(
            "INSERT INTO settings VALUES (?, ?)", ("overkiz_setup_reads", json.dumps([time.time()]))
        )
    conn.close()
    guard = places_try.stored_guard(path)
    assert guard is not None and guard.used() == 1
    guard.record()
    with sqlite3.connect(path) as conn:
        tables = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")]
        stored = json.loads(
            conn.execute("SELECT value FROM settings WHERE key='overkiz_setup_reads'").fetchone()[0]
        )
    conn.close()
    assert tables == ["settings"] and len(stored) == 2
