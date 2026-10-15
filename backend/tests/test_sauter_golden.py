"""Sauter commands, byte for byte (Plan 12). The fixture was recorded before the multi-brand
command layer existed (scripts/sauter_golden.py); never regenerate it to make this test pass."""

import json

import pytest
from asgi_lifespan import LifespanManager
from httpx import ASGITransport, AsyncClient

from kelvin.api.app import create_app
from kelvin.config import Settings
from kelvin.overkiz.fake import FakeGateway
from tests.conftest import ManualClock, login
from tests.sauter_script import FIXTURE, run_script


@pytest.fixture
async def ctx(tmp_path):
    clock = ManualClock()
    app = create_app(
        Settings(_env_file=None, kelvin_data=tmp_path, kelvin_fake=True),
        FakeGateway(clock=clock),
        start_tasks=False,
    )
    async with LifespanManager(app):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://t", headers={"X-Kelvin": "1"}
        ) as c:
            await login(c)
            yield c, app.state.ctx.rt, clock


def test_the_fixture_covers_every_command_route():
    recorded = json.loads(FIXTURE.read_text(encoding="utf-8"))
    assert len(recorded) == 23
    assert all(step["status"] == 202 for step in recorded)
    assert all(step["commands"] for step in recorded)
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
    # Every request is one Overkiz action carrying all of its commands (grouping).
    assert all(step["actions"] == [len(step["commands"])] for step in recorded)
    # The verified restore order (overkiz-notes, I5): target first, then mode, in one action.
    restore = next(s for s in recorded if s["request"][:2] == ["DELETE", "/api/overrides/{id}"])
    assert [c[1] for c in restore["commands"]] == ["setTargetTemperature", "setOperatingMode"]
    assert restore["actions"] == [2]


async def test_sauter_commands_are_unchanged(ctx):
    c, rt, clock = ctx
    assert await run_script(c, rt, clock) == json.loads(FIXTURE.read_text(encoding="utf-8"))
