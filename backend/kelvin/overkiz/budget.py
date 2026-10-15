"""Overkiz call budget (spec ruling 8).

The Overkiz end-user API documents `GET /setup`, `/setup/devices` and `/setup/places` as
"1 call per 1d (bulk-load)" per session. Kelvin reads the whole setup only at startup, after a
reconnect and on demand, and never more than FULL_READS_PER_DAY times in any 24 h. Everything
else comes from events and from per-device state reads (`GET /setup/devices/{url}/states`),
which have no documented limit.
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections import deque
from collections.abc import Awaitable, Callable, Iterable
from typing import Any

from kelvin.overkiz.errors import GatewayError

log = logging.getLogger(__name__)

FULL_READS_PER_DAY = 3
DAY_S = 86400.0


class SetupReadGuard:
    """A rolling 24 h budget of full setup reads (places + devices).

    One guard serves the whole process (startup, retries, logins and the pump). `reads` are
    stored timestamps and `on_record` stores them again after each read, so a restart (or a
    crash loop) cannot reset the budget.
    """

    def __init__(
        self,
        limit: int = FULL_READS_PER_DAY,
        *,
        wall: Callable[[], float] = time.time,
        reads: Iterable[float] = (),
        on_record: Callable[[list[float]], None] | None = None,
    ) -> None:
        self.limit = limit
        self.wall = wall
        self.on_record = on_record
        now = wall()
        # A stored time in the future (clock set back) counts as now: it cannot block for ever.
        self._reads: deque[float] = deque(
            sorted(min(float(t), now) for t in reads if isinstance(t, int | float))
        )

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
        if self.on_record is not None:
            self.on_record(list(self._reads))

    def used(self) -> int:
        self._trim()
        return len(self._reads)

    def next_at(self, reserve: int = 0) -> float | None:
        """When the next full read is possible (keeping `reserve` reads back): None when one
        is possible now."""
        self._trim()
        free = self.limit - reserve
        if len(self._reads) < free:
            return None
        if free <= 0:
            return None if not self._reads else self._reads[-1] + DAY_S
        return self._reads[len(self._reads) - free] + DAY_S

    def remaining(self) -> int:
        """Full reads left in the rolling 24 h (negative after a startup overdraft)."""
        return self.limit - self.used()


QUOTA_CACHE_S = 3600.0
QUOTA_ERROR_CACHE_S = 60.0
MAX_QUOTA_ENTRIES = 50
MAX_TEXT = 100
_PRIVATE_KEY_PARTS = (
    "url",
    "gateway",
    "setup",
    "user",
    "email",
    "oid",
    "serial",
    "account",
    "token",
    "device",
    "place",
)
_PRIVATE_TEXT = ("://", "@")
_ID_SUFFIXES = ("Id", "ID", "_id", "Ids", "IDs", "_ids")


def _private(key: str) -> bool:
    low = key.lower()
    return low == "id" or key.endswith(_ID_SUFFIXES) or any(p in low for p in _PRIVATE_KEY_PARTS)


def sanitize_quotas(raw: Any) -> list[dict[str, Any]]:
    """`GET /setup/quotas`, whose shape is not documented: keep at most 50 objects, and in each
    only scalar values under keys that cannot name an id, a URL or an account, and no text that
    looks like a URL or an email address."""
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
            elif isinstance(v, str) and not any(p in v for p in _PRIVATE_TEXT):
                clean[k[:MAX_TEXT]] = v[:MAX_TEXT]
        if clean:
            out.append(clean)
    return out


class QuotasUnavailable(Exception):
    """The quota read failed for a reason other than Overkiz itself (an unexpected answer)."""


class QuotaReadout:
    """The remaining Overkiz quotas, read at most once an hour, only when asked for.

    One read at a time; a failed read is not retried for QUOTA_ERROR_CACHE_S. An Overkiz failure
    raises GatewayError, any other failure QuotasUnavailable (never an unhandled error)."""

    def __init__(
        self,
        fetch: Callable[[], Awaitable[Any]],
        *,
        wall: Callable[[], float] = time.time,
        ttl: float = QUOTA_CACHE_S,
        error_ttl: float = QUOTA_ERROR_CACHE_S,
    ) -> None:
        self.fetch = fetch
        self.wall = wall
        self.ttl = ttl
        self.error_ttl = error_ttl
        self._value: dict[str, Any] | None = None
        self._failed_at: float | None = None
        self._failure: type[Exception] = GatewayError
        self._lock = asyncio.Lock()

    async def get(self) -> dict[str, Any]:
        async with self._lock:
            if self._failed_at is not None and self.wall() - self._failed_at < self.error_ttl:
                raise self._failure("quota read failed recently")
            if self._value is None or self.wall() - self._value["fetched_at"] >= self.ttl:
                try:
                    raw = await self.fetch()
                except GatewayError:
                    self._failed_at, self._failure = self.wall(), GatewayError
                    raise
                except Exception as e:  # an answer of an unexpected shape, a bug in a gateway
                    log.warning("quota read failed (%s)", type(e).__name__)
                    self._failed_at, self._failure = self.wall(), QuotasUnavailable
                    raise QuotasUnavailable("quota read failed") from None
                self._failed_at = None
                self._value = {"fetched_at": self.wall(), "quotas": sanitize_quotas(raw)}
            return self._value
