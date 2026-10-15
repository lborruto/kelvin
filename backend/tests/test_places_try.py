"""The real-account place check, run here on the simulator only (CLAUDE.md: scripts talk to a
real installation only when the owner asks and watches)."""

import importlib.util
import sys
from pathlib import Path

import pytest

from kelvin.overkiz.fake import FakeGateway
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
    before = dict(gw.places)
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
