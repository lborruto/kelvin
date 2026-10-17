"""Spec §6.2: each bucket's outdoor block over elapsed days; the comparison's weather row."""

from datetime import date, timedelta
from zoneinfo import ZoneInfo

from kelvin.billing.report import ReportInputs, build_report
from kelvin.weather.models import AROME_HD, DayWeather
from tests.mcp_helpers import kelvin_app

PARIS = ZoneInfo("Europe/Paris")
TODAY = date(2026, 11, 20)


def wday(d: date, t: float) -> DayWeather:
    return DayWeather(d, t - 3, t + 3, t, max(0.0, 18 - t), 24, 24, AROME_HD, True)


def inputs(weather_on=True, skip=()):
    days = [
        date(2025, 1, 1) + timedelta(days=i) for i in range((TODAY - date(2025, 1, 1)).days + 1)
    ]
    return ReportInputs(
        daily_wh={d: 12_000 for d in days if d < TODAY},
        curve={},
        tariff=None,
        tz=PARIS,
        today=TODAY,
        first_day=date(2025, 1, 1),
        outdoor={d: wday(d, 6.0) for d in days if d < TODAY and d not in skip},
        weather_on=weather_on,
    )


def test_bucket_dju_is_null_unless_every_day_has_weather():
    r = build_report(date(2026, 11, 1), date(2026, 12, 1), "day", inputs(skip={date(2026, 11, 5)}))
    by = {b["key"]: b for b in r["buckets"]}
    assert by["2026-11-04"]["outdoor"] == {
        "mean_c": 6.0,
        "min_c": 3.0,
        "max_c": 9.0,
        "dju": 12.0,
        "days": 1,
        "of": 1,
    }
    assert by["2026-11-05"]["outdoor"]["dju"] is None and by["2026-11-05"]["outdoor"]["days"] == 0
    assert by["2026-11-20"]["outdoor"] is None  # today: no elapsed day
    total = r["total"]["outdoor"]
    assert (total["days"], total["of"], total["dju"], total["mean_c"]) == (18, 19, None, 6.0)


def test_a_week_sums_its_days():
    r = build_report(date(2026, 11, 2), date(2026, 11, 16), "week", inputs())
    assert [b["outdoor"]["dju"] for b in r["buckets"]] == [84.0, 84.0]


def test_off_means_null_everywhere():
    r = build_report(date(2026, 11, 1), date(2026, 12, 1), "day", inputs(weather_on=False))
    assert all(b["outdoor"] is None for b in r["buckets"]) and r["total"]["outdoor"] is None
    assert r["comparison"]["last_year"]["weather"] is None


def test_comparison_rows_carry_their_weather_row():
    r = build_report(
        date(2026, 10, 1),
        date(2026, 11, 1),
        "month",
        inputs(),
        (date(2026, 10, 1), date(2026, 11, 1)),
    )
    row = r["comparison"]["last_year"]["weather"]
    assert row["change"] is None and row["why"] == "few_heating_days"  # a flat 6 °C: no spread
    assert "weather" not in (r["comparison"]["avg4"] or {})


def test_weather_changes_no_other_figure():
    a = build_report(date(2026, 1, 1), date(2027, 1, 1), "month", inputs(weather_on=False))
    b = build_report(date(2026, 1, 1), date(2027, 1, 1), "month", inputs(weather_on=True))

    def strip(x):
        if isinstance(x, dict):
            return {k: strip(v) for k, v in x.items() if k not in ("outdoor", "weather")}
        if isinstance(x, list):
            return [strip(v) for v in x]
        return x

    assert strip(a) == strip(b)


async def test_the_api_report_has_outdoor_once_weather_is_fetched(tmp_path):
    async with kelvin_app(tmp_path) as (c, app):
        rt = app.state.ctx.rt
        await rt.weather.forecast_job()
        await rt.weather.backfill_job()
        r = (await c.get("/api/energy?from=2026-11-01&to=2026-12-01&group=day")).json()
        b = next(b for b in r["buckets"] if b["key"] == "2026-11-10")
        assert b["outdoor"]["dju"] is not None and b["outdoor"]["days"] == 1
        ly = r["comparison"]["last_year"]
        assert ly is None or "weather" in ly
