import ast
import json
import re
from pathlib import Path

import pytest

from kelvin.catalogue import catalogue, dump
from kelvin.errors import SAMPLES, TEMPLATES, UserError, french, gateway_error_code, safe_reason
from kelvin.labels import LABEL_SAMPLES, LABEL_TEMPLATES, Label
from kelvin.overkiz.errors import AuthError, GatewayError, QuotaError, SetupBudgetSpent


def test_every_code_has_a_french_text_for_its_sample_params():
    for code in TEMPLATES:
        text = french(code, SAMPLES.get(code, {}))
        assert text and "{" not in text and "'" not in text, code  # typographic ’ only
    assert set(SAMPLES) <= set(TEMPLATES)


def test_user_error_carries_status_code_params_and_the_french_detail():
    e = UserError("too_many_attempts", 429, minutes=15)
    assert (e.status, e.code, e.params) == (429, "too_many_attempts", {"minutes": 15})
    assert str(e) == e.detail == "Trop de tentatives. Réessayez dans 15 min."
    assert e.body() == {"detail": e.detail, "code": "too_many_attempts", "params": {"minutes": 15}}
    assert UserError("not_found", 404).status == 404
    assert UserError("period_invalid").status == 422


def test_an_unknown_code_is_a_programming_error():
    with pytest.raises(KeyError):
        UserError("no_such_code")


def test_day_and_kind_params_are_keys_shown_in_french():
    assert (
        french("program_too_many", {"day": "sunday"}) == "dimanche : 3 plages confort au maximum."
    )
    assert (
        french("temp_range", {"kind": "eco", "min": 1.0, "max": 8.0})
        == "L’abaissement éco doit être comprise entre 1 et 8 °C."
    )
    assert french("temp_step", {"kind": "manual"}) == "La consigne se règle par pas de 0,5 °C."


def test_gateway_errors_map_to_status_codes():
    errors = (
        QuotaError("q"),
        SetupBudgetSpent("b"),
        AuthError("a"),
        GatewayError("n"),
        RuntimeError("x"),
    )
    assert [gateway_error_code(e) for e in errors] == [
        "quota",
        "quota",
        "auth",
        "network",
        "unknown",
    ]


KELVIN = Path(__file__).resolve().parents[1] / "kelvin"


def test_no_route_raises_a_bare_http_exception():
    offenders = [
        f"{p.relative_to(KELVIN)}:{i}"
        for p in sorted(KELVIN.rglob("*.py"))
        for i, line in enumerate(p.read_text(encoding="utf-8").splitlines(), 1)
        if "HTTPException(" in line
    ]
    assert offenders == []


API_CODES = Path(__file__).resolve().parents[2] / "web" / "src" / "lib" / "i18n" / "api-codes.json"
FRENCH = re.compile(
    r"[àâçéèêëîïôûùüÿœ’«»]|\b(inconnue?|aucune?|introuvable|indisponible|invalide|requête|réessayez"
    r"|veilleuse|jeton|plages?)\b",
    re.IGNORECASE,
)
CATALOGUE_FILES = {"errors.py", "labels.py"}
# Files that define the codes (and the catalogue built from them): a use elsewhere is a real use.
DEFINING_FILES = {"errors.py", "labels.py", "catalogue.py"}
# Param names that would carry an identifier or a secret into an API body or a log.
FORBIDDEN_PARAMS = {"id", "email", "password", "token", "prm", "pdl", "url", "device_url"}
CODE_CALLS = {"UserError", "CommandError", "SlotError", "LoginRefused", "of", "_resolve"}


def test_labels_read_in_french_with_their_params():
    assert Label.of("mode", name="Salon", mode="manual").text == "Salon : Manuel"
    assert (
        Label.of("setpoint", name="Salon", kind="eco", value=2.5).text
        == "Salon : abaissement éco 2,5 °C"
    )
    assert Label.of("night_light", name="Salon", on=False).text == "Salon : veilleuse éteinte"
    assert Label.of("away", temperature=12.0).text == "Absence à 12 °C"
    assert Label.of("away_end").text == "Fin de l’absence"
    for code in LABEL_TEMPLATES:
        assert "{" not in Label.of(code, **LABEL_SAMPLES.get(code, {})).text
    with pytest.raises(KeyError):
        Label.of("nope")


def test_api_codes_json_is_up_to_date():
    """Run `cd backend && uv run python scripts/export_codes.py` after changing a code."""
    assert API_CODES.read_text(encoding="utf-8") == dump(catalogue())
    data = json.loads(API_CODES.read_text(encoding="utf-8"))
    assert set(data["errors"]) == set(TEMPLATES) and set(data["labels"]) == set(LABEL_TEMPLATES)
    assert len(data["errors"]) + len(data["labels"]) + len(data["status"]) == 76


def _literals(path: Path):
    tree = ast.parse(path.read_text(encoding="utf-8"))
    docs = {
        id(n.body[0].value)
        for n in ast.walk(tree)
        if isinstance(n, ast.Module | ast.ClassDef | ast.FunctionDef | ast.AsyncFunctionDef)
        and n.body
        and isinstance(n.body[0], ast.Expr)
        and isinstance(n.body[0].value, ast.Constant)
    }
    for n in ast.walk(tree):
        if isinstance(n, ast.Constant) and isinstance(n.value, str) and id(n) not in docs:
            yield n.lineno, n.value


def test_user_facing_french_lives_only_in_errors_and_labels():
    offenders = [
        f"{p.relative_to(KELVIN)}:{line}: {text[:60]}"
        for p in sorted(KELVIN.rglob("*.py"))
        if p.name not in CATALOGUE_FILES or p.parent != KELVIN
        for line, text in _literals(p)
        if FRENCH.search(text)
    ]
    assert offenders == []


def test_every_error_and_label_code_is_raised_somewhere():
    used = {
        text
        for p in sorted(KELVIN.rglob("*.py"))
        if not (p.name in DEFINING_FILES and p.parent == KELVIN)
        for _, text in _literals(p)
    }
    assert sorted(set(TEMPLATES) - used) == []
    assert sorted(set(LABEL_TEMPLATES) - used) == []


def test_no_code_takes_an_identifier_or_secret_param():
    params = {k for s in (*SAMPLES.values(), *LABEL_SAMPLES.values()) for k in s}
    for p in sorted(KELVIN.rglob("*.py")):
        for n in ast.walk(ast.parse(p.read_text(encoding="utf-8"))):
            if isinstance(n, ast.Call):
                f = n.func
                name = f.attr if isinstance(f, ast.Attribute) else getattr(f, "id", None)
                if name in CODE_CALLS:
                    params |= {k.arg for k in n.keywords if k.arg}
    assert params & FORBIDDEN_PARAMS == set()


def test_a_send_failure_reason_never_carries_an_address():
    e = RuntimeError("Device io://1234-5678-9012/5432187#1 unknown for someone@example.org")
    assert safe_reason(e) == "Device … unknown for …"
    assert safe_reason(RuntimeError("")) == "RuntimeError"
    assert safe_reason(RuntimeError("x" * 500)) == "x" * 200
