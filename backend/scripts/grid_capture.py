"""MANUAL: capture MyElectricalData's public Tempo, EcoWatt and Tempo-price answers.

No token, no PDL: these endpoints are public and take dates only. Three calls. Writes
backend/captures/grid/*.json (gitignored). The answers are public grid data (no household data),
but fixtures are still written by hand with synthetic values in the captured shapes.

    cd backend && uv run python scripts/grid_capture.py
"""

from __future__ import annotations

import asyncio
import json
from datetime import date, timedelta
from pathlib import Path

import httpx

BASE = "https://www.myelectricaldata.fr"
OUT = Path(__file__).resolve().parents[1] / "captures" / "grid"


async def main() -> None:
    today = date.today()
    paths = {
        "tempo": f"/rte/tempo/{today - timedelta(days=7)}/{today + timedelta(days=2)}",
        "ecowatt": f"/rte/ecowatt/{today - timedelta(days=1)}/{today + timedelta(days=4)}",
        "tempo_price": "/edf/tempo/price",
    }
    OUT.mkdir(parents=True, exist_ok=True)
    async with httpx.AsyncClient(
        base_url=BASE, timeout=10.0, headers={"User-Agent": "Kelvin-capture"}
    ) as c:
        for name, path in paths.items():
            r = await c.get(path)
            print(f"{name}: HTTP {r.status_code}, {len(r.content)} bytes, {path}")
            body = {
                "status": r.status_code,
                "path": path,
                "fetched": str(today),
                "body": r.json() if r.content else None,
            }
            (OUT / f"{name}-{today}.json").write_text(
                json.dumps(body, indent=2, ensure_ascii=False)
            )


if __name__ == "__main__":
    asyncio.run(main())
