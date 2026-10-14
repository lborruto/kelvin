from __future__ import annotations

import asyncio
import json
import time
from collections.abc import AsyncIterator, Callable
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from kelvin.api.runtime import Runtime


class Broadcaster:
    def __init__(self, max_queue: int = 200) -> None:
        self.max_queue = max_queue
        self._subs: set[asyncio.Queue] = set()

    @property
    def subscriber_count(self) -> int:
        return len(self._subs)

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=self.max_queue)
        self._subs.add(q)
        return q

    def is_subscribed(self, q: asyncio.Queue) -> bool:
        return q in self._subs

    def unsubscribe(self, q: asyncio.Queue) -> None:
        self._subs.discard(q)

    def publish(self, event: str, data: Any) -> None:
        msg = {"event": event, "data": json.dumps(data, ensure_ascii=False, default=str)}
        for q in list(self._subs):
            try:
                q.put_nowait(msg)
            except asyncio.QueueFull:
                # Client too slow: drop it. Its event_stream ends once it has drained the
                # buffer, so the browser's EventSource reconnects and gets a fresh snapshot.
                self._subs.discard(q)


PING_S = 15.0


async def event_stream(
    rt: Runtime,
    request: Any = None,
    *,
    ping_s: float = PING_S,
    alive: Callable[[], bool] | None = None,
    check_every_s: float = PING_S,
    clock: Callable[[], float] = time.monotonic,
) -> AsyncIterator[dict[str, str]]:
    """Snapshot first, then broadcast events; a named `ping` event when idle for ping_s.

    The ping is a real event (not an SSE comment) so the browser can see the stream is alive
    and reconnect when it goes quiet (half-open connection after a network change).
    `alive` is re-checked every check_every_s: a stream whose session ended (logout, expiry)
    closes, and the browser's reconnect then gets 401.
    """
    q = rt.broadcaster.subscribe()
    last_check = clock()
    try:
        yield {
            "event": "snapshot",
            "data": json.dumps(rt.snapshot(), ensure_ascii=False, default=str),
        }
        while True:
            if not rt.broadcaster.is_subscribed(q) and q.empty():
                break  # dropped as too slow: end the stream so the client resyncs
            if request is not None and await request.is_disconnected():
                break
            if alive is not None and clock() - last_check >= check_every_s:
                last_check = clock()
                if not alive():
                    break
            try:
                msg = await asyncio.wait_for(q.get(), timeout=ping_s)
            except TimeoutError:
                yield {"event": "ping", "data": "{}"}
                continue
            yield msg
    finally:
        rt.broadcaster.unsubscribe(q)
