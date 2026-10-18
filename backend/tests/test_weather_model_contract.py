"""The live answers have exactly the key tree of spec §8 (the sample both tracks build against)."""

import json
from pathlib import Path

from tests.test_weather_model_api import a_room, demo

SAMPLE = json.loads((Path(__file__).parent / "fixtures" / "weather_model_sample.json").read_text())


def same_keys(live, sample, path="$"):
    if isinstance(sample, dict):
        assert isinstance(live, dict), path
        assert set(live) == set(sample), (path, set(live) ^ set(sample))
        for k in sample:
            if live[k] is not None:
                same_keys(live[k], sample[k], f"{path}.{k}")
    elif isinstance(sample, list) and sample and isinstance(sample[0], dict) and live:
        same_keys(live[0], sample[0], f"{path}[0]")


async def test_live_answer_matches_the_contract(tmp_path):
    async with demo(tmp_path) as (client, rt):
        same_keys((await client.get("/api/energy/weather")).json(), SAMPLE)
        light = (await client.get("/api/energy/weather/forecast")).json()
        assert set(light) == {"computed_at", "level", "price", "house", "forecast"}
        assert set(light["house"]) == set(SAMPLE["house"]) - {"line", "points", "period_share"}
        w = (await client.get(f"/api/rooms/{a_room(rt)}/energy?days=1")).json()["weather"]
        assert set(w) == set(SAMPLE["rooms"]["items"][0]) | {
            "balance_point_c",
            "balance_point_source",
        }
        rep = (await client.get("/api/energy?from=2026-11-01&to=2026-12-01&group=day")).json()
        assert set(rep["projection"]["month"]["weather"]) == {
            "why",
            "observed_days",
            "today",
            "forecast_days",
            "normal_days",
            "kwh_lo",
            "kwh_hi",
            "eur_lo",
            "eur_hi",
            "spread",
        }
