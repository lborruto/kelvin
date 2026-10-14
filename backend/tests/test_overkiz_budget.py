from kelvin.overkiz.budget import (
    DAY_S,
    FULL_READS_PER_DAY,
    QUOTA_CACHE_S,
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
