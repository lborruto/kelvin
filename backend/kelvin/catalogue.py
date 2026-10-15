"""The code catalogue the web app translates: web/src/lib/i18n/api-codes.json (spec §4).

Each code comes with sample params and the French text they give, so the web's tests can check
that both dictionaries cover every code and that the web's French matches the backend's."""

from __future__ import annotations

import json
from typing import Any

from kelvin.errors import DETAIL_ONLY, SAMPLES, STATUS_CODES, TEMPLATES, french
from kelvin.labels import LABEL_SAMPLES, LABEL_TEMPLATES, Label


def catalogue() -> dict[str, Any]:
    return {
        "errors": {
            c: {
                "params": SAMPLES.get(c, {}),
                "fr": french(c, {**SAMPLES.get(c, {}), **DETAIL_ONLY.get(c, {})}),
            }
            for c in sorted(TEMPLATES)
        },
        "labels": {
            c: {
                "params": LABEL_SAMPLES.get(c, {}),
                "fr": Label.of(c, **LABEL_SAMPLES.get(c, {})).text,
            }
            for c in sorted(LABEL_TEMPLATES)
        },
        "status": sorted(STATUS_CODES),
    }


def dump(data: dict[str, Any]) -> str:
    return json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
