"""Spec MCP §7: nothing reachable from MCP writes; the surface says so; every result has units
and a basis; nothing secret leaves."""

import ast
import json
from pathlib import Path

import pytest
from mcp import Client

from kelvin.alerts.service import AlertService
from kelvin.billing.tariff import TariffStore
from kelvin.commands.overrides import OverrideManager
from kelvin.commands.service import CommandService
from kelvin.grid.service import GridService
from kelvin.linky.service import LinkyService
from kelvin.linky.sync import LinkySync
from kelvin.mcp.shape import UNITS
from kelvin.overkiz.budget import QuotaReadout
from kelvin.setup.refresh import SetupRefresher
from kelvin.setup.service import SetupService
from tests.mcp_helpers import kelvin_app

MCP_DIR = Path(__file__).parents[1] / "kelvin" / "mcp"
TOOLS = {
    "get_overview",
    "get_room",
    "get_programmes",
    "get_temperature_history",
    "get_alerts",
    "get_grid_signals",
    "get_tariff",
    "get_energy",
    "get_room_energy",
    "get_day_detail",
    "get_data_status",
    "propose_savings",
    "evaluate_programme",
}
FORBIDDEN_MODULES = (
    "kelvin.setup",
    "kelvin.overkiz",
    "kelvin.linky.sync",
    "kelvin.linky.med",
    "kelvin.grid.client",
    "kelvin.commands.service",
    "kelvin.commands.overrides",
    "kelvin.alerts.service",
    "kelvin.api.routes",
    "pyoverkiz",
    "httpx",
    "aiohttp",
)
ALLOWED_FROM = {("kelvin.commands.translate", "normalize_program")}
# `replace` and `update` are left to the dynamic spies (TariffStore.replace/update): datetime
# .replace and dict.update are ordinary reads here.
FORBIDDEN_CALLS = {
    "submit",
    "start",
    "cancel",
    "save",
    "configure",
    "dismiss",
    "tempo_prices",
    "set_setting",
    "spend",
    "request_manual",
    "request",
    "wake",
    "evaluate",
    "revoke_others",
    "upsert_tempo",
    "upsert_ecowatt",
    "upsert_curve",
    "active",
    "execute",
    "executemany",
}
DB_WRITERS = {"tokens.py", "audit.py"}  # their own tables only
PRM, MED_TOKEN, EMAIL = "12345678901234", "demo-token-0123456789", "demo@kelvin.local"


def test_mcp_code_imports_no_writer():
    for path in sorted(MCP_DIR.glob("*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for a in node.names:
                    assert not a.name.startswith(FORBIDDEN_MODULES), (path.name, a.name)
            if isinstance(node, ast.ImportFrom) and node.module:
                if node.module.startswith("kelvin.commands"):
                    for a in node.names:
                        assert (node.module, a.name) in ALLOWED_FROM, (path.name, a.name)
                    continue
                assert not node.module.startswith(FORBIDDEN_MODULES), (path.name, node.module)
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
                name = node.func.attr
                if name in ("execute", "executemany") and path.name in DB_WRITERS:
                    continue
                assert name not in FORBIDDEN_CALLS, (path.name, node.lineno, name)


def _spy_writers(monkeypatch, gw) -> list[str]:
    calls: list[str] = []

    def spy(label):
        def f(*a, **k):
            calls.append(label)
            raise AssertionError(f"MCP reached a writer: {label}")

        return f

    for cls, names in (
        (CommandService, ("submit",)),
        (OverrideManager, ("start", "cancel", "_reap")),
        (
            SetupService,
            (
                "create_room",
                "rename_room",
                "delete_room",
                "move_radiator",
                "rename_radiator",
                "tidy",
            ),
        ),
        (TariffStore, ("replace", "update", "save")),
        (LinkyService, ("configure",)),
        (LinkySync, ("spend",)),
        (AlertService, ("dismiss", "evaluate")),
        (GridService, ("tempo_prices",)),
        (QuotaReadout, ("get",)),
        (SetupRefresher, ("request_manual",)),
    ):
        for n in names:
            monkeypatch.setattr(cls, n, spy(f"{cls.__name__}.{n}"))
    for n in (
        "execute",
        "create_place",
        "update_place",
        "delete_place",
        "relocate_device",
        "rename_device",
        "snapshot",
        "device_states",
        "quotas",
        "read_place",
        "read_device",
        "login",
        "set_credentials",
        "check_credentials",
        "fetch_events",
    ):
        monkeypatch.setattr(gw, n, spy(f"gateway.{n}"))
    return calls


def _tables(db) -> dict[str, list]:
    names = [
        r["name"]
        for r in db.query(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT IN"
            " ('mcp_audit', 'mcp_tokens', 'sqlite_sequence')"
        )
    ]
    return {n: db.rows(f"SELECT * FROM {n} ORDER BY rowid") for n in names}


def calls_for(rt) -> list[tuple[str, dict]]:
    room = next(r for r in rt.house.rooms if rt.house.room_radiators(r))
    rid = rt.house.room_radiators(room)[0].id
    day = {"start": "2026-11-19T00:00:00", "end": "2026-11-20T00:00:00"}
    return [
        ("get_overview", {}),
        ("get_room", {"room_id": room}),
        ("get_programmes", {}),
        ("get_programmes", {"room_id": room}),
        ("get_temperature_history", {**day, "room_id": room, "step_minutes": 60}),
        ("get_temperature_history", {**day, "radiator_ids": [rid], "step_minutes": 30}),
        ("get_alerts", {"state": "all"}),
        ("get_grid_signals", {}),
        ("get_tariff", {}),
        ("get_energy", {"start": "2026-10-01", "end": "2026-11-01", "group": "day"}),
        ("get_energy", {"start": "2025-11-01", "end": "2026-11-01", "group": "month"}),
        ("get_room_energy", {"room_id": room, "days": 7}),
        ("get_day_detail", {"date": "2026-11-19"}),
        ("get_data_status", {}),
        ("propose_savings", {"days": 30}),
        (
            "evaluate_programme",
            {"room_id": room, "week": {"monday": [{"start": "06:00", "end": "08:00"}]}},
        ),
    ]


async def _everything(client, rt) -> list[tuple[str, object]]:
    out = []
    for name, args in calls_for(rt):
        out.append((name, await client.call_tool(name, args)))
    for r in (await client.list_resources()).resources:
        out.append((str(r.uri), await client.read_resource(str(r.uri))))
    room = next(iter(rt.house.rooms))
    out.append(("room resource", await client.read_resource(f"kelvin://rooms/{room}")))
    for p, args in (
        ("analyse_last_month", {}),
        ("explain_bill", {"month": "2026-10"}),
        ("plan_tempo_red_day", {}),
        ("review_programme", {"room_id": room}),
    ):
        out.append((p, await client.get_prompt(p, args)))
    return out


@pytest.mark.parametrize("house", ["sauter", "atlantic", "thermor", "experimental"])
async def test_no_tool_resource_or_prompt_writes(tmp_path, monkeypatch, house):
    async with kelvin_app(tmp_path, house=house) as (c, app):
        rt = app.state.ctx.rt
        assert {n for n, _ in calls_for(rt)} == TOOLS
        before = _tables(app.state.ctx.db)
        calls = _spy_writers(monkeypatch, rt.gateway)
        async with Client(app.state.mcp) as client:
            await _everything(client, rt)
        assert calls == []
        assert _tables(app.state.ctx.db) == before


async def test_every_tool_is_read_only(tmp_path):
    async with kelvin_app(tmp_path, sync=False) as (c, app):
        async with Client(app.state.mcp) as client:
            tools = (await client.list_tools()).tools
        assert {t.name for t in tools} == TOOLS
        for t in tools:
            a = t.annotations
            assert (a.read_only_hint, a.destructive_hint, a.open_world_hint) == (True, False, False)
            assert not t.name.startswith(
                (
                    "set_",
                    "apply_",
                    "send_",
                    "update_",
                    "delete_",
                    "create_",
                    "start_",
                    "stop_",
                    "dismiss_",
                )
            )


async def test_every_result_has_units_and_a_basis(tmp_path):
    async with kelvin_app(tmp_path) as (c, app):
        rt = app.state.ctx.rt
        async with Client(app.state.mcp) as client:
            for name, args in calls_for(rt):
                r = await client.call_tool(name, args)
                if r.is_error:
                    continue
                meta = r.structured_content["meta"]
                assert meta["units"] == UNITS, name
                assert meta["basis"] in (
                    "measured",
                    "computed",
                    "estimated",
                    "mixed",
                    "unknown",
                    "static",
                ), name


async def test_no_secret_in_any_output(tmp_path):
    async with kelvin_app(tmp_path) as (c, app):
        r = await c.put("/api/settings/linky", json={"prm": PRM, "token": MED_TOKEN})
        assert r.status_code == 200, r.text  # test setup: a configured Linky
        mcp_secret = (await c.post("/api/mcp/tokens", json={"name": "t"})).json()["secret"]
        rt = app.state.ctx.rt
        async with Client(app.state.mcp) as client:
            results = await _everything(client, rt)
        for name, res in results:
            text = res.model_dump_json()
            for secret in (PRM, MED_TOKEN, EMAIL, "io://", mcp_secret, "kmcp_"):
                assert secret not in text, (name, secret)
        audit = json.dumps(app.state.ctx.db.query("SELECT * FROM mcp_audit"))
        for secret in (PRM, MED_TOKEN, EMAIL, mcp_secret):
            assert secret not in audit
