"""Login throttle (spec §3.7): protects the Cozytouch account from a lockout."""

from __future__ import annotations

import ipaddress
import math
import time
from collections import deque
from collections.abc import Callable

from kelvin.errors import french

IP_LIMIT, IP_WINDOW_S = 5, 15 * 60
GLOBAL_LIMIT, GLOBAL_WINDOW_S = 20, 3600


def _trim(q: deque[float], window: float, now: float) -> None:
    while q and q[0] <= now - window:
        q.popleft()


class LoginThrottle:
    def __init__(self, *, clock: Callable[[], float] = time.monotonic) -> None:
        self.clock = clock
        self._ip: dict[str, deque[float]] = {}
        self._all: deque[float] = deque()

    def ip_retry_after(self, ip: str) -> float | None:
        """Seconds until this IP may try a login again, or None. Checked before any comparison."""
        now = self.clock()
        q = self._ip.get(ip)
        if q is None:
            return None
        _trim(q, IP_WINDOW_S, now)
        if len(q) >= IP_LIMIT:
            return q[-IP_LIMIT] + IP_WINDOW_S - now
        if not q:
            del self._ip[ip]
        return None

    def global_retry_after(self) -> float | None:
        """Seconds until Overkiz attempts are allowed again overall, or None."""
        now = self.clock()
        _trim(self._all, GLOBAL_WINDOW_S, now)
        if len(self._all) >= GLOBAL_LIMIT:
            return self._all[-GLOBAL_LIMIT] + GLOBAL_WINDOW_S - now
        return None

    def retry_after(self, ip: str) -> float | None:
        """Seconds until a login attempt from this IP may reach Cozytouch again, or None."""
        waits = [w for w in (self.ip_retry_after(ip), self.global_retry_after()) if w is not None]
        return max(waits) if waits else None

    def failure(self, ip: str, *, reached_overkiz: bool) -> None:
        """Every miss counts against its IP. Only one Cozytouch itself refused counts against
        the global gate, whose purpose is to protect the Cozytouch account: a wrong email or a
        miss decided locally must not let one client block everyone's Overkiz logins."""
        now = self.clock()
        self._ip.setdefault(ip, deque()).append(now)
        if reached_overkiz:
            self._all.append(now)

    def success(self, ip: str) -> None:
        self._ip.pop(ip, None)


def client_key(host: str) -> str:
    """The per-IP bucket: IPv6 clients by their /64 (SLAAC gives one device many addresses),
    IPv4-mapped IPv6 as IPv4, IPv4 as is."""
    try:
        addr = ipaddress.ip_address(host)
    except ValueError:
        return host
    if isinstance(addr, ipaddress.IPv6Address):
        if addr.ipv4_mapped is not None:
            return str(addr.ipv4_mapped)
        return str(ipaddress.IPv6Network((addr, 64), strict=False))
    return str(addr)


def retry_minutes(seconds: float) -> int:
    return max(1, math.ceil(seconds / 60))


def retry_message(seconds: float) -> str:
    return french("too_many_attempts", {"minutes": retry_minutes(seconds)})
