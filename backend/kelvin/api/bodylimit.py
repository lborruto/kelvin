"""A size limit on /api request bodies, in front of routing.

FastAPI buffers a JSON body before any dependency runs, so without this anyone who reaches the
port (no session, no X-Kelvin header) could make Kelvin hold a body of any size in memory. A
declared Content-Length above the limit is refused before a byte is read; a body without one
(chunked) is counted as it streams and cut off at the limit. /mcp has its own limit
(kelvin.mcp.server.MAX_BODY).

Pure ASGI (not BaseHTTPMiddleware) so the SSE stream is passed through unbuffered.
"""

from __future__ import annotations

import json
from typing import Any

from kelvin.errors import UserError

# The largest bodies the schemas allow are a full tariff document (about 47 KiB) and a
# programme send carrying the `base` of 50 radiators (about 45 KiB); the web's own bodies are
# far smaller. tests/test_body_limit.py keeps the margin.
MAX_API_BODY = 256 * 1024


def _is_api(path: str) -> bool:
    return path == "/api" or path.startswith("/api/")


def _declared_length(scope: dict[str, Any]) -> int | None:
    for name, value in scope.get("headers", []):
        if name == b"content-length":
            try:
                return int(value)
            except ValueError:
                return None  # the body is counted as it streams instead
    return None


async def _refuse(send: Any) -> None:
    error = UserError("invalid_request", 413)
    body = json.dumps(error.body()).encode()
    await send(
        {
            "type": "http.response.start",
            "status": error.status,
            "headers": [
                (b"content-type", b"application/json"),
                (b"content-length", str(len(body)).encode()),
                (b"connection", b"close"),  # the rest of the body is never read
            ],
        }
    )
    await send({"type": "http.response.body", "body": body})


class BodyLimit:
    def __init__(self, app: Any, limit: int = MAX_API_BODY) -> None:
        self.app = app
        self.limit = limit

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        if scope["type"] != "http" or not _is_api(scope.get("path", "")):
            await self.app(scope, receive, send)
            return
        declared = _declared_length(scope)
        if declared is not None and declared > self.limit:
            await _refuse(send)
            return
        read = 0
        refused = False

        async def counted_receive() -> dict[str, Any]:
            nonlocal read, refused
            if refused:
                return {"type": "http.disconnect"}
            message = await receive()
            if message["type"] == "http.request":
                read += len(message.get("body", b""))
                if read > self.limit:
                    # Answer now and hand the app a disconnect: it stops reading, and whatever
                    # it then tries to send is dropped below.
                    refused = True
                    await _refuse(send)
                    return {"type": "http.disconnect"}
            return message

        async def guarded_send(message: dict[str, Any]) -> None:
            if not refused:
                await send(message)

        await self.app(scope, counted_receive, guarded_send)
