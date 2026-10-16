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
AUDIT_DENIAL_EVERY_S = 60  # one `denied` audit row a minute for all bad tokens together
AUDIT_REFUSAL_EVERY_S = 60  # one `rate_limited` audit row per token a minute, however many 429s


def _trim(q: deque[float], window: float, now: float) -> None:
    while q and q[0] <= now - window:
        q.popleft()


class McpLimits:
    def __init__(self, *, clock: Callable[[], float] = time.monotonic) -> None:
        self.clock = clock
        self._fail: dict[str, deque[float]] = {}
        self._calls: dict[str, deque[float]] = {}
        self._audited: dict[str, float] = {}
        self._denial_at: float | None = None
        self._denials_folded = 0

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

    def refusal_to_audit(self, token_id: str) -> bool:
        """True for the first refusal of a token in AUDIT_REFUSAL_EVERY_S: a client looping above
        the limit writes one audit row a minute, never one per request (so it cannot churn the
        database or evict the owner's real audit rows). Keyed by live token ids only (≤ 10)."""
        now = self.clock()
        last = self._audited.get(token_id)
        if last is not None and now - last < AUDIT_REFUSAL_EVERY_S:
            return False
        self._audited[token_id] = now
        return True

    def denial_to_audit(self) -> int | None:
        """For a refused authentication: None when it folds into the minute's audit row, else the
        number folded since the last row (the new row carries it). Global, not per address: bad
        tokens from any number of addresses or rotating headers write one row a minute, so they
        can never crowd the owner's real audit rows out."""
        now = self.clock()
        if self._denial_at is not None and now - self._denial_at < AUDIT_DENIAL_EVERY_S:
            self._denials_folded += 1
            return None
        folded, self._denials_folded, self._denial_at = self._denials_folded, 0, now
        return folded
