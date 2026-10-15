from kelvin.auth.throttle import LoginThrottle, client_key, retry_minutes
from tests.conftest import ManualClock


def test_five_failures_per_ip_block_for_the_rest_of_15_minutes():
    clock = ManualClock(0.0)
    t = LoginThrottle(clock=clock)
    for _ in range(4):
        t.failure("1.1.1.1", reached_overkiz=True)
        clock.advance(10)
    assert t.retry_after("1.1.1.1") is None
    t.failure("1.1.1.1", reached_overkiz=True)
    wait = t.retry_after("1.1.1.1")
    assert wait is not None and abs(wait - (900 - 40)) < 1e-6
    assert t.retry_after("2.2.2.2") is None  # per IP
    clock.advance(wait + 0.001)
    assert t.retry_after("1.1.1.1") is None


def test_twenty_failures_per_hour_overall():
    clock = ManualClock(0.0)
    t = LoginThrottle(clock=clock)
    for i in range(20):
        t.failure(f"10.0.0.{i}", reached_overkiz=True)
        clock.advance(1)
    wait = t.retry_after("192.168.1.1")
    assert wait is not None and abs(wait - (3600 - 20)) < 1e-6


def test_success_clears_the_ip():
    clock = ManualClock(0.0)
    t = LoginThrottle(clock=clock)
    for _ in range(5):
        t.failure("1.1.1.1", reached_overkiz=True)
    t.success("1.1.1.1")
    assert t.retry_after("1.1.1.1") is None


def test_retry_minutes_rounds_up_to_whole_minutes():
    assert [retry_minutes(1), retry_minutes(61), retry_minutes(860)] == [1, 2, 15]


def test_local_misses_count_per_ip_but_not_against_the_overkiz_gate():
    """Only attempts Cozytouch itself refused fill the global gate: a wrong email or a local
    miss from one LAN client must not block the repair logins of everyone else."""
    clock = ManualClock(0.0)
    t = LoginThrottle(clock=clock)
    for i in range(30):
        t.failure(f"10.0.0.{i % 5}", reached_overkiz=False)
    assert t.global_retry_after() is None
    assert t.ip_retry_after("10.0.0.0") is not None  # per IP unchanged
    for i in range(20):
        t.failure(f"10.0.1.{i}", reached_overkiz=True)
    assert t.global_retry_after() is not None


def test_ipv6_clients_share_a_bucket_per_64():
    assert client_key("2001:db8:1:2:aaaa::1") == client_key("2001:db8:1:2:bbbb:cccc:dddd:2")
    assert client_key("2001:db8:1:2::1") != client_key("2001:db8:1:3::1")
    assert client_key("192.168.1.20") == "192.168.1.20"
    assert client_key("::ffff:192.168.1.20") == "192.168.1.20"
    assert client_key("unknown") == "unknown"
