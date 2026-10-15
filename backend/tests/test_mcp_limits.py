"""MCP rate limits (spec MCP §5.2): failed authentications per client, calls per token."""

from kelvin.mcp.limits import FAIL_LIMIT, HOUR_LIMIT, MINUTE_LIMIT, McpLimits
from tests.conftest import ManualClock


def test_failures_lock_a_client_out_for_the_window():
    clock = ManualClock(0.0)
    lim = McpLimits(clock=clock)
    for _ in range(FAIL_LIMIT - 1):
        lim.failure("10.0.0.2")
        assert lim.failure_wait("10.0.0.2") is None
    lim.failure("10.0.0.2")
    assert lim.failure_wait("10.0.0.2") == 900.0
    assert lim.failure_wait("10.0.0.3") is None  # another client is not affected
    clock.advance(899)
    assert lim.failure_wait("10.0.0.2") == 1.0
    clock.advance(1)
    assert lim.failure_wait("10.0.0.2") is None


def test_per_token_minute_and_hour_limits():
    clock = ManualClock(0.0)
    lim = McpLimits(clock=clock)
    for _ in range(MINUTE_LIMIT):
        assert lim.hit("t1") is None
    assert lim.hit("t1") == 60.0  # refused, not recorded
    assert lim.hit("t2") is None  # tokens are independent
    calls = MINUTE_LIMIT
    while calls < HOUR_LIMIT:
        clock.advance(60)
        for _ in range(min(MINUTE_LIMIT, HOUR_LIMIT - calls)):
            assert lim.hit("t1") is None
            calls += 1
    clock.advance(60)
    wait = lim.hit("t1")
    assert wait is not None and 0 < wait <= 3600


def test_the_key_table_is_bounded():
    lim = McpLimits(clock=ManualClock(0.0))
    for i in range(10_005):
        lim.failure(f"k{i}")
    assert len(lim._fail) <= 10_000
