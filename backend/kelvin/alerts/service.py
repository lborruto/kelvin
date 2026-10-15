"""Runs the alert rules (spec §2.4): every 5 min and soon after the events that matter."""

from __future__ import annotations

import asyncio
import contextlib
import logging
import time
from collections.abc import Callable
from typing import Any

from kelvin.alerts.store import AlertStore, Candidate

log = logging.getLogger(__name__)

EVERY_S = 300.0
Rule = Callable[[Any, float], list[Candidate]]


class AlertService:
    def __init__(
        self,
        store: AlertStore,
        rules: dict[str, Rule],
        context: Callable[[], Any],
        *,
        publish: Callable[[dict[str, Any]], None],
        wall: Callable[[], float] = time.time,
    ) -> None:
        self.store = store
        self.rules = rules
        self.context = context
        self.publish = publish
        self.wall = wall
        self._published: dict[str, Any] | None = None
        self._wake = asyncio.Event()

    def _publish_if_changed(self) -> dict[str, Any]:
        summary = self.store.summary()
        if summary != self._published:
            self._published = summary
            self.publish(summary)
        return summary

    def evaluate(self) -> dict[str, Any]:
        now = self.wall()
        ctx = self.context()
        candidates: list[Candidate] = []
        ran: set[str] = set()
        for kind, rule in self.rules.items():
            try:
                found = rule(ctx, now)
            except Exception:  # one broken rule never hides or resolves the others
                log.exception("alert rule %s failed", kind)
                continue
            candidates += [c for c in found if c.kind == kind]
            ran.add(kind)
        self.store.sync(candidates, ran)
        self.store.prune()
        return self._publish_if_changed()

    def dismiss(self, alert_id: int) -> bool:
        ok = self.store.dismiss(alert_id)
        if ok:
            self._publish_if_changed()
        return ok

    def request(self) -> None:
        self._wake.set()

    async def run(self, every: float = EVERY_S) -> None:
        while True:
            self._wake.clear()
            try:
                self.evaluate()
            except Exception:
                log.exception("alert evaluation failed")
            with contextlib.suppress(TimeoutError):
                await asyncio.wait_for(self._wake.wait(), timeout=every)
            await asyncio.sleep(1.0)  # let a burst of events settle before re-evaluating
