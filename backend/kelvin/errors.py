"""User-facing errors: a stable code, its parameters, and the French text (spec §4).

The web app translates by `code` (web/src/lib/i18n); `detail` stays French for curl, logs and
older clients. Every French error text of the backend lives in TEMPLATES and nowhere else
(tests/test_error_codes.py checks). After adding a code, run `uv run python scripts/export_codes.py`
and add its text to both web dictionaries.

Params are keys and figures only: never a secret, an email, a PDL, a token or a device id.
"""

from __future__ import annotations

import re
from typing import Any

from kelvin.overkiz.errors import AuthError, GatewayError, QuotaError, SetupBudgetSpent

DAY_FR = {
    "monday": "lundi",
    "tuesday": "mardi",
    "wednesday": "mercredi",
    "thursday": "jeudi",
    "friday": "vendredi",
    "saturday": "samedi",
    "sunday": "dimanche",
}
KIND_SUBJECT_FR = {
    "manual": "La consigne",
    "comfort": "La température confort",
    "eco": "L’abaissement éco",
}

TEMPLATES: dict[str, str] = {
    # Auth and platform
    "login_required": "Connexion requise.",
    "header_missing": "En-tête X-Kelvin manquant.",
    "bad_credentials": "Email ou mot de passe Cozytouch incorrect.",
    "wrong_account": "Ce compte Cozytouch n’est pas celui de cette maison.",
    "cozytouch_unreachable": "Cozytouch injoignable, réessayez dans un instant.",
    "cozytouch_unavailable": "Cozytouch injoignable, réessayez plus tard.",
    "quotas_unavailable": "Quotas indisponibles.",
    "too_many_attempts": "Trop de tentatives. Réessayez dans {minutes} min.",
    "not_found": "Introuvable.",
    "method_not_allowed": "Méthode non autorisée.",
    "invalid_request": "Requête invalide.",
    # Rooms, radiators, overrides
    "radiator_unknown": "Radiateur inconnu.",
    "room_unknown": "Pièce inconnue.",
    "too_many_radiators": "Trop de radiateurs dans la demande.",
    "nothing_to_change": "Rien à modifier.",
    "override_not_found": "Forçage ou absence introuvable.",
    "no_radiator": "Aucun radiateur.",
    # No id in params (a device id never goes into an error): the text says where instead.
    "radiator_unknown_id": "Radiateur inconnu dans la demande.",
    "end_in_past": "La fin doit être dans le futur.",
    # Command validation
    "unsupported_command": "Ce radiateur ne prend pas en charge « {command} ».",
    "temp_range": "{subject} doit être comprise entre {min_fr} et {max_fr} °C.",
    "temp_step": "{subject} se règle par pas de 0,5 °C.",
    "mode_unknown": "Mode inconnu : {mode}.",
    "setpoint_kind_unknown": "Type de consigne inconnu : {kind}.",
    "program_time_invalid": "{day_fr} : heure invalide « {value} » (format HH:MM).",
    "day_unknown": "Jour inconnu : {day}.",
    "program_too_many": "{day_fr} : 3 plages confort au maximum.",
    "program_slot_invalid": "{day_fr} : la plage {start}–{end} est invalide.",
    "program_overlap": "{day_fr} : des plages se chevauchent.",
    "program_changed_elsewhere": "Programme modifié ailleurs : rechargez-le ou remplacez-le.",
    "feature_unknown": "Fonction inconnue : {feature}.",
    "no_night_light": "Ce radiateur n’a pas de veilleuse.",
    "intensity_light_off": "L’intensité ne peut être réglée que veilleuse allumée.",
    "intensity_range": "L’intensité doit être comprise entre 1 et 100 %.",
    "name_length": "Le nom doit faire entre 1 et 32 caractères.",
    # Tariff
    "slot_time_invalid": "Heure invalide : {value} (format HH:MM).",
    "slots_none": "Indiquez au moins une plage d’heures creuses.",
    "slots_too_many": "Trois plages d’heures creuses au maximum.",
    "slot_empty": "Une plage d’heures creuses ne peut pas être vide.",
    "slots_overlap": "Les plages d’heures creuses se chevauchent.",
    "tariff_option_unsupported": "Seule l’option heures pleines / heures creuses est disponible.",
    "kva_unknown": "Puissance souscrite inconnue.",
    "price_subscription_invalid": "Prix de l’abonnement invalide.",
    "price_hc_invalid": "Prix du kWh en heures creuses invalide.",
    "price_hp_invalid": "Prix du kWh en heures pleines invalide.",
    # Énergie and Linky
    "linky_unavailable": "Linky indisponible.",
    "period_invalid": "Période invalide.",
    "pdl_invalid": "Le PDL compte 14 chiffres.",
    "token_missing": "Collez le jeton MyElectricalData.",
    "linky_quota": "Quota Linky du jour atteint : réessayez demain.",
    "linky_refused": "MyElectricalData refuse ce PDL ou ce jeton.",
    "linky_throttled": "Enedis limite les requêtes : réessayez plus tard.",
    "med_unreachable": "MyElectricalData injoignable, réessayez plus tard.",
    "linky_status_auth": "MyElectricalData refuse le jeton : renouvelez-le dans Réglages.",
    "linky_status_quota": "Quota Linky du jour atteint : reprise demain.",
    "linky_status_error": "Synchronisation Linky en échec.",
    "linky_status_throttled": "Enedis limite les requêtes : nouvel essai à {at}.",
    # Pending failures
    "send_failed": "Envoi impossible : {reason}.",
    "send_internal": "Envoi impossible : erreur interne.",
    "radiator_refused": "Le radiateur a refusé la commande.",
    "no_confirmation": "Pas de confirmation du radiateur.",
}

# Sample params, for the catalogue exported to the web and its tests.
SAMPLES: dict[str, dict[str, Any]] = {
    "too_many_attempts": {"minutes": 15},
    "unsupported_command": {"command": "setName"},
    "temp_range": {"kind": "comfort", "min": 12.0, "max": 28.0},
    "temp_step": {"kind": "eco"},
    "mode_unknown": {"mode": "turbo"},
    "setpoint_kind_unknown": {"kind": "turbo"},
    "program_time_invalid": {"day": "monday", "value": "25:00"},
    "day_unknown": {"day": "funday"},
    "program_too_many": {"day": "sunday"},
    "program_slot_invalid": {"day": "monday", "start": "10:00", "end": "09:00"},
    "program_overlap": {"day": "tuesday"},
    "program_changed_elsewhere": {"days": ["monday"]},
    "feature_unknown": {"feature": "turbo"},
    "slot_time_invalid": {"value": "24:00"},
    "linky_status_throttled": {"at": "14:30"},
}

# Status.last_error_code: why the last Cozytouch poll failed.
STATUS_CODES = ("auth", "network", "quota", "unknown")


def french_number(v: Any) -> str:
    """A figure as the French copy writes it: shortest form, decimal comma, true minus (−7,5)."""
    return f"{v:g}".replace(".", ",").replace("-", "\u2212")


def french(code: str, params: dict[str, Any]) -> str:
    """The French text of `code`. A `day` param (a key) reads as the French day name, a `kind`
    param (manual, comfort, eco) as the subject of the sentence."""
    extra: dict[str, Any] = {}
    if "day" in params:
        extra["day_fr"] = DAY_FR.get(str(params["day"]), str(params["day"]))
    if "kind" in params:
        extra["subject"] = KIND_SUBJECT_FR.get(str(params["kind"]), str(params["kind"]))
    for bound in ("min", "max"):
        if bound in params:
            extra[f"{bound}_fr"] = french_number(params[bound])
    return TEMPLATES[code].format(**params, **extra)


class UserError(ValueError):
    """An error the user sees: an HTTP status, a stable code and its params. `str(e)` is the
    French detail, so code that logs or matches the message keeps working."""

    def __init__(self, code: str, status: int | None = None, **params: Any) -> None:
        if code not in TEMPLATES:
            raise KeyError(f"unknown error code: {code}")
        self.code = code
        self.status = 422 if status is None else status
        self.params = params
        self.detail = french(code, params)
        super().__init__(self.detail)

    def body(self) -> dict[str, Any]:
        return {"detail": self.detail, "code": self.code, "params": self.params}


def invalid_request_detail(field: str, msg: str) -> str:
    """The French detail of a request pydantic refused. Its message is English and technical:
    it stays in `detail` only (the web shows the field)."""
    return f"Requête invalide\u00a0: {field} — {msg}" if field else TEMPLATES["invalid_request"]


# Third-party text (a gateway's error message) may hold addresses, ids and secrets. `scrub`
# replaces each shape below with « … » before that text reaches an API body, SSE or a log.
# Best effort: it knows the shapes Overkiz, aiohttp and HTTP produce, not every possible one.
_SCRUB = re.compile(
    "|".join(
        (
            r"[A-Za-z][\w+.-]*://\S+",  # any URL, Overkiz device URLs (io://gateway/device#n)
            r"[^\s@]+@[^\s@]+",  # an email address
            r"\bBearer\s+\S+",  # an Authorization value
            # token=…, JSESSIONID=…, api_key: …, password=… (name and value)
            r"\b\w*(?:token|key|session|secret|password|passwd|auth|cookie)\w*\s*[=:]\s*(?:Bearer\s+)?[^\s;,]+",
            r"\S*\?\S*",  # a path with a query string
            r"\[[0-9A-Fa-f:.%\w]+\](?::\d+)?",  # a bracketed IPv6 literal, with its port
            r"\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b",  # an IPv4 address, with its port
            # a bare IPv6 address: with « :: », or at least four groups (not a time like 14:30:00)
            r"(?<![\w:])(?:[0-9A-Fa-f]{0,4}:){1,7}:[0-9A-Fa-f]{0,4}(?:%\w+)?(?![\w:])",
            r"(?<![\w:])(?:[0-9A-Fa-f]{1,4}:){3,7}[0-9A-Fa-f]{1,4}(?:%\w+)?(?![\w:])",
            # digit lookarounds, not \b: an id right after a word character (an URL-encoded
            # device path, io%3A%2F%2F1234-5678-9012%2F5432187) is still an id
            r"(?<!\d)\d{4}-\d{4}-\d{4}(?:/[\w.#-]*)?",  # an Overkiz gateway id, with a device path
            r"\b[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}\b",  # a UUID
            r"\b[A-Za-z0-9_-]{32,}\b",  # a long opaque token or session id
            r"(?<!\d)\d{6,}(?!\d)",  # a device id, a serial, a PDL
        )
    ),
    re.IGNORECASE,
)
REASON_MAX = 200

# Free text a code's French detail shows but its params never carry (the web builds its own
# message from the pending's `reason_code`). Values are samples for the catalogue.
DETAIL_ONLY: dict[str, dict[str, str]] = {"send_failed": {"reason": "timeout"}}


def scrub(text: str) -> str:
    """`text` without any address, id or secret shape (see _SCRUB)."""
    return _SCRUB.sub("…", text)


def safe_reason(e: BaseException) -> str:
    """A gateway exception as text fit for an API body, SSE or a log: scrubbed, bounded, never
    empty."""
    return scrub(str(e)).strip()[:REASON_MAX].rstrip() or type(e).__name__


def gateway_error_code(e: BaseException) -> str:
    # SetupBudgetSpent (Plan 5): Kelvin's own daily budget of full setup reads, a quota too.
    if isinstance(e, QuotaError | SetupBudgetSpent):
        return "quota"
    if isinstance(e, AuthError):
        return "auth"
    if isinstance(e, GatewayError):
        return "network"
    return "unknown"
