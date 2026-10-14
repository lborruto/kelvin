import asyncio
import json

import pytest

from kelvin.api.sse import Broadcaster


async def test_publish_reaches_subscribers():
    b = Broadcaster()
    q = b.subscribe()
    b.publish("pending", {"id": "x"})
    msg = await asyncio.wait_for(q.get(), 1)
    assert msg["event"] == "pending" and json.loads(msg["data"]) == {"id": "x"}


async def test_slow_client_is_dropped_not_blocking():
    b = Broadcaster(max_queue=3)
    slow, fast = b.subscribe(), b.subscribe()
    for i in range(5):
        b.publish("e", i)
        await fast.get()
    assert b.subscriber_count == 1
    assert slow.qsize() == 3


async def test_dropped_subscriber_stream_terminates():
    from types import SimpleNamespace

    from kelvin.api.sse import event_stream

    b = Broadcaster(max_queue=3)
    rt = SimpleNamespace(broadcaster=b, snapshot=lambda: {})
    gen = event_stream(rt)
    assert (await anext(gen))["event"] == "snapshot"
    for i in range(5):
        b.publish("e", i)
    assert b.subscriber_count == 0
    got = 0
    with pytest.raises(StopAsyncIteration):
        for _ in range(10):
            await asyncio.wait_for(anext(gen), 1)
            got += 1
    assert got <= 3


async def test_idle_stream_sends_a_named_ping_event():
    """A comment ping is invisible to EventSource; a named event lets the client check liveness."""
    from types import SimpleNamespace

    from kelvin.api.sse import event_stream

    rt = SimpleNamespace(broadcaster=Broadcaster(), snapshot=lambda: {})
    gen = event_stream(rt, ping_s=0.01)
    assert (await anext(gen))["event"] == "snapshot"
    msg = await asyncio.wait_for(anext(gen), 1)
    assert msg == {"event": "ping", "data": "{}"}
    rt.broadcaster.publish("status", {"connected": True})
    assert (await asyncio.wait_for(anext(gen), 1))["event"] == "status"
    await gen.aclose()


async def test_stream_stops_when_alive_turns_false():
    from kelvin.api.sse import event_stream

    class _Rt:
        broadcaster = Broadcaster()

        def snapshot(self):
            return {}

    flag = {"ok": True}
    gen = event_stream(_Rt(), alive=lambda: flag["ok"], check_every_s=0, ping_s=0.01)
    assert (await anext(gen))["event"] == "snapshot"
    flag["ok"] = False
    with pytest.raises(StopAsyncIteration):
        await anext(gen)
