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
    "night_light_intensity": "{name} : veilleuse à {intensity} %",
    "identify": "{name} : identification",
    "boost": "{name} : forcé à {temperature_fr} °C",
    "away": "Absence à {temperature_fr} °C",
    "all_off": "Tout éteindre",
    "all_program": "Tout en programme",
    "boost_end": "Fin du forçage",
    "away_end": "Fin de l’absence",
    "setup_room_create": "Nouvelle pièce « {label} »",
    "setup_room_rename": "{name} : renommée « {label} »",
    "setup_room_delete": "Suppression de la pièce {name}",
    "setup_move": "{name} : vers {room}",
    "setup_rename_device": "{name} : renommé « {label} »",
    "setup_tidy": "{name} : appareil rangé avec le radiateur",
}
LABEL_SAMPLES: dict[str, dict[str, Any]] = {
    "mode": {"name": "Salon", "mode": "manual"},
    "setpoint": {"name": "Salon", "kind": "comfort", "value": 19.5},
    "program": {"name": "Salon"},
    "settings": {"name": "Salon"},
    "night_light": {"name": "Salon", "on": True},
    "night_light_intensity": {"name": "Salon", "intensity": 40},
    "identify": {"name": "Salon"},
    "boost": {"name": "Salon", "temperature": 21.5},
    "away": {"temperature": 12.0},
    "setup_room_create": {"label": "Bureau"},
    # Language-neutral: the web's strict scanner reads the English rendering too.
    "setup_room_rename": {"name": "Salon", "label": "Studio"},
    "setup_room_delete": {"name": "Bureau"},
    "setup_move": {"name": "Hekla", "room": "Salon"},
    "setup_rename_device": {"name": "Hekla", "label": "Studio"},
    "setup_tidy": {"name": "Hekla"},
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
