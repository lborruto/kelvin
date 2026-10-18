from datetime import date, timedelta
from zoneinfo import ZoneInfo

import pytest

from kelvin.billing.report import (
    ReportInputs,
    build_report,
    daily_points,
    model_euros,
    trailing_price,
)
from kelvin.billing.slots import Slot
from kelvin.billing.tariff import PriceRow, Prices, Tariff
from kelvin.weather.costmodel import MonthOutlook

PARIS = ZoneInfo("Europe/Paris")
D = date(2026, 1, 12)
TEMPO = {
    "blue_hc": 0.1288,
    "blue_hp": 0.1609,
    "white_hc": 0.1486,
    "white_hp": 0.1894,
    "red_hc": 0.1568,
    "red_hp": 0.7562,
}


def hchp_tariff() -> Tariff:
    return Tariff("hchp", 9, (Slot("22:00", "06:00"),), (Prices(date(2025, 1, 1), 15.0, 0.2, 0.3),))


def tempo_tariff() -> Tariff:
    return Tariff.build(9, [PriceRow.make(date(2025, 9, 1), "tempo", 15.0, TEMPO)])


def inputs(*, daily, tariff, today, colours=None, weather_on=False, month_outlook=None):
    return ReportInputs(
        daily_wh=daily,
        curve={},
        tariff=tariff,
        tz=PARIS,
        today=today,
        colours=colours or {},
        weather_on=weather_on,
        month_outlook=month_outlook,
    )


def test_point_eur_is_the_day_bar_eur():
    inp = inputs(
        daily={D - timedelta(days=i): 30_000 + 400 * i for i in range(40)},
        tariff=hchp_tariff(),
        today=D + timedelta(days=1),
    )
    pts = daily_points(inp, D - timedelta(days=39), D + timedelta(days=1))
    rep = build_report(D, D + timedelta(days=1), "day", inp)
    assert pts[D].kwh == pytest.approx(rep["buckets"][0]["kwh"])
    assert pts[D].energy_eur == rep["buckets"][0]["energy_eur"]
    assert dict(pts[D].parts) == pytest.approx(rep["buckets"][0]["by_rate"])


def test_unknown_colour_point_has_no_eur():
    inp = inputs(
        daily={D: 41_200, D + timedelta(days=1): 39_000},
        tariff=tempo_tariff(),
        colours={D - timedelta(days=1): "blue", D: "red"},  # 00:00–06:00 is the day before
        today=D + timedelta(days=2),
    )
    pts = daily_points(inp, D, D + timedelta(days=2))
    assert pts[D].colour == "red" and pts[D].energy_eur is not None
    nxt = pts[D + timedelta(days=1)]
    assert nxt.energy_eur is None and nxt.kwh == pytest.approx(39.0) and nxt.colour is None


def test_trailing_price_is_the_projection_price():
    inp = inputs(
        daily={D - timedelta(days=i): 30_000 for i in range(40)},
        tariff=hchp_tariff(),
        today=D + timedelta(days=1),
    )
    rep = build_report(D - timedelta(days=30), D + timedelta(days=1), "month", inp)
    assert trailing_price(inp) == pytest.approx(
        rep["projection"]["rolling"]["price_eur_kwh"], abs=1e-4
    )


def _view(days):
    return {
        "house": {
            "baseload_kwh_day": 9.6,
            "kwh_per_c": 2.3,
            "line": [{"kwh": 30.0, "kwh_lo": 29.0, "kwh_hi": 31.0}],
        },
        "rooms": {"items": [{"kwh_per_c": 0.8}, {"kwh_per_c": None}]},
        "forecast": {
            "state": "ok",
            "days": days,
            "week": {
                "kwh": 0,
                "heating_kwh": 0,
                "eur": None,
                "heating_eur": None,
                "days": sum(1 for d in days if d["complete"]),  # as the builder counts them
                "priced_days": 0,
            },
        },
    }


def _fday(d, kwh, heating, complete=True):
    return {
        "date": d.isoformat(),
        "complete": complete,
        "kwh": kwh if complete else None,
        "kwh_lo": kwh - 4 if complete else None,
        "kwh_hi": kwh + 4 if complete else None,
        "heating_kwh": heating if complete else None,
        "eur": None,
        "eur_lo": None,
        "eur_hi": None,
        "heating_eur": None,
        "eur_why": None,
        "colour": None,
        "parts": None,
    }


def test_model_euros_and_forecast_cents_add_up_to_the_week():
    today = D
    inp = inputs(
        daily={D - timedelta(days=i): 30_000 for i in range(1, 40)},
        tariff=hchp_tariff(),
        today=today,
    )
    days = [_fday(today + timedelta(days=i), 30.333 + i / 7, 20.111) for i in range(1, 8)]
    v = model_euros(_view(days), inp, 0.2016)
    assert v["house"]["eur_per_c"] == round(2.3 * 0.2016, 2)
    assert v["house"]["baseload_eur_day"] == round(9.6 * 0.2016, 2)
    assert v["house"]["line"][0]["eur"] == round(30.0 * 0.2016, 2)
    assert v["rooms"]["items"][1]["eur_per_c"] is None
    fc = v["forecast"]
    assert all(d["eur"] is not None and d["parts"] for d in fc["days"])
    assert round(sum(d["eur"] for d in fc["days"]), 2) == fc["week"]["eur"]
    assert round(sum(d["heating_eur"] for d in fc["days"]), 2) == fc["week"]["heating_eur"]
    assert fc["week"]["priced_days"] == fc["week"]["days"] == 7
    assert v["price"] == {"eur_kwh": 0.2016, "option": "hchp"}


def test_forecast_beyond_the_published_colour_has_no_eur():
    today = D
    inp = inputs(
        daily={D - timedelta(days=i): 30_000 for i in range(1, 40)},
        tariff=tempo_tariff(),
        colours={today: "blue", today + timedelta(days=1): "white"},
        today=today,
    )
    days = [_fday(today + timedelta(days=i), 30.0, 20.0) for i in range(1, 3)]
    fc = model_euros(_view(days), inp, 0.18)["forecast"]
    assert fc["days"][0]["eur"] is not None and fc["days"][0]["colour"] == "white"
    assert fc["days"][1]["eur"] is None and fc["days"][1]["eur_why"] == "tempo_colour_unknown"
    assert fc["week"]["eur"] is None and fc["week"]["priced_days"] == 1


def test_no_tariff_means_no_eur_anywhere():
    inp = inputs(daily={D - timedelta(days=i): 30_000 for i in range(1, 40)}, tariff=None, today=D)
    v = model_euros(_view([_fday(D + timedelta(days=1), 30.0, 20.0)]), inp, None)
    assert v["price"] is None and v["house"]["eur_per_c"] is None
    assert v["forecast"]["days"][0]["eur_why"] == "no_tariff"


def _outlook(today, first, end, kwh=20.0, why=None, missing=None):
    days = {}
    d = first
    while d < end:
        src = (
            "observed"
            if d < today
            else "today"
            if d == today
            else "forecast"
            if d <= today + timedelta(days=7)
            else "normal"
        )
        days[d] = (kwh, src)
        d += timedelta(days=1)
    for m in missing or {}:
        days.pop(m, None)
    return MonthOutlook(
        why,
        days,
        dict(missing or {}),
        lambda need: (len(need) * kwh - 10, len(need) * kwh + 10, "full"),
    )


def test_month_projection_uses_the_weather_outlook():
    today = date(2026, 1, 14)
    last = today - timedelta(days=2)  # Linky up to the 12th
    daily = {last - timedelta(days=i): 30_000 for i in range(60)}
    first, end = date(2026, 1, 1), date(2026, 2, 1)
    inp = inputs(
        daily=daily,
        tariff=hchp_tariff(),
        today=today,
        weather_on=True,
        month_outlook=_outlook(today, first, end),
    )
    m = build_report(first, end, "month", inp)["projection"]["month"]
    need = (end - last - timedelta(days=1)).days  # 13th … 31st
    assert m["method"] == "weather"
    assert m["kwh"] == pytest.approx(12 * 30.0 + need * 20.0, abs=1e-3)
    w = m["weather"]
    assert (w["observed_days"], w["today"], w["forecast_days"], w["normal_days"]) == (
        1,
        True,
        7,
        need - 9,
    )
    assert w["kwh_lo"] == pytest.approx(m["actual_kwh"] + need * 20.0 - 10, abs=1e-3)
    assert w["why"] is None and w["spread"] == "full"


def test_a_missing_day_keeps_the_old_method_and_says_why():
    today = date(2026, 1, 14)
    daily = {today - timedelta(days=2 + i): 30_000 for i in range(60)}
    first, end = date(2026, 1, 1), date(2026, 2, 1)
    mo = _outlook(today, first, end, missing={date(2026, 1, 25): "no_normals"})
    inp = inputs(daily=daily, tariff=hchp_tariff(), today=today, weather_on=True, month_outlook=mo)
    m = build_report(first, end, "month", inp)["projection"]["month"]
    assert m["method"] in ("seasonal", "linear")
    assert m["weather"]["why"] == "no_normals" and m["weather"]["kwh_lo"] is None


def test_weather_off_has_no_weather_block():
    today = date(2026, 1, 14)
    inp = inputs(
        daily={today - timedelta(days=2 + i): 30_000 for i in range(60)},
        tariff=hchp_tariff(),
        today=today,
    )
    m = build_report(date(2026, 1, 1), date(2026, 2, 1), "month", inp)["projection"]["month"]
    assert m["weather"] is None


def test_a_finished_month_is_never_a_weather_projection():
    """Review ruling: on 2 November with Linky through 31 October the projected month is October,
    measured whole: no day to predict, so v0.2's method and no weather block."""
    today = date(2026, 11, 2)
    daily = {date(2026, 10, 31) - timedelta(days=i): 30_000 for i in range(60)}
    mo = _outlook(today, date(2026, 10, 1), date(2026, 12, 1))
    inp = inputs(daily=daily, tariff=hchp_tariff(), today=today, weather_on=True, month_outlook=mo)
    m = build_report(date(2026, 10, 1), date(2026, 11, 1), "month", inp)["projection"]["month"]
    assert m["key"] == "2026-10" and m["method"] in ("seasonal", "linear")
    assert m["weather"] is None
    assert m["kwh"] == pytest.approx(31 * 30.0, abs=1e-3)


def test_no_stated_price_means_no_forecast_eur():
    """Final review: a tariff but too few recent Linky days for the trailing price → `price` null,
    and the forecast days carry no € either (never € without a price stated)."""
    inp = inputs(daily={D - timedelta(days=30): 30_000}, tariff=hchp_tariff(), today=D)
    assert trailing_price(inp) is None
    v = model_euros(_view([_fday(D + timedelta(days=1), 30.0, 20.0)]), inp, trailing_price(inp))
    assert v["price"] is None and v["house"]["eur_per_c"] is None
    d = v["forecast"]["days"][0]
    assert d["eur"] is None and d["heating_eur"] is None and d["eur_why"] == "price_unknown"
    assert v["forecast"]["week"]["eur"] is None and v["forecast"]["week"]["priced_days"] == 0
