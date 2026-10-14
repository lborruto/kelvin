"""MANUAL, against your own Linky: capture MyElectricalData response shapes.

Reads MED_TOKEN and MED_PRM from the environment (a repo-root .env, never committed). Makes at
most 5 calls of the 50/day quota. Writes backend/captures/med/*.json (gitignored) with the PDL
and the customer id replaced, and refuses to write a file that still contains the PDL, the
customer id or the token. The values are still your household's consumption: copy shapes into
tests/fixtures/med by hand with synthetic values, never these files.

    cd backend && set -a && . ../.env && set +a && uv run python scripts/med_capture.py
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import httpx

BASE = "https://www.myelectricaldata.fr"
OUT = Path(__file__).resolve().parents[1] / "captures" / "med"
FAKE_PRM = "12345678901234"
FAKE_CUSTOMER = "0000000000"


def scrub(value: Any, replace: dict[str, str]) -> Any:
    if isinstance(value, dict):
        return {
            k: (FAKE_CUSTOMER if k == "customer_id" else scrub(v, replace))
            for k, v in value.items()
        }
    if isinstance(value, list):
        return [scrub(v, replace) for v in value]
    if isinstance(value, str):
        for real, fake in replace.items():
            value = value.replace(real, fake)
    return value


def summary(body: Any) -> str:
    reading = body.get("meter_reading") if isinstance(body, dict) else None
    if isinstance(reading, dict) and isinstance(reading.get("interval_reading"), list):
        items = reading["interval_reading"]
        if not items:
            return "0 readings"
        return (
            f"{len(items)} readings, {items[0].get('date')} … {items[-1].get('date')}, "
            f"unit={reading.get('reading_type', {}).get('unit')}, "
            f"interval={items[0].get('interval_length')}, quality={reading.get('quality')}"
        )
    return json.dumps(body, ensure_ascii=False)[:300]


async def main() -> int:
    token = os.environ.get("MED_TOKEN", "")
    prm = os.environ.get("MED_PRM", "")
    if not token or not prm:
        print("MED_TOKEN and MED_PRM must be set (repo-root .env)")
        return 2
    today = date.today()
    calls = [
        ("valid_access", f"valid_access/{prm}"),
        ("contracts", f"contracts/{prm}"),
        ("daily", f"daily_consumption/{prm}/start/{today - timedelta(days=8)}/end/{today}"),
        ("daily_today", f"daily_consumption/{prm}/start/{today}/end/{today + timedelta(days=1)}"),
        (
            "curve",
            f"consumption_load_curve/{prm}/start/{today - timedelta(days=2)}/end/{today}",
        ),
    ]
    OUT.mkdir(parents=True, exist_ok=True)
    replace = {prm: FAKE_PRM}
    secrets = {token, prm}
    async with httpx.AsyncClient(
        base_url=BASE,
        timeout=60,
        headers={"Authorization": token, "Accept": "application/json"},
    ) as client:
        for name, path in calls:
            r = await client.get(f"/{path}")
            try:
                body = r.json()
            except ValueError:
                body = {"_text": r.text[:2000]}
            if name == "contracts" and isinstance(body, dict):
                cid = (body.get("customer") or {}).get("customer_id")
                if cid:
                    replace[str(cid)] = FAKE_CUSTOMER
                    secrets.add(str(cid))
            record = {
                "status": r.status_code,
                "request": path.replace(prm, FAKE_PRM),
                "body": scrub(body, replace),
            }
            text = json.dumps(record, ensure_ascii=False, indent=2)
            if any(s and s in text for s in secrets):
                print(f"{name}: a secret survived scrubbing; NOT written")
                return 1
            target = "med_429" if r.status_code == 429 else name
            (OUT / f"{target}.json").write_text(text + "\n")
            print(f"{name}: HTTP {r.status_code} · {summary(record['body'])}")
            if r.status_code == 429:
                print("throttled by Enedis: re-run the remaining calls after nextAccessTime")
                return 3
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
