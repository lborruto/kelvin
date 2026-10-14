from kelvin.overkiz.budget import DAY_S, FULL_READS_PER_DAY, SetupReadGuard
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
