"""Feature 9: the share of programmed comfort time that falls in peak hours (spec §5.2, §10.1)."""

from datetime import date, timedelta

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from kelvin.billing.overlap import Overlap, minutes_of, week_overlap
from kelvin.billing.slots import Slot, slot_ranges
from kelvin.billing.tariff import ALL_MONTHS, HcSchedule, HcVariant, PriceRow, Tariff
from kelvin.house.model import DAY_ORDER

MONDAY = date(2026, 10, 26)  # Monday 26 October … Sunday 1 November 2026
HCHP = {"hc": 0.2, "hp": 0.3}
TEMPO = {
    "blue_hc": 0.1296,
    "blue_hp": 0.1609,
    "white_hc": 0.1486,
    "white_hp": 0.1894,
    "red_hc": 0.1568,
    "red_hp": 0.7562,
}
NIGHT = (Slot("22:00", "06:00"),)
SUMMER = (Slot("01:00", "07:00"), Slot("19:00", "21:00"))
EVENINGS = [{"start": "06:00", "end": "08:00"}, {"start": "18:00", "end": "22:00"}]  # 6 h a day


def row(day, option="hchp", rates=HCHP):
    return PriceRow.make(day, option, 15.0, rates)


def hchp(*variants, rows=None):
    return Tariff.build(
        9, rows or [row(date(2026, 1, 1))], [HcSchedule(date(2026, 1, 1), tuple(variants))]
    )


def every_day(slots):
    return {d: list(slots) for d in DAY_ORDER}


def test_minutes_of_reads_midnight_as_the_end_of_the_day():
    assert (minutes_of("00:00"), minutes_of("06:15"), minutes_of("24:00")) == (0, 375, 1440)


def test_night_off_peak_hours_leave_every_evening_minute_in_peak():
    o = week_overlap(MONDAY, every_day(EVENINGS), hchp(HcVariant(ALL_MONTHS, NIGHT)))
    assert o == Overlap(7 * 360, 7 * 360) and o.share == 1.0
    assert o.view() == {"hp_minutes": 2520, "minutes": 2520, "share": 1.0}


def test_each_day_uses_its_own_schedule_and_option():
    winter = HcVariant((11, 12, 1, 2, 3), NIGHT)
    summer = HcVariant((4, 5, 6, 7, 8, 9, 10), SUMMER)
    # 26–31 October use the summer slots (06–07 and 19–21 off-peak: 180 of 360 min in peak);
    # Sunday 1 November the winter slots (22–06: all 360 in peak).
    o = week_overlap(MONDAY, every_day(EVENINGS), hchp(winter, summer))
    assert o == Overlap(6 * 180 + 360, 7 * 360)
    assert o.share == pytest.approx(1440 / 2520)
    # From Thursday the household is on Tempo: 06:00–22:00 is peak whatever the colour.
    switch = [row(date(2026, 1, 1)), row(date(2026, 10, 29), "tempo", TEMPO)]
    t = hchp(HcVariant(ALL_MONTHS, SUMMER), rows=switch)
    assert week_overlap(MONDAY, every_day(EVENINGS), t) == Overlap(3 * 180 + 4 * 360, 2520)


def test_tempo_hours_split_a_morning_slot():
    t = Tariff.build(9, [row(date(2026, 1, 1), "tempo", TEMPO)])
    o = week_overlap(MONDAY, every_day([{"start": "05:00", "end": "07:00"}]), t)
    assert o == Overlap(7 * 60, 7 * 120)  # 05–06 off-peak, 06–07 peak


def test_midnight_end_and_a_slot_across_midnight():
    t = hchp(HcVariant(ALL_MONTHS, (Slot("23:00", "07:00"),)))
    week = every_day([])
    week["friday"] = [{"start": "20:00", "end": "24:00"}]  # 20–23 peak, 23–24 off-peak
    week["saturday"] = [{"start": "06:00", "end": "08:00"}]  # 06–07 off-peak, 07–08 peak
    assert week_overlap(MONDAY, week, t) == Overlap(180 + 60, 240 + 120)


def test_base_or_unknown_day_gives_none():
    base_from_wednesday = [row(date(2026, 1, 1)), row(date(2026, 10, 28), "base", {"base": 0.25})]
    t = hchp(HcVariant(ALL_MONTHS, NIGHT), rows=base_from_wednesday)
    assert week_overlap(MONDAY, every_day(EVENINGS), t) is None
    week = every_day(EVENINGS)
    del week["saturday"]  # a day Kelvin could not read (Plan 8 locks it and leaves it out)
    assert week_overlap(MONDAY, week, hchp(HcVariant(ALL_MONTHS, NIGHT))) is None
    bad = every_day(EVENINGS)
    bad["monday"] = [{"start": "08:00", "end": "06:00"}]
    assert week_overlap(MONDAY, bad, hchp(HcVariant(ALL_MONTHS, NIGHT))) is None


def test_no_comfort_time_has_no_share():
    o = week_overlap(MONDAY, every_day([]), hchp(HcVariant(ALL_MONTHS, NIGHT)))
    assert o == Overlap(0, 0) and o.share is None


def hhmm(m: int) -> str:
    return "24:00" if m == 1440 else f"{m // 60:02d}:{m % 60:02d}"


@st.composite
def offpeak_slots(draw):
    """1–3 non-overlapping off-peak slots on a 10-minute grid; with `wrap`, the last one runs
    across midnight (as « 22:00–06:00 »)."""
    k = draw(st.integers(1, 3))
    q = sorted(draw(st.lists(st.integers(0, 143), min_size=2 * k, max_size=2 * k, unique=True)))
    q = [x * 10 for x in q]
    if draw(st.booleans()):
        pairs = [(q[i], q[i + 1]) for i in range(0, 2 * k, 2)]
    else:
        pairs = [(q[i], q[i + 1]) for i in range(1, 2 * k - 1, 2)] + [(q[-1], q[0])]
    return tuple(Slot(hhmm(a), hhmm(b)) for a, b in pairs)


@st.composite
def programmes(draw):
    """0–3 comfort slots a day on a 15-minute grid; an end may be 24:00."""
    week = {}
    for name in DAY_ORDER:
        j = draw(st.integers(0, 3))
        q = sorted(draw(st.lists(st.integers(0, 96), min_size=2 * j, max_size=2 * j, unique=True)))
        week[name] = [
            {"start": hhmm(q[i] * 15), "end": hhmm(q[i + 1] * 15)} for i in range(0, 2 * j, 2)
        ]
    return week


@settings(max_examples=200, deadline=None)
@given(winter=offpeak_slots(), summer=offpeak_slots(), week=programmes(), shift=st.integers(0, 365))
def test_overlap_matches_a_minute_oracle(winter, summer, week, shift):
    monday = date(2026, 1, 5) + timedelta(weeks=shift // 7)
    t = hchp(HcVariant((11, 12, 1, 2, 3), winter), HcVariant((4, 5, 6, 7, 8, 9, 10), summer))
    hp = total = 0
    for i, name in enumerate(DAY_ORDER):
        day = monday + timedelta(days=i)
        slots = winter if day.month in (11, 12, 1, 2, 3) else summer
        off = {m for a, b in slot_ranges(slots) for m in range(a, b)}
        for s in week[name]:
            for m in range(minutes_of(s["start"]), minutes_of(s["end"])):
                total += 1
                hp += m not in off
    assert week_overlap(monday, week, t) == Overlap(hp, total)
