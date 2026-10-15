"""Record tests/fixtures/sauter_commands.json from the CURRENT code (Plan 12, Task 1 only).

Simulator only: a FakeGateway and a temporary KELVIN_DATA; it never contacts Overkiz. Run it
once, before any Plan 12 change: `cd backend && uv run python scripts/sauter_golden.py`.
Re-running it later would bless whatever the code does then: don't. It refuses to overwrite an
existing fixture unless --force is given, and the test pins the fixture's SHA-256, so a
re-record always needs its own, justified commit that also updates FIXTURE_SHA256.
"""

import argparse
import asyncio
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
from tests.sauter_script import FIXTURE, WALL_START, dump, run_script  # noqa: E402


async def record() -> None:
    # A developer shell may export real Cozytouch or Linky credentials: the recording never
    # sees them (tests/conftest.py hides the same names from every test).
    for name in ("COZY_USER", "COZY_PASS", "MED_TOKEN", "MED_PRM"):
        os.environ.pop(name, None)
    with tempfile.TemporaryDirectory() as tmp:
        clock = ManualClock(WALL_START)
        settings = Settings(_env_file=None, kelvin_data=Path(tmp), kelvin_fake=True)
        app = create_app(settings, FakeGateway(clock=clock), start_tasks=False, wall=clock)
        async with LifespanManager(app):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://t", headers={"X-Kelvin": "1"}
            ) as client:
                await login(client)
                recorded = await run_script(client, app.state.ctx.rt, clock)
    FIXTURE.write_text(dump(recorded), encoding="utf-8")
    print(f"wrote {FIXTURE.name}: {len(recorded)} requests")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Record the Sauter golden fixture from the simulator (Task 1 only)."
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="overwrite an existing fixture; only for a separate, justified commit that also "
        "updates FIXTURE_SHA256 in tests/test_sauter_golden.py",
    )
    args = parser.parse_args()
    if FIXTURE.exists() and not args.force:
        sys.exit(
            f"{FIXTURE.name} exists and is recorded once: re-recording would bless the current "
            "behaviour. Pass --force only for a separate, justified commit."
        )
    asyncio.run(record())


if __name__ == "__main__":
    main()
