import asyncio
import json
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import httpx
import pytest

from kelvin.linky.fake import FakeLinkySource
from kelvin.linky.med import (
    MedSource,
    parse_contract,
    parse_curve,
    parse_daily,
    parse_kva,
    parse_offpeak,
    parse_retry_at,
)
from kelvin.linky.models import (
    LinkyAuthError,
    LinkyError,
    LinkyThrottled,
    day_bounds,
    local_day,
)

PARIS = ZoneInfo("Europe/Paris")
FIXTURES = Path(__file__).parent / "fixtures" / "med"
PRM = "12345678901234"
TOKEN = "tok-secret-0123456789"


def fixture(name):
    return json.loads((FIXTURES / f"{name}.json").read_text())


def curve_payload(day: date, watts=lambda i: 1000.0) -> dict:
    """A MED load curve for one local day, points dated at the END of each 30-min interval,
    as naive local times (the autumn DST hour repeats)."""
    a, b = day_bounds(day, PARIS)
    items = []
    for i, start in enumerate(range(a, b, 1800)):
        end = datetime.fromtimestamp(start + 1800, PARIS).strftime("%Y-%m-%d %H:%M:%S")
        items.append(
            {
                "value": f"{watts(i):.0f}",
                "date": end,
                "interval_length": "PT30M",
                "measure_type": "B",
            }
        )
    return {
        "meter_reading": {
            "usage_point_id": PRM,
            "start": str(day),
            "end": str(day + timedelta(days=1)),
            "quality": "BRUT",
            "reading_type": {"measurement_kind": "power", "unit": "W", "aggregate": "average"},
            "interval_reading": items,
        }
    }


def test_offpeak_and_kva_from_the_contract_text():
    assert parse_offpeak("HC (1H30-7H30;12H30-14H30)") == (("01:30", "07:30"), ("12:30", "14:30"))
    assert parse_offpeak("HC (22H00-6H00)") == (("22:00", "06:00"),)
    assert parse_offpeak(None) == ()
    assert parse_kva("6 kVA") == 6 and parse_kva(None) is None


def test_retry_at_from_a_429_body():
    body = {
        "detail": json.dumps(
            {
                "code": "900804",
                "message": "Message throttled out",
                "description": "x",
                "nextAccessTime": "2026-Oct-14 07:00:00+0000 UTC",
            }
        )
    }
    assert parse_retry_at(body) == datetime(2026, 10, 14, 7, 0, tzinfo=UTC).timestamp()
    assert parse_retry_at({"detail": "nope"}) is None and parse_retry_at(None) is None


def test_daily_shape_with_end_exclusive():
    payload = {
        "meter_reading": {
            "usage_point_id": PRM,
            "start": "2026-10-06",
            "end": "2026-10-08",
            "quality": "BRUT",
            "reading_type": {
                "measurement_kind": "energy",
                "measuring_period": "P1D",
                "unit": "Wh",
                "aggregate": "sum",
            },
            "interval_reading": [
                {"value": "11250", "date": "2026-10-06"},
                {"value": "9800", "date": "2026-10-07"},
            ],
        }
    }
    rows = parse_daily(payload)
    assert [(r.day, r.wh) for r in rows] == [(date(2026, 10, 6), 11250), (date(2026, 10, 7), 9800)]
    with pytest.raises(LinkyError):
        parse_daily({"detail": "x"})


async def test_unpublished_day_returns_previous_day_and_is_dropped():
    """Verified with the real API (fixture daily_today): start=D not yet published answers
    D-1's reading. Neither fetch may report data for a day that was not asked for."""
    daily = fixture("daily_today")["body"]
    src = _source(lambda req: httpx.Response(200, json=daily))
    assert await src.fetch_daily(date(2026, 10, 14), date(2026, 10, 15)) == []
    await src.aclose()
    curve = curve_payload(date(2026, 10, 13))
    src = _source(lambda req: httpx.Response(200, json=curve))
    assert await src.fetch_curve(date(2026, 10, 14), date(2026, 10, 15)) == []
    assert len(await src.fetch_curve(date(2026, 10, 13), date(2026, 10, 14))) == 48
    await src.aclose()


def test_curve_parses_with_end_dated_points():
    pts = parse_curve(curve_payload(date(2026, 10, 6)), PARIS)
    a, b = day_bounds(date(2026, 10, 6), PARIS)
    assert len(pts) == 48 and pts[0].ts == a and pts[-1].ts == b - 1800
    assert all(p.minutes == 30 and p.wh == 500.0 for p in pts)  # 1000 W for 30 min


@pytest.mark.parametrize(("day", "n"), [(date(2026, 10, 25), 50), (date(2026, 3, 29), 46)])
def test_curve_on_dst_days(day, n):
    pts = parse_curve(curve_payload(day), PARIS)
    a, b = day_bounds(day, PARIS)
    assert len(pts) == n and b - a == n * 1800
    assert [p.ts for p in pts] == list(range(a, b, 1800))  # strictly increasing, no gap
    assert {local_day(p.ts, PARIS) for p in pts} == {day}


def test_contract_payload():
    c = parse_contract(
        {
            "customer": {
                "customer_id": "0000000000",
                "usage_points": [
                    {
                        "usage_point": {"usage_point_id": PRM, "usage_point_status": "com"},
                        "contracts": {
                            "segment": "C5",
                            "subscribed_power": "6 kVA",
                            "last_activation_date": "2026-08-05+02:00",
                            "distribution_tariff": "BTINFMU4",
                            "offpeak_hours": "HC (1H30-7H30;12H30-14H30)",
                        },
                    }
                ],
            }
        }
    )
    assert c.kva == 6 and c.offpeak == (("01:30", "07:30"), ("12:30", "14:30"))
    assert c.activation_date == date(2026, 8, 5) and c.tariff_code == "BTINFMU4"
    with pytest.raises(LinkyError):
        parse_contract({"customer": {}})


def test_real_shapes_from_the_spike_parse():
    for name in ("valid_access", "contracts", "daily", "curve"):
        rec = fixture(name)
        assert rec["status"] == 200, name
        assert "0000000000" in json.dumps(rec) or name != "contracts"
    c = parse_contract(fixture("contracts")["body"])
    assert c.kva == 9 and c.offpeak == (("22:00", "06:00"),)
    assert c.activation_date == date(2025, 1, 15) and c.tariff_code == "BTINFMU4"
    days = parse_daily(fixture("daily")["body"])
    assert days and all(r.wh >= 0 for r in days)
    assert [r.day for r in days] == [days[0].day + timedelta(days=i) for i in range(len(days))]
    pts = parse_curve(fixture("curve")["body"], PARIS)
    assert pts and all(p.minutes in (10, 15, 30, 60) for p in pts)
    assert all(b.ts - a.ts == a.minutes * 60 for a, b in zip(pts, pts[1:], strict=False))


def _source(handler):
    client = httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="https://med.test")
    return MedSource(PRM, TOKEN, client=client)


async def test_client_sends_the_token_and_parses():
    seen = []

    def handler(req: httpx.Request) -> httpx.Response:
        seen.append((req.url.path, req.headers["authorization"]))
        return httpx.Response(200, json=curve_payload(date(2026, 10, 6)))

    src = _source(handler)
    pts = await src.fetch_curve(date(2026, 10, 6), date(2026, 10, 7))
    assert len(pts) == 48
    assert seen == [(f"/consumption_load_curve/{PRM}/start/2026-10-06/end/2026-10-07", TOKEN)]
    assert TOKEN not in repr(src)
    with pytest.raises(ValueError):
        await src.fetch_curve(date(2026, 10, 1), date(2026, 10, 9))
    await src.aclose()


async def test_client_maps_errors_without_leaking_secrets():
    body429 = {"detail": '{"code":"900804","nextAccessTime":"2026-Oct-14 07:00:00+0000 UTC"}'}
    responses = iter(
        [
            httpx.Response(429, json=body429),
            httpx.Response(401, json={"detail": "x"}),
            httpx.Response(404, json={"detail": "no data"}),
            httpx.Response(500, text="boom"),
        ]
    )
    src = _source(lambda req: next(responses))
    with pytest.raises(LinkyThrottled) as e:
        await src.fetch_daily(date(2026, 10, 1), date(2026, 10, 2))
    assert e.value.retry_at == datetime(2026, 10, 14, 7, tzinfo=UTC).timestamp()
    with pytest.raises(LinkyAuthError):
        await src.check()
    assert await src.fetch_daily(date(2026, 10, 1), date(2026, 10, 2)) == []
    with pytest.raises(LinkyError) as err:
        await src.fetch_daily(date(2026, 10, 1), date(2026, 10, 2))
    assert PRM not in str(err.value) and TOKEN not in str(err.value)

    def boom(req):
        raise httpx.ConnectError("cannot reach", request=req)

    src = _source(boom)
    with pytest.raises(LinkyError) as err:
        await src.check()
    assert PRM not in str(err.value) and err.value.__cause__ is None


def test_fake_source_is_consistent_and_records_calls():
    now = datetime(2026, 10, 14, 9, 0, tzinfo=PARIS).timestamp()
    fake = FakeLinkySource(wall=lambda: now)
    day = date(2026, 10, 12)
    fake.missing = {date(2026, 10, 13)}

    async def run():
        daily = await fake.fetch_daily(date(2026, 10, 10), date(2026, 10, 15))
        curve = await fake.fetch_curve(day, day + timedelta(days=1))
        return daily, curve

    daily, curve = asyncio.run(run())
    assert [r.day for r in daily] == [
        date(2026, 10, 10),
        date(2026, 10, 11),
        day,
    ]  # not 13, not today
    assert abs(sum(p.wh for p in curve) - fake.day_wh(day)) <= 48  # whole watts per point
    assert fake.calls == ["daily:2026-10-10:2026-10-15", "curve:2026-10-12:2026-10-13"]


def test_curve_span_guard_is_shared():
    from kelvin.linky.models import check_curve_span

    check_curve_span(date(2026, 10, 1), date(2026, 10, 8))
    with pytest.raises(ValueError):
        check_curve_span(date(2026, 10, 1), date(2026, 10, 9))
    with pytest.raises(ValueError):
        asyncio.run(FakeLinkySource().fetch_curve(date(2026, 10, 1), date(2026, 10, 9)))


@pytest.mark.parametrize(
    "bad",
    [
        {"value": "1"},
        {"value": "abc", "date": "2026-10-06"},
        {"value": "1", "date": "not-a-date"},
        {"value": "1e999", "date": "2026-10-06 00:30:00"},
        "junk",
    ],
)
def test_malformed_items_raise_linky_error(bad):
    good = {"value": "5", "date": "2026-10-06"}
    payload = {"meter_reading": {"reading_type": {}, "interval_reading": [good, bad]}}
    with pytest.raises(LinkyError, match="unexpected payload"):
        parse_daily(payload)
    with pytest.raises(LinkyError, match="unexpected payload"):
        parse_curve(payload, PARIS)


def test_contract_with_a_bad_date_raises_linky_error():
    payload = {"customer": {"usage_points": [{"contracts": {"last_activation_date": "garbage"}}]}}
    with pytest.raises(LinkyError):
        parse_contract(payload)


def test_retry_at_ignores_an_impossible_date():
    body = {"detail": "2026-Feb-30 07:00:00+0000 UTC"}
    assert parse_retry_at(body) is None


async def test_network_error_leaves_no_cause_or_context():
    def boom(req):
        raise httpx.ConnectError("cannot reach", request=req)

    src = _source(boom)
    with pytest.raises(LinkyError) as err:
        await src.check()
    assert err.value.__cause__ is None and err.value.__context__ is None


async def test_end_boundary_is_exclusive():
    daily = {
        "meter_reading": {
            "reading_type": {"unit": "Wh"},
            "interval_reading": [
                {"value": "1", "date": "2026-10-06"},
                {"value": "2", "date": "2026-10-07"},
            ],
        }
    }
    src = _source(lambda req: httpx.Response(200, json=daily))
    rows = await src.fetch_daily(date(2026, 10, 6), date(2026, 10, 7))
    assert [r.day for r in rows] == [date(2026, 10, 6)]
    two_days = curve_payload(date(2026, 10, 6))
    two_days["meter_reading"]["interval_reading"] += curve_payload(date(2026, 10, 7))[
        "meter_reading"
    ]["interval_reading"]
    src = _source(lambda req: httpx.Response(200, json=two_days))
    pts = await src.fetch_curve(date(2026, 10, 6), date(2026, 10, 7))
    assert len(pts) == 48
    assert max(p.ts for p in pts) < day_bounds(date(2026, 10, 7), PARIS)[0]


@pytest.mark.parametrize("body", [[1, 2], 5, "text", True])
async def test_a_non_object_json_body_is_a_linky_error(body):
    src = _source(lambda req: httpx.Response(200, json=body))
    for call in (
        src.check,
        src.fetch_contract,
        lambda: src.fetch_daily(date(2026, 10, 1), date(2026, 10, 2)),
        lambda: src.fetch_curve(date(2026, 10, 1), date(2026, 10, 2)),
    ):
        with pytest.raises(LinkyError):
            await call()
    await src.aclose()
