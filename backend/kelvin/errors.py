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
    "session_is_current": "Utilisez « Se déconnecter » pour cet appareil.",
    "session_unknown": "Cet appareil n’est plus connecté.",
    "mcp_token_name_invalid": "Nom de jeton invalide (1 à {max} caractères).",
    "mcp_token_limit": "{max} jetons MCP au plus : révoquez-en un d’abord.",
    "alert_unknown": "Alerte introuvable.",
    "header_missing": "En-tête X-Kelvin manquant.",
    "bad_credentials": "Cozytouch refuse cet email ou ce mot de passe.",
    "wrong_account": "Ce compte Cozytouch n’est pas celui de cette maison.",
    "cozytouch_unreachable": "Cozytouch injoignable. Réessayez dans un instant.",
    "cozytouch_unavailable": "Cozytouch injoignable. Réessayez plus tard.",
    "quotas_unavailable": ("Limites de requêtes Cozytouch indisponibles. Réessayez plus tard."),
    "too_many_attempts": "Trop de tentatives. Réessayez dans {minutes} min.",
    "not_found": "Introuvable.",
    "method_not_allowed": "Méthode non autorisée.",
    "invalid_request": "Requête invalide.",
    # Plan 12: the Overkiz server chosen at the first login
    "server_unknown": "Serveur inconnu.",
    "server_mismatch": "Cette maison est reliée au serveur {server}. Pour changer de serveur, "
    "repartez d’une installation neuve (voir le README).",
    "data_other_server": "Ce dossier de données appartient à une maison reliée au serveur "
    "{server} : utilisez un autre dossier KELVIN_DATA.",
    "bad_credentials_server": "{server} refuse cet email ou ce mot de passe.",
    # Rooms, radiators, overrides
    "radiator_unknown": "Radiateur inconnu.",
    "room_unknown": "Pièce inconnue.",
    "too_many_radiators": "Trop de radiateurs dans la demande.",
    "nothing_to_change": "Rien à modifier.",
    "override_not_found": (
        "Chauffe temporaire ou absence introuvable : elle est peut-être déjà terminée."
    ),
    "no_radiator": "Aucun radiateur.",
    # No id in params (a device id never goes into an error): the text says where instead.
    "radiator_unknown_id": "Radiateur inconnu dans la demande.",
    "end_in_past": "Choisissez une fin dans le futur.",
    # Command validation
    "unsupported_command": "Ce radiateur ne prend pas en charge « {command} ».",
    "temp_range": "{subject} doit être comprise entre {min_fr} et {max_fr} °C.",
    "temp_step": "{subject} se règle par pas de 0,5 °C.",
    "mode_unknown": "Mode inconnu : {mode}.",
    "setpoint_kind_unknown": "Type de consigne inconnu : {kind}.",
    "program_time_invalid": "{day_fr} : heure invalide « {value} » (format HH:MM).",
    "day_unknown": "Jour inconnu : {day}.",
    "program_too_many": "{day_fr} : 3 plages confort au maximum.",
    "program_day_unknown": (
        "{day_fr} : le radiateur n’a pas rapporté ce jour ;"
        " renseignez-le pour envoyer le programme."
    ),
    "program_slot_invalid": "{day_fr} : la plage {start}–{end} est invalide.",
    "program_overlap": "{day_fr} : des plages se chevauchent.",
    "program_changed_elsewhere": "Programme modifié ailleurs : rechargez-le ou remplacez-le.",
    "feature_unknown": "Fonction inconnue : {feature}.",
    "no_night_light": "Ce radiateur n’a pas de veilleuse.",
    "intensity_light_off": "L’intensité ne peut être réglée que veilleuse allumée.",
    "intensity_range": "L’intensité doit être comprise entre 1 et 100 %.",
    # Plan 12: kinds the command layer refuses or does not know
    "read_only_device": "Kelvin ne pilote pas cet appareil : il est affiché en lecture seule.",
    "level_unknown": "Allure inconnue : {level}.",
    "unsupported_in_room": "Aucun des radiateurs concernés ne prend en charge cette commande.",
    "dryer_action_unknown": "Action inconnue : {action}.",
    # Plan 12: the setup (rooms, placement, labels) is written on the Cozytouch servers only
    "setup_experimental": (
        "Sur un serveur expérimental, Kelvin ne modifie ni les pièces ni les appareils."
    ),
    # Tariff
    "slot_time_invalid": "Heure invalide : {value} (format HH:MM).",
    "slots_none": "Indiquez au moins une plage d’heures creuses.",
    "slots_too_many": "Trois plages d’heures creuses au maximum.",
    "slot_empty": "Une plage d’heures creuses ne peut pas être vide.",
    "slots_overlap": "Les plages d’heures creuses se chevauchent.",
    "tariff_option_unsupported": "Option tarifaire inconnue.",
    "tariff_prices_missing": "Ajoutez au moins une ligne de prix.",
    "tariff_dates_duplicate": "Deux lignes ne peuvent pas commencer le même jour.",
    "tariff_rates_invalid": "Prix du kWh invalide.",
    "hc_schedules_missing": "Indiquez les heures creuses.",
    "hc_months_missing": "Chaque mois doit avoir ses heures creuses.",
    "hc_months_overlap": "Un mois ne peut appartenir qu’à une seule saison.",
    "tempo_hours_invalid": "Heures creuses Tempo invalides.",
    "tariff_form_outdated": "Votre tarif a changé d’option : rechargez la page pour le modifier.",
    "kva_unknown": "Puissance souscrite inconnue.",
    "price_subscription_invalid": "Prix de l’abonnement invalide.",
    "price_hc_invalid": "Prix du kWh en heures creuses invalide.",
    "price_hp_invalid": "Prix du kWh en heures pleines invalide.",
    # Énergie and Linky
    "linky_unavailable": "Linky indisponible.",
    "period_invalid": "Période invalide.",
    "med_quota": "Quota MyElectricalData du jour atteint : réessayez demain.",
    "tempo_prices_unavailable": "Prix Tempo indisponibles pour le moment.",
    "pdl_invalid": "Le PDL compte 14 chiffres.",
    "token_missing": "Collez le jeton MyElectricalData.",
    "linky_quota": "Quota Linky du jour atteint : réessayez demain.",
    "linky_refused": "MyElectricalData refuse ce PDL ou ce jeton.",
    "linky_throttled": "Enedis limite les requêtes : réessayez plus tard.",
    "med_unreachable": "MyElectricalData injoignable. Réessayez plus tard.",
    "linky_status_auth": ("MyElectricalData refuse le jeton : renouvelez-le dans Maison › Linky."),
    "linky_status_quota": "Quota Linky du jour atteint : reprise demain.",
    "linky_status_error": "Synchronisation Linky en échec.",
    "linky_status_throttled": "Enedis limite les requêtes : nouvel essai à {at}.",
    # Rooms and devices (Cozytouch setup, spec §2.7)
    "room_label_invalid": (
        "Le nom de la pièce doit faire de 1 à 32 caractères, sans caractère invisible."
    ),
    "room_label_taken": "Une pièce s’appelle déjà « {label} ».",
    "room_label_reserved": (
        "« {label} » attend encore la confirmation de Cozytouch : "
        "réessayez après la prochaine synchronisation."
    ),
    "room_not_empty": (
        "Videz d’abord la pièce : déplacez ses radiateurs et appareils vers une autre pièce."
    ),
    "room_protected": (
        "Cette pièce ne peut pas être supprimée : c’est la maison, ou elle contient "
        "le pont Cozytouch ou d’autres pièces."
    ),
    "room_type_unknown": (
        "Créez d’abord une pièce dans l’application Cozytouch : Kelvin reprend son type."
    ),
    "setup_busy": "Une modification est déjà en cours pour cette pièce ou ce radiateur.",
    "setup_not_found": "Cozytouch ne trouve plus cette pièce ou cet appareil.",
    "setup_failed": "Cozytouch a refusé la modification.",
    "setup_no_confirmation": (
        "Cozytouch n’a pas confirmé la modification : Kelvin vérifie au prochain relevé."
    ),
    "radiator_in_room": "Le radiateur est déjà dans cette pièce.",
    "device_in_place": "L’appareil est déjà dans la pièce de son radiateur.",
    "device_unknown": "Appareil inconnu.",
    "setup_move_partial": "Déplacement partiel ({done} sur {total}).",
    "rename_alone": "Renommez le radiateur seul, sans autre réglage dans la même demande.",
    "setup_sync_spent": (
        "Plus de synchronisation disponible sur 24 h "
        "(la dernière reste pour un redémarrage) : réessayez plus tard."
    ),
    "device_label_invalid": (
        "Le nom doit faire de 1 à 32 caractères, sans caractère invisible ni mot réservé."
    ),
    # Pending failures
    "send_failed": "Envoi impossible : {reason}.",
    "send_internal": "Envoi impossible : erreur interne.",
    "radiator_refused": "Le radiateur a refusé la commande.",
    "no_confirmation": "Le radiateur n’a pas confirmé la commande.",
}

# Sample params, for the catalogue exported to the web and its tests.
SAMPLES: dict[str, dict[str, Any]] = {
    "mcp_token_name_invalid": {"max": 40},
    "mcp_token_limit": {"max": 10},
    "too_many_attempts": {"minutes": 15},
    "unsupported_command": {"command": "setName"},
    "temp_range": {"kind": "comfort", "min": 12.0, "max": 28.0},
    "temp_step": {"kind": "eco"},
    "mode_unknown": {"mode": "turbo"},
    "setpoint_kind_unknown": {"kind": "turbo"},
    "program_time_invalid": {"day": "monday", "value": "25:00"},
    "day_unknown": {"day": "funday"},
    "program_too_many": {"day": "sunday"},
    "program_day_unknown": {"day": "sunday"},
    "program_slot_invalid": {"day": "monday", "start": "10:00", "end": "09:00"},
    "program_overlap": {"day": "tuesday"},
    "program_changed_elsewhere": {"days": ["monday"]},
    "feature_unknown": {"feature": "turbo"},
    "slot_time_invalid": {"value": "24:00"},
    "tariff_dates_duplicate": {"date": "2026-11-01"},
    "tariff_rates_invalid": {"rate": "red_hp"},
    "hc_months_missing": {"months": [4]},
    "hc_months_overlap": {"months": [1]},
    "linky_status_throttled": {"at": "14:30"},
    "room_label_taken": {"label": "Salon"},
    "room_label_reserved": {"label": "Studio", "at": None, "day": None},
    "room_not_empty": {"count": 2},
    "setup_move_partial": {"done": 5, "total": 6},
    "setup_sync_spent": {"used": 3, "limit": 3, "next_at": 1760500000.0},
    # Plan 12
    "server_mismatch": {"server": "Sauter Cozytouch"},
    "data_other_server": {"server": "Sauter Cozytouch"},
    "bad_credentials_server": {"server": "Flexom"},
    "level_unknown": {"level": "turbo"},
    "dryer_action_unknown": {"action": "spin"},
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
