from kelvin.overkiz.budget import (
    DAY_S,
    FULL_READS_PER_DAY,
    QUOTA_CACHE_S,
    QUOTA_ERROR_CACHE_S,
    QuotaReadout,
    SetupReadGuard,
    sanitize_quotas,
)
from tests.conftest import ManualClock


def test_the_guard_allows_a_few_full_reads_per_rolling_day():
    clock = ManualClock(0.0)
    guard = SetupReadGuard(wall=clock)
    for _ in range(FULL_READS_PER_DAY):
        assert guard.allowed()
        guard.record()
        clock.advance(60)
    assert not guard.allowed() and guard.used() == FULL_READS_PER_DAY
    clock.t = DAY_S  # the first read is now 24 h old
    assert guard.allowed() and guard.used() == FULL_READS_PER_DAY - 1


def test_quota_answers_keep_only_scalar_values_under_harmless_keys():
    raw = [
        {"name": "bulk", "remaining": 2, "valid": True, "gatewayId": "g", "id": 7, "x": {"a": 1}},
        {"deviceURL": "io://…", "setupOID": "o"},
        "junk",
        {"label": "y" * 300},
    ]
    assert sanitize_quotas(raw) == [
        {"name": "bulk", "remaining": 2, "valid": True},
        {"label": "y" * 100},
    ]
    assert sanitize_quotas({"remaining": 1}) == [{"remaining": 1}]
    assert sanitize_quotas(
        [
            {"name": "a", "href": "https://x/y", "owner": "me@example.org", "kind": "exec"},
            {"accountRef": 1, "tokenTtl": 2, "deviceCount": 3, "placeName": "p", "left": 4},
        ]
    ) == [{"name": "a", "kind": "exec"}, {"left": 4}]
    assert sanitize_quotas("nope") == []


async def test_quota_readout_reads_at_most_once_an_hour():
    clock = ManualClock(0.0)
    calls = 0

    async def fetch():
        nonlocal calls
        calls += 1
        return [{"remaining": calls}]

    readout = QuotaReadout(fetch, wall=clock)
    assert (await readout.get())["quotas"] == [{"remaining": 1}]
    clock.advance(QUOTA_CACHE_S - 1)
    assert (await readout.get())["quotas"] == [{"remaining": 1}]
    clock.advance(1)
    assert (await readout.get())["quotas"] == [{"remaining": 2}]


async def test_quota_readout_caches_a_failure_briefly_and_reads_once_at_a_time():
    import asyncio

    import pytest

    from kelvin.overkiz.errors import GatewayError, QuotaError

    clock = ManualClock(0.0)
    calls = 0
    fail = True
    gate = asyncio.Event()

    async def fetch():
        nonlocal calls
        calls += 1
        await gate.wait()
        if fail:
            raise QuotaError("QUOTA_EXCEEDED")
        return [{"remaining": calls}]

    readout = QuotaReadout(fetch, wall=clock)
    gate.set()
    with pytest.raises(GatewayError):
        await readout.get()
    clock.advance(QUOTA_ERROR_CACHE_S - 1)
    with pytest.raises(GatewayError):
        await readout.get()
    assert calls == 1  # a failure is not retried at once
    clock.advance(1)
    fail = False
    gate.clear()
    first = asyncio.create_task(readout.get())
    second = asyncio.create_task(readout.get())
    await asyncio.sleep(0)
    gate.set()
    assert (await first) == (await second)
    assert calls == 2  # two concurrent requests, one Overkiz call


async def test_quota_readout_turns_any_other_failure_into_unavailable_and_caches_it():
    import pytest

    from kelvin.overkiz.budget import QuotasUnavailable

    clock = ManualClock(0.0)
    calls = 0

    async def fetch():
        nonlocal calls
        calls += 1
        raise KeyError("unexpected payload")

    readout = QuotaReadout(fetch, wall=clock)
    with pytest.raises(QuotasUnavailable):
        await readout.get()
    clock.advance(QUOTA_ERROR_CACHE_S - 1)
    with pytest.raises(QuotasUnavailable):
        await readout.get()
    assert calls == 1


def test_next_at_says_when_the_oldest_read_leaves_the_window():
    clock = ManualClock(0.0)
    guard = SetupReadGuard(wall=clock)
    assert guard.next_at() is None
    for _ in range(FULL_READS_PER_DAY):
        guard.record()
        clock.advance(100)
    assert guard.next_at() == DAY_S
    clock.t = DAY_S
    assert guard.next_at() is None


def test_next_at_with_a_reserve_counts_the_reads_kept_back():
    clock = ManualClock(0.0)
    guard = SetupReadGuard(wall=clock)
    guard.record()
    clock.advance(100)
    guard.record()
    assert guard.next_at() is None
    assert guard.next_at(reserve=1) == DAY_S
