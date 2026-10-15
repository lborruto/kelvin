"""The scripted Sauter run behind tests/fixtures/sauter_commands.json (Plan 12, Task 1).

Every command route of the Sauter simulator, in a fixed order, through the HTTP API: for each
request, the Overkiz action label and commands Kelvin sent, how they were grouped into actions
and the device states it waits for. The fixture was recorded from the code as it was before
Plan 12; the capability-driven command layer must reproduce it byte for byte. Never change this
script or re-record the fixture to make a test pass.

The run is deterministic: the FakeGateway and the runtime's wall clock (`create_app(wall=…)`)
are one ManualClock started at WALL_START, and the away end times come from it.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

FIXTURE = Path(__file__).parent / "fixtures" / "sauter_commands.json"
WALL_START = 1_760_000_000.0  # 2025-10-09T08:53:20Z: the pinned wall clock of the run
AWAY_S = 2 * 3600  # both aways end two hours after the run started
SALON = "p-salon"
CH1 = "p-ch1"
PROGRAM = {
    "monday": [{"start": "06:00", "end": "08:00"}, {"start": "18:00", "end": "22:00"}],
    "wednesday": [{"start": "07:30", "end": "09:00"}],
    "saturday": [{"start": "09:00", "end": "23:00"}],
}


def steps(until: str) -> list[tuple[str, str, dict[str, Any] | None]]:
    """("CANCEL", kind, None) cancels the active override of that kind through the API;
    ("EXPIRE", kind, None) moves the clock past its end and runs the override tick, as the
    runtime's loop does (the most common real restore)."""
    return [
        ("POST", f"/api/rooms/{SALON}/mode", {"mode": "manual"}),
        ("POST", f"/api/rooms/{SALON}/setpoint", {"kind": "manual", "value": 21.5}),
        ("POST", f"/api/rooms/{SALON}/setpoint", {"kind": "comfort", "value": 19.5}),
        ("POST", f"/api/rooms/{SALON}/setpoint", {"kind": "eco", "value": 2.5}),
        ("POST", f"/api/rooms/{SALON}/mode", {"mode": "program"}),
        ("PUT", f"/api/rooms/{SALON}/program", PROGRAM),
        ("POST", "/api/radiators/9312063/mode", {"mode": "off"}),
        ("POST", "/api/radiators/9312063/mode", {"mode": "manual"}),
        ("POST", "/api/radiators/9312063/setpoint", {"kind": "manual", "value": 20.0}),
        ("PUT", "/api/radiators/8370022/program", PROGRAM),
        # Left off until the aways: their restores must bring « off » back (target, then standby).
        ("POST", "/api/radiators/8370022/mode", {"mode": "off"}),
        ("PATCH", "/api/radiators/9312063/features", {"window_detection": False}),
        ("PATCH", "/api/radiators/9312063/features", {"presence_detection": True}),
        # The web renames through the same route (RadiatorPanel): setName is a command too.
        ("PATCH", "/api/radiators/9312063/features", {"name": "Salon 2"}),
        # Several fields in one request: one action, window → presence → name.
        (
            "PATCH",
            "/api/radiators/9312063/features",
            {"window_detection": True, "presence_detection": False, "name": "Radiateur"},
        ),
        ("POST", "/api/radiators/9312063/light", {"on": True}),
        ("POST", "/api/radiators/9312063/light", {"on": True, "intensity": 40}),
        ("POST", "/api/radiators/9312063/light", {"on": False}),
        ("POST", "/api/radiators/9312063/identify", None),
        ("POST", f"/api/rooms/{CH1}/boost", {"temperature": 23.0, "duration_min": 60}),
        ("CANCEL", "boost", None),
        ("POST", "/api/house/away", {"temperature": 12.0, "until": until}),
        ("CANCEL", "away", None),
        ("POST", "/api/house/away", {"temperature": 14.0, "until": until}),
        ("EXPIRE", "away", None),
        ("POST", "/api/house/off", None),
        ("POST", "/api/house/program", None),
    ]


def dump(recorded: list[dict[str, Any]]) -> str:
    """The fixture's text: the one serialisation the script writes and the test compares, so
    that `20` vs `20.0`, `true` vs `1` and a reordered key are differences."""
    return json.dumps(recorded, ensure_ascii=False, indent=2) + "\n"


def _plain(v: Any) -> Any:
    return json.loads(json.dumps(v))


def _shown(body: dict[str, Any] | None) -> dict[str, Any] | None:
    """The body as recorded: the away end time is relative, so it is written as « +2h »."""
    if body is None or "until" not in body:
        return body
    return {**body, "until": "+2h"}


def _override(rt: Any, kind: str) -> dict[str, Any]:
    return next(o for o in rt.overrides.active() if o["kind"] == kind)


async def run_script(client: Any, rt: Any, clock: Any) -> list[dict[str, Any]]:
    """`clock` is the FakeGateway's clock and the runtime's wall clock (one ManualClock)."""
    until = datetime.fromtimestamp(clock() + AWAY_S, UTC).isoformat()
    out: list[dict[str, Any]] = []
    for method, path, body in steps(until):
        shown = [method, path, _shown(body)]
        sent_before = len(rt.gateway.executed)
        if method == "EXPIRE":
            clock.advance(_override(rt, path)["ends_at"] - clock() + 1)
            sent = await rt.overrides.tick()
            status, p = None, (sent[0] if sent else None)
        else:
            if method == "CANCEL":
                method, path = "DELETE", f"/api/overrides/{_override(rt, path)['id']}"
                shown = [method, "/api/overrides/{id}", None]
            r = await client.request(method, path, json=body)
            status = r.status_code
            pending = r.json().get("pending") if status == 202 else None
            known = {p.id: p for p in [*rt.commands.active(), *rt.commands.recent()]}
            p = known.get(pending["id"]) if pending else None
        batches = rt.gateway.executed[sent_before:]
        out.append(
            {
                "request": shown,
                "status": status,
                # The action label Overkiz receives (its French text, its code and params).
                "label": None if p is None else [p.label, p.label_code, _plain(p.label_params)],
                "commands": [
                    [cmd.device_url, cmd.name, _plain(list(cmd.parameters))]
                    for batch in batches
                    for cmd in batch
                ],
                # Grouping: how many commands each Overkiz action (one execute call) carried.
                "actions": [len(batch) for batch in batches],
                "expect": []
                if p is None
                else [[e.device_url, e.name, _plain(e.value)] for e in p.planned.expectations],
            }
        )
        clock.advance(2)
        await rt.pump.run_once()
    return out
