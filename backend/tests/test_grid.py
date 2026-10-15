"""Grid sources (spec §2.3): parsers, the MED public client, the caches, the simulator's grid."""

import json
import logging
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import httpx
import pytest

from kelvin.billing.slots import Slot
from kelvin.billing.tariff import PriceRow, Prices, Tariff
from kelvin.grid import service as grid_service
from kelvin.grid.client import (
    MAX_BYTES,
    MedPublicClient,
    parse_ecowatt,
    parse_tempo,
    parse_tempo_prices,
)
from kelvin.grid.fake import FakeGridSource
from kelvin.grid.models import BudgetSpent, EcowattDay, GridError, GridThrottled
from kelvin.grid.service import GridService
from kelvin.grid.store import GridStore
from kelvin.linky.store import LinkyStore
from kelvin.linky.sync import LinkySync
from kelvin.recorder.db import Database
from kelvin.scheduler import Scheduler
from tests.conftest import ManualClock

PARIS = ZoneInfo("Europe/Paris")
D = date(2026, 12, 1)
PRICES = {
    "blue_hc": 0.1296,
    "blue_hp": 0.1609,
    "white_hc": 0.1486,
    "white_hp": 0.1894,
    "red_hc": 0.1568,
    "red_hp": 0.7562,
}


def hours_of(day: date, levels: dict[int, int]) -> dict[str, int]:
    """A timestamped EcoWatt detail for the 24 local hours of `day`."""
    out = {}
    for h in range(24):
        ts = datetime(day.year, day.month, day.day, h, tzinfo=PARIS)
        out[ts.isoformat()] = levels.get(h, 1)
    return out


def test_parse_tempo_keeps_published_colours_inside_the_window(caplog):
    payload = {
        "2026-11-30": "WHITE",  # before the window
        "2026-12-01": "BLUE",
        "2026-12-02": "RED",
        "2026-12-03": "UNKNOWN",  # not published yet
        "2026-12-04": "PURPLE",  # unknown value: dropped, never logged
        "x": "BLUE",
    }
    with caplog.at_level(logging.INFO):
        assert parse_tempo(payload, D, D + timedelta(days=4)) == {
            D: "blue",
            D + timedelta(days=1): "red",
        }
    assert "PURPLE" not in caplog.text
    with pytest.raises(GridError):
        parse_tempo(["BLUE"], D, D + timedelta(days=1))


def test_parse_ecowatt_dates_hours_by_their_own_timestamps():
    oct14, oct15 = date(2026, 10, 14), date(2026, 10, 15)
    payload = {
        # The live quirk (spec §2.3): the key 14 October holds the hours of 15 October, and its
        # `value` is not trusted: the 15th is orange because of its own 18:00.
        "2026-10-14": {"value": 3, "message": "…", "detail": hours_of(oct15, {18: 2, 19: 2})},
        "2026-10-16": {"value": 2, "detail": {}},  # no hours: no level
        "2026-10-17": {"message": "no value"},
    }
    got = parse_ecowatt(payload, oct14, date(2026, 10, 18), PARIS)
    assert set(got) == {oct15}
    assert got[oct15].level == 2 and got[oct15].hours[18:20] == (2, 2) and got[oct15].hours[17] == 1
    assert set(parse_ecowatt(payload, oct14, oct15, PARIS)) == set()  # outside the window
    naive = {"2026-10-14": {"detail": {"2026-10-15 18:00:00": 3, "2026-10-15 03:00:00": 0}}}
    got = parse_ecowatt(naive, oct14, date(2026, 10, 18), PARIS)[oct15]
    assert got.level == 3 and got.hours[18] == 3 and got.hours[3] == 0 and got.hours[4] is None
    low = {"2026-10-14": {"detail": {"2026-10-15 03:00:00": 0}}}
    assert parse_ecowatt(low, oct14, date(2026, 10, 18), PARIS)[oct15].level == 1
    bare = {"2026-10-15": {"value": 2, "detail": {str(h): 3 for h in range(24)}, "x": 1}}
    assert parse_ecowatt(bare, oct15, date(2026, 10, 17), PARIS) == {}  # bare hours dropped


def test_parse_tempo_prices_needs_the_six_prices():
    assert parse_tempo_prices({**PRICES, "date": "2026-08-01"}) == PRICES
    assert parse_tempo_prices({"prices": {k.upper(): v for k, v in PRICES.items()}}) == PRICES
    with pytest.raises(GridError):
        parse_tempo_prices({k: v for k, v in PRICES.items() if k != "red_hp"})
    with pytest.raises(GridError):
        parse_tempo_prices({**PRICES, "red_hp": -1})


def client_for(handler, wall=None) -> MedPublicClient:
    transport = httpx.MockTransport(handler)
    return MedPublicClient(
        client=httpx.AsyncClient(base_url="https://med.test", transport=transport, timeout=10.0),
        wall=wall or ManualClock(1000.0),
    )


async def test_the_client_calls_the_public_paths_with_no_credentials():
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        if request.url.path.startswith("/rte/tempo/"):
            return httpx.Response(200, json={"2026-12-01": "BLUE"})
        if request.url.path.startswith("/rte/ecowatt/"):
            return httpx.Response(
                200, json={"2026-11-30": {"value": 1, "detail": hours_of(D, {18: 3})}}
            )
        return httpx.Response(200, json=PRICES)

    c = client_for(handler)
    assert await c.tempo(D, D + timedelta(days=2)) == {D: "blue"}
    assert (await c.ecowatt(D, D + timedelta(days=4)))[D].level == 3
    assert await c.tempo_prices() == PRICES
    assert [r.url.path for r in seen] == [
        "/rte/tempo/2026-12-01/2026-12-03",
        "/rte/ecowatt/2026-12-01/2026-12-05",
        "/edf/tempo/price",
    ]
    for r in seen:
        assert "authorization" not in r.headers and r.headers["user-agent"].startswith("Kelvin")


async def test_the_client_honours_429_and_refuses_large_or_broken_answers():
    clock = ManualClock(1000.0)
    c = client_for(lambda r: httpx.Response(429, headers={"Retry-After": "120"}), wall=clock)
    with pytest.raises(GridThrottled) as e:
        await c.tempo(D, D + timedelta(days=1))
    assert e.value.retry_at == 1120.0
    big = client_for(lambda r: httpx.Response(200, content=b" " * (MAX_BYTES + 1)))
    with pytest.raises(GridError, match="too large"):
        await big.tempo(D, D + timedelta(days=1))
    with pytest.raises(GridError):
        await client_for(lambda r: httpx.Response(500)).tempo(D, D + timedelta(days=1))
    with pytest.raises(GridError):
        await client_for(lambda r: httpx.Response(200, content=b"<html>")).tempo(
            D, D + timedelta(days=1)
        )

    def down(request):
        raise httpx.ConnectError("boom", request=request)

    with pytest.raises(GridError) as e:
        await client_for(down).tempo(D, D + timedelta(days=1))
    assert "med.test" not in str(e.value) and e.value.__cause__ is None


def test_the_store_keeps_colours_and_ecowatt_days(caplog):
    store = GridStore(Database(":memory:"))
    store.upsert_tempo({D: "blue", D + timedelta(days=1): "red"}, 1000.0)
    # A published colour never changes (it priced days already shown and cached): a MED
    # correction is logged and the published colour kept; a new day is added.
    with caplog.at_level(logging.WARNING):
        store.upsert_tempo({D + timedelta(days=1): "white", D + timedelta(days=2): "blue"}, 2000.0)
    assert "2026-12-02" in caplog.text and "red" in caplog.text and "white" in caplog.text
    assert store.tempo_colours(D, D + timedelta(days=4)) == {
        D: "blue",
        D + timedelta(days=1): "red",
        D + timedelta(days=2): "blue",
    }
    assert store.tempo_missing(D, D + timedelta(days=4)) == [D + timedelta(days=3)]
    assert store.fetched_at("tempo_days", D + timedelta(days=1)) == 1000.0
    assert store.fetched_at("tempo_days", D + timedelta(days=2)) == 2000.0
    caplog.clear()
    store.upsert_tempo({D: "blue"}, 3000.0)  # the same colour again: nothing to say
    assert caplog.text == "" and store.fetched_at("tempo_days", D) == 1000.0
    hours = tuple([1] * 18 + [2, 2] + [1] * 4)
    store.upsert_ecowatt(
        {
            D: EcowattDay(D, 2, hours),
            D + timedelta(days=1): EcowattDay(D + timedelta(days=1), 1, None),
        },
        1000.0,
    )
    got = store.ecowatt(D, D + timedelta(days=2))
    assert got[D] == EcowattDay(D, 2, hours) and got[D + timedelta(days=1)].hours is None
    assert store.prune_ecowatt(D + timedelta(days=1)) == 1 and list(
        store.ecowatt(D, D + timedelta(days=2))
    ) == [D + timedelta(days=1)]


async def test_the_simulator_publishes_tomorrow_at_eleven_and_an_orange_evening():
    clock = ManualClock(datetime(2026, 12, 1, 10, 0, tzinfo=PARIS).timestamp())
    fake = FakeGridSource(wall=clock)
    got = await fake.tempo(D - timedelta(days=1), D + timedelta(days=2))
    assert set(got) == {D - timedelta(days=1), D} and got[D] == FakeGridSource.colour(D)
    clock.advance(3600)
    assert D + timedelta(days=1) in await fake.tempo(D, D + timedelta(days=2))
    eco = await fake.ecowatt(D, D + timedelta(days=4))
    assert eco[D].level == 1 and eco[D + timedelta(days=1)].level == 2
    assert eco[D + timedelta(days=1)].hours[18:20] == (2, 2)
    season = [FakeGridSource.colour(D + timedelta(days=i)) for i in range(120)]
    assert {"blue", "white", "red"} <= set(season)
    assert fake.calls == [
        f"tempo:{D - timedelta(days=1)}:{D + timedelta(days=2)}",
        f"tempo:{D}:{D + timedelta(days=2)}",
        f"ecowatt:{D}:{D + timedelta(days=4)}",
    ]


async def test_non_finite_numbers_and_deep_nesting_are_unexpected_payloads():
    """Review of batch 4 (Important 1–2): Python's JSON reads Infinity/NaN and recurses on deep
    nesting; neither may escape as anything but a GridError."""
    inf = client_for(
        lambda r: httpx.Response(200, content=b'{"2026-12-01": {"value": Infinity, "detail": {}}}')
    )
    assert await inf.ecowatt(D, D + timedelta(days=1)) == {}  # no level: dropped, not a crash
    hours = client_for(
        lambda r: httpx.Response(
            200,
            content=b'{"2026-12-01": {"value": 2, "detail": {"2026-12-01T18:00:00+01:00": NaN}}}',
        )
    )
    assert await hours.ecowatt(D, D + timedelta(days=1)) == {}
    with pytest.raises(GridError, match="unexpected payload"):
        await client_for(lambda r: httpx.Response(200, content=b"Infinity")).tempo(
            D, D + timedelta(days=1)
        )
    deep = client_for(lambda r: httpx.Response(200, content=b"[" * 200_000))
    with pytest.raises(GridError, match="unexpected payload"):
        await deep.tempo(D, D + timedelta(days=1))
    # Called directly, the parser refuses an infinite level too.
    assert (
        parse_ecowatt({"2026-12-01": {"value": float("inf")}}, D, D + timedelta(days=1), PARIS)
        == {}
    )


def test_a_med_correction_is_logged_once_per_day_and_colour(caplog):
    store = GridStore(Database(":memory:"))
    store.upsert_tempo({D: "red"}, 1000.0)
    with caplog.at_level(logging.WARNING):
        for _ in range(3):
            store.upsert_tempo({D: "white"}, 2000.0)
        assert caplog.text.count("published colour is kept") == 1
        store.upsert_tempo({D: "blue"}, 3000.0)  # another correction: said once more
        assert caplog.text.count("published colour is kept") == 2
    assert store.tempo_colours(D, D + timedelta(days=1)) == {D: "red"}


HCHP = Tariff("hchp", 9, (Slot("22:00", "06:00"),), (Prices(date(2026, 1, 1), 15.0, 0.2, 0.3),))
TEMPO_T = Tariff.build(9, [PriceRow.make(date(2026, 9, 1), "tempo", 15.0, PRICES)])


def grid_env(t, when: datetime):
    clock = ManualClock(when.timestamp())
    db = Database(":memory:")
    sync = LinkySync(LinkyStore(db), db, None, wall=clock)
    tariff = {"t": t}
    fake = FakeGridSource(wall=clock)
    svc = GridService(
        GridStore(db),
        fake,
        spend=lambda: sync.spend(kind="grid"),
        tariff=lambda: tariff["t"],
        db=db,
        tz=PARIS,
        wall=clock,
    )
    return clock, db, sync, tariff, fake, svc


async def test_grid_view_hides_tempo_unless_the_row_in_force_is_tempo():
    clock, db, sync, tariff, fake, svc = grid_env(HCHP, datetime(2026, 12, 1, 12, 0, tzinfo=PARIS))
    await svc.ecowatt_job()
    await svc.tempo_job()
    v = svc.view()
    assert v["tempo"] is None and fake.calls == [
        f"ecowatt:{D - timedelta(days=1)}:{D + timedelta(days=4)}"
    ]
    assert [x["level"] for x in v["ecowatt"]["days"]] == [1, 2, 1, 1]
    assert v["ecowatt"]["days"][1]["hours"] == [  # verified (Task 15): shown for every tariff
        {"start": "18:00", "end": "20:00", "level": 2}
    ]
    tariff["t"] = TEMPO_T
    await svc.tempo_job()
    v = svc.view()
    assert v["tempo"]["today"] == {"date": "2026-12-01", "colour": FakeGridSource.colour(D)}
    assert v["tempo"]["tomorrow"]["colour"] == FakeGridSource.colour(D + timedelta(days=1))
    assert v["tempo"]["tomorrow"]["expected_at"] is None and v["source"] == "MyElectricalData"


async def test_tempo_is_fetched_only_when_needed_with_its_history_in_the_same_call():
    clock, db, sync, tariff, fake, svc = grid_env(
        TEMPO_T, datetime(2026, 12, 1, 6, 30, tzinfo=PARIS)
    )
    assert svc.tempo_window(clock()) == (
        date(2026, 8, 31),
        date(2026, 12, 3),
    )  # history from the day before the switch (its night), + today; tomorrow if out
    await svc.tempo_job()
    assert fake.calls == ["tempo:2026-08-31:2026-12-03"]
    await svc.tempo_job()  # today known, tomorrow not before 11:00: no call
    assert len(fake.calls) == 1
    clock.t = datetime(2026, 12, 1, 11, 15, tzinfo=PARIS).timestamp()
    await svc.tempo_job()
    assert fake.calls[-1] == "tempo:2026-12-02:2026-12-03"
    await svc.tempo_job()
    assert len(fake.calls) == 2 and sync.grid_calls_today() == 2


async def test_a_day_of_jobs_stays_within_the_grid_share():
    for t, most in ((HCHP, 2), (TEMPO_T, 4)):
        clock, db, sync, tariff, fake, svc = grid_env(t, datetime(2026, 12, 1, 0, 5, tzinfo=PARIS))
        s = Scheduler(db, svc.jobs(), wall=clock)
        s.state = {
            "tempo": {"slot": clock()},
            "ecowatt": {"slot": clock()},
        }  # running since yesterday
        for _ in range(23 * 12):  # every 5 minutes, 00:05 to 23:00
            await s.run_due()
            clock.advance(300)
        assert sync.calls_today() == sync.grid_calls_today() <= most
        assert sum(c.startswith("ecowatt") for c in fake.calls) == 2


class HoleyGridSource(FakeGridSource):
    """MED's Tempo cache with one old day it never returns."""

    HOLE = date(2026, 10, 10)

    async def tempo(self, start, end):
        out = await super().tempo(start, end)
        out.pop(self.HOLE, None)
        return out


async def test_a_day_med_never_returns_costs_no_call_of_its_own():
    clock, db, sync, tariff, _, svc = grid_env(TEMPO_T, datetime(2026, 12, 1, 0, 5, tzinfo=PARIS))
    fake = svc.source = HoleyGridSource(wall=clock)
    s = Scheduler(db, svc.jobs(), wall=clock)
    s.state = {"tempo": {"slot": clock()}, "ecowatt": {"slot": clock()}}  # running since yesterday

    async def run_day():
        start = len(fake.calls)
        for _ in range(24 * 12):  # every 5 minutes, 00:05 to 00:00 the next day
            await s.run_due()
            assert s.state.get("ecowatt", {}).get("state") != "quota"
            if datetime.fromtimestamp(clock(), PARIS).time() == datetime.min.time().replace(
                hour=14, minute=5
            ):
                last_ok = s.state["tempo"]["last_ok"]
                s.request("tempo")  # a settings save: the hole was asked already, no call
                await s.run_due()
                assert s.state["tempo"]["last_ok"] == last_ok
            clock.advance(300)
        return fake.calls[start:]

    day1 = await run_day()
    # 06:30 today's colour with the history (the hole asked once), 11:15 tomorrow's colour
    assert [c.split(":")[0] for c in day1].count("tempo") == 2
    assert [c.split(":")[0] for c in day1].count("ecowatt") == 2  # 17:15 not refused
    day2 = await run_day()
    tempo2 = [c for c in day2 if c.startswith("tempo")]
    assert len(tempo2) == 1  # 11:15 only; the hole rides in it
    assert tempo2[0] == f"tempo:{HoleyGridSource.HOLE}:2026-12-04"
    assert sum(c.startswith("ecowatt") for c in day2) == 2
    assert HoleyGridSource.HOLE not in svc.store.tempo_colours(D - timedelta(days=60), D)


async def test_planned_today_is_the_reserve_left_for_the_grid():
    clock, db, sync, tariff, fake, svc = grid_env(HCHP, datetime(2026, 12, 1, 8, 0, tzinfo=PARIS))
    assert svc.planned_today() == 2  # 17:15, and 07:15 not fetched yet (it runs at start)
    await svc.ecowatt_job()
    assert svc.planned_today() == 1
    tariff["t"] = TEMPO_T
    assert (
        svc.planned_today() == 4
    )  # + today's colour now, 11:15 and 13:15 while tomorrow is unknown
    await svc.tempo_job()  # today's colour (tomorrow is not expected before 11:00)
    assert svc.planned_today() == 3
    clock.t = datetime(2026, 12, 1, 18, 0, tzinfo=PARIS).timestamp()
    await svc.ecowatt_job()
    await svc.tempo_job()
    assert svc.planned_today() == 0


async def test_ecowatt_hours_show_once_verified():
    clock, db, sync, tariff, fake, svc = grid_env(HCHP, datetime(2026, 12, 1, 12, 0, tzinfo=PARIS))
    await svc.ecowatt_job()
    assert grid_service.ECOWATT_HOURS_VERIFIED
    assert svc.view()["ecowatt"]["days"][1]["hours"] == [
        {"start": "18:00", "end": "20:00", "level": 2}
    ]


async def test_a_spent_ledger_is_budget_not_failure_and_prices_are_cached_a_week():
    clock, db, sync, tariff, fake, svc = grid_env(
        TEMPO_T, datetime(2026, 12, 1, 12, 0, tzinfo=PARIS)
    )
    first = await svc.tempo_prices()
    assert first["rates"] == PRICES and first["fetched_at"] == clock()
    clock.advance(6 * 86400)
    assert (await svc.tempo_prices()) == first and fake.calls.count("tempo_prices") == 1
    clock.advance(2 * 86400)  # the cached prices are now stale
    while sync.spend():
        pass
    with pytest.raises(BudgetSpent):
        await svc.tempo_prices()


async def test_the_switch_day_s_night_is_priced_by_the_day_before_s_colour():
    from kelvin.billing.pricing import Pricing

    clock, db, sync, tariff, fake, svc = grid_env(
        TEMPO_T, datetime(2026, 12, 1, 6, 30, tzinfo=PARIS)
    )
    await svc.tempo_job()
    colours = svc.store.tempo_colours(date(2026, 8, 31), date(2026, 12, 3))
    assert date(2026, 8, 31) in colours
    night = datetime(2026, 9, 1, 3, 0, tzinfo=PARIS).timestamp()
    sl = Pricing(TEMPO_T, PARIS, colours).slice(night, 1800)
    assert sl.colour is not None


def _tempo_then(row):
    return Tariff.build(9, [PriceRow.make(date(2026, 9, 1), "tempo", 15.0, PRICES), row])


async def test_tempo_is_needed_only_while_a_tempo_row_is_in_force_or_ahead():
    later = PriceRow.make(date(2026, 11, 1), "hchp", 15.0, {"hc": 0.2, "hp": 0.3})
    clock, db, sync, tariff, fake, svc = grid_env(
        _tempo_then(later), datetime(2026, 12, 1, 6, 30, tzinfo=PARIS)
    )
    assert not svc.tempo_needed() and svc.tempo_window(clock()) is None
    tariff["t"] = _tempo_then(
        PriceRow.make(date(2027, 1, 1), "base", 15.0, {"base": 0.2})
    )  # base dated ahead: Tempo is still in force today
    assert svc.tempo_needed()
    tariff["t"] = Tariff.build(
        9,
        [
            PriceRow.make(date(2026, 1, 1), "base", 15.0, {"base": 0.2}),
            PriceRow.make(date(2027, 1, 1), "tempo", 15.0, PRICES),
        ],
    )
    assert svc.tempo_needed()  # a Tempo row dated ahead


async def test_concurrent_tempo_price_requests_share_one_call():
    import asyncio

    clock, db, sync, tariff, fake, svc = grid_env(
        TEMPO_T, datetime(2026, 12, 1, 12, 0, tzinfo=PARIS)
    )
    a, b = await asyncio.gather(svc.tempo_prices(), svc.tempo_prices())
    assert a == b and fake.calls.count("tempo_prices") == 1 and sync.grid_calls_today() == 1


FIXTURES = Path(__file__).parent / "fixtures" / "grid"


def test_the_captured_tempo_shape_parses():
    payload = json.loads((FIXTURES / "tempo.json").read_text())
    got = parse_tempo(payload, date(2026, 1, 1), date(2026, 1, 31))
    assert got and set(got.values()) <= {"blue", "white", "red"}
    assert got[date(2026, 1, 8)] == "red" and got[date(2026, 1, 12)] == "blue"


def test_an_unpublished_tempo_day_stays_unknown():
    payload = json.loads((FIXTURES / "tempo.json").read_text())
    got = parse_tempo(payload, date(2026, 1, 1), date(2026, 1, 31))
    assert date(2026, 1, 13) not in got and date(2026, 1, 20) not in got
    assert len(got) == len(payload)  # nothing invented for the missing days


def test_the_captured_ecowatt_shape_is_dated_as_recorded():
    payload = json.loads((FIXTURES / "ecowatt.json").read_text())
    got = parse_ecowatt(payload, date(2026, 1, 1), date(2026, 1, 31), PARIS)
    # Key D holds the hours of D+1 (naive Paris timestamps): the 12th's key dates the 13th.
    assert set(got) == {date(2026, 1, d) for d in range(11, 16)}
    orange = [d for d in got.values() if d.level == 2]
    assert len(orange) == 1 and orange[0].day == date(2026, 1, 13)
    assert orange[0].hours is not None and orange[0].hours[18] == 2 and orange[0].hours[3] == 0
    assert all(d.level == 1 for d in got.values() if d.day != date(2026, 1, 13))


def test_parse_tempo_prices_accepts_six_string_decimals():
    strings = {k: f"{v:.4f}" for k, v in PRICES.items()}
    assert parse_tempo_prices(strings) == PRICES


async def test_todays_ecowatt_comes_from_yesterdays_key_in_one_call():
    clock, db, sync, tariff, fake, svc = grid_env(HCHP, datetime(2026, 12, 1, 12, 0, tzinfo=PARIS))
    shifted = {  # the live shape: key D holds the hours of D+1
        "2026-11-30": {"value": 1, "detail": hours_of(D, {18: 2})},
        "2026-12-01": {"value": 1, "detail": hours_of(D + timedelta(days=1), {})},
    }
    svc.source = client_for(lambda r: httpx.Response(200, json=shifted))
    await svc.ecowatt_job()
    assert sync.grid_calls_today() == 1
    days = svc.view()["ecowatt"]["days"]
    assert days[0]["date"] == "2026-12-01" and days[0]["level"] == 2
    assert days[0]["hours"] == [{"start": "18:00", "end": "19:00", "level": 2}]
    assert days[1]["level"] == 1 and days[1]["hours"] == []
    # yesterday (kept 30 days) is stored, but the view starts today
    assert svc.store.ecowatt(D - timedelta(days=1), D) == {}
