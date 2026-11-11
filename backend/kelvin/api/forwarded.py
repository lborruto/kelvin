"""A one-time warning when a request carries X-Forwarded-For and no proxy is trusted.

That header is the sign of a reverse proxy in front of Kelvin. With KELVIN_TRUSTED_PROXIES
empty the header is ignored (kelvin.serve), so every client has the proxy's address: they
share one login throttle key and one MCP lockout. The line never holds the header's value,
which a client chooses.

Pure ASGI (not BaseHTTPMiddleware) so the SSE stream is passed through unbuffered.
"""

from __future__ import annotations

import logging
from typing import Any

log = logging.getLogger(__name__)


class ForwardedWarning:
    """Logs a WARNING once, at the first request with an X-Forwarded-For header."""

    def __init__(self, app: Any) -> None:
        self.app = app
        self.warned = False

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        if (
            not self.warned
            and scope["type"] in ("http", "websocket")
            and any(name == b"x-forwarded-for" for name, _ in scope.get("headers", []))
        ):
            self.warned = True
            log.warning(
                "A request carried an X-Forwarded-For header and KELVIN_TRUSTED_PROXIES is "
                "empty: if a reverse proxy sits in front of Kelvin, every client looks like "
                "the proxy, so they all share one login throttle and one MCP lockout, and "
                "the session cookie is not marked Secure. Set KELVIN_TRUSTED_PROXIES to the "
                "proxy's exact address. Without a proxy, ignore this: the header is not read."
            )
        await self.app(scope, receive, send)
