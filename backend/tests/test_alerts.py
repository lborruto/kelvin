"""Alerts store, engine and rules (spec §2.4)."""

from datetime import date, timedelta
from zoneinfo import ZoneInfo

import pytest

from kelvin.alerts.rules import (
    RULES,
    AlertContext,
    away_open_long,
    command_failed,
    consent_expiring,
    ecowatt,
    hc_changed,
    linky_stalled,
    price_change,
    radiator_unreachable,
    tempo_red_tomorrow,
)
from kelvin.alerts.service import AlertService
from kelvin.alerts.store import RETENTION_S, AlertStore, Candidate
from kelvin.billing.slots import Slot
from kelvin.billing.tariff import ALL_MONTHS, HcSchedule, HcVariant, PriceRow, Prices, Tariff
from kelvin.grid.models import EcowattDay
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
    url = f"{SAMPLE_GATEWAY}/9000011#1"
    house.apply(StateChange(url, "core:StatusState", "unavailable"))
    clock.advance(29 * 60)
    assert radiator_unreachable(actx(house=house), clock()) == []
    clock.advance(60)
    [c] = radiator_unreachable(actx(house=house), clock())
    assert (c.key, c.severity) == ("radiator_unreachable:9000011:1000000", "bad")
    assert c.params == {"radiator_id": "9000011", "room_id": "p-ch1", "since": 1_000_000.0}
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


def test_rules_table_names_the_plan_8_and_9_kinds():
    assert set(RULES) == {
        "price_change",
        "consent_expiring",
        "radiator_unreachable",
        "command_failed",
        "linky_stalled",
        "tempo_red_tomorrow",
        "ecowatt",
        "hc_changed",
        "away_open_long",
    }


def _away(created_at, *, open_ended=True, restoring=False, oid="a1", kind="away"):
    return {
        "id": oid,
        "kind": kind,
        "room_id": None,
        "radiator_ids": ["9500003"],
        "temperature": 12.0,
        "ends_at": None if open_ended else created_at + 30 * 86400,
        "open_ended": open_ended,
        "restoring": restoring,
        "created_at": created_at,
    }


def test_away_open_long_reminds_after_seven_days_of_an_open_ended_away():
    start = 1_800_000_000.0
    c = actx()
    c.overrides = [_away(start)]
    assert away_open_long(c, start + 7 * 86400 - 1) == []
    [got] = away_open_long(c, start + 7 * 86400)
    assert (got.kind, got.key, got.severity) == ("away_open_long", "away_open_long:a1", "info")
    assert got.params == {"since": start, "days": 7}
    # The key stays the absence's: a dismissal holds while it runs; days follow in the params.
    [later] = away_open_long(c, start + 10.5 * 86400)
    assert later.key == got.key and later.params["days"] == 10


def test_away_open_long_ignores_dated_ending_and_other_overrides():
    start = 1_800_000_000.0
    c = actx()
    c.overrides = [
        _away(start, open_ended=False, oid="d"),
        _away(start, restoring=True, oid="r"),
        _away(start, kind="boost", oid="b"),
        {**_away(start, oid="old"), "created_at": None},
    ]
    assert away_open_long(c, start + 30 * 86400) == []


def test_away_open_long_resolves_when_the_away_ends():
    svc, store, clock, _ = make()
    c = actx()
    c.overrides = [_away(clock() - 8 * 86400)]
    svc.rules = {"away_open_long": away_open_long}
    svc.context = lambda: c
    svc.evaluate()
    [a] = store.listing("active")
    assert a["kind"] == "away_open_long" and a["params"]["days"] == 8
    c.overrides = []
    svc.evaluate()
    assert store.listing("active") == []


def test_linky_stalled_ignores_a_malformed_last_day():
    st = {"configured": True, "state": "ok", "last_day": "2026-13-45", "last_ok_at": 0}
    assert linky_stalled(actx(linky=st), 2_000_000_000.0) == []


# --- Final review I1: a dismissed unreachable alert stays dismissed across a restart ---------

HEATER_CH1 = f"{SAMPLE_GATEWAY}/9000011#1"


class _Kelvin:
    """One Kelvin run on a database file: its house, alert store and engine (the unreachable
    rule only). A restart is a new _Kelvin on the same file."""

    def __init__(self, path, clock, *, unavailable_at_start=False):
        root, devices = sample_house()
        if unavailable_at_start:
            next(d for d in devices if d.device_url == HEATER_CH1).states["core:StatusState"] = (
                "unavailable"
            )
        self.house = build_house(root, devices, wall=clock)
        self.db = Database(path)
        self.store = AlertStore(self.db, wall=clock)
        self.svc = AlertService(
            self.store,
            {"radiator_unreachable": radiator_unreachable},
            lambda: actx(house=self.house, db=self.db),
            publish=lambda s: None,
            wall=clock,
        )

    def status(self, value):
        self.house.apply(StateChange(HEATER_CH1, "core:StatusState", value))


def test_a_dismissed_unreachable_alert_stays_hidden_after_a_restart(tmp_path):
    path, clock = tmp_path / "k.db", ManualClock(1_000_000.0)
    k = _Kelvin(path, clock)
    k.status("unavailable")
    clock.advance(31 * 60)
    k.svc.evaluate()
    [a] = k.store.listing("active")
    assert k.svc.dismiss(a["id"])
    k.db.close()
    # Restart while the radiator is still unavailable: Kelvin sees it from its start.
    clock.advance(600)
    k = _Kelvin(path, clock, unavailable_at_start=True)
    k.svc.evaluate()
    assert k.store.listing("active") == []
    [row] = k.store.listing("all")
    assert (row["id"], row["dismissed"], row["resolved_at"]) == (a["id"], True, None)
    clock.advance(2 * 3600)
    k.svc.evaluate()
    assert k.store.listing("active") == []
    # It comes back, then drops again: a new occurrence, shown.
    k.status("available")
    k.svc.evaluate()
    assert k.store.listing("all")[0]["resolved_at"] is not None
    k.status("unavailable")
    clock.advance(31 * 60)
    k.svc.evaluate()
    [b] = k.store.listing("active")
    assert b["id"] != a["id"]
    k.db.close()


def test_an_outage_seen_only_from_a_start_has_a_stable_key(tmp_path):
    path, clock = tmp_path / "k.db", ManualClock(1_000_000.0)
    k = _Kelvin(path, clock, unavailable_at_start=True)
    k.svc.evaluate()
    assert k.store.listing("active") == []  # 30 minutes first, as any outage
    clock.advance(31 * 60)
    k.svc.evaluate()
    [a] = k.store.listing("active")
    assert a["params"]["since"] is None
    k.svc.dismiss(a["id"])
    k.db.close()
    clock.advance(3600)
    k = _Kelvin(path, clock, unavailable_at_start=True)
    clock.advance(31 * 60)
    k.svc.evaluate()
    assert k.store.listing("active") == []  # the same outage, still dismissed
    # Resolved, then seen again only from a later start: the same key reopens, shown again.
    k.status("available")
    k.svc.evaluate()
    k.db.close()
    clock.advance(3600)
    k = _Kelvin(path, clock, unavailable_at_start=True)
    clock.advance(31 * 60)
    k.svc.evaluate()
    assert [x["id"] for x in k.store.listing("active")] == [a["id"]]
    k.db.close()


def test_a_resolved_key_that_returns_is_shown_again_even_if_it_was_dismissed():
    svc, store, _, _ = make()
    emitted = [cand("consent_expiring:2026-10-30:warn", "consent_expiring", "warn")]
    svc.rules = {"consent_expiring": lambda ctx, now: emitted}
    svc.evaluate()
    svc.dismiss(store.listing("active")[0]["id"])
    svc.evaluate()
    assert store.listing("active") == []  # still open: stays dismissed
    emitted[:] = []
    svc.evaluate()  # resolved
    emitted[:] = [cand("consent_expiring:2026-10-30:warn", "consent_expiring", "warn")]
    svc.evaluate()
    assert len(store.listing("active")) == 1


PLAN9_TODAY = date(2026, 12, 1)
TOMORROW = date(2026, 12, 2)
TEMPO_RATES = {
    "blue_hc": 0.1,
    "blue_hp": 0.2,
    "white_hc": 0.1,
    "white_hp": 0.3,
    "red_hc": 0.1,
    "red_hp": 0.8,
}
HCHP9 = Tariff("hchp", 9, (Slot("22:00", "06:00"),), (Prices(date(2026, 1, 1), 15.0, 0.2, 0.3),))
TEMPO9 = Tariff.build(9, [PriceRow.make(date(2026, 1, 1), "tempo", 15.0, TEMPO_RATES)])
BASE9 = Tariff.build(9, [PriceRow.make(date(2026, 1, 1), "base", 15.0, {"base": 0.19})])


def ctx9(tariff, **kw):
    return AlertContext(
        ZoneInfo("Europe/Paris"), PLAN9_TODAY, tariff, None, None, Database(":memory:"), **kw
    )


def test_tempo_red_tomorrow_needs_a_tempo_row_tomorrow():
    assert tempo_red_tomorrow(ctx9(TEMPO9, tempo={TOMORROW: "red"}), 0) == [
        Candidate(
            "tempo_red_tomorrow", "tempo_red_tomorrow:2026-12-02", "warn", {"date": "2026-12-02"}
        )
    ]
    assert tempo_red_tomorrow(ctx9(TEMPO9, tempo={TOMORROW: "white"}), 0) == []
    assert tempo_red_tomorrow(ctx9(HCHP9, tempo={TOMORROW: "red"}), 0) == []  # HC/HP: no Tempo
    assert tempo_red_tomorrow(ctx9(None, tempo={TOMORROW: "red"}), 0) == []
    switch = Tariff.build(
        9,
        [
            Prices(date(2026, 1, 1), 15.0, 0.2, 0.3),
            PriceRow.make(TOMORROW, "tempo", 15.0, TEMPO_RATES),
        ],
        [HcSchedule(date(2026, 1, 1), (HcVariant(ALL_MONTHS, (Slot("22:00", "06:00"),)),))],
    )
    assert len(tempo_red_tomorrow(ctx9(switch, tempo={TOMORROW: "red"}), 0)) == 1


@pytest.mark.parametrize("tariff", [None, HCHP9, TEMPO9, BASE9])
def test_ecowatt_fires_for_every_option(tariff):
    days = {
        PLAN9_TODAY: EcowattDay(PLAN9_TODAY, 1, None),
        TOMORROW: EcowattDay(TOMORROW, 3, None),
    }
    assert ecowatt(ctx9(tariff, ecowatt=days), 0) == [
        Candidate(
            "ecowatt",
            "ecowatt:2026-12-02:3",
            "bad",
            {"date": "2026-12-02", "level": 3, "hours": None},
        )
    ]
    orange = {PLAN9_TODAY: EcowattDay(PLAN9_TODAY, 2, tuple([1] * 18 + [2, 2] + [1] * 4))}
    [c] = ecowatt(ctx9(tariff, ecowatt=orange), 0)
    assert (c.key, c.severity) == ("ecowatt:2026-12-01:2", "warn")
    assert c.params["hours"] == [{"start": "18:00", "end": "20:00", "level": 2}]  # verified
    assert ecowatt(ctx9(tariff, ecowatt={TOMORROW: EcowattDay(TOMORROW, 1, None)}), 0) == []


def test_hc_changed_compares_the_contract_with_today_s_and_planned_slots():
    same = {"offpeak": [{"start": "22:00", "end": "06:00"}]}
    moved = {"offpeak": [{"start": "23:00", "end": "07:00"}]}
    assert hc_changed(ctx9(HCHP9, contract=same), 0) == []
    assert hc_changed(ctx9(HCHP9, contract=moved), 0) == [
        Candidate(
            "hc_changed",
            "hc_changed:23:00-07:00",
            "info",
            {"slots": [{"start": "23:00", "end": "07:00"}]},
        )
    ]
    planned = Tariff.build(
        9,
        [Prices(date(2026, 1, 1), 15.0, 0.2, 0.3)],
        [
            HcSchedule(date(2026, 1, 1), (HcVariant(ALL_MONTHS, (Slot("22:00", "06:00"),)),)),
            HcSchedule(date(2026, 12, 15), (HcVariant(ALL_MONTHS, (Slot("23:00", "07:00"),)),)),
        ],
    )
    assert hc_changed(ctx9(planned, contract=moved), 0) == []  # already added from 15 December
    assert hc_changed(ctx9(BASE9, contract=moved), 0) == []
    assert hc_changed(ctx9(HCHP9, contract={"offpeak": []}), 0) == []
    assert hc_changed(ctx9(HCHP9), 0) == []
