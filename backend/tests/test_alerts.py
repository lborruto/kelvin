"""Alerts store and engine (spec §2.4)."""

import pytest

from kelvin.alerts.service import AlertService
from kelvin.alerts.store import RETENTION_S, AlertStore, Candidate
from kelvin.recorder.db import Database
from tests.conftest import ManualClock


def make(rules=None):
    clock = ManualClock(1_800_000_000.0)
    store = AlertStore(Database(":memory:"), wall=clock)
    published: list[dict] = []
    svc = AlertService(store, rules or {}, lambda: None, publish=published.append, wall=clock)
    return svc, store, clock, published


def cand(key="k1", kind="command_failed", severity="bad", **params):
    return Candidate(kind, key, severity, params)


def test_upsert_updates_last_seen_and_a_vanished_key_is_resolved():
    svc, store, clock, _ = make()
    emitted = [cand(n=1)]
    svc.rules = {"command_failed": lambda ctx, now: emitted}
    svc.evaluate()
    first = store.listing("active")[0]
    assert (first["kind"], first["severity"], first["params"]) == (
        "command_failed",
        "bad",
        {"n": 1},
    )
    clock.advance(300)
    emitted[:] = [cand(n=2)]
    svc.evaluate()
    again = store.listing("active")[0]
    assert (again["id"], again["first_seen"], again["last_seen"], again["params"]) == (
        first["id"],
        first["first_seen"],
        first["first_seen"] + 300,
        {"n": 2},
    )
    emitted[:] = []
    clock.advance(300)
    svc.evaluate()
    assert store.listing("active") == []
    assert store.listing("all")[0]["resolved_at"] == first["first_seen"] + 600


def test_a_resolved_key_that_comes_back_is_reopened():
    svc, store, _, _ = make()
    emitted = [cand()]
    svc.rules = {"command_failed": lambda ctx, now: emitted}
    svc.evaluate()
    emitted[:] = []
    svc.evaluate()
    emitted[:] = [cand()]
    svc.evaluate()
    assert [a["resolved_at"] for a in store.listing("active")] == [None]


def test_a_dismissed_key_stays_hidden_until_the_key_changes():
    svc, store, _, _ = make()
    emitted = [cand("radiator_unreachable:r1:100", "radiator_unreachable")]
    svc.rules = {"radiator_unreachable": lambda ctx, now: emitted}
    svc.evaluate()
    aid = store.listing("active")[0]["id"]
    assert svc.dismiss(aid) is True
    svc.evaluate()
    assert store.listing("active") == []
    assert store.listing("all")[0]["dismissed"] is True
    emitted[:] = [cand("radiator_unreachable:r1:900", "radiator_unreachable")]  # a new occurrence
    svc.evaluate()
    assert [a["id"] != aid for a in store.listing("active")] == [True]


def test_a_rule_that_fails_keeps_its_alerts_and_the_others_run():
    svc, store, _, _ = make()
    state = {"fail": False}

    def flaky(ctx, now):
        if state["fail"]:
            raise RuntimeError("boom")
        return [cand("a", "linky_stalled", "warn")]

    svc.rules = {"linky_stalled": flaky, "command_failed": lambda ctx, now: [cand("b")]}
    svc.evaluate()
    state["fail"] = True
    svc.evaluate()
    assert sorted(a["kind"] for a in store.listing("active")) == ["command_failed", "linky_stalled"]


def test_resolved_alerts_are_pruned_after_90_days():
    svc, store, clock, _ = make()
    emitted = [cand()]
    svc.rules = {"command_failed": lambda ctx, now: emitted}
    svc.evaluate()
    emitted[:] = []
    svc.evaluate()
    clock.advance(RETENTION_S - 1)
    svc.evaluate()
    assert len(store.listing("all")) == 1
    clock.advance(2)
    svc.evaluate()
    assert store.listing("all") == []


def test_summary_counts_active_and_names_the_highest_and_publishes_on_change():
    svc, store, _, published = make()
    svc.rules = {
        "price_change": lambda ctx, now: [cand("p", "price_change", "info")],
        "linky_stalled": lambda ctx, now: [cand("l", "linky_stalled", "warn")],
    }
    assert svc.evaluate() == {"active": 2, "highest": "warn"}
    svc.evaluate()
    assert published == [{"active": 2, "highest": "warn"}]  # unchanged: published once
    svc.dismiss(next(a["id"] for a in store.listing("active") if a["kind"] == "linky_stalled"))
    assert published[-1] == {"active": 1, "highest": "info"}
    assert store.listing("active")[0]["severity"] == "info"


def test_an_unknown_severity_is_a_programming_error():
    svc, _, _, _ = make({"command_failed": lambda ctx, now: [cand(severity="loud")]})
    with pytest.raises(ValueError):
        svc.store.sync([cand(severity="loud")], {"command_failed"})


def test_dismissing_an_unknown_id_is_false():
    svc, _, _, _ = make()
    assert svc.dismiss(12345) is False
