"""Plan 15 M1: the backend and the web build against one « Météo et coût » sample (spec §8.1)."""

from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
BACK = ROOT / "backend" / "tests" / "fixtures" / "weather_model_sample.json"
WEB = ROOT / "web" / "src" / "lib" / "fixtures" / "weatherModel.sample.json"


@pytest.mark.skipif(not WEB.exists(), reason="the web sources are not here (backend-only context)")
def test_weather_model_samples_are_identical():
    assert BACK.read_bytes() == WEB.read_bytes()
