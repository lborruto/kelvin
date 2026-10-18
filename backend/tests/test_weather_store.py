"""The weather store (spec §5): what is written, what is frozen, what is kept."""

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from kelvin.recorder.db import Database
from kelvin.weather.dju import expected_hours
from kelvin.weather.models import AROME_HD, ERA5_LAND, Hour
from kelvin.weather.store import DAILY_KEEP_DAYS, HOURLY_KEEP_S, WeatherStore

PARIS = ZoneInfo("Europe/Paris")
NOW = datetime(2026, 11, 20, 14, 10, tzinfo=PARIS).timestamp()


def ts(y, mo, d, h=0):
    return int(datetime(y, mo, d, h, tzinfo=PARIS).timestamp())


def day_hours(day: date, t: float, model=AROME_HD, skip=()):
    a = ts(day.year, day.month, day.day)
    return [
        Hour(a + 3600 * i, t, t - 2, 80.0, model)
        for i in range(expected_hours(day, PARIS))
        if i not in skip
    ]


def store(tmp_path) -> WeatherStore:
    return WeatherStore(Database(tmp_path / "k.db"), PARIS)


def test_ingest_builds_past_days_only(tmp_path):
    s = store(tmp_path)
    days = s.ingest(
        day_hours(date(2026, 11, 19), 6.0) + day_hours(date(2026, 11, 20), 9.0), NOW, replace=True
    )
    assert days == {date(2026, 11, 19), date(2026, 11, 20)}
    d = s.daily(date(2026, 11, 19), date(2026, 11, 21))
    assert list(d) == [date(2026, 11, 19)]  # today is never a daily row
    assert d[date(2026, 11, 19)].dju == 12.0 and not d[date(2026, 11, 19)].final
    future = [h for h in s.hours(ts(2026, 11, 20), ts(2026, 11, 21)) if h.forecast]
    assert future and min(h.ts for h in future) == ts(2026, 11, 20, 15)  # the current hour is past


def test_incomplete_day_has_no_figures(tmp_path):
    s = store(tmp_path)
    s.ingest(day_hours(date(2026, 11, 10), 6.0, skip=(1, 2, 3)), NOW, replace=False)
    w = s.daily(date(2026, 11, 10), date(2026, 11, 11))[date(2026, 11, 10)]
    assert w.hours == 21 and w.tmean is None and w.dju is None
    assert s.missing_days(date(2026, 11, 9), date(2026, 11, 12)) == [
        date(2026, 11, 9),
        date(2026, 11, 10),
        date(2026, 11, 11),
    ]


def test_backfill_never_replaces_and_forecast_replaces_only_recent_hours(tmp_path):
    s = store(tmp_path)
    old, recent = date(2026, 11, 10), date(2026, 11, 19)
    s.ingest(day_hours(old, 6.0) + day_hours(recent, 6.0), NOW, replace=False)
    s.ingest(day_hours(old, 1.0, ERA5_LAND), NOW, replace=False)  # backfill: ignored
    s.ingest(day_hours(old, 1.0), NOW, replace=True)  # older than 72 h: frozen
    s.ingest(day_hours(recent, 8.0), NOW, replace=True)  # within 72 h: replaced
    d = s.daily(old, recent + timedelta(days=1))
    assert d[old].tmean == 6.0 and d[old].final and d[old].model == AROME_HD
    assert d[recent].tmean == 8.0


def test_forecast_values_never_freeze_into_history(tmp_path):
    s = store(tmp_path)
    day = date(2026, 11, 12)
    then = ts(2026, 11, 11, 12)  # fetched when the 12th was the future
    s.ingest(day_hours(day, 15.0), then, replace=True)
    assert all(h.forecast for h in s.hours(ts(2026, 11, 12), ts(2026, 11, 13)))
    assert day in s.missing_days(day, day + timedelta(days=1))  # still a forecast: to be fetched
    s.ingest(day_hours(day, 7.0), NOW, replace=False)  # the backfill replaces forecast rows
    w = s.daily(day, day + timedelta(days=1))[day]
    assert w.tmean == 7.0 and w.final
    assert day not in s.missing_days(day, day + timedelta(days=1))


def test_final_days_are_never_rebuilt(tmp_path):
    s = store(tmp_path)
    day = date(2026, 11, 1)
    s.ingest(day_hours(day, 6.0), NOW, replace=False)
    s.db.execute("DELETE FROM weather_hourly")  # as if pruned
    s.ingest(day_hours(day, 1.0, skip=(0,)), NOW, replace=False)
    assert s.daily(day, day + timedelta(days=1))[day].tmean == 6.0


def test_old_hours_build_daily_rows_without_being_stored(tmp_path):
    s = store(tmp_path)
    day = date(2025, 6, 1)  # beyond the 400-day hourly retention
    s.ingest(day_hours(day, 20.0, ERA5_LAND), NOW, replace=False)
    assert s.hours(ts(2025, 6, 1), ts(2025, 6, 2)) == []
    w = s.daily(day, day + timedelta(days=1))[day]
    assert w.tmean == 20.0 and w.dju == 0.0 and w.model == ERA5_LAND


def test_prune_and_clear_work_in_batches(tmp_path):
    s = store(tmp_path)
    s.ingest(day_hours(date(2026, 11, 18), 6.0), NOW, replace=False)
    s.db.execute(
        "INSERT INTO weather_daily VALUES (?, 1, 2, 1.5, 16.5, 24, 24, 'era5_land', 1)",
        ((date(2026, 11, 20) - timedelta(days=DAILY_KEEP_DAYS + 1)).isoformat(),),
    )
    s.db.execute(
        "INSERT INTO weather_hourly VALUES (?, 1, NULL, NULL, 'arome_hd', 0, 0)",
        (int(NOW - HOURLY_KEEP_S - 3600),),
    )
    assert s.prune(NOW) == 2
    assert s.coverage()["first_day"] == "2026-11-18"
    assert s.clear() > 0 and s.coverage() is None


def test_a_forecast_hour_never_completes_a_past_day(tmp_path):
    s = store(tmp_path)
    day = date(2026, 11, 12)
    s.ingest(day_hours(day, 15.0), ts(2026, 11, 11, 12), replace=True)  # all forecast values
    s.ingest(day_hours(day, 7.0)[:1], NOW, replace=False)  # one real hour arrives
    w = s.daily(day, day + timedelta(days=1))[day]
    assert w.hours == 1 and w.tmean is None and w.dju is None and not w.final
    assert day in s.missing_days(day, day + timedelta(days=1))


def test_days_the_forecast_filled_become_final_after_the_freeze_window(tmp_path):
    s = store(tmp_path)
    day = date(2026, 11, 18)
    s.ingest(day_hours(day, 6.0), NOW, replace=True)  # the forecast job, two days later
    assert not s.daily(day, day + timedelta(days=1))[day].final
    assert s.finalise(NOW) == 0  # not yet 72 h after the day ended
    later = ts(2026, 11, 22, 4)
    assert s.finalise(later) == 1
    w = s.daily(day, day + timedelta(days=1))[day]
    assert w.final and w.tmean == 6.0
    s.db.execute("DELETE FROM weather_hourly")  # a final day never changes again
    s.ingest(day_hours(day, 1.0)[:3], later, replace=True)
    assert s.daily(day, day + timedelta(days=1))[day].tmean == 6.0


def test_finalise_keeps_a_day_whose_hours_are_gone(tmp_path):
    s = store(tmp_path)
    day = date(2026, 11, 18)
    s.ingest(day_hours(day, 6.0), NOW, replace=True)
    s.db.execute("DELETE FROM weather_hourly")  # as if pruned
    assert s.finalise(ts(2026, 11, 25)) == 0
    w = s.daily(day, day + timedelta(days=1))[day]
    assert w.tmean == 6.0 and not w.final
