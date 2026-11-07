"""Sauter commands, byte for byte. The fixture was recorded before the multi-brand command layer
existed (scripts/sauter_golden.py); never regenerate it to make this test pass. A justified
re-record is its own commit and updates FIXTURE_SHA256 here. Re-recorded after the programme
`keep` semantics and night-light intensity label change, then after radiator names became
their Cozytouch labels (a setup write, no device command; a name never travels with other
fields): each time identical to main + this harness alone. Re-recorded once more when the
simulator's device serials were replaced by clearly invented ones: the new fixture equals the
old one with that substitution applied, byte for byte. Re-recorded when an away stopped
including a radiator in « Arrêt » (owner, 2026-11-07): the new fixture equals the old one minus
that radiator's commands in the two aways and their ends (8 commands per action → 6)."""

import hashlib
import json

import pytest
from asgi_lifespan import LifespanManager
from httpx import ASGITransport, AsyncClient

from kelvin.api.app import create_app
from kelvin.config import Settings
from kelvin.overkiz.fake import FakeGateway
from tests.conftest import ManualClock, login
from tests.sauter_script import FIXTURE, WALL_START, dump, run_script

FIXTURE_SHA256 = "e1cc4608dc0ca3f430d44123958148feebe185bebe4891a026d64d1e63f2b0e8"
REQUESTS = 27


@pytest.fixture
async def ctx(tmp_path):
    clock = ManualClock(WALL_START)
    app = create_app(
        Settings(_env_file=None, kelvin_data=tmp_path, kelvin_fake=True),
        FakeGateway(clock=clock),
        start_tasks=False,
        wall=clock,
    )
    async with LifespanManager(app):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://t", headers={"X-Kelvin": "1"}
        ) as c:
            await login(c)
            yield c, app.state.ctx.rt, clock


def _requests(recorded: list[dict], method: str, path: str) -> list[dict]:
    return [s for s in recorded if s["request"][:2] == [method, path]]


def test_the_fixture_is_the_one_recorded_in_task_1():
    assert hashlib.sha256(FIXTURE.read_bytes()).hexdigest() == FIXTURE_SHA256


def test_the_fixture_covers_every_command_route():
    recorded = json.loads(FIXTURE.read_text(encoding="utf-8"))
    assert len(recorded) == REQUESTS
    # A rename is a Cozytouch setup write (the label), not a device command, and a
    # name sent with other fields is refused (`rename_alone`): neither sends a command.
    rename, rename_mixed = _requests(recorded, "PATCH", "/api/radiators/9500003/features")[2:]
    assert (rename["status"], rename["commands"], rename["label"]) == (202, [], None)
    assert (rename_mixed["status"], rename_mixed["commands"]) == (422, [])
    recorded = [s for s in recorded if s not in (rename, rename_mixed)]
    for step in recorded:  # the expiry is the override loop's tick, not an HTTP request
        assert step["status"] == (None if step["request"][0] == "EXPIRE" else 202), step
        assert step["commands"] and step["label"] and step["label"][1], step["request"]
        # Every request is one Overkiz action carrying all of its commands (grouping).
        assert step["actions"] == [len(step["commands"])], step["request"]
    names = {cmd[1] for step in recorded for cmd in step["commands"]}
    assert {
        "setOperatingMode",
        "setTargetTemperature",
        "setComfortTemperature",
        "setEcoTemperature",
        "setTimeProgram",
        "setOpenWindowDetectionActivation",
        "setOccupancyActivation",
        "on",
        "off",
        "setIntensity",
        "identify",
    } <= names
    assert {step["label"][1] for step in recorded} == {
        "mode",
        "setpoint",
        "program",
        "settings",
        "night_light",
        "night_light_intensity",  # Plan 8: a light command with an intensity
        "identify",
        "boost",
        "boost_end",
        "away",
        "away_end",
        "all_off",
        "all_program",
    }
    # The verified restore order (overkiz-notes, I5): target first, then mode, in one action.
    boost_end, away_end = _requests(recorded, "DELETE", "/api/overrides/{id}")
    assert [c[1] for c in boost_end["commands"]] == ["setTargetTemperature", "setOperatingMode"]
    assert boost_end["actions"] == [2]
    # A radiator in « Arrêt » is left alone by an away (owner, 2026-11-07): neither the away nor
    # its end sends it anything.
    (away, _) = _requests(recorded, "POST", "/api/house/away")
    for step in (away, away_end):
        assert not [c for c in step["commands"] if c[0].endswith("/9000022#1")]
    assert away_end["actions"] == [6]
    # The expiry (override tick) restores the same way as a cancel, in one action.
    (expired,) = _requests(recorded, "EXPIRE", "away")
    assert expired["label"][1] == "away_end"
    assert expired["commands"] == away_end["commands"]
    assert expired["actions"] == [6]


async def test_sauter_commands_are_unchanged(ctx):
    c, rt, clock = ctx
    text = FIXTURE.read_text(encoding="utf-8")
    got = await run_script(c, rt, clock)
    # Serialised per request first, so a failure names the request; then the whole text.
    want = json.loads(text)
    for i, (g, w) in enumerate(zip(got, want, strict=False), 1):
        assert dump([g]) == dump([w]), f"request {i}: {w['request'][:2]}"
    assert dump(got) == text
