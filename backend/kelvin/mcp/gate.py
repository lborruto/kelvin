"""The /mcp gate (spec MCP §5.2, ruling R2): Kelvin checks the MCP token in front of the SDK.

Pure ASGI, so the SDK's responses pass through untouched. Order: Origin (no browser ever talks
to /mcp: this closes DNS rebinding and cross-site posts), the client's failure lockout, the
bearer token, the token's rate limit, then the SDK with the token id in CURRENT_TOKEN for the
audit. No token material is ever logged or stored."""

from __future__ import annotations

import json
import math
from contextvars import ContextVar
from typing import Any

from starlette.datastructures import Headers

from kelvin.auth.throttle import client_key

CURRENT_TOKEN: ContextVar[str | None] = ContextVar("kelvin_mcp_token", default=None)


def bearer(value: str | None) -> str | None:
    if not value or value[:7].lower() != "bearer ":
        return None
    return value[7:].strip() or None


async def _answer(
    send: Any, status: int, error: str, *, retry_after: float | None = None, challenge: bool = False
) -> None:
    headers = [(b"content-type", b"application/json"), (b"cache-control", b"no-store")]
    if retry_after is not None:
        headers.append((b"retry-after", str(max(1, math.ceil(retry_after))).encode()))
    if challenge:
        headers.append((b"www-authenticate", b'Bearer realm="kelvin"'))
    await send({"type": "http.response.start", "status": status, "headers": headers})
    await send({"type": "http.response.body", "body": json.dumps({"error": error}).encode()})


class McpGate:
    def __init__(self, app: Any) -> None:
        self.app = app

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        ctx = scope["app"].state.ctx
        headers = Headers(scope=scope)
        if "origin" in headers:
            await _answer(send, 403, "origin_refused")
            return
        client = scope.get("client")
        key = client_key(client[0]) if client else "unknown"
        wait = ctx.mcp_limits.failure_wait(key)
        if wait is not None:
            await _answer(send, 429, "too_many_attempts", retry_after=wait)
            return
        record = ctx.mcp_tokens.verify(bearer(headers.get("authorization")))
        if record is None:
            ctx.mcp_limits.failure(key)
            ctx.mcp_audit.refusal(
                token_id=None,
                name="authenticate",
                outcome="denied",
                error_code="invalid_token",
                source=key,
            )
            await _answer(send, 401, "invalid_token", challenge=True)
            return
        wait = ctx.mcp_limits.hit(record.id)
        if wait is not None:
            ctx.mcp_audit.refusal(
                token_id=record.id,
                name="rate_limit",
                outcome="rate_limited",
                error_code="rate_limited",
                source=key,
            )
            await _answer(send, 429, "rate_limited", retry_after=wait)
            return
        ctx.mcp_tokens.touch(record.id)
        reset = CURRENT_TOKEN.set(record.id)
        try:
            await self.app(scope, receive, send)
        finally:
            CURRENT_TOKEN.reset(reset)
