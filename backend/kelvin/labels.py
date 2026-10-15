"""Pending-action labels: a stable code, its params and the French text (spec §4).

The French text is also the Overkiz execution label (`gateway.execute`), so it stays French; the
web shows its own text from `label_code` and `label_params`.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

MODE_FR = {"off": "Arrêt", "manual": "Manuel", "program": "Programme"}
KIND_FR = {"manual": "consigne", "comfort": "confort", "eco": "abaissement éco"}

LABEL_TEMPLATES: dict[str, str] = {
    "mode": "{name} : {mode_fr}",
    "setpoint": "{name} : {kind_fr} {value_fr} °C",
    "program": "{name} : programme",
    "settings": "{name} : réglages",
    "night_light": "{name} : veilleuse {on_fr}",
    "identify": "{name} : identification",
    "boost": "{name} : forcé à {temperature_fr} °C",
    "away": "Absence à {temperature_fr} °C",
    "all_off": "Tout éteindre",
    "all_program": "Tout en programme",
    "boost_end": "Fin du forçage",
    "away_end": "Fin de l’absence",
}
LABEL_SAMPLES: dict[str, dict[str, Any]] = {
    "mode": {"name": "Salon", "mode": "manual"},
    "setpoint": {"name": "Salon", "kind": "comfort", "value": 19.5},
    "program": {"name": "Salon"},
    "settings": {"name": "Salon"},
    "night_light": {"name": "Salon", "on": True},
    "identify": {"name": "Salon"},
    "boost": {"name": "Salon", "temperature": 21.5},
    "away": {"temperature": 12.0},
}


def _num(v: float) -> str:
    return f"{v:g}".replace(".", ",")


@dataclass(frozen=True)
class Label:
    code: str
    params: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def of(cls, code: str, **params: Any) -> Label:
        if code not in LABEL_TEMPLATES:
            raise KeyError(f"unknown label code: {code}")
        return cls(code, params)

    @property
    def text(self) -> str:
        p = self.params
        extra: dict[str, Any] = {}
        if "mode" in p:
            extra["mode_fr"] = MODE_FR.get(p["mode"], p["mode"])
        if "kind" in p:
            extra["kind_fr"] = KIND_FR.get(p["kind"], p["kind"])
        if "value" in p:
            extra["value_fr"] = _num(p["value"])
        if "temperature" in p:
            extra["temperature_fr"] = _num(p["temperature"])
        if "on" in p:
            extra["on_fr"] = "allumée" if p["on"] else "éteinte"
        return LABEL_TEMPLATES[self.code].format(**p, **extra)
