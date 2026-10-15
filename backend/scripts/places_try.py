"""MANUAL, main session only, with the owner watching: check Cozytouch place writes (Plan 8b).

Read-only by default: one bulk read of the place tree, then its shape (counts and types; no
labels, no ids). With --write --i-am-watching it creates a temporary place « Kelvin test »,
confirms it (event, then targeted re-reads at +5/+15/+30 s), renames it « Kelvin test 2 »,
confirms, deletes it, confirms the 404, then re-reads the house root and every room one by one
(targeted reads, no second bulk read) and checks they equal the first read. It never touches an
existing place or any device. Stop Kelvin first: one session, no second listener.

    uv run python scripts/places_try.py
    uv run python scripts/places_try.py --write --i-am-watching
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from collections import Counter
from collections.abc import Awaitable, Callable
from typing import Any

from kelvin.overkiz.errors import GatewayError, SetupNotFoundError
from kelvin.overkiz.models import PlaceEvent, RawPlace

TEST_LABEL = "Kelvin test"
RENAMED = "Kelvin test 2"
WAIT_S = 30
READ_AT = (5, 15, 30)


def parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Check Cozytouch place writes (read-only by default).")
    p.add_argument("--write", action="store_true", help="create, rename and delete « Kelvin test »")
    p.add_argument("--i-am-watching", action="store_true", help="required with --write")
    args = p.parse_args(argv)
    if args.write and not args.i_am_watching:
        p.error("--write needs --i-am-watching: the owner watches every real write")
    return args


def _walk(p: RawPlace, parent: str | None = None):
    yield parent, p
    for c in p.children:
        yield from _walk(c, p.oid)


async def _confirm(
    gw: Any,
    kind: str,
    done: Callable[[], Awaitable[bool]],
    events: list[str],
    sleep: Callable[[float], Awaitable[None]],
) -> dict[str, Any]:
    """Wait for the place event of `kind`, then confirm by a targeted read (≤ 3 reads)."""
    saw, reads = False, 0
    for second in range(1, WAIT_S + 1):
        await sleep(1)
        for ev in await gw.fetch_events():
            if isinstance(ev, PlaceEvent):
                events.append(ev.kind)
                saw |= ev.kind == kind
        if (saw or second in READ_AT) and reads < len(READ_AT):
            reads += 1
            if await done():
                return {"event": saw, "reads": reads, "ok": True}
    return {"event": saw, "reads": reads, "ok": False}


async def _rooms(gw: Any, root_oid: str) -> list[tuple[str, str, int | None]]:
    """The root's sub-places, by targeted reads (oid, label, type): compared, never printed."""
    root = await gw.read_place(root_oid)
    out = []
    for oid in root.children:
        p = await gw.read_place(oid)
        out.append((p.oid, p.label, p.type))
    return sorted(out)


async def check(
    gw: Any,
    *,
    write: bool,
    sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    out: Callable[[str], None] = print,
) -> dict[str, Any]:
    await gw.login()
    root, _ = await gw.snapshot()  # the one bulk read
    places = list(_walk(root))
    subs = [p for parent, p in places if parent == root.oid]
    types = Counter(p.type for p in subs)
    report: dict[str, Any] = {
        "mode": "write" if write else "read-only",
        "places": len(places),
        "room_types": {str(t): n for t, n in sorted(types.items(), key=lambda kv: str(kv[0]))},
    }
    if not write:
        out(json.dumps(report, ensure_ascii=False))
        return report
    if any(p.label.strip() in (TEST_LABEL, RENAMED) for _, p in places):
        raise SystemExit(
            "A place « Kelvin test » already exists: nothing written. Remove it first."
        )
    known = [t for t in types if t is not None]
    if not known:
        raise SystemExit("No room type to copy: nothing written.")
    room_type = Counter({t: types[t] for t in known}).most_common(1)[0][0]
    before = await _rooms(gw, root.oid)
    events: list[str] = []
    report["room_type"] = room_type
    oid = await gw.create_place(root.oid, TEST_LABEL, room_type)
    out(f"created « {TEST_LABEL} » (type {room_type}); confirming…")

    async def labelled(want: str) -> bool:
        try:
            return (await gw.read_place(oid)).label == want
        except SetupNotFoundError:
            return False

    async def gone() -> bool:
        try:
            await gw.read_place(oid)
        except SetupNotFoundError:
            return True
        return False

    def refused(why: str) -> dict[str, Any]:
        return {"event": False, "reads": 0, "ok": False, "error": why}

    async def still_ours() -> bool:
        """Only the place this run created, and only while it bears a test label."""
        try:
            return (await gw.read_place(oid)).label in (TEST_LABEL, RENAMED)
        except SetupNotFoundError:
            return True  # not there (yet): a delete of this oid touches nothing else

    try:
        report["create"] = await _confirm(
            gw, "created", lambda: labelled(TEST_LABEL), events, sleep
        )
        try:
            current = await gw.read_place(oid)
            if current.label != TEST_LABEL:
                report["rename"] = refused("not the test place")
            else:
                await gw.update_place(oid, RENAMED, current.type, current.metadata)
                report["rename"] = await _confirm(
                    gw, "updated", lambda: labelled(RENAMED), events, sleep
                )
        except GatewayError as e:
            report["rename"] = refused(type(e).__name__)
    finally:
        # Always: the test place never stays. Never anything else than that place.
        try:
            if not await still_ours():
                report["delete"] = refused("not the test place")
                out("the temporary place was renamed meanwhile: left alone, check it by hand")
            else:
                await gw.delete_place(oid)
                report["delete"] = await _confirm(gw, "deleted", gone, events, sleep)
        except GatewayError as e:
            report["delete"] = refused(type(e).__name__)
            out("the temporary place could not be deleted: remove « Kelvin test » by hand")
    report["events"] = events
    report["unchanged"] = await _rooms(gw, root.oid) == before
    out(json.dumps(report, ensure_ascii=False))
    return report


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    from kelvin.overkiz.real import PyOverkizGateway

    gw = PyOverkizGateway(os.environ["COZY_USER"], os.environ["COZY_PASS"])

    async def run() -> dict[str, Any]:
        try:
            return await check(gw, write=args.write)
        finally:
            await gw.close()

    report = asyncio.run(run())
    return 0 if not args.write or report.get("unchanged") else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
