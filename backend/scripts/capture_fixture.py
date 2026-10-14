"""MANUAL, read-only: dump your home (places + devices) to backend/captures/home_dump.json.

The dump holds your gateway id, device addresses and place ids, so it is gitignored. To run the
simulator on your own layout, copy it to $KELVIN_DATA/fake_home.json. Never commit it: the
test fixture tests/fixtures/home_dump.json is synthetic.

Usage: cd backend && set -a && . ../.env && set +a && uv run python scripts/capture_fixture.py
"""

import asyncio
import json
import os
from pathlib import Path

from kelvin.overkiz.models import device_to_dict, place_to_dict
from kelvin.overkiz.real import PyOverkizGateway

OUT = Path(__file__).resolve().parents[1] / "captures" / "home_dump.json"


async def main() -> None:
    gw = PyOverkizGateway(os.environ["COZY_USER"], os.environ["COZY_PASS"])
    try:
        await gw.login()
        root, devices = await gw.snapshot()
    finally:
        await gw.close()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(
            {"places": place_to_dict(root), "devices": [device_to_dict(d) for d in devices]},
            ensure_ascii=False,
            indent=2,
            default=str,
        )
    )
    print(f"wrote {OUT} ({len(devices)} devices)")


if __name__ == "__main__":
    asyncio.run(main())
