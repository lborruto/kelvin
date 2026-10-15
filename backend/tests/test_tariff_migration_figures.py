"""The v1 → v2 tariff migration changes no figure (spec §2.2: « with no user action »).

The golden file holds `/api/energy` (a year by month, by week and by day) and `/api/energy/day`
(both DST days, a price change day, a day with recorded radiators) on the simulator, with the
wall clock pinned and a v1 `tariff` setting, first computed by the code before the tariff model
v2 (main 36e8e66). Here the same v1 setting is in the database before Kelvin starts, the startup
migrates it, and every figure must come out the same. Later fields are allowed (a response may
grow); a value the golden holds may not change.

Regenerate (`KELVIN_WRITE_GOLDEN=1 uv run pytest -q tests/test_tariff_migration_figures.py`)
only in the commit that changes a figure by design, on that commit's code, and review the
fixture's diff: every changed value must be one that change explains (say which in the commit).
The file is written one value per line with sorted keys, so that diff is readable.
"""

import json
import os
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from asgi_lifespan import LifespanManager
from httpx import ASGITransport, AsyncClient

from kelvin.api.app import create_app
from kelvin.config import Settings
from kelvin.overkiz.fake import FakeGateway
from kelvin.recorder.db import Database
from tests.conftest import ManualClock, login

PARIS = ZoneInfo("Europe/Paris")
GOLDEN = Path(__file__).parent / "fixtures" / "tariff_v1_figures.json"
NOW = datetime(2027, 4, 15, 14, 0, tzinfo=PARIS).timestamp()
YEAR = (date(2026, 4, 1), date(2027, 4, 1))
DAYS = [
    date(2026, 10, 25),
    date(2027, 3, 28),
    date(2026, 8, 1),
    date(2026, 10, 24),
    date(2027, 4, 14),
]
# A v1 setting as the pre-v2 Tariff.view() wrote it: two price rows (a change on 1 August) and
# an off-peak edge inside a half-hour (12:15), so prorated half-hours are covered too.
V1 = {
    "option": "hchp",
    "kva": 9,
    "hc_slots": [{"start": "22:00", "end": "06:00"}, {"start": "12:15", "end": "13:45"}],
    "prices": [
        {
            "valid_from": "2026-02-01",
            "subscription_eur_month": 15.47,
            "hc_eur_kwh": 0.2068,
            "hp_eur_kwh": 0.27,
        },
        {
            "valid_from": "2026-08-01",
            "subscription_eur_month": 15.89,
            "hc_eur_kwh": 0.1712,
            "hp_eur_kwh": 0.2268,
        },
    ],
}


async def _figures(tmp_path) -> dict:
    db = Database(tmp_path / "kelvin.db")  # the v1 setting an upgraded installation holds
    db.set_setting("tariff", V1)
    db.close()
    app = create_app(
        Settings(_env_file=None, kelvin_data=tmp_path, kelvin_fake=True),
        FakeGateway(clock=ManualClock()),
        start_tasks=False,
        wall=lambda: NOW,
    )
    async with LifespanManager(app):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://t", headers={"X-Kelvin": "1"}
        ) as c:
            await login(c)
            rt = app.state.ctx.rt
            assert "hc_schedules" in rt.db.get_setting("tariff")  # migrated at startup
            await rt.linky.sync.run_once()
            # A whole year of curve (the sync's quota would take weeks), straight from the source.
            store, source = rt.linky.sync.store, rt.linky.sync.source
            day = YEAR[0] - timedelta(days=40)  # the fallback split pools 35 days back
            while day < date(2027, 4, 15):
                end = min(day + timedelta(days=7), date(2027, 4, 15))
                store.upsert_curve(await source.fetch_curve(day, end))
                day = end
            out: dict = {}
            for group in ("month", "week", "day"):
                r = await c.get(
                    "/api/energy", params={"from": str(YEAR[0]), "to": str(YEAR[1]), "group": group}
                )
                assert r.status_code == 200, r.text
                out[f"energy_{group}"] = r.json()
            for d in DAYS:
                r = await c.get("/api/energy/day", params={"date": str(d)})
                assert r.status_code == 200, r.text
                out[f"day_{d}"] = r.json()
            out["v1_kept"] = rt.db.get_setting("tariff_v1")
            return out


def _same(golden, got, path="$") -> None:
    """Every value the golden holds is in `got`, unchanged; `got` may hold more keys."""
    if isinstance(golden, dict):
        assert isinstance(got, dict), path
        for k, v in golden.items():
            assert k in got, f"{path}.{k} missing"
            _same(v, got[k], f"{path}.{k}")
    elif isinstance(golden, list):
        assert isinstance(got, list) and len(got) == len(golden), path
        for i, (a, b) in enumerate(zip(golden, got, strict=True)):
            _same(a, b, f"{path}[{i}]")
    else:
        assert got == golden and type(got) is type(golden), f"{path}: {golden!r} → {got!r}"


async def test_the_migrated_v1_tariff_reproduces_every_figure(tmp_path):
    got = await _figures(tmp_path)
    if os.environ.get("KELVIN_WRITE_GOLDEN"):
        golden = {k: v for k, v in got.items() if k != "v1_kept"}
        text = json.dumps(golden, ensure_ascii=False, indent=1, sort_keys=True)
        GOLDEN.write_text(text + "\n")
        return
    assert got.pop("v1_kept") == V1  # migrated, the original kept
    golden = json.loads(GOLDEN.read_text())
    assert golden.keys() == got.keys()
    assert golden["energy_month"]["buckets"] and golden["day_2026-10-25"]["intervals"]
    _same(golden, got)
