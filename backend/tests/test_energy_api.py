import json
import logging
import stat
import threading
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from asgi_lifespan import LifespanManager
from httpx import ASGITransport, AsyncClient

from kelvin.api.app import create_app
from kelvin.config import Settings
from kelvin.linky.fake import FakeLinkySource
from kelvin.linky.models import DailyReading, LinkyAuthError, LinkyError, day_bounds
from kelvin.overkiz.fake import FakeGateway
from tests.conftest import ManualClock, login

PARIS = ZoneInfo("Europe/Paris")
TOKEN = "demo-token-0123456789"
PRM = "12345678901234"


@pytest.fixture
async def api(tmp_path):
    gw = FakeGateway(clock=ManualClock())
    app = create_app(
        Settings(_env_file=None, kelvin_data=tmp_path, kelvin_fake=True), gw, start_tasks=False
    )
    async with LifespanManager(app):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://t", headers={"X-Kelvin": "1"}
        ) as c:
            await login(c)
            rt = app.state.ctx.rt
            # The simulator's first sync: 1 daily + 5 curve calls, then 2 extension chunks (8).
            await rt.linky.sync.run_once()
            yield c, app, rt, tmp_path


def today() -> date:
    return datetime.now(PARIS).date()


def tariff_body(**over):
    return {
        "tariff": {
            "option": "hchp",
            "kva": 6,
            "hc_slots": [{"start": "01:30", "end": "07:30"}, {"start": "12:30", "end": "14:30"}],
            "subscription_eur_month": 19.5,
            "hc_eur_kwh": 0.2068,
            "hp_eur_kwh": 0.2700,
            "valid_from": str(today()),
            **over,
        }
    }


async def test_month_report_has_linky_euros_and_radiators(api):
    c, _, rt, _ = api
    first = today().replace(day=1)
    start = (first - timedelta(days=1)).replace(day=1)
    end = (first + timedelta(days=32)).replace(day=1)
    r = await c.get("/api/energy", params={"from": str(start), "to": str(end), "group": "month"})
    assert r.status_code == 200
    body = r.json()
    assert body["linky"] is True and body["tariff"] is True
    assert body["last_day"] == str(today() - timedelta(days=1))
    last_month = body["buckets"][0]
    assert last_month["kwh"] > 0 and last_month["eur"] > last_month["subscription_eur"] > 0
    assert round(last_month["eur"], 2) == last_month["eur"]  # cents at the API boundary
    assert body["hero"]["current"]["eur"] > 0
    assert body["heating_share"] is not None and body["heating_share"] > 0
    assert {x["radiator_id"] for x in body["radiators"]} <= set(rt.house.radiators)
    assert body["projection"]["year"]["eur"] > 0


async def test_report_counts_from_the_backfill_window_not_the_old_contract_start(api):
    c, _, rt, _ = api
    # Kelvin never fetches daily data older than the backfill: those days are not "missing".
    rt.linky.sync.set_not_before(today() - timedelta(days=400))
    a, b = today() - timedelta(days=380), today() - timedelta(days=370)
    body = (await c.get("/api/energy", params={"from": str(a), "to": str(b)})).json()
    assert body["total"]["missing_days"] == 0
    assert body["total"]["subscription_eur"] is None
    # Inside the backfill window, a day without data is missing and pays its subscription.
    a, b = today() - timedelta(days=200), today() - timedelta(days=190)
    rt.db.execute("DELETE FROM linky_daily WHERE day >= ? AND day < ?", (str(a), str(b)))
    lo, hi = day_bounds(a, PARIS)[0], day_bounds(b, PARIS)[0]
    rt.db.execute("DELETE FROM linky_curve WHERE ts >= ? AND ts < ?", (lo, hi))
    body = (await c.get("/api/energy", params={"from": str(a), "to": str(b)})).json()
    assert body["total"]["missing_days"] == 10
    assert body["total"]["subscription_eur"] > 0


async def test_report_without_a_known_contract_start_uses_the_data(api):
    c, _, rt, _ = api
    rt.linky.sync.set_not_before(None)
    a, b = today() - timedelta(days=380), today() - timedelta(days=370)
    body = (await c.get("/api/energy", params={"from": str(a), "to": str(b)})).json()
    assert body["total"]["missing_days"] == 0


@pytest.mark.parametrize(
    ("start", "end"),
    [("9999-12-30", "9999-12-31"), ("1999-12-31", "2000-01-02"), ("2026-01-01", "2099-01-01")],
)
async def test_energy_dates_out_of_range_are_french(api, start, end):
    c, *_ = api
    r = await c.get("/api/energy", params={"from": start, "to": end})
    assert r.status_code == 422 and r.json() == {"detail": "Période invalide."}


@pytest.mark.parametrize("day", ["9999-12-31", "1999-12-31", str(date.today().replace(year=2099))])
async def test_curve_dates_out_of_range_are_french(api, day):
    c, *_ = api
    r = await c.get("/api/linky/curve", params={"date": day})
    assert r.status_code == 422 and r.json() == {"detail": "Période invalide."}


async def test_curve_of_a_day(api):
    c, *_ = api
    day = today() - timedelta(days=1)
    body = (await c.get("/api/linky/curve", params={"date": str(day)})).json()
    a, b = day_bounds(day, PARIS)
    assert len(body["points"]) == (b - a) // 1800 and body["complete"] is True
    assert body["hc_kwh"] + body["hp_kwh"] == pytest.approx(body["kwh"], abs=0.01)
    assert all(0 <= p["offpeak"] <= 1 for p in body["points"])
    assert str(day) in body["available"]


async def test_curve_available_reaches_the_oldest_stored_day(api):
    c, _, rt, _ = api
    old = today() - timedelta(days=500)
    rt.linky.store.upsert_curve(await FakeLinkySource().fetch_curve(old, old + timedelta(days=1)))
    body = (await c.get("/api/linky/curve", params={"date": str(old)})).json()
    assert body["complete"] is True
    assert body["available"][0] == str(old)


async def test_invalid_period_is_french(api):
    c, *_ = api
    r = await c.get("/api/energy", params={"from": "2026-10-10", "to": "2026-10-01"})
    assert r.status_code == 422 and r.json() == {"detail": "Période invalide."}
    r = await c.get("/api/energy", params={"from": "2020-01-01", "to": "2026-01-01"})
    assert r.status_code == 422 and r.json() == {"detail": "Période invalide."}


async def test_tariff_settings_round_trip(api):
    c, *_ = api
    body = (await c.get("/api/settings")).json()
    assert body["tariff"]["option"] == "hchp"  # the simulator's demo tariff
    new = tariff_body()
    r = await c.put("/api/settings", json=new)
    assert r.status_code == 200
    t = r.json()["tariff"]
    assert t["kva"] == 6 and t["prices"][-1]["hc_eur_kwh"] == 0.2068
    assert len(t["prices"]) == 2  # the demo prices stay as history
    bad = tariff_body(
        hc_slots=[{"start": "22:00", "end": "06:00"}, {"start": "05:00", "end": "07:00"}]
    )
    r = await c.put("/api/settings", json=bad)
    assert (
        r.status_code == 422 and r.json()["detail"] == "Les plages d’heures creuses se chevauchent."
    )
    r = await c.put("/api/settings", json=tariff_body(kva=11))
    assert r.json()["detail"] == "Puissance souscrite inconnue."


@pytest.mark.parametrize("kva", [0, -3])
async def test_tariff_rejects_a_non_positive_power(api, kva):
    c, *_ = api
    r = await c.put("/api/settings", json=tariff_body(kva=kva))
    assert r.status_code == 422 and r.json()["detail"] == "Puissance souscrite inconnue."


@pytest.mark.parametrize(
    ("field", "value", "detail"),
    [
        ("subscription_eur_month", -1.0, "Prix de l’abonnement invalide."),
        ("subscription_eur_month", float("inf"), "Prix de l’abonnement invalide."),
        ("hc_eur_kwh", -0.2, "Prix du kWh en heures creuses invalide."),
        ("hc_eur_kwh", float("nan"), "Prix du kWh en heures creuses invalide."),
        ("hp_eur_kwh", float("-inf"), "Prix du kWh en heures pleines invalide."),
        ("hp_eur_kwh", float("nan"), "Prix du kWh en heures pleines invalide."),
    ],
)
async def test_tariff_rejects_bad_prices_in_french(api, field, value, detail):
    c, *_ = api
    before = (await c.get("/api/settings")).json()
    # NaN and Infinity are not JSON, but Python's parser (behind the API) accepts them.
    raw = json.dumps(tariff_body(**{field: value}))
    r = await c.put("/api/settings", content=raw, headers={"Content-Type": "application/json"})
    assert r.status_code == 422 and r.json() == {"detail": detail}
    assert (await c.get("/api/settings")).json() == before


async def test_bad_slot_time_is_french(api):
    c, *_ = api
    r = await c.put(
        "/api/settings", json=tariff_body(hc_slots=[{"start": "25:00", "end": "06:00"}])
    )
    assert r.status_code == 422 and r.json()["detail"].startswith("Heure invalide")


async def test_mutating_settings_need_the_kelvin_header(api):
    c, *_ = api
    r = await c.put("/api/settings", json=tariff_body(), headers={"X-Kelvin": "0"})
    assert r.status_code == 403
    r = await c.put(
        "/api/settings/linky", json={"prm": PRM, "token": TOKEN}, headers={"X-Kelvin": "0"}
    )
    assert r.status_code == 403


async def test_linky_token_is_write_only(api, caplog):
    c, app, rt, tmp = api
    rt.linky.sync.budget = 20  # the first sync spent 8 of the 10 daily calls
    caplog.set_level(logging.DEBUG)
    spent = rt.linky.sync.calls_today()
    woken = []
    rt.linky.sync.wake = lambda: woken.append(1)
    r = await c.put("/api/settings/linky", json={"prm": PRM, "token": TOKEN})
    assert r.status_code == 200, r.text
    assert rt.linky.sync.calls_today() == spent + 2  # valid_access + contracts, in the budget
    assert woken  # the sync is woken, not run inline
    body = r.json()
    assert body["prm"] == PRM and body["token_set"] is True and "token" not in body
    assert TOKEN not in r.text and TOKEN not in (await c.get("/api/settings/linky")).text
    assert (await c.get("/api/settings")).json()["prefill"]["kva"] == 9  # from the contract
    path = tmp / "account.json"
    assert TOKEN in path.read_text() and stat.S_IMODE(path.stat().st_mode) == 0o600
    assert TOKEN not in "\n".join(app.state.ctx.db.conn.iterdump())
    rt.linky.store.upsert_daily([DailyReading(today() - timedelta(days=1), 1234)])
    r = await c.put("/api/settings/linky", json={"prm": PRM})  # keeps the token
    assert r.status_code == 200
    assert rt.linky.store.daily()  # same PDL: the data stays
    assert TOKEN in path.read_text()
    assert TOKEN not in caplog.text and PRM not in caplog.text


async def test_linky_settings_errors_are_french(api, caplog):
    c, _, rt, _ = api
    caplog.set_level(logging.DEBUG)
    r = await c.put("/api/settings/linky", json={"prm": PRM})
    assert r.status_code == 422 and r.json()["detail"] == "Collez le jeton MyElectricalData."
    refused = FakeLinkySource()
    refused.fail["check"] = LinkyAuthError("HTTP 401")
    rt.linky.make_source = lambda prm, token: refused
    r = await c.put("/api/settings/linky", json={"prm": PRM, "token": TOKEN})
    assert (
        r.status_code == 422 and r.json()["detail"] == "MyElectricalData refuse ce PDL ou ce jeton."
    )
    refused.fail["check"] = LinkyError("HTTP 500")
    r = await c.put("/api/settings/linky", json={"prm": PRM, "token": TOKEN})
    assert r.status_code == 503
    assert r.json()["detail"] == "MyElectricalData injoignable, réessayez plus tard."
    rt.linky.sync.budget = rt.linky.sync.calls_today()
    r = await c.put("/api/settings/linky", json={"prm": PRM, "token": TOKEN})
    assert r.status_code == 429
    assert r.json()["detail"] == "Quota Linky du jour atteint : réessayez demain."
    r = await c.put("/api/settings/linky", json={"prm": "123", "token": TOKEN})
    assert r.status_code == 422 and r.json()["detail"] == "Le PDL compte 14 chiffres."
    arabic = "\u0661" * 14  # Unicode digits that are not ASCII
    r = await c.put("/api/settings/linky", json={"prm": arabic, "token": TOKEN})
    assert r.status_code == 422 and r.json()["detail"] == "Le PDL compte 14 chiffres."
    assert rt.linky.prm != PRM  # nothing refused was kept
    assert TOKEN not in caplog.text and PRM not in caplog.text


async def test_a_new_pdl_forgets_the_old_one(api):
    c, _, rt, _ = api
    sync = rt.linky.sync
    sync.budget = 20
    assert rt.linky.store.daily() and rt.linky.store.curve()  # the simulator's PDL
    sync.state.tries["curve:2020-01-01"] = 3
    sync.set_not_before(date(2024, 5, 1))
    rt.linky.tariffs.db.set_setting("tariff_prefill", {"kva": 3, "hc_slots": []})
    tariff = rt.linky.tariffs.get()
    spent = sync.calls_today()
    r = await c.put("/api/settings/linky", json={"prm": PRM, "token": TOKEN})
    assert r.status_code == 200, r.text
    assert rt.linky.store.daily() == {} and rt.linky.store.curve() == {}
    assert sync.state.tries == {} and sync.state.last_ok_at is None
    assert sync.state.not_before == "2020-01-01"  # the new contract's start, not the old one
    assert rt.linky.tariffs.prefill()["kva"] == 9  # the new contract's prefill
    assert rt.linky.tariffs.get() == tariff  # the user's tariff is kept
    assert sync.calls_today() == spent + 2  # the budget is not reset


async def test_a_refused_new_pdl_keeps_the_old_data(api):
    c, _, rt, _ = api
    refused = FakeLinkySource()
    refused.fail["check"] = LinkyAuthError("HTTP 401")
    rt.linky.make_source = lambda prm, token: refused
    r = await c.put("/api/settings/linky", json={"prm": PRM, "token": TOKEN})
    assert r.status_code == 422
    assert rt.linky.store.daily()


async def test_status_reports_linky(api):
    c, *_ = api
    assert (await c.get("/api/status")).json()["linky"] == "ok"


async def test_failed_start_closes_the_linky_source(tmp_path, monkeypatch):
    from kelvin.api import runtime

    closed = []

    class Tracked(FakeLinkySource):
        async def aclose(self) -> None:
            closed.append(1)

    def boom(self):
        raise RuntimeError("boom")

    monkeypatch.setattr(runtime, "make_linky_source", lambda settings, **_: lambda p, t: Tracked())
    monkeypatch.setattr(runtime.LinkyService, "seed_demo_tariff", boom)
    with pytest.raises(RuntimeError):
        await runtime.start_runtime(
            Settings(_env_file=None, kelvin_data=tmp_path, kelvin_fake=True),
            FakeGateway(clock=ManualClock()),
            start_tasks=False,
        )
    assert closed == [1]


async def test_real_runtime_without_linky_config_is_off(tmp_path):
    from kelvin.api.runtime import start_runtime, stop_runtime

    rt = await start_runtime(
        Settings(_env_file=None, kelvin_data=tmp_path, kelvin_fake=False),
        FakeGateway(clock=ManualClock()),
        start_tasks=False,
    )
    try:
        assert rt.linky is not None and rt.linky.status()["state"] == "off"
        assert rt.linky.tariffs.get() is None  # no demo tariff outside the simulator
    finally:
        await stop_runtime(rt)


async def test_simulator_demo_is_plausible_over_the_seeded_week(api):
    """The demo Linky covers the simulated radiators plus a household base, every room heats."""
    c, _, rt, _ = api
    start, end = today() - timedelta(days=8), today()
    r = await c.get("/api/energy", params={"from": str(start), "to": str(end), "group": "day"})
    body = r.json()
    assert 0.4 < body["heating_share"] < 0.85
    first = rt.recorder.first_energy_ts(list(rt.house.radiators))
    first_day = datetime.fromtimestamp(first, PARIS).date()
    assert body["heating_share_since"] == str(first_day + timedelta(days=1))  # whole days only
    assert (
        next(b for b in body["buckets"] if b["key"] == str(first_day - timedelta(days=1)))[
            "radiators_kwh"
        ]
        is None
    )  # before the recorder: unknown, not 0
    # The simulator never builds a network client.
    assert isinstance(rt.gateway, FakeGateway)
    assert isinstance(rt.linky.sync.source, FakeLinkySource)
    for b in body["buckets"]:
        if b["radiators_kwh"] is not None and b["kwh"] is not None:
            assert b["radiators_kwh"] < b["kwh"]  # the meter sees the radiators and the rest
    by_id = {x["radiator_id"]: x["kwh"] for x in body["radiators"]}
    for room_id in rt.house.rooms:
        rads = rt.house.room_radiators(room_id)
        if rads:
            assert sum(by_id.get(x.id) or 0.0 for x in rads) > 0, room_id
    assert all(by_id.get(rid, 0.0) > 0 for rid in rt.house.radiators)


async def test_a_non_object_med_answer_is_a_french_503(api):
    import httpx

    from kelvin.linky.med import MedSource

    c, _, rt, _ = api
    client = httpx.AsyncClient(
        transport=httpx.MockTransport(lambda req: httpx.Response(200, json=[1, 2])),
        base_url="https://med.test",
    )
    rt.linky.make_source = lambda prm, tok: MedSource(prm, tok, client=client)
    r = await c.put("/api/settings/linky", json={"prm": PRM, "token": TOKEN})
    assert r.status_code == 503
    assert r.json() == {"detail": "MyElectricalData injoignable, réessayez plus tard."}


async def test_radiator_energy_keeps_its_shape_and_adds_the_flags(api):
    c, _, rt, _ = api
    end = datetime.now(PARIS).replace(minute=0, second=0, microsecond=0)
    start = end - timedelta(days=2)
    r = await c.get(
        "/api/energy/radiators",
        params={"start": start.timestamp(), "end": end.timestamp(), "group": "day"},
    )
    rows = r.json()
    assert rows, "the simulator seeds a week of readings"
    assert set(rows[0]) == {
        "bucket",
        "radiator_id",
        "kwh",
        "t1_kwh",
        "t2_kwh",
        "interpolated",
        "apportioned",
    }
    assert {x["radiator_id"] for x in rows} <= set(rt.house.radiators)
    assert all(x["kwh"] >= 0 for x in rows)


async def test_radiator_energy_and_the_report_run_off_the_event_loop(api, monkeypatch):
    """Bucketing years of readings takes time: it must not block every other request."""
    c, _, rt, _ = api
    loop_thread = threading.get_ident()
    seen: list[int] = []

    def spy(fn):
        def call(*args, **kwargs):
            seen.append(threading.get_ident())
            return fn(*args, **kwargs)

        return call

    monkeypatch.setattr(rt.recorder, "radiator_energy", spy(rt.recorder.radiator_energy))
    monkeypatch.setattr(rt.linky, "report", spy(rt.linky.report))
    end = datetime.now(PARIS).replace(minute=0, second=0, microsecond=0)
    p = {"start": (end - timedelta(days=2)).timestamp(), "end": end.timestamp()}
    assert (await c.get("/api/energy/radiators", params=p)).status_code == 200
    p = {"from": str(today() - timedelta(days=7)), "to": str(today())}
    assert (await c.get("/api/energy", params=p)).status_code == 200
    assert len(seen) == 2 and loop_thread not in seen


async def test_energy_accepts_week_and_a_selected_period(api):
    c, _, _, _ = api
    last = today() - timedelta(days=1)
    start = last - timedelta(days=last.weekday() + 21)
    r = await c.get(
        "/api/energy",
        params={"from": str(start), "to": str(today()), "group": "week", "focus": str(start)},
    )
    body = r.json()
    assert r.status_code == 200 and body["group"] == "week"
    assert body["period"]["from"] == str(start)
    assert body["period"]["to"] == str(start + timedelta(days=7))
    r = await c.get(
        "/api/energy",
        params={
            "from": str(start),
            "to": str(today()),
            "period_from": str(start),
            "period_to": str(start + timedelta(days=3)),
        },
    )
    assert r.json()["period"]["days"] == 3


@pytest.mark.parametrize(
    "params",
    [
        {"period_from": "2026-10-01"},
        {"period_from": "2026-10-05", "period_to": "2026-10-01"},
        {"focus": "2026-09-10", "period_from": "2026-09-01", "period_to": "2026-09-30"},
    ],
)
async def test_an_invalid_selected_period_is_french(api, params):
    c, _, _, _ = api
    r = await c.get("/api/energy", params={"from": "2026-09-01", "to": "2026-10-01", **params})
    assert r.status_code == 422 and r.json()["detail"] == "Période invalide."


async def test_by_radiator_covers_the_selected_period_with_rooms_and_room_stats(api):
    c, _, rt, _ = api
    day = today() - timedelta(days=2)
    r = await c.get(
        "/api/energy",
        params={"from": str(day - timedelta(days=6)), "to": str(today()), "focus": str(day)},
    )
    body = r.json()
    assert (body["period"]["from"], body["period"]["to"]) == (
        str(day),
        str(day + timedelta(days=1)),
    )
    rows = {x["radiator_id"]: x for x in body["by_radiator"]}
    assert set(rows) == set(rt.house.radiators)
    for rid, row in rows.items():
        assert row["room_id"] == rt.house.radiators[rid].room_id
        assert row["kwh"] is not None and row["coverage"] == 1.0
        assert row["temp_avg"] is not None and row["heating_hours"] is not None
    assert body["heating"]["days"] == 1 and body["heating"]["inconsistent"] is False


async def test_the_report_loads_only_the_linky_rows_it_needs(api, monkeypatch):
    """No unbounded query: the window, the period and 400 days of look-back at most."""
    c, _, rt, _ = api
    calls = []
    for name in ("daily", "curve"):
        original = getattr(rt.linky.store, name)

        def spy(start=None, end=None, _original=original):
            calls.append((start, end))
            return _original(start, end)

        monkeypatch.setattr(rt.linky.store, name, spy)
    start = today() - timedelta(days=7)
    await c.get("/api/energy", params={"from": str(start), "to": str(today())})
    assert len(calls) == 2
    assert all(a is not None and b is not None and (b - a).days <= 7 + 400 + 1 for a, b in calls)


async def test_room_stats_of_a_current_period_use_its_elapsed_part(api):
    """Review I-2: a period running into the future is judged on its elapsed part: 50 % of a
    week that is two days old would leave the stats null for days."""
    c, _, rt, _ = api
    start = today() - timedelta(days=2)
    r = await c.get(
        "/api/energy",
        params={
            "from": str(start),
            "to": str(today()),
            "period_from": str(start),
            "period_to": str(start + timedelta(days=7)),
        },
    )
    rows = r.json()["by_radiator"]
    assert rows and all(x["temp_avg"] is not None for x in rows)
    assert all(x["heating_hours"] is not None for x in rows)
    assert all(x["coverage"] == 1.0 for x in rows)


async def test_the_default_period_is_the_unit_of_the_last_linky_day(api):
    """Review M-1: one definition of the default period, the same as the hero's."""
    c, _, _, _ = api
    r = await c.get(
        "/api/energy",
        params={"from": str(today() - timedelta(days=40)), "to": str(today()), "group": "week"},
    )
    body = r.json()
    assert body["period"]["from"] == body["hero"]["current"]["from"]


async def test_comparisons_load_the_years_they_compare_with(api):
    """The default year period starts on 1 January: last year and the four previous years
    are further back than the projection's look-back, and must be loaded all the same."""
    c, _, rt, _ = api
    rt.linky.sync.set_not_before(None)
    first = today().replace(month=1, day=1).replace(year=today().year - 4)
    n = (today() - first).days
    rt.linky.store.upsert_daily([DailyReading(first + timedelta(days=i), 10_000) for i in range(n)])
    body = (
        await c.get(
            "/api/energy",
            params={"from": str(today() - timedelta(days=7)), "to": str(today()), "group": "year"},
        )
    ).json()
    comparison = body["comparison"]
    assert comparison["last_year"]["comparable"] is True
    assert comparison["avg4"]["units"] == 4


async def test_last_year_counts_once_kelvin_has_stored_it(api):
    """After a year of running, the store holds days older than the backfill window: they are
    data (Kelvin fetched them), so last year's comparison and the seasonal projection use them."""
    c, _, rt, _ = api
    rt.linky.sync.set_not_before(today() - timedelta(days=900))
    first = today() - timedelta(days=500)
    rt.linky.store.upsert_daily(
        [DailyReading(first + timedelta(days=i), 10_000) for i in range(140)]
    )
    body = (
        await c.get(
            "/api/energy",
            params={"from": str(today() - timedelta(days=7)), "to": str(today()), "group": "month"},
        )
    ).json()
    assert body["comparison"]["last_year"]["comparable"] is True
    assert body["linky_since"] == str(first)
