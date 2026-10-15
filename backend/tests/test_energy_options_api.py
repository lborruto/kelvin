"""The Énergie API under a stored Tempo or Base row (spec §2.2): every route answers, and each
figure is the one an independent computation gives (review of batch 2, Important 2)."""

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from asgi_lifespan import LifespanManager
from httpx import ASGITransport, AsyncClient

from kelvin.api.app import create_app
from kelvin.billing.slots import Slot
from kelvin.billing.tariff import ALL_MONTHS, HcSchedule, HcVariant, PriceRow, Prices, Tariff
from kelvin.config import Settings
from kelvin.overkiz.fake import FakeGateway
from tests.conftest import ManualClock, login

PARIS = ZoneInfo("Europe/Paris")
NOW = datetime(2026, 11, 20, 14, 0, tzinfo=PARIS).timestamp()
TEMPO = {
    "blue_hc": 0.1296,
    "blue_hp": 0.1609,
    "white_hc": 0.1486,
    "white_hp": 0.1894,
    "red_hc": 0.1568,
    "red_hp": 0.7562,
}
HCHP = Prices(date(2026, 1, 1), 15.0, 0.2, 0.27)
SWITCH = date(2026, 11, 1)
UNKNOWN = date(2026, 11, 10)  # its colour is not published
COLOURS = {
    date(2026, 9, 1) + timedelta(days=i): ("blue", "white", "red")[i % 3]
    for i in range(90)
    if date(2026, 9, 1) + timedelta(days=i) != UNKNOWN
}


def tempo_switch() -> Tariff:
    return Tariff.build(
        9,
        [HCHP, PriceRow.make(SWITCH, "tempo", 15.6, TEMPO)],
        [HcSchedule(date(2026, 1, 1), (HcVariant(ALL_MONTHS, (Slot("22:00", "06:00"),)),))],
    )


@pytest.fixture
async def api(tmp_path):
    app = create_app(
        Settings(_env_file=None, kelvin_data=tmp_path, kelvin_fake=True),
        FakeGateway(clock=ManualClock()),
        start_tasks=False,
        wall=lambda: NOW,
    )
    async with LifespanManager(app):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://t", headers={"X-Kelvin": "1"}
        ) as c:
            await login(c)
            rt = app.state.ctx.rt
            await rt.linky.sync.run_once()
            store, source = rt.linky.sync.store, rt.linky.sync.source
            day = date(2026, 8, 20)
            while day < date(2026, 11, 20):
                end = min(day + timedelta(days=7), date(2026, 11, 20))
                store.upsert_curve(await source.fetch_curve(day, end))
                day = end
            rt.linky.colours = lambda a, b: {d: c for d, c in COLOURS.items() if a <= d < b}
            yield c, rt


def expected_eur(rt, day: date) -> float | None:
    """The day's energy € from scratch: each half-hour's key by its own wall clock (HC 22–06,
    the Tempo day before 06:00 is the previous date), scaled to the daily reading."""
    points = rt.linky.store.curve(day, day + timedelta(days=1))[day]
    daily = rt.linky.store.daily(day, day + timedelta(days=1))[day]
    scale = daily / sum(p.wh for p in points)
    total = 0.0
    for p in points:
        local = datetime.fromtimestamp(p.ts, PARIS)
        hc = local.hour < 6 or local.hour >= 22
        if day < SWITCH:
            rate = HCHP.rate("hc" if hc else "hp")
        else:
            colour = COLOURS.get(day - timedelta(days=1) if local.hour < 6 else day)
            if colour is None:
                return None
            rate = TEMPO[f"{colour}_{'hc' if hc else 'hp'}"]
        total += p.wh * scale / 1000 * rate
    return total


async def test_a_stored_tempo_row_prices_every_route(api):
    c, rt = api
    rt.linky.tariffs.replace(tempo_switch())
    r = await c.get(
        "/api/energy", params={"from": "2026-10-01", "to": "2026-12-01", "group": "day"}
    )
    assert r.status_code == 200, r.text
    buckets = {b["key"]: b for b in r.json()["buckets"]}
    checked = 0
    for d in (date(2026, 10, 1) + timedelta(days=i) for i in range(50)):
        b = buckets[d.isoformat()]
        want = expected_eur(rt, d)
        if want is None:
            assert b["energy_eur"] is None and b["kwh"] > 0, d  # 10 and 11 Nov: no colour
            continue
        # The day's cents come from running sums: within a cent of the exact figure.
        assert b["energy_eur"] == pytest.approx(want, abs=0.01), d
        checked += 1
    assert checked == 48
    assert (
        buckets["2026-11-10"]["energy_eur"] is None and buckets["2026-11-11"]["energy_eur"] is None
    )

    r = await c.get("/api/energy/day", params={"date": "2026-11-15"})
    assert r.status_code == 200, r.text
    body = r.json()
    ivs = body["intervals"]
    colours = [iv["tempo_colour"] for iv in ivs]
    assert colours == [COLOURS[date(2026, 11, 14)]] * 12 + [COLOURS[date(2026, 11, 15)]] * 36
    assert ivs[0]["price"] == TEMPO[f"{COLOURS[date(2026, 11, 14)]}_hc"]
    assert ivs[20]["price"] == TEMPO[f"{COLOURS[date(2026, 11, 15)]}_hp"]
    # The simulator seeds a week of radiator readings before the wall clock (13–20 November
    # here), so the 15th has radiator half-hours, priced through the same Tempo row.
    assert any(iv["radiators_wh"] is not None for iv in ivs)
    t = body["totals"]
    assert t["hc_kwh"] + t["hp_kwh"] == pytest.approx(t["daily_kwh"], abs=0.002)

    r = await c.get(
        "/api/energy",
        params={
            "from": "2026-11-01",
            "to": "2026-12-01",
            "group": "month",
            "period_from": "2026-11-01",
            "period_to": "2026-12-01",
        },
    )
    assert r.status_code == 200, r.text
    nov = r.json()["buckets"][0]
    # The Tempo lens agrees with the hero: its € rows are the priced days', to the cent, and
    # the two days without a colour are its kWh without a colour, whole.
    lens, period = r.json()["tempo_lens"], r.json()["period"]
    assert round(sum(x["eur"] for x in lens["rows"]) * 100) == round(period["energy_eur"] * 100)
    unpriced = buckets["2026-11-10"]["kwh"] + buckets["2026-11-11"]["kwh"]
    assert lens["unknown_kwh"] == pytest.approx(unpriced, abs=0.002)
    # 10 and 11 November have no €: the month says so, and its € are the priced days' only.
    assert nov["missing_colour_days"] == 2 and nov["tempo"]["unknown"] == 1
    assert nov["energy_eur"] == pytest.approx(
        sum(buckets[f"2026-11-{d:02d}"]["energy_eur"] or 0.0 for d in range(1, 20)), abs=1e-9
    )
    assert any(x["eur"] is not None for x in r.json()["by_radiator"])
    r = await c.get("/api/linky/curve", params={"date": "2026-11-15"})
    assert r.status_code == 200 and r.json()["hc_kwh"] is not None


async def test_a_stored_base_row_answers_without_a_split(api):
    c, rt = api
    rt.linky.tariffs.replace(
        Tariff.build(9, [PriceRow.make(date(2026, 1, 1), "base", 15.0, {"base": 0.1952})])
    )
    r = await c.get(
        "/api/energy", params={"from": "2026-10-01", "to": "2026-12-01", "group": "day"}
    )
    assert r.status_code == 200, r.text
    b = {x["key"]: x for x in r.json()["buckets"]}["2026-11-15"]
    assert (b["hc_kwh"], b["hp_kwh"]) == (None, None)
    assert b["energy_eur"] == pytest.approx(b["kwh"] * 0.1952, abs=0.01)
    r = await c.get("/api/energy/day", params={"date": "2026-11-15"})
    assert r.status_code == 200, r.text
    assert {iv["offpeak"] for iv in r.json()["intervals"]} == {None}
    assert {iv["price"] for iv in r.json()["intervals"]} == {0.1952}
    r = await c.get("/api/linky/curve", params={"date": "2026-11-15"})
    assert r.status_code == 200 and r.json()["hc_kwh"] is None
