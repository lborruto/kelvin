"""Record tests/fixtures/sauter_commands.json from the CURRENT code (Plan 12, Task 1 only).

Simulator only: a FakeGateway and a temporary KELVIN_DATA; it never contacts Overkiz. Run it
once, before any Plan 12 change: `cd backend && uv run python scripts/sauter_golden.py`.
Re-running it later would bless whatever the code does then: don't.
"""

import asyncio
import json
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # `tests` is not installed

from asgi_lifespan import LifespanManager  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402

from kelvin.api.app import create_app  # noqa: E402
from kelvin.config import Settings  # noqa: E402
from kelvin.overkiz.fake import FakeGateway  # noqa: E402
from tests.conftest import ManualClock, login  # noqa: E402
from tests.sauter_script import FIXTURE, run_script  # noqa: E402


async def main() -> None:
    # A developer shell may export real Cozytouch or Linky credentials: the recording never
    # sees them (tests/conftest.py hides the same names from every test).
    for name in ("COZY_USER", "COZY_PASS", "MED_TOKEN", "MED_PRM"):
        os.environ.pop(name, None)
    with tempfile.TemporaryDirectory() as tmp:
        clock = ManualClock()
        settings = Settings(_env_file=None, kelvin_data=Path(tmp), kelvin_fake=True)
        app = create_app(settings, FakeGateway(clock=clock), start_tasks=False)
        async with LifespanManager(app):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://t", headers={"X-Kelvin": "1"}
            ) as client:
                await login(client)
                recorded = await run_script(client, app.state.ctx.rt, clock)
    FIXTURE.write_text(json.dumps(recorded, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {FIXTURE.name}: {len(recorded)} requests")


if __name__ == "__main__":
    asyncio.run(main())
