"""Overkiz call budget (spec ruling 8).

The Overkiz end-user API documents `GET /setup`, `/setup/devices` and `/setup/places` as
"1 call per 1d (bulk-load)" per session. Kelvin reads the whole setup only at startup, after a
reconnect and on demand, and never more than FULL_READS_PER_DAY times in any 24 h. Everything
else comes from events and from per-device state reads (`GET /setup/devices/{url}/states`),
which have no documented limit.
"""

from __future__ import annotations

import time
from collections import deque
from collections.abc import Callable

FULL_READS_PER_DAY = 3
DAY_S = 86400.0


class SetupReadGuard:
    """A rolling 24 h budget of full setup reads (places + devices)."""

    def __init__(
        self, limit: int = FULL_READS_PER_DAY, *, wall: Callable[[], float] = time.time
    ) -> None:
        self.limit = limit
        self.wall = wall
        self._reads: deque[float] = deque()

    def _trim(self) -> None:
        cutoff = self.wall() - DAY_S
        while self._reads and self._reads[0] <= cutoff:
            self._reads.popleft()

    def allowed(self) -> bool:
        self._trim()
        return len(self._reads) < self.limit

    def record(self) -> None:
        """Count one full read (made, or attempted: a refused call may still count upstream)."""
        self._trim()
        self._reads.append(self.wall())

    def used(self) -> int:
        self._trim()
        return len(self._reads)
