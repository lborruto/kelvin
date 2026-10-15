"""MCP rate limits (spec MCP §5.2). In memory: a restart resets them, which is fine for a
home server; the injected monotonic clock keeps tests exact."""

from __future__ import annotations

import time
from collections import deque
from collections.abc import Callable
from itertools import takewhile

FAIL_LIMIT, FAIL_WINDOW_S = 10, 15 * 60
MINUTE_LIMIT, HOUR_LIMIT = 60, 1000
MAX_KEYS = 10_000


def _trim(q: deque[float], window: float, now: float) -> None:
    while q and q[0] <= now - window:
        q.popleft()


class McpLimits:
    def __init__(self, *, clock: Callable[[], float] = time.monotonic) -> None:
        self.clock = clock
        self._fail: dict[str, deque[float]] = {}
        self._calls: dict[str, deque[float]] = {}

    def failure_wait(self, key: str) -> float | None:
        q = self._fail.get(key)
        if q is None:
            return None
        now = self.clock()
        _trim(q, FAIL_WINDOW_S, now)
        if not q:
            del self._fail[key]
            return None
        return q[-FAIL_LIMIT] + FAIL_WINDOW_S - now if len(q) >= FAIL_LIMIT else None

    def failure(self, key: str) -> None:
        if key not in self._fail and len(self._fail) >= MAX_KEYS:
            self._fail.clear()  # a flood of addresses: forget them all rather than grow
        self._fail.setdefault(key, deque()).append(self.clock())

    def hit(self, token_id: str) -> float | None:
        now = self.clock()
        q = self._calls.setdefault(token_id, deque())
        _trim(q, 3600, now)
        if len(q) >= HOUR_LIMIT:
            return q[-HOUR_LIMIT] + 3600 - now
        recent = sum(1 for _ in takewhile(lambda t: t > now - 60, reversed(q)))
        if recent >= MINUTE_LIMIT:
            return q[-MINUTE_LIMIT] + 60 - now
        q.append(now)
        return None
