"""MANUAL, main session only, with the owner watching: check Cozytouch place writes (Plan 8b).

Read-only by default: one bulk read of the place tree, then its shape (counts and types; no
labels, no ids). With --write --i-am-watching it creates a temporary place « Kelvin test »,
confirms it (event, then targeted re-reads at +5/+15/+30 s), renames it « Kelvin test 2 »,
confirms, deletes it, confirms the 404, then re-reads the house root and every room one by one
(targeted reads, no second bulk read) and checks they equal the first read. It never touches an
existing place or any device: every write targets the oid this run created, and only while that
place still bears a test label. Whatever happens (an error, Ctrl-C), the report is printed, the
tree is re-read and a « Kelvin test » left behind is announced. Stop Kelvin first: one session,
no second listener.

The bulk read is one of the day's full setup reads (Overkiz: "1 call per 1d"). When Kelvin's
database exists under KELVIN_DATA, the read is debited from Kelvin's stored budget (and refused
when it is spent); without it, Kelvin does not see it, and Overkiz's own quota is the only limit.

Exit code: 0 for a read-only run; with --write, 0 only when every step succeeded and the house
is unchanged.

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

from kelvin.overkiz.budget import SetupReadGuard
from kelvin.overkiz.errors import GatewayError, SetupNotFoundError
from kelvin.overkiz.models import PlaceEvent, RawPlace

TEST_LABEL = "Kelvin test"
RENAMED = "Kelvin test 2"
WAIT_S = 30
READ_AT = (5, 15, 30)

Sleep = Callable[[float], Awaitable[None]]
Tree = tuple[str, "int | None", tuple[tuple[str, str, "int | None"], ...]]


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


def _is_test(label: str) -> bool:
    return label.strip().casefold() in (TEST_LABEL.casefold(), RENAMED.casefold())


def _refused(why: str) -> dict[str, Any]:
    return {"event": False, "reads": 0, "ok": False, "error": why}


async def _confirm(
    gw: Any,
    kind: str,
    done: Callable[[], Awaitable[bool]],
    events: list[str],
    sleep: Sleep,
) -> dict[str, Any]:
    """Wait for the place event of `kind`; read once when it arrives, else at READ_AT (≤ 3
    reads): the event may come before the change is readable."""
    saw, reads, read_on_event = False, 0, False
    for second in range(1, WAIT_S + 1):
        await sleep(1)
        for ev in await gw.fetch_events():
            if isinstance(ev, PlaceEvent):
                events.append(ev.kind)
                saw |= ev.kind == kind
        due = second in READ_AT or (saw and not read_on_event)
        if due and reads < len(READ_AT):
            read_on_event |= saw
            reads += 1
            if await done():
                return {"event": saw, "reads": reads, "ok": True}
    return {"event": saw, "reads": reads, "ok": False}


async def _tree(gw: Any, root_oid: str) -> Tree:
    """The root's label and type and its sub-places, by targeted reads: compared, never
    printed."""
    root = await gw.read_place(root_oid)
    rooms = []
    for oid in root.children:
        p = await gw.read_place(oid)
        rooms.append((p.oid, p.label, p.type))
    return root.label, root.type, tuple(sorted(rooms))


async def _appears(gw: Any, oid: str, sleep: Sleep) -> bool:
    """After a 404: is the place still appearing? Targeted reads at READ_AT only."""
    for second in range(1, WAIT_S + 1):
        await sleep(1)
        if second in READ_AT:
            try:
                await gw.read_place(oid)
                return True
            except SetupNotFoundError:
                pass
    return False


async def _stray(gw: Any, root_oid: str, known: set[str], sleep: Sleep) -> bool:
    """After a create that failed client-side: did a test place appear anyway? Reads only."""
    for second in range(1, WAIT_S + 1):
        await sleep(1)
        if second not in READ_AT:
            continue
        try:
            for oid in (await gw.read_place(root_oid)).children:
                if oid not in known and _is_test((await gw.read_place(oid)).label):
                    return True
        except GatewayError:
            return False
    return False


async def _cleanup(
    gw: Any,
    oid: str,
    events: list[str],
    sleep: Sleep,
    out: Callable[[str], None],
) -> dict[str, Any]:
    """Delete the place this run created, and only while it bears a test label."""

    async def ours() -> bool:
        try:
            return _is_test((await gw.read_place(oid)).label)
        except SetupNotFoundError:
            return True  # not there (yet): a delete of this oid touches nothing else

    async def gone() -> bool:
        try:
            await gw.read_place(oid)
        except SetupNotFoundError:
            return True
        return False

    try:
        if not await ours():
            out("the temporary place was renamed meanwhile: left alone, check it by hand")
            return _refused("not the test place")
        resent = False
        try:
            await gw.delete_place(oid)
        except SetupNotFoundError:
            # Too early: the place may still be appearing. Look before saying anything.
            if not await _appears(gw, oid, sleep):
                return {"event": False, "reads": len(READ_AT), "ok": True, "absent": True}
            if not await ours():
                out("the temporary place was renamed meanwhile: left alone, check it by hand")
                return _refused("not the test place")
            # The one re-sent write: the same created oid, which can touch nothing else.
            await gw.delete_place(oid)
            resent = True
        result = await _confirm(gw, "deleted", gone, events, sleep)
        result["resent"] = resent
        return result
    except GatewayError as e:
        out(f"the temporary place could not be deleted: remove « {TEST_LABEL} » by hand")
        return _refused(type(e).__name__)


async def _steps(
    gw: Any, oid: str, report: dict[str, Any], events: list[str], sleep: Sleep
) -> None:
    """Confirm the create, then rename and confirm. Errors are recorded, never raised."""

    async def labelled(want: str) -> bool:
        try:
            return (await gw.read_place(oid)).label == want
        except SetupNotFoundError:
            return False

    try:
        report["create"] = await _confirm(
            gw, "created", lambda: labelled(TEST_LABEL), events, sleep
        )
    except GatewayError as e:
        report["create"] = _refused(type(e).__name__)
    if not report["create"]["ok"]:
        report["rename"] = _refused("create not confirmed")
        return
    try:
        current = await gw.read_place(oid)
        if current.label != TEST_LABEL:
            report["rename"] = _refused("not the test place")
            return
        await gw.update_place(oid, RENAMED, current.type, current.metadata)
        report["rename"] = await _confirm(gw, "updated", lambda: labelled(RENAMED), events, sleep)
    except GatewayError as e:
        report["rename"] = _refused(type(e).__name__)


async def check(
    gw: Any,
    *,
    write: bool,
    sleep: Sleep = asyncio.sleep,
    out: Callable[[str], None] = print,
    guard: SetupReadGuard | None = None,
) -> dict[str, Any]:
    await gw.login()
    if guard is not None:
        if not guard.allowed():
            raise SystemExit("Kelvin's full setup reads for today are spent: nothing read.")
        guard.record()  # made or attempted, like Kelvin counts it
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
    if any(_is_test(p.label) for _, p in places):
        raise SystemExit(
            "A place « Kelvin test » already exists: nothing written. Remove it first."
        )
    known = [t for t in types if t is not None]
    if not known:
        raise SystemExit("No room type to copy: nothing written.")
    room_type = Counter({t: types[t] for t in known}).most_common(1)[0][0]
    before = await _tree(gw, root.oid)
    # The final « unchanged » compares targeted reads: they must see what the bulk read saw,
    # or the comparison would prove nothing (an empty list equals an empty list).
    if (before[0], before[1]) != (root.label, root.type) or {r[0] for r in before[2]} != {
        p.oid for p in subs
    }:
        raise SystemExit("The targeted reads do not match the bulk read: nothing written.")
    report["room_type"] = room_type
    events: list[str] = []
    cancelled: BaseException | None = None
    try:
        oid: str | None = None
        try:
            oid = await gw.create_place(root.oid, TEST_LABEL, room_type)
            out(f"created « {TEST_LABEL} » (type {room_type}); confirming…")
        except GatewayError as e:
            report["create"] = _refused(type(e).__name__)
            out("the create failed; it may still have reached Cozytouch: looking for it")
            await _stray(gw, root.oid, {r[0] for r in before[2]}, sleep)
        if oid is not None:
            try:
                await _steps(gw, oid, report, events, sleep)
            except asyncio.CancelledError as e:  # Ctrl-C: clean up and report, then stop
                cancelled = e
                report.setdefault("create", _refused("cancelled"))
                report.setdefault("rename", _refused("cancelled"))
            report["delete"] = await _cleanup(gw, oid, events, sleep, out)
    finally:
        report["events"] = events
        try:
            after = await _tree(gw, root.oid)
            report["unchanged"] = after == before
            stray = [r for r in after[2] if _is_test(r[1]) and r not in before[2]]
            if stray:
                out(f"« {TEST_LABEL} » is still on the account: remove it by hand")
        except GatewayError as e:
            report["unchanged"] = False
            report["after_read"] = type(e).__name__
            out(f"the house could not be re-read: check for « {TEST_LABEL} » by hand")
        steps = (report.get(k) or {} for k in ("create", "rename", "delete"))
        report["ok"] = report["unchanged"] and all(s.get("ok") is True for s in steps)
        out(json.dumps(report, ensure_ascii=False))
    if cancelled is not None:
        raise cancelled
    return report


def exit_code(report: dict[str, Any]) -> int:
    return 0 if report.get("mode") != "write" or report.get("ok") is True else 1


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    from kelvin.api.context import SETUP_READS_KEY
    from kelvin.config import Settings
    from kelvin.overkiz.real import PyOverkizGateway
    from kelvin.recorder.db import Database

    path = Settings().kelvin_data / "kelvin.db"
    db = Database(path) if path.exists() else None
    guard = None
    if db is not None:
        stored = db.get_setting(SETUP_READS_KEY, [])
        guard = SetupReadGuard(
            reads=stored if isinstance(stored, list) else [],
            on_record=lambda reads: db.set_setting(SETUP_READS_KEY, reads),
        )
    gw = PyOverkizGateway(os.environ["COZY_USER"], os.environ["COZY_PASS"])

    async def run() -> dict[str, Any]:
        try:
            return await check(gw, write=args.write, guard=guard)
        finally:
            await gw.close()

    try:
        return exit_code(asyncio.run(run()))
    finally:
        if db is not None:
            db.close()


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
