"""MANUAL: show a device's states, or execute ONE command and watch events.

uv run python scripts/overkiz_try.py show  <device_url> [state_prefix]
uv run python scripts/overkiz_try.py run   <device_url> <command> '<json params list>' [watch_s]
"""

import asyncio
import json
import os
import sys
import time

from kelvin.overkiz.models import DeviceCommand
from kelvin.overkiz.real import PyOverkizGateway


async def main(argv: list[str]) -> None:
    gw = PyOverkizGateway(os.environ["COZY_USER"], os.environ["COZY_PASS"])
    await gw.login()
    try:
        if argv[0] == "show":
            _, devices = await gw.snapshot()
            dev = next(d for d in devices if d.device_url == argv[1])
            prefix = argv[2] if len(argv) > 2 else ""
            for k, v in sorted(dev.states.items()):
                if k.startswith(prefix):
                    print(f"{k} = {v!r}")
            return
        url, name, params = argv[1], argv[2], json.loads(argv[3])
        watch = float(argv[4]) if len(argv) > 4 else 60
        exec_id = await gw.execute([DeviceCommand(url, name, tuple(params))], "kelvin spike")
        print("exec_id", exec_id)
        end = time.monotonic() + watch
        while time.monotonic() < end:
            for ev in await gw.fetch_events():
                print(ev)
            await asyncio.sleep(2)
    finally:
        await gw.close()


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1:]))
