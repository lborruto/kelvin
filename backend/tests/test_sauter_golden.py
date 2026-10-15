"""Sauter commands, byte for byte (Plan 12). The fixture was recorded before the multi-brand
command layer existed (scripts/sauter_golden.py); never regenerate it to make this test pass.
A justified re-record is its own commit and updates FIXTURE_SHA256 here."""

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

FIXTURE_SHA256 = "eff86366365f947d42ac786dec673ee2aee2cda2adfa0bdbc7ea1c231e350454"
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
        "setName",
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
        "identify",
        "boost",
        "boost_end",
        "away",
        "away_end",
        "all_off",
        "all_program",
    }
    # Several fields in one PATCH: one action, window → presence → name.
    multi = _requests(recorded, "PATCH", "/api/radiators/9312063/features")[3]
    assert [c[1] for c in multi["commands"]] == [
        "setOpenWindowDetectionActivation",
        "setOccupancyActivation",
        "setName",
    ]
    assert multi["actions"] == [3]
    # The verified restore order (overkiz-notes, I5): target first, then mode, in one action.
    boost_end, away_end = _requests(recorded, "DELETE", "/api/overrides/{id}")
    assert [c[1] for c in boost_end["commands"]] == ["setTargetTemperature", "setOperatingMode"]
    assert boost_end["actions"] == [2]
    # A restore back to « off » sets the remembered target, then standby.
    off = [c[1:] for c in away_end["commands"] if c[0].endswith("/8370022#1")]
    assert off == [["setTargetTemperature", [18.0]], ["setOperatingMode", ["standby"]]]
    assert away_end["actions"] == [8]
    # The expiry (override tick) restores the same way as a cancel, in one action.
    (expired,) = _requests(recorded, "EXPIRE", "away")
    assert expired["label"][1] == "away_end"
    assert expired["commands"] == away_end["commands"]
    assert expired["actions"] == [8]


async def test_sauter_commands_are_unchanged(ctx):
    c, rt, clock = ctx
    text = FIXTURE.read_text(encoding="utf-8")
    got = await run_script(c, rt, clock)
    # Serialised per request first, so a failure names the request; then the whole text.
    want = json.loads(text)
    for i, (g, w) in enumerate(zip(got, want, strict=False), 1):
        assert dump([g]) == dump([w]), f"request {i}: {w['request'][:2]}"
    assert dump(got) == text
