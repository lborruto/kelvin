"""The alert rules of Plan 8 (spec §2.4). Pure: (context, now) → candidates. Plans 9 and 10a
add theirs to RULES."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from kelvin.alerts.service import Rule
from kelvin.alerts.store import Candidate
from kelvin.billing.tariff import Tariff
from kelvin.house.model import House
from kelvin.recorder.db import Database

UNREACHABLE_S = 1800
FAILED_WINDOW_S = 86400
FAILED_MAX = 50
STALL_DAYS = 4
PRICE_BEFORE = timedelta(days=15)
PRICE_AFTER = timedelta(days=45)
CONSENT_WARN_DAYS = 30
CONSENT_BAD_DAYS = 7


@dataclass
class AlertContext:
    tz: ZoneInfo
    today: date
    tariff: Tariff | None
    linky: dict[str, Any] | None
    house: House
    db: Database


def price_change(ctx: AlertContext, now: float) -> list[Candidate]:
    """Regulated prices change on 1 February and 1 August: from 15 days before to 45 days
    after, unless the tariff already has a price row from that day. Never fills a price."""
    if ctx.tariff is None:
        return []
    out = []
    for year in (ctx.today.year - 1, ctx.today.year, ctx.today.year + 1):
        for d in (date(year, 2, 1), date(year, 8, 1)):
            if not d - PRICE_BEFORE <= ctx.today <= d + PRICE_AFTER:
                continue
            if any(p.valid_from >= d for p in ctx.tariff.prices):
                continue
            out.append(
                Candidate("price_change", f"price_change:{d}", "info", {"date": d.isoformat()})
            )
    return out


def consent_expiring(ctx: AlertContext, now: float) -> list[Candidate]:
    st = ctx.linky or {}
    raw = st.get("consent_expires")
    if not st.get("configured") or not isinstance(raw, str):
        return []
    try:
        d = date.fromisoformat(raw[:10])
    except ValueError:
        return []
    days = (d - ctx.today).days
    if days > CONSENT_WARN_DAYS:
        return []
    severity = "bad" if days <= CONSENT_BAD_DAYS else "warn"
    return [
        Candidate(
            "consent_expiring",
            f"consent_expiring:{d}:{severity}",
            severity,
            {"date": d.isoformat(), "days": days},
        )
    ]


def radiator_unreachable(ctx: AlertContext, now: float) -> list[Candidate]:
    out = []
    for rid, r in ctx.house.radiators.items():
        lasted = ctx.house.unreachable_for(rid, now)
        if lasted is None or lasted < UNREACHABLE_S:
            continue
        seen = ctx.house.signal.status_seen[r.heater_url]
        out.append(
            Candidate(
                "radiator_unreachable",
                f"radiator_unreachable:{rid}:{int(seen.since)}",
                "bad",
                {
                    "radiator_id": rid,
                    "room_id": r.room_id,
                    "since": seen.since if seen.known_start else None,
                },
            )
        )
    return out


def command_failed(ctx: AlertContext, now: float) -> list[Candidate]:
    rows = ctx.db.query(
        "SELECT id, ts, label_code, label_params, error_code, error_params, reason_code"
        " FROM command_log"
        " WHERE status = 'failed' AND ts >= ? AND label_code IS NOT NULL"
        " ORDER BY ts DESC LIMIT ?",
        (now - FAILED_WINDOW_S, FAILED_MAX),
    )
    return [
        Candidate(
            "command_failed",
            f"command_failed:{r['id']}",
            "bad",
            {
                "pending_id": r["id"],
                "at": r["ts"],
                "label_code": r["label_code"],
                "label_params": json.loads(r["label_params"] or "{}"),
                "error_code": r["error_code"],
                "error_params": json.loads(r["error_params"] or "{}"),
                # Why a send failed (`quota`, `auth`, `network`, `unknown`; ruling R10).
                "reason_code": r["reason_code"],
            },
        )
        for r in rows
    ]


def linky_stalled(ctx: AlertContext, now: float) -> list[Candidate]:
    """No new Linky day for 4 days, unless the sync is visibly progressing (quota or Enedis
    throttling with a successful call in the last 24 h)."""
    st = ctx.linky or {}
    last = st.get("last_day")
    if not st.get("configured") or not last:
        return []
    try:
        days = (ctx.today - date.fromisoformat(last)).days
    except (TypeError, ValueError):
        return []  # a malformed date is not a stall (and must not fail every evaluation)
    if days < STALL_DAYS:
        return []
    if st.get("state") in ("quota", "throttled") and (st.get("last_ok_at") or 0) >= now - 86400:
        return []
    return [
        Candidate(
            "linky_stalled", f"linky_stalled:{last}", "warn", {"last_day": last, "days": days}
        )
    ]


RULES: dict[str, Rule] = {
    "price_change": price_change,
    "consent_expiring": consent_expiring,
    "radiator_unreachable": radiator_unreachable,
    "command_failed": command_failed,
    "linky_stalled": linky_stalled,
}
