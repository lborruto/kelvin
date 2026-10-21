"""The alert rules of Plans 8 and 9 (spec §2.4). Pure: (context, now) → candidates. Plan 10a
adds its own to RULES."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from kelvin.alerts.service import Rule
from kelvin.alerts.store import Candidate
from kelvin.billing.tariff import Tariff
from kelvin.grid import service as grid_service
from kelvin.grid.models import EcowattDay
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
AWAY_OPEN_REMIND_DAYS = 7


@dataclass
class AlertContext:
    tz: ZoneInfo
    today: date
    tariff: Tariff | None
    linky: dict[str, Any] | None
    house: House
    db: Database
    tempo: dict[date, str] = field(default_factory=dict)  # today and tomorrow (Tempo days)
    ecowatt: dict[date, EcowattDay] = field(default_factory=dict)  # today and tomorrow
    contract: dict[str, Any] | None = None  # the last contract read (Enedis via MED)
    # The overrides as `OverrideManager.peek()` lists them (never settles a restore).
    overrides: list[dict[str, Any]] = field(default_factory=list)


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


def _open_unreachable(db: Database) -> dict[str, tuple[str, dict[str, Any]]]:
    """The unreachable alerts still open, by radiator: (key, params)."""
    out: dict[str, tuple[str, dict[str, Any]]] = {}
    for row in db.query(
        "SELECT key, params FROM alerts WHERE kind = 'radiator_unreachable' AND resolved_at IS NULL"
    ):
        params = json.loads(row["params"])
        if isinstance(params.get("radiator_id"), str):
            out[params["radiator_id"]] = (row["key"], params)
    return out


def radiator_unreachable(ctx: AlertContext, now: float) -> list[Candidate]:
    """`core:StatusState` unavailable for 30 continuous minutes. Kelvin's memory of when a run
    began is lost at a restart, so an outage it already alerted on and never saw end keeps its
    key (and its dismissal) across restarts; a run seen only from a start is keyed `startup`,
    stable across restarts too (final review I1)."""
    out = []
    open_ = _open_unreachable(ctx.db)
    for rid, r in ctx.house.radiators.items():
        lasted = ctx.house.unreachable_for(rid, now)
        if lasted is None:
            continue
        seen = ctx.house.signal.status_seen[r.heater_url]
        since = seen.since if seen.known_start else None
        prior = open_.get(rid)
        if prior is not None:  # the same outage: never seen ending
            key = prior[0]
            since = prior[1].get("since", since)
        elif lasted < UNREACHABLE_S:
            continue
        else:
            key = f"radiator_unreachable:{rid}:{int(seen.since) if seen.known_start else 'startup'}"
        out.append(
            Candidate(
                "radiator_unreachable",
                key,
                "bad",
                {"radiator_id": rid, "room_id": r.room_id, "since": since},
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


def tempo_red_tomorrow(ctx: AlertContext, now: float) -> list[Candidate]:
    """Tomorrow is a red Tempo day and tomorrow is Tempo-priced (ruling 1: Tempo only)."""
    tomorrow = ctx.today + timedelta(days=1)
    if ctx.tariff is None or ctx.tariff.option_on(tomorrow) != "tempo":
        return []
    if ctx.tempo.get(tomorrow) != "red":
        return []
    d = tomorrow.isoformat()
    return [Candidate("tempo_red_tomorrow", f"tempo_red_tomorrow:{d}", "warn", {"date": d})]


def ecowatt(ctx: AlertContext, now: float) -> list[Candidate]:
    """EcoWatt orange (2) or red (3) today or tomorrow, for every household (ruling 1). The
    level is in the key, so a dismissed orange that turns red shows again."""
    out = []
    for d in (ctx.today, ctx.today + timedelta(days=1)):
        e = ctx.ecowatt.get(d)
        if e is None or e.level < 2:
            continue
        hours = (
            grid_service.hour_runs(e.hours)
            if grid_service.ECOWATT_HOURS_VERIFIED and e.hours
            else None
        )
        out.append(
            Candidate(
                "ecowatt",
                f"ecowatt:{d.isoformat()}:{e.level}",
                "bad" if e.level >= 3 else "warn",
                {"date": d.isoformat(), "level": e.level, "hours": hours},
            )
        )
    return out


def hc_changed(ctx: AlertContext, now: float) -> list[Candidate]:
    """The contract's off-peak hours differ from today's and from every later schedule's for
    this month. Kelvin never applies them: the alert offers to add them from a date (spec §2.2)."""
    t = ctx.tariff
    raw = (ctx.contract or {}).get("offpeak") or []
    if t is None or not raw or t.option_on(ctx.today) != "hchp":
        return []
    offered = tuple(sorted((s["start"], s["end"]) for s in raw))
    known = {tuple(sorted((s.start, s.end) for s in (t.slots_on(ctx.today) or ())))}
    for s in t.hc_schedules:
        if s.valid_from > ctx.today:
            slots = s.slots_for_month(ctx.today.month) or ()
            known.add(tuple(sorted((x.start, x.end) for x in slots)))
    if offered in known:
        return []
    sig = ",".join(f"{a}-{b}" for a, b in offered)
    return [
        Candidate(
            "hc_changed",
            f"hc_changed:{sig}",
            "info",
            {"slots": [{"start": a, "end": b} for a, b in offered]},
        )
    ]


def away_open_long(ctx: AlertContext, now: float) -> list[Candidate]:
    """A gentle reminder: an open-ended absence (« Jusqu’à mon retour ») has run 7 days or more.
    Keyed on the absence, so a dismissal holds until the owner starts another; resolved when it
    ends. `days` counts whole days since its start."""
    out = []
    for o in ctx.overrides:
        since = o.get("created_at")
        if o.get("kind") != "away" or not o.get("open_ended") or o.get("restoring"):
            continue
        if not isinstance(since, int | float) or since <= 0:
            continue
        days = int((now - since) // 86400)
        if days < AWAY_OPEN_REMIND_DAYS:
            continue
        out.append(
            Candidate(
                "away_open_long",
                f"away_open_long:{o['id']}",
                "info",
                {"since": since, "days": days},
            )
        )
    return out


RULES: dict[str, Rule] = {
    "price_change": price_change,
    "consent_expiring": consent_expiring,
    "radiator_unreachable": radiator_unreachable,
    "command_failed": command_failed,
    "linky_stalled": linky_stalled,
    "tempo_red_tomorrow": tempo_red_tomorrow,
    "ecowatt": ecowatt,
    "hc_changed": hc_changed,
    "away_open_long": away_open_long,
}
