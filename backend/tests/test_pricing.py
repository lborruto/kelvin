"""Interval pricing under base, HC/HP (dated, seasonal) and Tempo (spec §2.2)."""

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from kelvin.billing.pricing import Pricing, tempo_day
from kelvin.billing.slots import Slot
from kelvin.billing.tariff import ALL_MONTHS, HcSchedule, HcVariant, PriceRow, Prices, Tariff
from kelvin.linky.models import day_bounds

PARIS = ZoneInfo("Europe/Paris")
TEMPO = {
    "blue_hc": 0.1296,
    "blue_hp": 0.1609,
    "white_hc": 0.1486,
    "white_hp": 0.1894,
    "red_hc": 0.1568,
    "red_hp": 0.7562,
}
NIGHT = (Slot("22:00", "06:00"),)


def at(y, m, d, h=0, mi=0, fold=0) -> int:
    return int(datetime(y, m, d, h, mi, tzinfo=PARIS, fold=fold).timestamp())


def halves(day: date) -> list[int]:
    a, b = day_bounds(day, PARIS)
    return list(range(a, b, 1800))


def tempo(*rows: PriceRow, colours=None) -> Pricing:
    return Pricing(
        Tariff.build(9, rows or [PriceRow.make(date(2025, 9, 1), "tempo", 15.0, TEMPO)]),
        PARIS,
        colours,
    )


def test_tempo_day_is_the_wall_clock_day_before_six():
    assert tempo_day(at(2026, 10, 14, 0, 0), PARIS) == date(2026, 10, 13)
    assert tempo_day(at(2026, 10, 14, 5, 59), PARIS) == date(2026, 10, 13)
    assert tempo_day(at(2026, 10, 14, 6, 0), PARIS) == date(2026, 10, 14)
    assert tempo_day(at(2026, 10, 14, 23, 59), PARIS) == date(2026, 10, 14)


@pytest.mark.parametrize(
    ("day", "n", "before_six"), [(date(2026, 10, 25), 50, 14), (date(2027, 3, 28), 46, 10)]
)
def test_dst_nights_belong_to_the_previous_tempo_day(day, n, before_six):
    starts = halves(day)
    assert len(starts) == n
    days = [tempo_day(t, PARIS) for t in starts]
    assert days[:before_six] == [day - timedelta(days=1)] * before_six
    assert days[before_six:] == [day] * (n - before_six)
    assert datetime.fromtimestamp(starts[before_six], PARIS).strftime("%H:%M") == "06:00"


def test_tempo_slices_take_the_tempo_day_s_colour():
    p = tempo(colours={date(2026, 10, 24): "white", date(2026, 10, 25): "red"})
    night = p.slice(at(2026, 10, 25, 2, 0, fold=1), 1800)  # the repeated hour, second time
    assert (night.colour, night.keys, night.offpeak) == ("white", (("white_hc", 1.0),), 1.0)
    morning = p.slice(at(2026, 10, 25, 6, 0), 1800)
    assert (morning.colour, morning.keys) == ("red", (("red_hp", 1.0),))
    assert p.rate(at(2026, 10, 25, 6, 0), 1800) == pytest.approx(0.7562)
    assert p.slice(at(2026, 10, 25, 22, 0), 1800).keys == (("red_hc", 1.0),)
    unknown = p.slice(at(2026, 10, 26, 7, 0), 1800)  # the 26th is not published
    assert (unknown.colour, unknown.keys) == (None, (("unknown_hp", 1.0),))
    assert p.rate(at(2026, 10, 26, 7, 0), 1800) is None
    assert p.colour(at(2026, 10, 26, 3, 0)) == "red"  # 03:00 on the 26th is the 25th's Tempo day


def test_the_price_row_is_the_calendar_date_s_and_the_colour_the_tempo_day_s():
    jan = PriceRow.make(date(2025, 8, 1), "tempo", 15.0, {**TEMPO, "red_hc": 0.15})
    feb = PriceRow.make(date(2026, 2, 1), "tempo", 15.5, {**TEMPO, "red_hc": 0.16})
    p = tempo(jan, feb, colours={date(2026, 1, 31): "red"})
    sl = p.slice(at(2026, 2, 1, 3, 0), 1800)
    assert (sl.day, sl.colour) == (date(2026, 2, 1), "red")
    assert p.rate(at(2026, 2, 1, 3, 0), 1800) == pytest.approx(0.16)


def test_hchp_follows_the_dated_and_seasonal_schedule():
    winter = HcVariant((11, 12, 1, 2, 3), (Slot("01:00", "07:00"), Slot("13:00", "15:00")))
    summer = HcVariant((4, 5, 6, 7, 8, 9, 10), (Slot("02:00", "08:00"),))
    t = Tariff.build(
        9,
        [Prices(date(2025, 1, 1), 15.0, 0.2, 0.3)],
        [
            HcSchedule(date(2025, 1, 1), (HcVariant(ALL_MONTHS, NIGHT),)),
            HcSchedule(date(2026, 11, 1), (winter, summer)),
        ],
    )
    p = Pricing(t, PARIS)
    assert p.offpeak(at(2026, 10, 31, 23, 30), 1800) == 1.0
    assert p.offpeak(at(2026, 11, 1, 0, 30), 1800) == 0.0
    assert p.offpeak(at(2026, 11, 1, 13, 30), 1800) == 1.0
    assert p.slice(at(2026, 11, 1, 13, 30), 1800).keys == (("hc", 1.0),)
    assert p.rate(at(2026, 11, 1, 12, 0), 1800) == pytest.approx(0.3)
    assert (
        p.offpeak(at(2027, 5, 1, 1, 30), 1800) == 0.0
        and p.offpeak(at(2027, 5, 1, 2, 0), 1800) == 1.0
    )
    assert p.day_share(date(2026, 10, 31)) == pytest.approx(8 / 24)
    assert p.day_share(date(2026, 11, 1)) == pytest.approx(8 / 24)


def test_an_edge_inside_a_half_hour_is_prorated_and_flagged():
    t = Tariff("hchp", 9, (Slot("00:50", "06:50"),), (Prices(date(2026, 1, 1), 15.0, 0.2, 0.3),))
    p = Pricing(t, PARIS)
    sl = p.slice(at(2026, 10, 14, 0, 30), 1800)
    assert sl.boundary and sl.offpeak == pytest.approx(10 / 30)
    assert sl.keys == (("hc", pytest.approx(1 / 3)), ("hp", pytest.approx(2 / 3)))
    assert p.rate(at(2026, 10, 14, 0, 30), 1800) == pytest.approx(0.2 / 3 + 0.3 * 2 / 3)
    assert p.slice(at(2026, 10, 14, 6, 30), 1800).boundary
    assert not p.slice(at(2026, 10, 14, 1, 0), 1800).boundary


def test_base_has_no_off_peak_split():
    p = Pricing(
        Tariff.build(9, [PriceRow.make(date(2026, 1, 1), "base", 15.0, {"base": 0.1952})]), PARIS
    )
    sl = p.slice(at(2026, 10, 14, 3, 0), 1800)
    assert (sl.offpeak, sl.keys, sl.colour, sl.boundary) == (None, (("base", 1.0),), None, False)
    assert p.rate(at(2026, 10, 14, 3, 0), 1800) == pytest.approx(0.1952)
    assert p.day_share(date(2026, 10, 14)) is None
    assert p.subscription(date(2026, 2, 10)) == pytest.approx(15.0 / 28)


def test_a_switch_of_option_prices_each_day_by_its_own_row():
    t = Tariff.build(
        9,
        [
            Prices(date(2025, 1, 1), 15.0, 0.2, 0.3),
            PriceRow.make(date(2026, 11, 1), "tempo", 15.0, TEMPO),
        ],
        [HcSchedule(date(2025, 1, 1), (HcVariant(ALL_MONTHS, NIGHT),))],
    )
    p = Pricing(t, PARIS, {date(2026, 10, 31): "blue", date(2026, 11, 1): "white"})
    assert p.slice(at(2026, 10, 31, 23, 0), 1800).keys == (("hc", 1.0),)
    # 1 November 03:00: the Tempo row is in force (calendar date) and the Tempo day is 31 October.
    assert p.slice(at(2026, 11, 1, 3, 0), 1800).keys == (("blue_hc", 1.0),)


@st.composite
def slot_sets(draw):
    """1–3 disjoint off-peak slots on a 10-minute grid, possibly wrapping midnight."""
    k = draw(st.integers(1, 3))
    points = sorted(
        draw(st.lists(st.integers(0, 143), min_size=2 * k, max_size=2 * k, unique=True))
    )
    shift = draw(st.integers(0, 143))
    hhmm = lambda i: f"{(i % 144) * 10 // 60:02d}:{(i % 144) * 10 % 60:02d}"  # noqa: E731
    return tuple(
        Slot(hhmm(points[2 * j] + shift), hhmm(points[2 * j + 1] + shift)) for j in range(k)
    )


@settings(max_examples=150, deadline=None)
@given(
    slots=slot_sets(),
    day=st.dates(date(2026, 1, 1), date(2027, 12, 31))
    | st.sampled_from([date(2026, 10, 25), date(2027, 3, 28)]),
    i=st.integers(0, 49),
)
def test_off_peak_fraction_matches_a_minute_membership_oracle(slots, day, i):
    starts = halves(day)
    start = starts[i % len(starts)]
    t = Tariff("hchp", 9, slots, (Prices(date(2020, 1, 1), 15.0, 0.2, 0.3),))
    hc_minutes = set()
    for s in slots:
        a, b = (int(x[:2]) * 60 + int(x[3:]) for x in (s.start, s.end))
        m = a
        while m != b:
            hc_minutes.add(m)
            m = (m + 1) % 1440
    local = datetime.fromtimestamp(start, PARIS)
    first = local.hour * 60 + local.minute
    expected = sum(((first + k) % 1440) in hc_minutes for k in range(30)) / 30
    assert Pricing(t, PARIS).offpeak(start, 1800) == pytest.approx(expected)
