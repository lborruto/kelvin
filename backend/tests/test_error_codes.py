import ast
import importlib
import json
import pkgutil
import re
from pathlib import Path

import pytest

import kelvin
from kelvin.catalogue import catalogue, dump
from kelvin.errors import (
    DETAIL_ONLY,
    SAMPLES,
    TEMPLATES,
    UserError,
    french,
    gateway_error_code,
    safe_reason,
    scrub,
)
from kelvin.labels import LABEL_SAMPLES, LABEL_TEMPLATES, Label
from kelvin.overkiz.errors import AuthError, GatewayError, QuotaError, SetupBudgetSpent


def test_every_code_has_a_french_text_for_its_sample_params():
    for code in TEMPLATES:
        text = french(code, {**SAMPLES.get(code, {}), **DETAIL_ONLY.get(code, {})})
        assert text and "{" not in text and "'" not in text, code  # typographic ’ only
    assert set(SAMPLES) <= set(TEMPLATES) and set(DETAIL_ONLY) <= set(TEMPLATES)
    # Free text the French detail shows is never a param the web gets.
    assert all(not set(DETAIL_ONLY[c]) & set(SAMPLES.get(c, {})) for c in DETAIL_ONLY)


def test_user_error_carries_status_code_params_and_the_french_detail():
    e = UserError("too_many_attempts", 429, minutes=15)
    assert (e.status, e.code, e.params) == (429, "too_many_attempts", {"minutes": 15})
    assert str(e) == e.detail == "Trop de tentatives. Réessayez dans 15 min."
    assert e.body() == {"detail": e.detail, "code": "too_many_attempts", "params": {"minutes": 15}}
    assert UserError("not_found", 404).status == 404
    assert UserError("period_invalid").status == 422


def test_an_unknown_code_is_a_programming_error():
    with pytest.raises(KeyError):
        UserError("no_such_code")


def test_day_and_kind_params_are_keys_shown_in_french():
    assert (
        french("program_too_many", {"day": "sunday"}) == "dimanche : 3 plages confort au maximum."
    )
    assert (
        french("temp_range", {"kind": "eco", "min": 1.0, "max": 8.0})
        == "L’abaissement éco doit être comprise entre 1 et 8 °C."
    )
    assert french("temp_step", {"kind": "manual"}) == "La consigne se règle par pas de 0,5 °C."


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
# Simulator data (invented room and device labels, as a Cozytouch setup reports them): not copy.
SIMULATOR_DATA = {"overkiz/houses.py"}
# Files that define the codes (and the catalogue built from them): a use elsewhere is a real use.
DEFINING_FILES = {"errors.py", "labels.py", "catalogue.py"}
# Param names that would carry an identifier or a secret into an API body or a log.
FORBIDDEN_PARAMS = {
    *("id", "rid", "serial", "gateway", "email", "password", "token", "prm", "pdl"),
    *("key", "secret", "session", "auth", "url", "device_url", "ip", "host"),
}
# A param value read from a variable or attribute with one of these names is an id or a secret.
ID_LIKE = re.compile(
    r"^(id|rid|.*_id|.*_ids|serial|gateway.*|.*url|email|password|token|.*_token|prm|pdl"
    r"|secret|key|session|host|ip)$",
    re.IGNORECASE,
)
# french(code, params) is called with a non-literal dict only here: errors.py and catalogue.py
# pass through params their callers gave (checked at those calls); service.py `_resolve` passes
# its own keyword params (checked at every `_resolve` call) plus the scrubbed detail-only reason.
# setup/service.py `_resolve` passes its own keyword params (checked at every `_resolve` call).
FRENCH_PASS_THROUGH = {"errors.py", "catalogue.py", "commands/service.py", "setup/service.py"}


def _user_error_classes() -> set[str]:
    for m in pkgutil.walk_packages(kelvin.__path__, "kelvin."):
        if not m.name.endswith("__main__"):  # importing it would start the server
            importlib.import_module(m.name)
    names, todo = set(), [UserError]
    while todo:
        cls = todo.pop()
        names.add(cls.__name__)
        todo += cls.__subclasses__()
    return names


def _call_name(n: ast.Call) -> str | None:
    f = n.func
    return f.attr if isinstance(f, ast.Attribute) else getattr(f, "id", None)


def _id_like(v: ast.expr) -> str | None:
    name = v.id if isinstance(v, ast.Name) else v.attr if isinstance(v, ast.Attribute) else None
    return name if name and ID_LIKE.match(name) else None


def param_offenders(source: str, file: str, classes: set[str]) -> list[str]:
    """What a coded call would put into `params` that looks like an id or a secret.

    Best effort, and only that. It checks every call of a UserError class (found by walking
    UserError's subclasses), `Label.of`, `_resolve` and `french`: the keyword names, any `**`
    expansion (which it cannot see into, so it refuses it), the keys of a dict literal given to
    `french`, and a value that is a variable or attribute named like an id. It cannot follow a
    value through another variable, a function call, an f-string or a container, nor see a call
    made through an alias or `getattr`; a code's free-text detail-only reason is scrubbed by
    `kelvin.errors.scrub` instead.
    """
    calls = classes | {"of", "_resolve"}
    out = []
    for n in ast.walk(ast.parse(source)):
        if not isinstance(n, ast.Call):
            continue
        name = _call_name(n)
        where = f"{file}:{n.lineno}"
        if name in calls:
            for k in n.keywords:
                if k.arg is None:
                    out.append(f"{where}: ** in {name}()")
                elif k.arg.lower() in FORBIDDEN_PARAMS:
                    out.append(f"{where}: param {k.arg}")
                elif bad := _id_like(k.value):
                    out.append(f"{where}: {k.arg}={bad}")
        elif name == "french" and len(n.args) >= 2:
            arg = n.args[1]
            if isinstance(arg, ast.Dict):
                for key, value in zip(arg.keys, arg.values, strict=True):
                    if key is None:
                        out.append(f"{where}: ** in french()")
                    elif (
                        isinstance(key, ast.Constant) and str(key.value).lower() in FORBIDDEN_PARAMS
                    ):
                        out.append(f"{where}: param {key.value}")
                    elif bad := _id_like(value):
                        out.append(
                            f"{where}: {key.value if isinstance(key, ast.Constant) else '?'}={bad}"
                        )
            elif file not in FRENCH_PASS_THROUGH:
                out.append(f"{where}: french() with params it cannot see")
    return out


def test_labels_read_in_french_with_their_params():
    assert Label.of("mode", name="Salon", mode="manual").text == "Salon : Manuel"
    assert (
        Label.of("setpoint", name="Salon", kind="eco", value=2.5).text
        == "Salon : abaissement éco 2,5 °C"
    )
    assert Label.of("night_light", name="Salon", on=False).text == "Salon : veilleuse éteinte"
    assert Label.of("away", temperature=12.0).text == "Absence à 12 °C"
    assert Label.of("away_end").text == "Fin de l’absence"
    assert Label.of("level", name="Bureau", level="comfort-1").text == "Bureau : allure confort −1"
    assert (
        Label.of("dryer", name="Salle de bain", action="drying").text == "Salle de bain : séchage"
    )
    for code in LABEL_TEMPLATES:
        assert "{" not in Label.of(code, **LABEL_SAMPLES.get(code, {})).text
    with pytest.raises(KeyError):
        Label.of("nope")


def test_api_codes_json_is_up_to_date():
    """Run `cd backend && uv run python scripts/export_codes.py` after changing a code."""
    assert API_CODES.read_text(encoding="utf-8") == dump(catalogue())
    data = json.loads(API_CODES.read_text(encoding="utf-8"))
    assert set(data["errors"]) == set(TEMPLATES) and set(data["labels"]) == set(LABEL_TEMPLATES)
    assert len(data["errors"]) + len(data["labels"]) + len(data["status"]) == 129


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
        if (p.name not in CATALOGUE_FILES or p.parent != KELVIN)
        and p.relative_to(KELVIN).as_posix() not in SIMULATOR_DATA
        for line, text in _literals(p)
        if FRENCH.search(text)
    ]
    assert offenders == []


def _coded_literals(path: Path, classes: set[str]) -> set[str]:
    """String constants used as codes: inside the positional args of a UserError class,
    `Label.of`, `_resolve` or `french` call, a `code=` keyword, values of a `"code": …` dict
    entry, and values of a module-level `*_CODES` mapping."""
    tree = ast.parse(path.read_text(encoding="utf-8"))
    out: set[str] = set()

    def strings(node: ast.AST) -> None:
        out.update(
            c.value
            for c in ast.walk(node)
            if isinstance(c, ast.Constant) and isinstance(c.value, str)
        )

    for n in ast.walk(tree):
        if isinstance(n, ast.Call):
            if _call_name(n) in classes | {"of", "_resolve"}:
                for a in n.args:
                    strings(a)
            elif _call_name(n) == "french" and n.args:
                strings(n.args[0])
            for k in n.keywords:
                if k.arg == "code":
                    strings(k.value)
        elif isinstance(n, ast.Dict):
            for k, v in zip(n.keys, n.values, strict=True):
                if isinstance(k, ast.Constant) and k.value == "code":
                    strings(v)
        elif isinstance(n, ast.Assign) and any(
            isinstance(t, ast.Name) and t.id.endswith("_CODES") for t in n.targets
        ):
            if isinstance(n.value, ast.Dict):
                for v in n.value.values:
                    strings(v)
    return out


def test_every_error_and_label_code_is_raised_somewhere():
    classes = _user_error_classes()
    used = set().union(
        *(
            _coded_literals(p, classes)
            for p in sorted(KELVIN.rglob("*.py"))
            if not (p.name in DEFINING_FILES and p.parent == KELVIN)
        )
    )
    assert sorted(set(TEMPLATES) - used) == []
    assert sorted(set(LABEL_TEMPLATES) - used) == []


def test_template_texts_are_not_copied_outside_errors_and_labels():
    """Catches French without accents that FRENCH misses (« Pas de confirmation du radiateur. »)."""
    pieces = {
        piece.strip()
        for text in (*TEMPLATES.values(), *LABEL_TEMPLATES.values())
        for piece in re.split(r"\{[^}]*\}", text)
        if len(piece.strip()) >= 12
    }
    offenders = [
        f"{p.relative_to(KELVIN)}:{line}: {piece}"
        for p in sorted(KELVIN.rglob("*.py"))
        if not (p.name in CATALOGUE_FILES and p.parent == KELVIN)
        for line, text in _literals(p)
        for piece in pieces
        if piece in text
    ]
    assert offenders == []


def test_the_code_classes_come_from_user_error_subclasses():
    classes = _user_error_classes()
    assert {"UserError", "CommandError", "SlotError", "LoginRefused"} <= classes


@pytest.mark.parametrize(
    "snippet",
    [
        'UserError("x", **{"id": rid})',
        'CommandError("x", **params)',
        'CommandError("x", rid=rid)',
        'SlotError("x", serial=s)',
        'UserError("x", value=device_url)',
        'UserError("x", value=r.id)',
        'Label.of("mode", name=gateway_id)',
        'self._resolve(p, "failed", "send_failed", host=h)',
        'french("x", {"token": t})',
        'french("x", {**extra})',
        'french("x", {"value": self.device_url})',
        'french("x", params)',
    ],
)
def test_the_param_guard_flags_ids_secrets_and_what_it_cannot_see(snippet):
    assert param_offenders(snippet, "routes.py", _user_error_classes()) != []


@pytest.mark.parametrize("file", ["service.py", "auth/service.py", "linky/service.py"])
def test_only_the_command_service_may_pass_params_it_builds_to_french(file):
    snippet = 'french("x", params)'
    assert param_offenders(snippet, file, _user_error_classes()) != []
    assert param_offenders(snippet, "commands/service.py", _user_error_classes()) == []


def test_the_param_guard_lets_keys_and_figures_through():
    ok = 'CommandError("temp_range", kind=kind, min=lo, max=hi)\nfrench("x", {"day": day})'
    assert param_offenders(ok, "routes.py", _user_error_classes()) == []


def test_no_code_takes_an_identifier_or_secret_param():
    classes = _user_error_classes()
    names = {k for s in (*SAMPLES.values(), *LABEL_SAMPLES.values()) for k in s}
    assert {n.lower() for n in names} & FORBIDDEN_PARAMS == set()
    # catalogue.py expands the SAMPLES (their names are checked above); errors.py defines.
    offenders = [
        o
        for p in sorted(KELVIN.rglob("*.py"))
        if not (p.name in DEFINING_FILES and p.parent == KELVIN)
        for o in param_offenders(
            p.read_text(encoding="utf-8"), p.relative_to(KELVIN).as_posix(), classes
        )
    ]
    assert offenders == []


@pytest.mark.parametrize(
    ("raw", "kept"),
    [
        ("Device io://1234-5678-9012/5432187#1 unknown", "Device … unknown"),
        (
            "bad answer from https://ha110-1.overkiz.com/enduser-mobile-web/x?y=1",
            "bad answer from …",
        ),
        ("account someone@example.org refused", "account … refused"),
        ("connect to [2001:db8::1]:443 failed", "connect to … failed"),
        ("connect to 2001:db8::1 failed", "connect to … failed"),
        ("connect to fe80::1%eth0 failed", "connect to … failed"),
        ("connect to 192.168.1.20:8443 failed", "connect to … failed"),
        ("gateway 1234-5678-9012 offline", "gateway … offline"),
        ("device 1234-5678-9012/5432187#1 offline", "device … offline"),
        ("radiator 5432187 offline", "radiator … offline"),
        # URL-encoded device path with no scheme: ids right after a word character
        ("GET io%3A%2F%2F1234-5678-9012%2F5432187 failed", "GET io%3A%2F%2F…%2F… failed"),
        ("device a5432187 gone", "device a… gone"),
        ("PDL 12345678901234 refused", "PDL … refused"),
        ("got token=deadbeef back", "got … back"),
        ("JSESSIONID=abc123; path=/", "…; path=/"),
        ("api_key: s3cr3t rejected", "… rejected"),
        ("Authorization: Bearer abc.def.ghi", "…"),
        ("GET /enduser-mobile-web/setup?session=1 failed", "GET … failed"),
        ("exec 7f3b2a10-1c2d-4e5f-8a9b-0c1d2e3f4a5b failed", "exec … failed"),
        ("cookie a9f8e7d6c5b4a3928170fedcba9876543210abcd expired", "cookie … expired"),
        ("Too many requests at 14:30:00", "Too many requests at 14:30:00"),
        ("Server error 503", "Server error 503"),
    ],
)
def test_scrub_removes_every_address_id_and_secret_shape(raw, kept):
    assert scrub(raw) == kept


def test_a_send_failure_reason_is_scrubbed_bounded_and_never_empty():
    e = RuntimeError("Device io://1234-5678-9012/5432187#1 unknown for someone@example.org")
    assert safe_reason(e) == "Device … unknown for …"
    assert safe_reason(RuntimeError("")) == "RuntimeError"
    assert safe_reason(RuntimeError("busy " * 100)) == ("busy " * 40).strip()


def test_temp_range_bounds_read_with_a_decimal_comma_and_a_true_minus():
    assert (
        french("temp_range", {"kind": "comfort", "min": 7.5, "max": 28.0})
        == "La température confort doit être comprise entre 7,5 et 28\u00a0°C."
    )
    assert french("temp_range", {"kind": "eco", "min": -2.0, "max": 8.0}).startswith(
        "L’abaissement éco doit être comprise entre \u22122 et 8"
    )
