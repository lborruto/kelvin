"""Grid sources (spec §2.3): parsers, the MED public client, the caches, the simulator's grid."""

import logging
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import httpx
import pytest

from kelvin.grid.client import (
    MAX_BYTES,
    MedPublicClient,
    parse_ecowatt,
    parse_tempo,
    parse_tempo_prices,
)
from kelvin.grid.fake import FakeGridSource
from kelvin.grid.models import EcowattDay, GridError, GridThrottled
from kelvin.grid.store import GridStore
from kelvin.recorder.db import Database
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
        # The live quirk (spec §2.3): the key 14 October holds the hours of 15 October.
        "2026-10-14": {"value": 1, "message": "…", "detail": hours_of(oct15, {18: 2, 19: 2})},
        "2026-10-15": {"value": 2, "message": "…", "detail": {"0": 1, "1": 1}},
        "2026-10-16": {"value": 7, "detail": {}},  # unknown level: dropped
        "2026-10-17": {"message": "no value"},
    }
    got = parse_ecowatt(payload, oct14, date(2026, 10, 18), PARIS)
    assert set(got) == {oct14, oct15}
    assert got[oct14] == EcowattDay(oct14, 1, None)
    assert got[oct15].level == 2 and got[oct15].hours[18:20] == (2, 2) and got[oct15].hours[17] == 1
    bare = {"2026-10-15": {"value": 2, "detail": {str(h): (3 if h == 8 else 1) for h in range(24)}}}
    assert (
        parse_ecowatt(bare, oct15, date(2026, 10, 17), PARIS)[oct15].hours is None
    )  # dating unverified
    shifted = parse_ecowatt(bare, oct15, date(2026, 10, 17), PARIS, bare_offset=1)
    assert (
        shifted[oct15].hours is None and shifted.get(date(2026, 10, 16)) is None
    )  # no level for the 16th


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
            return httpx.Response(200, json={"2026-12-01": {"value": 3, "detail": {}}})
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
    assert (await hours.ecowatt(D, D + timedelta(days=1)))[D].hours is None
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
