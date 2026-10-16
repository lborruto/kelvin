"""One path for every MCP call (spec MCP §3): the runtime check, two calls at a time, error
mapping to stable codes, the redaction backstop and the audit row."""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable
from typing import Any, TypeVar

from mcp.server.mcpserver.exceptions import ToolError
from mcp.shared.exceptions import MCPError

from kelvin.errors import UserError
from kelvin.mcp.errors import TOOL_ERRORS, tool_error
from kelvin.mcp.gate import CURRENT_TOKEN
from kelvin.mcp.shape import Leak, redact

log = logging.getLogger(__name__)
MAX_CONCURRENT = 2
T = TypeVar("T")


class Runner:
    def __init__(self, get_ctx: Callable[[], Any]) -> None:
        self.get_ctx = get_ctx
        self._slots: asyncio.Semaphore | None = None

    def _slots_now(self) -> asyncio.Semaphore:
        if self._slots is None:  # created in the running loop, at the first call
            self._slots = asyncio.Semaphore(MAX_CONCURRENT)
        return self._slots

    async def __call__(
        self,
        kind: str,
        name: str,
        args: dict[str, Any],
        build: Callable[[Any], Awaitable[T]],
        *,
        needs_runtime: bool = True,
    ) -> T:
        ctx = self.get_ctx()
        started = time.monotonic()
        outcome, code = "ok", None
        try:
            if needs_runtime and ctx.rt is None:
                raise tool_error("kelvin_not_running")
            async with self._slots_now():
                return redact(await build(ctx))
        except ToolError as e:
            outcome, code = "error", str(e).split(":", 1)[0]
            raise
        except MCPError:  # a refused prompt argument: its message is for the client
            outcome, code = "error", "invalid_argument"
            raise
        except UserError as e:
            outcome = "error"
            code = e.code if e.code in TOOL_ERRORS else "invalid_argument"
            raise tool_error(code) from None
        except Leak as e:
            outcome, code = "error", "internal_error"
            log.error("mcp %s: a value that must not leave Kelvin was refused at %s", name, e)
            raise tool_error(code) from None
        except Exception as e:  # noqa: BLE001 — never a traceback or a message to the agent
            outcome, code = "error", "internal_error"
            log.error("mcp %s failed (%s)", name, type(e).__name__)
            raise tool_error(code) from None
        finally:
            ms = int((time.monotonic() - started) * 1000)
            ctx.mcp_audit.record(
                token_id=CURRENT_TOKEN.get(),
                kind=kind,
                name=name,
                args=args,
                outcome=outcome,
                error_code=code,
                duration_ms=ms,
            )
            log.info("mcp %s %s: %s in %d ms", kind, name, outcome, ms)
