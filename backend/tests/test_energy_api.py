import json
import logging
import stat
import threading
import time
from datetime import date, datetime, timedelta
from datetime import time as dtime
from zoneinfo import ZoneInfo

import pytest
from asgi_lifespan import LifespanManager
from httpx import ASGITransport, AsyncClient

from kelvin.api.app import create_app
from kelvin.config import Settings
from kelvin.linky.fake import FakeLinkySource
from kelvin.linky.models import DailyReading, LinkyAuthError, LinkyError, day_bounds
from kelvin.overkiz.fake import FakeGateway
from tests.conftest import ManualClock, err, login

PARIS = ZoneInfo("Europe/Paris")
TOKEN = "demo-token-0123456789"
PRM = "12345678901234"


@pytest.fixture
def wall(request):
    """The runtime's wall clock: real time, or (parametrized `(hour, minute)`) today at that
    Paris time, running from there, so the simulator's seeded week never depends on the hour
    the suite runs at."""
    hm = getattr(request, "param", None)
    if hm is None:
        return time.time
    day = datetime.now(PARIS).date()
    if len(hm) == 3 and hm[2] == "midweek":
        # The simulator's weekend programmes start late (Chambre 1 heats from 20:00 on Sunday):
        # a test whose figures depend on the weekday runs on the latest Wednesday.
        day -= timedelta(days=(day.weekday() - 2) % 7)
        hm = hm[:2]
    start = datetime.combine(day, dtime(*hm), PARIS).timestamp()
    t0 = time.monotonic()
    return lambda: start + time.monotonic() - t0


# A run just after midnight (the seeded readings then fall on day edges) and one mid-afternoon.
PINNED = pytest.mark.parametrize("wall", [(0, 27), (14, 0)], indirect=True, ids=["00h27", "14h00"])


@pytest.fixture
async def api(tmp_path, wall):
    gw = FakeGateway(clock=ManualClock())
    app = create_app(
        Settings(_env_file=None, kelvin_data=tmp_path, kelvin_fake=True),
        gw,
        start_tasks=False,
        wall=wall,
    )
    async with LifespanManager(app):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://t", headers={"X-Kelvin": "1"}
        ) as c:
            await login(c)
            rt = app.state.ctx.rt
            # The simulator's first sync: 1 daily + the newest curve chunk, the month's contract
            # re-read, 4 more curve calls, then 2 extension chunks (9 of the 10 a day).
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
    assert r.status_code == 422 and r.json() == err("period_invalid")


@pytest.mark.parametrize("day", ["9999-12-31", "1999-12-31", str(date.today().replace(year=2099))])
async def test_curve_dates_out_of_range_are_french(api, day):
    c, *_ = api
    r = await c.get("/api/linky/curve", params={"date": day})
    assert r.status_code == 422 and r.json() == err("period_invalid")


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
    assert r.status_code == 422 and r.json() == err("period_invalid")
    r = await c.get("/api/energy", params={"from": "2020-01-01", "to": "2026-01-01"})
    assert r.status_code == 422 and r.json() == err("period_invalid")


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
    ("field", "value", "code"),
    [
        ("subscription_eur_month", -1.0, "price_subscription_invalid"),
        ("subscription_eur_month", float("inf"), "price_subscription_invalid"),
        ("hc_eur_kwh", -0.2, "price_hc_invalid"),
        ("hc_eur_kwh", float("nan"), "price_hc_invalid"),
        ("hp_eur_kwh", float("-inf"), "price_hp_invalid"),
        ("hp_eur_kwh", float("nan"), "price_hp_invalid"),
    ],
)
async def test_tariff_rejects_bad_prices_in_french(api, field, value, code):
    c, *_ = api
    before = (await c.get("/api/settings")).json()
    # NaN and Infinity are not JSON, but Python's parser (behind the API) accepts them.
    raw = json.dumps(tariff_body(**{field: value}))
    r = await c.put("/api/settings", content=raw, headers={"Content-Type": "application/json"})
    assert r.status_code == 422 and r.json() == err(code)
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
    rt.linky.sync.state.calls = 0  # the fixture's sync took 9 of 10: these tries need 3
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
    assert r.json()["detail"] == "MyElectricalData injoignable. Réessayez plus tard."
    rt.linky.sync.budget = rt.linky.sync.calls_today()
    r = await c.put("/api/settings/linky", json={"prm": PRM, "token": TOKEN})
    assert r.status_code == 429
    assert r.json()["detail"] == "Quota Linky du jour atteint : réessayez demain."
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


@PINNED
async def test_simulator_demo_is_plausible_over_the_seeded_week(api):
    """The demo Linky covers the simulated radiators plus a household base, every room heats."""
    c, _, rt, _ = api
    start, end = rt.linky.today() - timedelta(days=8), rt.linky.today()
    r = await c.get("/api/energy", params={"from": str(start), "to": str(end), "group": "day"})
    body = r.json()
    assert 0.4 < body["heating_share"] < 0.85
    first = min(a for a, _ in rt.recorder.energy_extent().values())
    first_day = datetime.fromtimestamp(first, PARIS).date()
    # Whole days only: the first reading's day counts when that reading opens it (just after
    # midnight the seeded hourly readings fall on day edges), else the next day.
    whole = first_day if first == day_bounds(first_day, PARIS)[0] else first_day + timedelta(days=1)
    assert body["heating_share_since"] == str(whole)
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
    assert r.json() == err("med_unreachable")


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
        "complete",
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


@pytest.mark.parametrize(
    ("wall", "coverage"),
    [((0, 27, "midweek"), 0.5), ((14, 0, "midweek"), 1.0)],
    indirect=["wall"],
    ids=["00h27", "14h00"],
)
async def test_room_stats_of_a_current_period_use_its_elapsed_part(api, coverage):
    """Review I-2: a period running into the future is judged on its elapsed part: 50 % of a
    week that is two days old would leave the stats null for days.

    Coverage counts the two elapsed days. Just after midnight yesterday is not whole yet: the
    radiators have been idle since their last counter change (about 22:00), and the time after
    a counter's last change is unknown until it changes again (never invented energy)."""
    c, _, rt, _ = api
    start = rt.linky.today() - timedelta(days=2)
    r = await c.get(
        "/api/energy",
        params={
            "from": str(start),
            "to": str(rt.linky.today()),
            "period_from": str(start),
            "period_to": str(start + timedelta(days=7)),
        },
    )
    rows = r.json()["by_radiator"]
    assert rows and all(x["temp_avg"] is not None for x in rows)
    assert all(x["heating_hours"] is not None for x in rows)
    assert all(x["coverage"] == coverage for x in rows)


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


async def test_day_detail_of_a_simulated_day(api):
    c, _, rt, _ = api
    day = today() - timedelta(days=2)
    salon = next(r.id for r in rt.house.rooms.values() if r.name == "Salon")
    r = await c.get("/api/energy/day", params={"date": str(day), "room": salon})
    body = r.json()
    assert r.status_code == 200 and body["date"] == str(day) and body["complete"] is True
    assert len(body["intervals"]) == body["points"] in (46, 48, 50)
    t = body["totals"]
    assert t["hc_kwh"] + t["hp_kwh"] == pytest.approx(t["daily_kwh"], abs=0.002)
    assert any(i["radiators_wh"] for i in body["intervals"])
    assert body["room"]["id"] == salon and body["room"]["samples"]
    assert str(day) in body["available"]


async def test_day_detail_of_an_unknown_room_is_404(api):
    c, _, _, _ = api
    r = await c.get("/api/energy/day", params={"date": str(today()), "room": "nope"})
    assert r.status_code == 404


async def test_m7_a_day_without_a_curve_splits_as_the_report_does(api):
    """No complete curve within ±15 days: the day view uses the report's fallback share, so
    the day's HC/HP is the one the report shows for it."""
    c, _, rt, _ = api
    day = today() - timedelta(days=60)
    lo = day_bounds(day - timedelta(days=20), PARIS)[0]
    hi = day_bounds(day + timedelta(days=20), PARIS)[0]
    rt.db.execute("DELETE FROM linky_curve WHERE ts >= ? AND ts < ?", (lo, hi))
    detail = (await c.get("/api/energy/day", params={"date": str(day)})).json()["totals"]
    params = {"from": str(day), "to": str(day + timedelta(days=1)), "group": "day"}
    [bucket] = (await c.get("/api/energy", params=params)).json()["buckets"]
    assert detail["split_method"] == bucket["split_method"] != "curve"
    assert (detail["hc_kwh"], detail["hp_kwh"]) == (bucket["hc_kwh"], bucket["hp_kwh"])
    assert detail["curve_kwh"] is None


async def test_l15_the_simulated_meter_is_never_below_the_radiators(api):
    c, _, _, _ = api
    for back in range(2, 7):
        day = today() - timedelta(days=back)
        body = (await c.get("/api/energy/day", params={"date": str(day)})).json()
        for i in body["intervals"]:
            if i["radiators_wh"] is not None:
                assert i["wh"] >= i["radiators_wh"] - 0.5, (day, i["ts"])


async def test_l15_the_fake_curve_is_a_base_plus_the_radiator_half_hours():
    day = date(2026, 1, 15)
    halves = [0.0] * 40 + [1500.0] * 8  # the radiators heat from 20:00 to 24:00
    src = FakeLinkySource(radiators_halfhours=lambda d: halves)
    points = await src.fetch_curve(day, day + timedelta(days=1))
    assert len(points) == 48
    assert all(p.wh >= h - 0.5 for p, h in zip(points, halves, strict=True))
    assert sum(p.wh for p in points) == pytest.approx(src.day_wh(day), abs=30)


async def test_m6_a_day_before_the_contract_start_reads_null_with_its_reason(api):
    """Batch-4 review m-6: the report counts no day before its first day (« — »); the day view
    applies the same cut instead of showing another contract's figures."""
    c, _, rt, _ = api
    start = today() - timedelta(days=10)
    rt.linky.sync.set_not_before(start)
    before = await c.get("/api/energy/day", params={"date": str(start - timedelta(days=2))})
    body = before.json()
    assert before.status_code == 200
    assert set(body["totals"].values()) == {None}
    assert body["intervals"] == [] and body["points"] == 0 and body["complete"] is False
    assert body["counted_from"] == str(start) and body["not_counted"] == "before_first_day"
    assert body["power"]["peak_w"] is None
    assert all(d >= str(start) for d in body["available"])
    params = {"from": str(start - timedelta(days=2)), "to": str(start), "group": "day"}
    assert [b["kwh"] for b in (await c.get("/api/energy", params=params)).json()["buckets"]] == [
        None,
        None,
    ]
    after = (await c.get("/api/energy/day", params={"date": str(start)})).json()
    assert after["not_counted"] is None and after["totals"]["daily_kwh"] is not None


async def test_m9_a_radiator_added_mid_day_keeps_the_meter_above_the_known_radiators():
    """Batch-4 review m-9: one radiator unknown for part of the day no longer sends the whole
    day back to the seasonal shape: every half-hour some radiator knows holds what they drew."""
    from kelvin.api.runtime import _recorded_halfhours
    from kelvin.house.model import build_house
    from kelvin.overkiz.sample import sample_house
    from kelvin.recorder.db import Database
    from kelvin.recorder.recorder import Recorder

    day = date(2026, 1, 15)
    a = day_bounds(day, PARIS)[0]
    db = Database(":memory:")
    rows = [(a + i * 1800, "x", 750.0 * i) for i in range(49)]  # x all day
    rows += [(a + 24 * 1800, "y", 10_000.0), (a + 30 * 1800, "y", 13_000.0)]  # y from noon
    db.executemany("INSERT INTO energy VALUES (?,?,?,NULL,NULL)", rows)
    halves = _recorded_halfhours(Recorder(db, build_house(*sample_house())), "Europe/Paris")(day)
    assert halves is not None and len(halves) == 48
    assert halves[:24] == [750.0] * 24 and halves[24:30] == [1250.0] * 6
    src = FakeLinkySource(radiators_halfhours=lambda d: halves)
    points = await src.fetch_curve(day, day + timedelta(days=1))
    assert all(p.wh >= h - 0.5 for p, h in zip(points, halves, strict=True) if h is not None)
    assert sum(p.wh for p in points) == pytest.approx(src.day_wh(day), abs=30)


async def test_m1_a_far_window_and_period_bucket_radiators_separately(api, monkeypatch):
    """Final review m1: each range is bounded, so the radiator half-hours must be too, never
    the years between a window and a period far apart."""
    c, _, rt, _ = api
    spans = []
    original = rt.recorder.energy_buckets

    def spy(edges, *args, **kwargs):
        spans.append((edges[-1] - edges[0]) / 86400)
        return original(edges, *args, **kwargs)

    monkeypatch.setattr(rt.recorder, "energy_buckets", spy)
    start = today() - timedelta(days=13)
    params = {
        "from": "2000-01-01",
        "to": "2004-01-01",
        "group": "year",
        "period_from": str(start),
        "period_to": str(today() + timedelta(days=1)),
    }
    r = await c.get("/api/energy", params=params)
    assert r.status_code == 200
    assert spans and max(spans) <= 4 * 366 + 1
    near = await c.get(
        "/api/energy",
        params={**params, "from": str(start), "to": str(today() + timedelta(days=1))},
    )
    assert r.json()["by_radiator"] == near.json()["by_radiator"]  # the same period figures


@pytest.mark.parametrize("wall", [(14, 0)], indirect=True)
async def test_room_stats_stop_at_the_end_of_yesterday_like_the_radiator_kwh(api, monkeypatch):
    """Batch 4 review I-4: in a running period, °C, setpoint and heating hours cover the same
    days as the radiator kWh and € beside them (elapsed days up to yesterday), not today."""
    c, _, rt, _ = api
    calls = []
    original = rt.recorder.sample_stats

    def spy(ids, start, end):
        calls.append((start, end))
        return original(ids, start, end)

    monkeypatch.setattr(rt.recorder, "sample_stats", spy)
    t = rt.linky.today()
    start = t - timedelta(days=2)
    params = {"from": str(start), "to": str(t), "period_from": str(start)}
    await c.get("/api/energy", params={**params, "period_to": str(start + timedelta(days=7))})
    assert calls == [(day_bounds(start, PARIS)[0], day_bounds(t, PARIS)[0])]
    # A period over by now ends at its own end.
    calls.clear()
    await c.get("/api/energy", params={**params, "period_to": str(start + timedelta(days=1))})
    assert calls == [(day_bounds(start, PARIS)[0], day_bounds(start, PARIS)[1])]


@pytest.mark.parametrize("wall", [(0, 27), (9, 0), (14, 0), (20, 0)], indirect=True)
async def test_a_days_radiator_euros_read_the_same_in_jour_semaine_and_mois(api):
    """Batch 4 review N-1: the radiators' € are running sums from 1 January, so the service
    loads their half-hours from there: a day reads the same € however it is asked."""
    c, _, rt, _ = api
    t = rt.linky.today()

    async def report(a: date, b: date, group: str, pa: date, pb: date) -> dict:
        params = {"from": str(a), "to": str(b), "group": group}
        params |= {"period_from": str(pa), "period_to": str(pb)}
        r = await c.get("/api/energy", params=params)
        assert r.status_code == 200
        return r.json()

    for k in range(1, 7):
        d = t - timedelta(days=k)
        nxt = d + timedelta(days=1)
        jour = (await report(d - timedelta(days=6), nxt, "day", d, nxt))["period"]["radiators"]
        week = d - timedelta(days=d.weekday())
        month = d.replace(day=1)
        month_end = (month + timedelta(days=32)).replace(day=1)
        seen = [jour["eur"]]
        # Semaine, Mois, and a window that starts on the day itself.
        for a, b in (
            (week, week + timedelta(days=7)),
            (month, month_end),
            (d, nxt + timedelta(days=6)),
        ):
            body = await report(a, b, "day", a, b)
            bucket = next(x for x in body["buckets"] if x["key"] == str(d))
            seen.append(bucket["radiators"]["eur"])
        assert jour["eur"] is not None and len(set(seen)) == 1, (d, seen)


@PINNED
async def test_a_room_s_day_reads_its_par_piece_row(api):
    """Window invariance (CLAUDE.md « Énergie figures »): a room's elapsed day is the sum of its
    radiators' rows in Énergie's Par pièce for that day (Jour), € to the cent. `days=1` is today
    alone, which the report never counts, so yesterday is `days=2` less `days=1`."""
    c, _, rt, _ = api
    day = rt.linky.today() - timedelta(days=1)
    rooms = {r.id: r.room_id for r in rt.house.radiators.values()}
    report = await c.get(
        "/api/energy",
        params={
            "from": str(day),
            "to": str(day + timedelta(days=1)),
            "group": "day",
            # Explicit: by_radiator must describe this day, not the report's default period.
            "period_from": str(day),
            "period_to": str(day + timedelta(days=1)),
        },
    )
    assert report.status_code == 200, report.text
    rows = report.json()["by_radiator"]
    for room in rt.house.rooms:
        mine = [r for r in rows if rooms.get(r["radiator_id"]) == room]
        two = (await c.get(f"/api/rooms/{room}/energy", params={"days": 2})).json()
        one = (await c.get(f"/api/rooms/{room}/energy", params={"days": 1})).json()
        assert two["from"] == str(day)
        assert mine and all(r["eur"] is not None for r in mine), room
        eur = round(sum(r["eur"] for r in mine) * 100)
        # Just after midnight, today may have nothing measured yet (null, never 0).
        today_eur, today_kwh = one["eur"] or 0.0, one["kwh"] or 0.0
        assert round(two["eur"] * 100) - round(today_eur * 100) == eur, room
        kwh = sum(r["kwh"] for r in mine)
        assert two["kwh"] - today_kwh == pytest.approx(kwh, abs=0.002 * len(mine)), room


TEMPO_RATES = {
    "blue_hc": 0.1296,
    "blue_hp": 0.1609,
    "white_hc": 0.1486,
    "white_hp": 0.1894,
    "red_hc": 0.1568,
    "red_hp": 0.7562,
}


def doc(**over):
    start = str(today() - timedelta(days=60))
    switch = str(today() - timedelta(days=30))
    return {
        "tariff": {
            "kva": 9,
            "prices": [
                {
                    "valid_from": start,
                    "option": "hchp",
                    "subscription_eur_month": 15.0,
                    "rates": {"hc": 0.2068, "hp": 0.27},
                },
                {
                    "valid_from": switch,
                    "option": "tempo",
                    "subscription_eur_month": 15.6,
                    "rates": dict(TEMPO_RATES),
                },
            ],
            "hc_schedules": [
                {
                    "valid_from": start,
                    "variants": [
                        {
                            "months": list(range(1, 13)),
                            "slots": [{"start": "22:00", "end": "06:00"}],
                        }
                    ],
                }
            ],
            "tempo_hours": {"hc_start": "22:00", "hc_end": "06:00", "day_start": "06:00"},
            **over,
        }
    }


async def test_a_v2_tariff_document_is_saved_whole_and_read_back(api):
    c, _, rt, _ = api
    rt.linky.sync.state.calls = 0  # the fixture's first sync used most of the MED day
    r = await c.put("/api/settings", json=doc())
    assert r.status_code == 200, r.text
    t = r.json()["tariff"]
    assert t["option"] == "tempo" and [p["option"] for p in t["prices"]] == ["hchp", "tempo"]
    assert t["prices"][1]["rates"] == TEMPO_RATES and t["tempo_hours"]["day_start"] == "06:00"
    assert (await c.get("/api/settings")).json()["tariff"] == t
    assert rt.scheduler.state["tempo"]["retry_at"] is not None  # colours asked for at once
    await rt.grid.tempo_job()
    g = (await c.get("/api/grid")).json()
    assert g["tempo"]["today"]["colour"] in ("blue", "white", "red")


async def test_v2_errors_carry_codes(api):
    c, _, _, _ = api
    bad = doc()
    bad["tariff"]["hc_schedules"][0]["variants"][0]["months"] = [1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12]
    r = await c.put("/api/settings", json=bad)
    assert r.status_code == 422 and r.json() == err("hc_months_missing", months=[4])
    bad = doc()
    del bad["tariff"]["prices"][1]["rates"]["red_hp"]
    r = await c.put("/api/settings", json=bad)
    assert r.status_code == 422 and r.json() == err("tariff_rates_invalid", rate="red_hp")
    bad = doc()
    bad["tariff"]["prices"][1]["rates"] = {"x" * 17: 0.2}  # a key is never echoed unbounded
    assert (await c.put("/api/settings", json=bad)).json()["code"] == "invalid_request"
    bad = doc()
    bad["tariff"]["prices"] = bad["tariff"]["prices"] * 51
    assert (await c.put("/api/settings", json=bad)).json()["code"] == "invalid_request"
    bad = doc()
    bad["tariff"]["tempo_hours"] = {"hc_start": "22:00", "hc_end": "22:00"}
    assert (await c.put("/api/settings", json=bad)).json() == err("tempo_hours_invalid")


async def test_the_v1_body_still_works_and_becomes_a_schedule(api):
    c, _, _, _ = api
    r = await c.put("/api/settings", json=tariff_body())
    assert r.status_code == 200
    t = r.json()["tariff"]
    assert t["option"] == "hchp" and t["hc_schedules"][-1]["variants"][0]["months"] == list(
        range(1, 13)
    )


async def test_tempo_prices_prefill_costs_one_call_a_week(api):
    c, _, rt, _ = api
    rt.linky.sync.state.calls = 0  # the fixture's first sync used most of the MED day
    before = rt.linky.sync.grid_calls_today()
    r = await c.post("/api/grid/tempo-prices")
    assert r.status_code == 200 and r.json()["rates"] == TEMPO_RATES
    assert r.json()["source"] == "MyElectricalData"
    assert (await c.post("/api/grid/tempo-prices")).json() == r.json()
    assert rt.linky.sync.grid_calls_today() == before + 1
    rt.db.execute("DELETE FROM settings WHERE key = 'tempo_price_prefill'")
    rt.linky.sync.budget = rt.linky.sync.calls_today()
    r = await c.post("/api/grid/tempo-prices")
    assert r.status_code == 429 and r.json() == err("med_quota")


async def test_after_a_v2_save_the_strip_follows_and_a_stale_v1_form_is_refused(api):
    c, _, rt, _ = api
    q = rt.broadcaster.subscribe()
    assert (await c.put("/api/settings", json=doc())).status_code == 200
    events = [q.get_nowait() for _ in range(q.qsize())]
    rt.broadcaster.unsubscribe(q)
    [grid] = [e for e in events if e["event"] == "grid"]
    assert json.loads(grid["data"]) == (await c.get("/api/grid")).json()
    before = (await c.get("/api/settings")).json()["tariff"]
    r = await c.put("/api/settings", json=tariff_body())  # a tab opened before the switch
    assert r.status_code == 422 and r.json() == err("tariff_form_outdated")
    assert (await c.get("/api/settings")).json()["tariff"] == before
