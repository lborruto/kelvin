"""Response headers every Kelvin page and API answer carries.

Pure ASGI (not BaseHTTPMiddleware) so the SSE stream is passed through unbuffered.
"""

from __future__ import annotations

from typing import Any

SECURITY_HEADERS: tuple[tuple[bytes, bytes], ...] = (
    (b"x-content-type-options", b"nosniff"),
    (b"x-frame-options", b"DENY"),  # no framing: the login form cannot be overlaid
    (b"referrer-policy", b"same-origin"),
)


class SecurityHeaders:
    def __init__(self, app: Any) -> None:
        self.app = app

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_headers(message: dict[str, Any]) -> None:
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                present = {name.lower() for name, _ in headers}
                headers += [(n, v) for n, v in SECURITY_HEADERS if n not in present]
                message = {**message, "headers": headers}
            await send(message)

        await self.app(scope, receive, send_with_headers)
