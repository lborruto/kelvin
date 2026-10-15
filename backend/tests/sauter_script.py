"""The scripted Sauter run behind tests/fixtures/sauter_commands.json (Plan 12, Task 1).

Every command route of the Sauter simulator, in a fixed order, through the HTTP API: for each
request, the Overkiz commands Kelvin sent and the device states it waits for. The fixture was
recorded from the code as it was before Plan 12; the capability-driven command layer must
reproduce it exactly. Never change this script or re-record the fixture to make a test pass.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

FIXTURE = Path(__file__).parent / "fixtures" / "sauter_commands.json"
SALON = "p-salon"
CH1 = "p-ch1"
PROGRAM = {
    "monday": [{"start": "06:00", "end": "08:00"}, {"start": "18:00", "end": "22:00"}],
    "wednesday": [{"start": "07:30", "end": "09:00"}],
    "saturday": [{"start": "09:00", "end": "23:00"}],
}


def steps(until: str) -> list[tuple[str, str, dict[str, Any] | None]]:
    """("CANCEL", kind, None) cancels the active override of that kind."""
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
        ("PATCH", "/api/radiators/9312063/features", {"window_detection": False}),
        ("PATCH", "/api/radiators/9312063/features", {"presence_detection": True}),
        # The web renames through the same route (RadiatorPanel): setName is a command too.
        ("PATCH", "/api/radiators/9312063/features", {"name": "Salon 2"}),
        ("POST", "/api/radiators/9312063/light", {"on": True}),
        ("POST", "/api/radiators/9312063/light", {"on": True, "intensity": 40}),
        ("POST", "/api/radiators/9312063/light", {"on": False}),
        ("POST", "/api/radiators/9312063/identify", None),
        ("POST", f"/api/rooms/{CH1}/boost", {"temperature": 23.0, "duration_min": 60}),
        ("CANCEL", "boost", None),
        ("POST", "/api/house/away", {"temperature": 12.0, "until": until}),
        ("CANCEL", "away", None),
        ("POST", "/api/house/off", None),
        ("POST", "/api/house/program", None),
    ]


def _plain(v: Any) -> Any:
    return json.loads(json.dumps(v))


def _shown(body: dict[str, Any] | None) -> dict[str, Any] | None:
    """The body as recorded: the away end time is relative, so it is written as « +2h »."""
    if body is None or "until" not in body:
        return body
    return {**body, "until": "+2h"}


async def run_script(client: Any, rt: Any, clock: Any) -> list[dict[str, Any]]:
    until = (datetime.now(UTC) + timedelta(hours=2)).isoformat()
    out: list[dict[str, Any]] = []
    for method, path, body in steps(until):
        shown_path = path
        if method == "CANCEL":
            ov = next(o for o in rt.overrides.active() if o["kind"] == path)
            method, path = "DELETE", f"/api/overrides/{ov['id']}"
            shown_path = "/api/overrides/{id}"
        sent_before = len(rt.gateway.executed)
        r = await client.request(method, path, json=body)
        pending = r.json().get("pending") if r.status_code == 202 else None
        known = {p.id: p for p in [*rt.commands.active(), *rt.commands.recent()]}
        p = known.get(pending["id"]) if pending else None
        batches = rt.gateway.executed[sent_before:]
        out.append(
            {
                "request": [method, shown_path, _shown(body)],
                "status": r.status_code,
                "commands": [
                    [cmd.device_url, cmd.name, _plain(list(cmd.parameters))]
                    for batch in batches
                    for cmd in batch
                ],
                # Grouping: how many commands each Overkiz action (one execute call) carried.
                "actions": [len(batch) for batch in batches],
                "expect": [[e.device_url, e.name, _plain(e.value)] for e in p.planned.expectations]
                if p is not None
                else [],
            }
        )
        clock.advance(2)
        await rt.pump.run_once()
    return out
