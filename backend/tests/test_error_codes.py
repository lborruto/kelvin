import pytest

from kelvin.errors import SAMPLES, TEMPLATES, UserError, french, gateway_error_code
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
