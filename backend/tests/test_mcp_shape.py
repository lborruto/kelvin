"""The MCP result shape (spec MCP §4)."""

from types import SimpleNamespace

import pytest
from hypothesis import given
from hypothesis import strategies as st

from kelvin.mcp.shape import UNITS, Leak, combine, envelope, iso, neutral, neutral_key, redact


def test_neutral_renames_every_hc_hp_key():
    assert neutral_key("hc_kwh") == "offpeak_kwh"
    assert neutral_key("hp_eur_kwh") == "peak_eur_kwh"
    assert neutral_key("hc_lens") == "offpeak_lens"
    assert neutral_key("unknown_hp") == "unknown_peak"
    assert neutral_key("tempo_hours") == "tempo_hours"
    assert neutral_key("chpad") == "chpad"  # whole tokens only
    doc = {
        "by_rate": {"blue_hc": 1.0, "red_hp": 2.0},
        "rows": [{"key": "white_hc", "kwh": 3.0}],
        "hc_lens": {"hc_share": 0.4},
        "split_method": "curve",
    }
    assert neutral(doc) == {
        "by_rate": {"blue_offpeak": 1.0, "red_peak": 2.0},
        "rows": [{"key": "white_offpeak", "kwh": 3.0}],
        "offpeak_lens": {"offpeak_share": 0.4},
        "split_method": "curve",
    }


@given(
    st.recursive(
        st.dictionaries(st.sampled_from(["hc", "hp", "a_hc", "x"]), st.integers()),
        lambda c: st.dictionaries(st.sampled_from(["hc_x", "hp", "y"]), c),
        max_leaves=8,
    )
)
def test_no_hc_or_hp_key_survives(doc):
    def keys(v):
        if isinstance(v, dict):
            for k, x in v.items():
                yield k
                yield from keys(x)

    assert not any(t in ("hc", "hp") for k in keys(neutral(doc)) for t in k.split("_"))


def test_redact_drops_secret_keys_and_refuses_leaks():
    doc = {"linky": {"prm": "12345678901234", "token_set": True, "state": "ok"}, "email": "x"}
    assert redact(doc) == {"linky": {"state": "ok"}}
    for leak in ("io://1234-5678-9012/14172536", "demo@kelvin.local", "PDL 12345678901234"):
        with pytest.raises(Leak) as e:
            redact({"rooms": [{"name": leak}]})
        assert leak not in str(e.value) and "rooms" in str(e.value)
    assert redact({"n": 12345678901234}) == {"n": 12345678901234}  # numbers are figures


def test_combine():
    assert combine("measured") == "measured"
    assert combine("measured", "estimated") == "mixed"
    assert combine("measured", "computed") == "computed"
    assert combine("static", "unknown") == "static"
    assert combine("unknown") == combine() == "unknown"


def test_envelope():
    ctx = SimpleNamespace(
        wall=lambda: 1_763_643_600.0, settings=SimpleNamespace(tz="Europe/Paris", kelvin_fake=True)
    )
    env = envelope("get_x", {"a_kwh": 1}, ctx=ctx, sources=["linky"], basis="measured", notes=["n"])
    assert env == {
        "data": {"a_kwh": 1},
        "meta": {
            "tool": "get_x",
            "generated_at": "2025-11-20T14:00:00+01:00",
            "timezone": "Europe/Paris",
            "simulator": True,
            "sources": ["linky"],
            "basis": "measured",
            "notes": ["n"],
            "units": UNITS,
        },
    }
    assert iso(None, "Europe/Paris") is None
    assert {"_kwh", "_eur", "_c", "_share", "_at"} <= set(UNITS["suffixes"])
