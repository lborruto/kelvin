"""Tariff model v2 (spec §2.2): options per price row, dated and seasonal HC, Tempo hours, the
v1 migration."""

from datetime import date

import pytest

from kelvin.billing.slots import Slot
from kelvin.billing.tariff import (
    ALL_MONTHS,
    TARIFF_INVALID_KEY,
    TARIFF_KEY,
    TARIFF_V1_KEY,
    HcSchedule,
    HcVariant,
    PriceRow,
    Prices,
    Tariff,
    TariffStore,
    TariffUpdate,
    TempoHours,
)
from kelvin.errors import UserError
from kelvin.recorder.db import Database

V1 = {
    "option": "hchp",
    "kva": 9,
    "hc_slots": [{"start": "22:00", "end": "06:00"}],
    "prices": [
        {
            "valid_from": "2025-01-15",
            "subscription_eur_month": 15.0,
            "hc_eur_kwh": 0.2,
            "hp_eur_kwh": 0.27,
        },
        {
            "valid_from": "2026-08-01",
            "subscription_eur_month": 15.5,
            "hc_eur_kwh": 0.2068,
            "hp_eur_kwh": 0.27,
        },
    ],
}
TEMPO = {
    "blue_hc": 0.1296,
    "blue_hp": 0.1609,
    "white_hc": 0.1486,
    "white_hp": 0.1894,
    "red_hc": 0.1568,
    "red_hp": 0.7562,
}
NIGHT = (Slot("22:00", "06:00"),)
WINTER = HcVariant((11, 12, 1, 2, 3), (Slot("01:00", "07:00"), Slot("13:00", "15:00")))
SUMMER = HcVariant((4, 5, 6, 7, 8, 9, 10), (Slot("02:00", "08:00"), Slot("12:00", "14:00")))


def seasonal() -> Tariff:
    return Tariff.build(
        9,
        [Prices(date(2025, 1, 15), 15.0, 0.2, 0.27)],
        [
            HcSchedule(date(2025, 1, 15), (HcVariant(ALL_MONTHS, NIGHT),)),
            HcSchedule(date(2026, 11, 1), (WINTER, SUMMER)),
        ],
    )


def test_a_v1_setting_is_migrated_once_with_no_user_action():
    db = Database(":memory:")
    db.set_setting(TARIFF_KEY, V1)
    store = TariffStore(db)
    read = store.get()  # a read never writes: the migration runs once, at startup
    assert db.get_setting(TARIFF_KEY) == V1 and db.get_setting(TARIFF_V1_KEY) is None
    assert store.migrate() is True
    t = store.get()
    assert t == read and t is not None and t.option == "hchp" and t.kva == 9
    [s] = t.hc_schedules
    assert s.valid_from == date(2025, 1, 15)  # the earliest price's date
    assert s.variants == (HcVariant(ALL_MONTHS, NIGHT),)
    assert [p.view()["rates"] for p in t.prices] == [
        {"hc": 0.2, "hp": 0.27},
        {"hc": 0.2068, "hp": 0.27},
    ]
    stored = db.get_setting(TARIFF_KEY)
    assert "hc_schedules" in stored and db.get_setting(TARIFF_V1_KEY) == V1
    assert store.migrate() is False and db.get_setting(TARIFF_KEY) == stored  # once only
    db.set_setting(TARIFF_V1_KEY, {"kept": True})
    db.set_setting(TARIFF_KEY, V1)
    store.migrate()
    assert db.get_setting(TARIFF_V1_KEY) == {"kept": True}  # the first copy is never overwritten


def test_an_invalid_setting_is_neither_migrated_nor_priced(caplog):
    db = Database(":memory:")
    store = TariffStore(db)
    assert store.migrate() is False and store.get() is None  # nothing stored: nothing to do
    bad = {**V1, "kva": 7}
    db.set_setting(TARIFF_KEY, bad)
    assert store.migrate() is False
    assert db.get_setting(TARIFF_KEY) == bad and db.get_setting(TARIFF_V1_KEY) is None
    assert store.get() is None  # never priced silently wrong
    assert "kva_unknown" in caplog.text
    # A v2 document with HC/HP rows and no schedule (only by editing the database by hand).
    v2 = seasonal().view()
    db.set_setting(TARIFF_KEY, {**v2, "hc_schedules": []})
    assert store.get() is None and "hc_schedules_missing" in caplog.text
    db.set_setting(TARIFF_KEY, {"kva": 9})  # malformed: no crash, no tariff
    assert store.migrate() is False and store.get() is None


def test_the_v1_body_is_refused_once_a_row_is_not_hc_hp():
    db = Database(":memory:")
    store = TariffStore(db)
    store.replace(
        Tariff.build(
            9,
            [
                Prices(date(2025, 1, 15), 15.0, 0.2, 0.27),
                PriceRow.make(date(2026, 11, 1), "tempo", 15.6, TEMPO),
            ],
            [HcSchedule(date(2025, 1, 15), (HcVariant(ALL_MONTHS, NIGHT),))],
        )
    )
    before = db.get_setting(TARIFF_KEY)
    for day in (date(2026, 11, 1), date(2026, 12, 1), date(2026, 1, 1)):
        with pytest.raises(UserError) as e:
            store.update(TariffUpdate(9, NIGHT, Prices(day, 15.5, 0.21, 0.31)))
        assert (e.value.code, e.value.params) == ("tariff_form_outdated", {})
    assert db.get_setting(TARIFF_KEY) == before  # the Tempo rows are kept


def test_the_v1_constructor_and_names_still_work():
    t = Tariff("hchp", 9, NIGHT, (Prices(date(2026, 1, 1), 15.0, 0.2, 0.3),))
    assert t.slots_on(date(2025, 6, 1)) == NIGHT and t.retro_scheduled(date(2025, 6, 1))
    p = t.prices_on(date(2026, 3, 1))
    assert (p.option, p.hc_eur_kwh, p.hp_eur_kwh) == ("hchp", 0.2, 0.3)
    assert {p, Prices(date(2026, 1, 1), 15.0, 0.2, 0.3)} == {p}  # rows stay hashable


def test_slots_on_follows_valid_from_and_the_season():
    t = seasonal()
    assert t.slots_on(date(2025, 1, 1)) == NIGHT and t.retro_scheduled(date(2025, 1, 1))
    assert t.slots_on(date(2026, 10, 31)) == NIGHT and not t.retro_scheduled(date(2026, 10, 31))
    assert t.slots_on(date(2026, 11, 1)) == WINTER.slots
    assert t.slots_on(date(2027, 3, 31)) == WINTER.slots
    assert t.slots_on(date(2027, 4, 1)) == SUMMER.slots
    assert t.ranges_on(date(2027, 4, 1)) == [(120, 480), (720, 840)]


def test_an_option_change_keeps_earlier_rows_their_option():
    t = Tariff.build(
        9,
        [
            Prices(date(2025, 1, 15), 15.0, 0.2, 0.27),
            PriceRow.make(date(2026, 11, 1), "tempo", 15.6, TEMPO),
        ],
        [HcSchedule(date(2025, 1, 15), (HcVariant(ALL_MONTHS, NIGHT),))],
    ).validate()
    assert t.option == "tempo" and t.options() == {"hchp", "tempo"}
    assert t.option_on(date(2026, 10, 31)) == "hchp" and t.option_on(date(2026, 11, 1)) == "tempo"
    assert t.prices_on(date(2026, 11, 1)).rate("red_hp") == 0.7562
    assert t.tempo_ranges() == [(0, 360), (1320, 1440)]
    assert t.edges() == {360, 1320}  # 06:00 and 22:00: the slots and the Tempo hours share them


def test_months_must_be_covered_exactly_once():
    def check(*variants):
        Tariff.build(
            9, [Prices(date(2026, 1, 1), 15.0, 0.2, 0.3)], [HcSchedule(date(2026, 1, 1), variants)]
        ).validate()

    with pytest.raises(UserError) as e:
        check(HcVariant((1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12), NIGHT))
    assert (e.value.code, e.value.params) == ("hc_months_missing", {"months": [4]})
    with pytest.raises(UserError) as e:
        check(WINTER, HcVariant((1, 4, 5, 6, 7, 8, 9, 10), NIGHT))
    assert (e.value.code, e.value.params) == ("hc_months_overlap", {"months": [1]})
    with pytest.raises(UserError) as e:
        check(HcVariant(ALL_MONTHS, (Slot("22:00", "06:00"), Slot("05:00", "07:00"))))
    assert e.value.code == "slots_overlap"
    check(WINTER, SUMMER)


def test_rates_must_match_the_row_option():
    def check(row):
        Tariff.build(
            9, [row], [HcSchedule(date(2026, 1, 1), (HcVariant(ALL_MONTHS, NIGHT),))]
        ).validate()

    with pytest.raises(UserError) as e:
        check(
            PriceRow.make(
                date(2026, 1, 1), "tempo", 15.0, {k: v for k, v in TEMPO.items() if k != "red_hp"}
            )
        )
    assert (e.value.code, e.value.params) == ("tariff_rates_invalid", {"rate": "red_hp"})
    with pytest.raises(UserError) as e:
        check(PriceRow.make(date(2026, 1, 1), "base", 15.0, {"base": 0.19, "hc": 0.2}))
    assert (e.value.code, e.value.params) == ("tariff_rates_invalid", {"rate": "hc"})
    with pytest.raises(UserError) as e:
        check(PriceRow.make(date(2026, 1, 1), "base", 15.0, {"base": 0.0}))
    assert e.value.code == "tariff_rates_invalid"
    with pytest.raises(UserError) as e:
        check(PriceRow.make(date(2026, 1, 1), "eco", 15.0, {"base": 0.2}))
    assert e.value.code == "tariff_option_unsupported"
    with pytest.raises(UserError) as e:
        check(PriceRow.make(date(2026, 1, 1), "base", float("nan"), {"base": 0.2}))
    assert e.value.code == "price_subscription_invalid"


def test_rows_and_schedules_need_distinct_dates_and_hchp_needs_a_schedule():
    rows = [Prices(date(2026, 1, 1), 15.0, 0.2, 0.3), Prices(date(2026, 1, 1), 16.0, 0.2, 0.3)]
    with pytest.raises(UserError) as e:
        Tariff.build(
            9, rows, [HcSchedule(date(2026, 1, 1), (HcVariant(ALL_MONTHS, NIGHT),))]
        ).validate()
    assert (e.value.code, e.value.params) == ("tariff_dates_duplicate", {"date": "2026-01-01"})
    with pytest.raises(UserError) as e:
        Tariff.build(9, rows[:1]).validate()
    assert e.value.code == "hc_schedules_missing"
    with pytest.raises(UserError) as e:
        Tariff.build(9, []).validate()
    assert e.value.code == "tariff_prices_missing"
    base = Tariff.build(
        9, [PriceRow.make(date(2026, 1, 1), "base", 15.0, {"base": 0.1952})]
    ).validate()
    assert base.slots_on(date(2026, 5, 1)) is None and base.edges() == set()


def test_tempo_hours_are_checked_only_with_a_tempo_row():
    rows = [PriceRow.make(date(2026, 1, 1), "tempo", 15.0, TEMPO)]
    with pytest.raises(UserError) as e:
        Tariff.build(9, rows, tempo_hours=TempoHours("22:00", "22:00")).validate()
    assert e.value.code == "tempo_hours_invalid"
    with pytest.raises(UserError) as e:
        Tariff.build(9, rows, tempo_hours=TempoHours("25:00", "06:00")).validate()
    assert e.value.code == "tempo_hours_invalid"
    base = [PriceRow.make(date(2026, 1, 1), "base", 15.0, {"base": 0.19})]
    Tariff.build(
        9, base, tempo_hours=TempoHours("22:00", "22:00")
    ).validate()  # unused: not checked


def test_view_round_trips_and_keeps_the_v1_fields():
    t = seasonal()
    v = t.view()
    assert v["hc_slots"] == [{"start": "01:00", "end": "07:00"}, {"start": "13:00", "end": "15:00"}]
    assert v["tempo_hours"] == {"hc_start": "22:00", "hc_end": "06:00", "day_start": "06:00"}
    assert v["prices"][0] == {
        "valid_from": "2025-01-15",
        "option": "hchp",
        "subscription_eur_month": 15.0,
        "rates": {"hc": 0.2, "hp": 0.27},
        "hc_eur_kwh": 0.2,
        "hp_eur_kwh": 0.27,
    }
    assert v["hc_schedules"][1]["variants"][0] == {
        "months": [11, 12, 1, 2, 3],
        "slots": [{"start": "01:00", "end": "07:00"}, {"start": "13:00", "end": "15:00"}],
    }
    assert Tariff.from_view(v) == t


def test_the_v1_body_adds_a_dated_schedule_only_when_the_slots_change():
    db = Database(":memory:")
    store = TariffStore(db)
    store.update(TariffUpdate(9, NIGHT, Prices(date(2026, 1, 1), 15.0, 0.2, 0.3)))
    store.update(TariffUpdate(9, NIGHT, Prices(date(2026, 8, 1), 15.5, 0.21, 0.31)))
    assert len(store.get().hc_schedules) == 1
    store.update(
        TariffUpdate(9, (Slot("01:00", "07:00"),), Prices(date(2026, 9, 1), 15.5, 0.21, 0.31))
    )
    t = store.get()
    assert [s.valid_from for s in t.hc_schedules] == [date(2026, 1, 1), date(2026, 9, 1)]
    assert t.slots_on(date(2026, 8, 31)) == NIGHT
    with pytest.raises(UserError) as e:
        store.update(
            TariffUpdate(9, NIGHT, Prices(date(2026, 9, 1), 15.5, 0.21, 0.31), option="tempo")
        )
    assert e.value.code == "tariff_option_unsupported"


def test_an_invalid_setting_is_logged_once_per_document(caplog):
    db = Database(":memory:")
    store = TariffStore(db)
    db.set_setting(TARIFF_KEY, {**V1, "kva": 7})
    for _ in range(3):
        assert store.get() is None
    assert caplog.text.count("tariff setting") == 1  # the report, the day view, the loop: once
    db.set_setting(TARIFF_KEY, {"kva": 9})
    store.get()
    store.get()
    assert caplog.text.count("tariff setting") == 2  # another document: logged again


def test_saving_over_an_invalid_document_keeps_it_as_tariff_invalid():
    db = Database(":memory:")
    store = TariffStore(db)
    bad = {**V1, "kva": 7}
    db.set_setting(TARIFF_KEY, bad)
    t = store.update(TariffUpdate(9, NIGHT, Prices(date(2026, 1, 1), 15.0, 0.2, 0.3)))
    assert store.get() == t and db.get_setting(TARIFF_INVALID_KEY) == bad
    store.update(TariffUpdate(9, NIGHT, Prices(date(2026, 2, 1), 15.0, 0.2, 0.3)))
    assert db.get_setting(TARIFF_INVALID_KEY) == bad  # a valid document is never backed up


def test_the_simulator_seed_never_overwrites_a_stored_document():
    from kelvin.linky.service import LinkyService

    db = Database(":memory:")
    bad = {**V1, "kva": 7}
    db.set_setting(TARIFF_KEY, bad)
    svc = LinkyService(db, make_source=lambda *a: None, credentials=None, simulator=True)
    svc.seed_demo_tariff()
    assert db.get_setting(TARIFF_KEY) == bad
    db.execute("DELETE FROM settings WHERE key = ?", (TARIFF_KEY,))
    svc.seed_demo_tariff()
    assert svc.tariffs.get() is not None
