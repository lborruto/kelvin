"""A one-time warning when Kelvin is reached by a non-loopback name with no Host allowlist.

The start already warns when Kelvin listens beyond loopback (kelvin.serve), but inside a
container it always listens on 0.0.0.0, published or not. The first request that arrives
under another name proves the port is reachable from elsewhere: whoever opens an unclaimed
Kelvin first can claim the home, and any host name is accepted (DNS rebinding).

Pure ASGI (not BaseHTTPMiddleware) so the SSE stream is passed through unbuffered.
"""

from __future__ import annotations

import logging
from typing import Any

from kelvin.serve import is_loopback

log = logging.getLogger(__name__)


def host_name(scope: dict[str, Any]) -> str:
    for name, value in scope.get("headers", []):
        if name == b"host":
            host = value.decode("latin-1").strip()
            if host.startswith("["):  # [::1]:8070
                return host[1 : host.find("]")] if "]" in host else host
            return host.rsplit(":", 1)[0] if host.count(":") == 1 else host
    return ""


class ExposureWarning:
    """Logs a WARNING once, at the first request whose Host is not loopback."""

    def __init__(self, app: Any) -> None:
        self.app = app
        self.warned = False

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        if not self.warned and scope["type"] in ("http", "websocket"):
            host = host_name(scope)
            if host and not is_loopback(host):
                self.warned = True
                log.warning(
                    "Kelvin was reached as a host name other than localhost and "
                    "KELVIN_ALLOWED_HOSTS is empty: other machines can reach it. Whoever opens "
                    "an unclaimed Kelvin first can claim the home with their own Cozytouch "
                    "account, and any host name is accepted (DNS rebinding). Set "
                    "KELVIN_ALLOWED_HOSTS to the names and addresses you use (e.g. "
                    "kelvin.lan,192.168.1.10) and keep Kelvin on your LAN or VPN."
                )
        await self.app(scope, receive, send)
