"""Alerts store, engine and rules (spec §2.4)."""

from datetime import date, timedelta
from zoneinfo import ZoneInfo

import pytest

from kelvin.alerts.rules import (
    RULES,
    AlertContext,
    command_failed,
    consent_expiring,
    linky_stalled,
    price_change,
    radiator_unreachable,
)
from kelvin.alerts.service import AlertService
from kelvin.alerts.store import RETENTION_S, AlertStore, Candidate
from kelvin.billing.slots import Slot
from kelvin.billing.tariff import Prices, Tariff
from kelvin.house.model import build_house
from kelvin.overkiz.models import StateChange
from kelvin.overkiz.sample import SAMPLE_GATEWAY, sample_house
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


def test_alerts_of_a_kind_no_rule_runs_any_more_are_resolved():
    svc, store, _, _ = make({"command_failed": lambda ctx, now: [cand()]})
    svc.evaluate()
    svc.rules = {}  # the rule was removed or renamed
    svc.evaluate()
    assert store.listing("active") == []
    assert store.listing("all")[0]["resolved_at"] is not None


def test_a_failing_rule_is_not_a_removed_rule():
    state = {"fail": False}

    def flaky(ctx, now):
        if state["fail"]:
            raise RuntimeError("boom")
        return [cand()]

    svc, store, _, _ = make({"command_failed": flaky})
    svc.evaluate()
    state["fail"] = True
    svc.evaluate()
    assert len(store.listing("active")) == 1


def test_the_first_evaluation_publishes_nothing_when_nothing_changed():
    svc, _, _, published = make()
    svc.evaluate()
    assert published == []


def test_dismissing_an_unknown_id_is_false():
    svc, _, _, _ = make()
    assert svc.dismiss(12345) is False


TZ = ZoneInfo("Europe/Paris")


def tariff(*valid_from: str) -> Tariff:
    prices = tuple(Prices(date.fromisoformat(d), 15.0, 0.2, 0.3) for d in valid_from)
    return Tariff("hchp", 6, (Slot("22:00", "06:00"),), prices)


def actx(today="2026-10-14", *, t=None, linky=None, house=None, db=None):
    if house is None:
        root, devices = sample_house()
        house = build_house(root, devices)
    return AlertContext(TZ, date.fromisoformat(today), t, linky, house, db or Database(":memory:"))


@pytest.mark.parametrize(
    ("today", "keys"),
    [
        ("2026-01-16", []),
        ("2026-01-17", ["price_change:2026-02-01"]),
        ("2026-03-18", ["price_change:2026-02-01"]),
        ("2026-03-19", []),
        ("2026-07-17", ["price_change:2026-08-01"]),
        ("2026-09-15", ["price_change:2026-08-01"]),
        ("2026-09-16", []),
        ("2026-10-14", []),
    ],
)
def test_price_change_window(today, keys):
    got = price_change(actx(today, t=tariff("2025-08-01")), 0.0)
    assert [c.key for c in got] == keys
    assert all(c.severity == "info" and c.params == {"date": c.key[-10:]} for c in got)


def test_price_change_is_suppressed_by_a_row_from_d_on_and_needs_a_tariff():
    assert price_change(actx("2026-01-20", t=tariff("2025-08-01", "2026-02-01")), 0.0) == []
    assert price_change(actx("2026-01-20", t=None), 0.0) == []


@pytest.mark.parametrize(
    ("days", "severity"),
    [(31, None), (30, "warn"), (8, "warn"), (7, "bad"), (0, "bad"), (-3, "bad")],
)
def test_consent_thresholds(days, severity):
    expires = (date(2026, 10, 14) + timedelta(days=days)).isoformat() + "T12:00:00"
    got = consent_expiring(actx(linky={"configured": True, "consent_expires": expires}), 0.0)
    assert [c.severity for c in got] == ([severity] if severity else [])
    if got:
        assert got[0].params == {"date": expires[:10], "days": days}


def test_consent_severity_escalation_is_a_new_key():
    keys = {
        consent_expiring(actx(linky={"configured": True, "consent_expires": d}), 0.0)[0].key
        for d in ("2026-10-30", "2026-10-20")
    }
    assert keys == {"consent_expiring:2026-10-30:warn", "consent_expiring:2026-10-20:bad"}
    assert (
        consent_expiring(actx(linky={"configured": True, "consent_expires": "garbage"}), 0.0) == []
    )
    assert consent_expiring(actx(linky=None), 0.0) == []


def test_unreachable_needs_30_continuous_minutes():
    clock = ManualClock(1_000_000.0)
    root, devices = sample_house()
    house = build_house(root, devices, wall=clock)
    url = f"{SAMPLE_GATEWAY}/8370011#1"
    house.apply(StateChange(url, "core:StatusState", "unavailable"))
    clock.advance(29 * 60)
    assert radiator_unreachable(actx(house=house), clock()) == []
    clock.advance(60)
    [c] = radiator_unreachable(actx(house=house), clock())
    assert (c.key, c.severity) == ("radiator_unreachable:8370011:1000000", "bad")
    assert c.params == {"radiator_id": "8370011", "room_id": "p-ch1", "since": 1_000_000.0}
    house.apply(StateChange(url, "core:StatusState", "available"))
    clock.advance(60)
    house.apply(StateChange(url, "core:StatusState", "unavailable"))
    clock.advance(29 * 60)
    assert radiator_unreachable(actx(house=house), clock()) == []  # a new run starts from zero


def _log(db, pid, ts, status="failed", label_code="mode"):
    db.log_command(
        {
            "id": pid,
            "created_at": ts,
            "label": "Salon : Manuel",
            "radiator_ids": ["r1"],
            "status": status,
            "error": "Envoi impossible : x",
            "label_code": label_code,
            "label_params": {"name": "Salon", "mode": "manual"},
            "error_code": "send_failed",
            "error_params": {"reason": "x"},
            "reason_code": "network",
        },
        [],
    )


def test_command_failed_reads_the_log_for_24_hours():
    db = Database(":memory:")
    now = 2_000_000_000.0
    _log(db, "p-old", now - 86_401)
    _log(db, "p-ok", now - 60, status="confirmed")
    _log(db, "p-legacy", now - 60, label_code=None)
    _log(db, "p1", now - 60)
    [c] = command_failed(actx(db=db), now)
    assert c.key == "command_failed:p1"
    assert c.params == {
        "pending_id": "p1",
        "at": now - 60,
        "label_code": "mode",
        "label_params": {"name": "Salon", "mode": "manual"},
        "error_code": "send_failed",
        "error_params": {"reason": "x"},
        "reason_code": "network",  # ruling R10: the alert names why the send failed
    }


def test_command_failed_survives_a_restart(tmp_path):
    now = 2_000_000_000.0
    db = Database(tmp_path / "k.db")
    _log(db, "p1", now - 60)
    db.close()
    again = Database(tmp_path / "k.db")
    assert [c.key for c in command_failed(actx(db=again), now)] == ["command_failed:p1"]
    again.close()


@pytest.mark.parametrize(
    ("status", "fires"),
    [
        ({"configured": True, "state": "ok", "last_day": "2026-10-11", "last_ok_at": 0}, False),
        ({"configured": True, "state": "ok", "last_day": "2026-10-10", "last_ok_at": 0}, True),
        (
            {
                "configured": True,
                "state": "quota",
                "last_day": "2026-10-01",
                "last_ok_at": 1_999_990_000,
            },
            False,
        ),
        (
            {"configured": True, "state": "quota", "last_day": "2026-10-01", "last_ok_at": 1_000},
            True,
        ),
        ({"configured": True, "state": "never", "last_day": None, "last_ok_at": None}, False),
        (
            {"configured": False, "state": "off", "last_day": "2026-01-01", "last_ok_at": None},
            False,
        ),
    ],
)
def test_linky_stalled(status, fires):
    got = linky_stalled(actx(linky=status), 2_000_000_000.0)
    assert bool(got) is fires
    if got:
        assert got[0].key == f"linky_stalled:{status['last_day']}"
        assert got[0].params["days"] >= 4


def test_rules_table_names_the_plan_8_kinds():
    assert set(RULES) == {
        "price_change",
        "consent_expiring",
        "radiator_unreachable",
        "command_failed",
        "linky_stalled",
    }


def test_linky_stalled_ignores_a_malformed_last_day():
    st = {"configured": True, "state": "ok", "last_day": "2026-13-45", "last_ok_at": 0}
    assert linky_stalled(actx(linky=st), 2_000_000_000.0) == []
