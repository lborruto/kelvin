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
from collections.abc import Awaitable, Callable
from typing import Any

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


QUOTA_CACHE_S = 3600.0
MAX_QUOTA_ENTRIES = 50
MAX_TEXT = 100
_PRIVATE_KEY_PARTS = ("url", "gateway", "setup", "user", "email", "oid", "serial")
_ID_SUFFIXES = ("Id", "ID", "_id", "Ids", "IDs", "_ids")


def _private(key: str) -> bool:
    low = key.lower()
    return low == "id" or key.endswith(_ID_SUFFIXES) or any(p in low for p in _PRIVATE_KEY_PARTS)


def sanitize_quotas(raw: Any) -> list[dict[str, Any]]:
    """`GET /setup/quotas`, whose shape is not documented: keep at most 50 objects, and in each
    only scalar values under keys that cannot name an id, a URL or an account."""
    items = raw if isinstance(raw, list) else [raw] if isinstance(raw, dict) else []
    out: list[dict[str, Any]] = []
    for item in items[:MAX_QUOTA_ENTRIES]:
        if not isinstance(item, dict):
            continue
        clean: dict[str, Any] = {}
        for k, v in item.items():
            if not isinstance(k, str) or _private(k):
                continue
            if isinstance(v, bool | int | float) or v is None:
                clean[k[:MAX_TEXT]] = v
            elif isinstance(v, str):
                clean[k[:MAX_TEXT]] = v[:MAX_TEXT]
        if clean:
            out.append(clean)
    return out


class QuotaReadout:
    """The remaining Overkiz quotas, read at most once an hour, only when asked for."""

    def __init__(
        self,
        fetch: Callable[[], Awaitable[Any]],
        *,
        wall: Callable[[], float] = time.time,
        ttl: float = QUOTA_CACHE_S,
    ) -> None:
        self.fetch = fetch
        self.wall = wall
        self.ttl = ttl
        self._value: dict[str, Any] | None = None

    async def get(self) -> dict[str, Any]:
        if self._value is None or self.wall() - self._value["fetched_at"] >= self.ttl:
            raw = await self.fetch()
            self._value = {"fetched_at": self.wall(), "quotas": sanitize_quotas(raw)}
        return self._value
