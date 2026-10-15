from datetime import date
from zoneinfo import ZoneInfo

import pytest

from kelvin.billing.costs import (
    DayEnergy,
    energy_eur,
    subscription_eur,
)
from kelvin.billing.slots import (
    Slot,
    SlotError,
    offpeak_minutes,
    offpeak_share_of_day,
    slot_ranges,
    split_curve,
)
from kelvin.billing.tariff import Prices, Tariff, TariffStore, TariffUpdate
from kelvin.linky.models import Contract, CurvePoint, day_bounds
from kelvin.recorder.db import Database

PARIS = ZoneInfo("Europe/Paris")
NIGHT = (Slot("22:00", "06:00"),)


def flat(day: date, watts: float = 1000.0) -> list[CurvePoint]:
    a, b = day_bounds(day, PARIS)
    return [CurvePoint(ts, 30, watts / 2) for ts in range(a, b, 1800)]


def test_slot_across_midnight_and_validation():
    assert slot_ranges(NIGHT) == [(0, 360), (1320, 1440)]
    assert slot_ranges([Slot("01:30", "07:30"), Slot("12:30", "14:30")]) == [(90, 450), (750, 870)]
    assert slot_ranges([Slot("22:00", "00:00")]) == [(1320, 1440)]
    assert offpeak_share_of_day(slot_ranges(NIGHT)) == pytest.approx(8 / 24)
    for bad, msg in [
        ([], "Indiquez au moins une plage d’heures creuses."),
        ([Slot("01:00", "02:00")] * 4, "Trois plages d’heures creuses au maximum."),
        ([Slot("06:00", "06:00")], "Une plage d’heures creuses ne peut pas être vide."),
        (
            [Slot("22:00", "06:00"), Slot("05:00", "07:00")],
            "Les plages d’heures creuses se chevauchent.",
        ),
        ([Slot("24:00", "06:00")], "Heure invalide : 24:00 (format HH:MM)."),
    ]:
        with pytest.raises(SlotError) as e:
            slot_ranges(bad)
        assert str(e.value) == msg


def test_interval_overlap_is_proportional_and_wraps_midnight():
    night = slot_ranges(NIGHT)
    assert offpeak_minutes(21 * 60 + 30, 60, night) == 30
    assert offpeak_minutes(5 * 60 + 45, 30, night) == 15
    assert offpeak_minutes(23 * 60 + 45, 30, slot_ranges([Slot("00:00", "01:00")])) == 15
    enedis = slot_ranges([Slot("01:30", "07:30"), Slot("12:30", "14:30")])
    assert offpeak_minutes(75, 30, enedis) == 15  # 01:15–01:45 against a 01:30 start


@pytest.mark.parametrize(
    ("day", "hc_kwh", "hp_kwh"),
    [
        (date(2026, 10, 6), 8.0, 16.0),  # 24 h
        (date(2026, 10, 25), 9.0, 16.0),  # 25 h: the repeated hour is off-peak, twice
        (date(2026, 3, 29), 7.0, 16.0),  # 23 h: the skipped hour is not counted
    ],
)
def test_split_curve_on_normal_and_dst_days(day, hc_kwh, hp_kwh):
    hc, hp = split_curve(flat(day), slot_ranges(NIGHT), PARIS)
    assert hc / 1000 == pytest.approx(hc_kwh) and hp / 1000 == pytest.approx(hp_kwh)
    assert (hc + hp) / 1000 == pytest.approx(sum(p.wh for p in flat(day)) / 1000)


def test_costs_per_day():
    p = Prices(date(2026, 1, 1), 15.5, 0.2, 0.3)
    e = DayEnergy(date(2026, 2, 3), 10.0, 4.0, 6.0, False)
    assert energy_eur(e, p) == pytest.approx(4 * 0.2 + 6 * 0.3)
    assert energy_eur(DayEnergy(date(2026, 2, 3), 10.0, None, None, False), p) is None
    assert subscription_eur(date(2026, 2, 3), p) == pytest.approx(15.5 / 28)
    assert sum(subscription_eur(date(2026, 1, d), p) for d in range(1, 32)) == pytest.approx(15.5)


def test_price_history_and_store():
    store = TariffStore(Database(":memory:"))
    assert store.get() is None
    p1 = Prices(date(2026, 2, 1), 15.0, 0.20, 0.27)
    t = store.update(TariffUpdate(12, NIGHT, p1))
    assert t.prices == (p1,) and t.kva == 12 and t.option == "hchp"
    p2 = Prices(date(2026, 8, 1), 16.0, 0.21, 0.28)
    store.update(TariffUpdate(12, NIGHT, p2))
    p1b = Prices(date(2026, 2, 1), 15.1, 0.20, 0.27)  # same date: replaces
    t = store.update(TariffUpdate(9, (Slot("01:30", "07:30"),), p1b))
    assert t.prices == (p1b, p2) and t.kva == 9 and store.get() == t
    assert t.prices_on(date(2026, 1, 1)) == p1b  # before history: the first prices
    assert t.prices_on(date(2026, 7, 31)) == p1b
    assert t.prices_on(date(2026, 8, 1)) == p2
    assert Tariff.from_view(t.view()) == t
    with pytest.raises(ValueError, match="Puissance souscrite inconnue."):
        store.update(TariffUpdate(11, NIGHT, p1))
    with pytest.raises(SlotError):
        store.update(TariffUpdate(12, (), p1))


def test_prefill_from_the_contract():
    store = TariffStore(Database(":memory:"))
    store.set_prefill(Contract(6, (("01:30", "07:30"), ("12:30", "14:30")), date(2026, 8, 5), "X"))
    assert store.prefill() == {
        "kva": 6,
        "hc_slots": [{"start": "01:30", "end": "07:30"}, {"start": "12:30", "end": "14:30"}],
    }


def test_slot_errors_carry_codes():
    with pytest.raises(SlotError) as e:
        slot_ranges([Slot("24:00", "06:00")])
    assert (e.value.code, e.value.params) == ("slot_time_invalid", {"value": "24:00"})
    with pytest.raises(SlotError) as e:
        slot_ranges([])
    assert e.value.code == "slots_none"
