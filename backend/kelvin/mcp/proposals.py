"""Savings proposals (spec MCP §6). Measured exposure first; an estimate only when Kelvin's own
prices give it with the consumption held equal, labelled as an upper bound or a proportional
estimate; never a promise (PRODUCT.md Truthfulness). Pure functions over facts the tools read
from the report and the house. English machine text (ruling R1)."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from kelvin.commands.translate import normalize_program  # pure: validates, sends nothing
from kelvin.errors import UserError
from kelvin.house.model import DAY_ORDER

SAME = "same_consumption"
PROMISE_WORDS = re.compile(r"\b(will save|you save|guarantee[ds]?|savings of)\b", re.I)
DEFAULT_STEP = 30  # the programme step when a room names none (kelvin.devices.registry)
_HHMM = re.compile(r"^([01]\d|2[0-4]):([0-5]\d)$")


@dataclass(frozen=True)
class RoomFacts:
    room_id: str
    name: str
    peak_kwh: float | None
    offpeak_kwh: float | None
    cost_eur: float | None
    coverage_share: float | None
    comfort_c: float | None
    eco_c: float | None
    heating_hours: float | None
    radiators: list[dict[str, Any]] = field(default_factory=list)  # per radiator stats
    manual_setpoint: bool = False
    in_programme: bool = False
    peak_share: float | None = None
    comfort_minutes: int | None = None


@dataclass(frozen=True)
class HouseFacts:
    days: int
    option: str | None
    rates: dict[str, float]
    tempo_rows: list[dict[str, Any]] | None
    tempo_days: dict[str, int] | None
    tomorrow_colour: str | None
    tempo_hours: dict[str, str] | None
    coverage_share: float | None
    missing_days: int
    linky_last_day: str | None


def _proposal(
    kind: str,
    *,
    title: str,
    rationale: str,
    basis: str,
    figures: dict[str, Any],
    estimate: dict[str, Any] | None,
    assumptions: list[str],
    apply_in_app: dict[str, str],
    room_id: str | None = None,
) -> dict[str, Any]:
    return {
        "kind": kind,
        "scope": {"room_id": room_id} if room_id else {"house": True},
        "title": title,
        "rationale": rationale,
        "basis": basis,
        "figures": figures,
        "estimate": estimate,
        "assumptions": assumptions,
        "apply_in_app": apply_in_app,
    }


def shift_to_offpeak(h: HouseFacts, r: RoomFacts) -> dict[str, Any] | None:
    if h.option != "hchp" or not r.peak_kwh:
        return None
    gap = h.rates.get("hp", 0.0) - h.rates.get("hc", 0.0)
    if gap <= 0:
        return None
    return _proposal(
        "shift_to_offpeak",
        room_id=r.room_id,
        title=f"{r.name}: move heating into off-peak hours",
        rationale=(
            f"Over the last {h.days} days this room's radiators drew {r.peak_kwh:.1f} kWh in peak"
            f" hours, each kWh priced {gap:.4f} EUR above off-peak. The upper bound is what that"
            " difference amounted to; moving part of it gives part of it."
        ),
        basis="estimated",
        figures={
            "peak_kwh": r.peak_kwh,
            "offpeak_kwh": r.offpeak_kwh,
            "cost_eur": r.cost_eur,
            "price_gap_eur_per_kwh": round(gap, 4),
            "comfort_peak_share": r.peak_share,
            "coverage_share": r.coverage_share,
        },
        estimate={
            "upper_bound_eur": round(r.peak_kwh * gap, 2),
            "period_days": h.days,
            "basis": "estimated",
            "why": None,
        },
        assumptions=[SAME, "all_peak_kwh_moved_to_offpeak"],
        apply_in_app={
            "path": "/schedule",
            "what": "move comfort periods into the off-peak hours get_programmes lists",
        },
    )


def _tempo_rows(h: HouseFacts) -> dict[str, dict[str, Any]]:
    return {x["key"]: x for x in h.tempo_rows or []}


def tempo_red_days(h: HouseFacts) -> dict[str, Any] | None:
    if h.option != "tempo":
        return None
    red_days = (h.tempo_days or {}).get("red", 0)
    if not red_days and h.tomorrow_colour != "red":
        return None
    row = _tempo_rows(h).get("red_hp", {})
    red_peak = row.get("kwh")
    gap = h.rates.get("red_hp", 0.0) - h.rates.get("red_hc", 0.0)
    estimate = (
        {
            "upper_bound_eur": round(red_peak * gap, 2),
            "period_days": h.days,
            "basis": "estimated",
            "why": None,
        }
        if red_peak and gap > 0
        else {"upper_bound_eur": None, "why": "no_red_peak_consumption"}
    )
    return _proposal(
        "tempo_red_days",
        title="Tempo red days: lower comfort from 06:00 to 22:00, pre-heat before 06:00",
        rationale=(
            f"{red_days} red days in the last {h.days} days; tomorrow is"
            f" {h.tomorrow_colour or 'not published yet'}. Red peak kWh are the dearest of the"
            " contract; the upper bound prices them at the red off-peak rate instead."
        ),
        basis="estimated" if estimate["upper_bound_eur"] is not None else "measured",
        figures={
            "red_days": red_days,
            "red_peak_kwh": red_peak,
            "red_peak_eur": row.get("eur"),
            "red_peak_price_eur_per_kwh": h.rates.get("red_hp"),
            "red_offpeak_price_eur_per_kwh": h.rates.get("red_hc"),
            "tomorrow_colour": h.tomorrow_colour,
            "tempo_hours": h.tempo_hours,
        },
        estimate=estimate,
        assumptions=[SAME, "red_peak_kwh_moved_to_red_offpeak"],
        apply_in_app={
            "path": "/schedule",
            "what": "on red days: a lower comfort or eco 06:00-22:00 and comfort before"
            " 06:00; or a boost/away planned in the app",
        },
    )


def tempo_peak_share(h: HouseFacts) -> dict[str, Any] | None:
    if h.option != "tempo" or not h.tempo_rows:
        return None
    rows = _tempo_rows(h)
    per, bound = [], 0.0
    for colour in ("blue", "white", "red"):
        peak = rows.get(f"{colour}_hp", {}).get("kwh")
        gap = h.rates.get(f"{colour}_hp", 0.0) - h.rates.get(f"{colour}_hc", 0.0)
        per.append(
            {
                "colour": colour,
                "peak_kwh": peak,
                "offpeak_kwh": rows.get(f"{colour}_hc", {}).get("kwh"),
                "price_gap_eur_per_kwh": round(gap, 4),
            }
        )
        if peak and gap > 0:
            bound += peak * gap
    if bound <= 0:
        return None
    return _proposal(
        "tempo_peak_share",
        title="Tempo: heating in peak hours, by colour",
        rationale="Peak and off-peak kWh by Tempo colour over the window, with each colour's gap.",
        basis="estimated",
        figures={"by_colour": per},
        estimate={
            "upper_bound_eur": round(bound, 2),
            "period_days": h.days,
            "basis": "estimated",
            "why": None,
        },
        assumptions=[SAME, "all_peak_kwh_moved_to_offpeak_same_colour"],
        apply_in_app={"path": "/schedule", "what": "move comfort periods into 22:00-06:00"},
    )


def review_setpoints(h: HouseFacts, r: RoomFacts) -> dict[str, Any] | None:
    if not r.manual_setpoint or not r.cost_eur:
        return None
    return _proposal(
        "review_setpoints",
        room_id=r.room_id,
        title=f"{r.name}: review the comfort and eco temperatures",
        rationale=(
            f"This room cost {r.cost_eur:.2f} EUR over the last {h.days} days. Kelvin has no"
            " thermal model of the home, so it gives no figure for a lower setpoint."
        ),
        basis="measured",
        figures={
            "comfort_c": r.comfort_c,
            "eco_c": r.eco_c,
            "cost_eur": r.cost_eur,
            "heating_hours": r.heating_hours,
            "radiators": r.radiators,
        },
        estimate={"upper_bound_eur": None, "why": "no_thermal_model"},
        assumptions=[],
        apply_in_app={
            "path": f"/rooms/{r.room_id}",
            "what": "lower the comfort or eco temperature",
        },
    )


def review_programme(h: HouseFacts, r: RoomFacts) -> dict[str, Any] | None:
    if h.option not in ("hchp", "tempo") or not r.in_programme or not r.peak_share:
        return None
    return _proposal(
        "review_programme",
        room_id=r.room_id,
        title=f"{r.name}: {r.peak_share:.0%} of programmed comfort time is in peak hours",
        rationale="Draft a week with comfort periods moved toward off-peak hours and check it"
        " with evaluate_programme before suggesting it.",
        basis="static",
        figures={"comfort_peak_share": r.peak_share, "comfort_minutes_per_week": r.comfort_minutes},
        estimate={"upper_bound_eur": None, "why": "use_evaluate_programme"},
        assumptions=[],
        apply_in_app={"path": "/schedule", "what": "edit the room's weekly programme"},
    )


def data_gaps(h: HouseFacts) -> dict[str, Any] | None:
    partial = h.coverage_share is not None and h.coverage_share < 0.9
    if not partial and not h.missing_days:
        return None
    return _proposal(
        "data_gaps",
        title="Some figures are partial",
        rationale=(
            "Radiator meters or Linky days are missing in the window: say so with any figure."
        ),
        basis="measured",
        figures={
            "radiator_coverage_share": h.coverage_share,
            "linky_missing_days": h.missing_days,
            "linky_last_day_date": h.linky_last_day,
        },
        estimate=None,
        assumptions=[],
        apply_in_app={"path": "/energy#quality", "what": "see what is missing"},
    )


def _money(p: dict[str, Any]) -> float:
    e = p.get("estimate") or {}
    return float(e.get("upper_bound_eur") or p["figures"].get("cost_eur") or 0.0)


def build_proposals(h: HouseFacts, rooms: list[RoomFacts]) -> list[dict[str, Any]]:
    gaps = data_gaps(h)
    house_level = [p for p in (tempo_red_days(h), tempo_peak_share(h)) if p]
    per_room = [
        p
        for r in rooms
        for p in (shift_to_offpeak(h, r), review_programme(h, r), review_setpoints(h, r))
        if p
    ]
    ranked = sorted(house_level + per_room, key=_money, reverse=True)
    return ([gaps] if gaps else []) + ranked


def _minutes(hhmm: str) -> int | None:
    m = _HHMM.fullmatch(hhmm or "")
    return int(m[1]) * 60 + int(m[2]) if m else None


def check_week(
    week: dict[str, list[dict[str, str]]], locked: dict[str, str], step: int = DEFAULT_STEP
) -> list[dict[str, Any]]:
    """Kelvin's programme rules and the editor's (spec MCP §6.3). Nothing is sent. `step`: the
    room's programme step in minutes (the coarsest of its radiators): every time on it, the
    last end one step before midnight."""
    problems: list[dict[str, Any]] = []
    last_end = 24 * 60 - step
    for day, slots in week.items():
        if day not in DAY_ORDER:
            problems.append({"day": day, "code": "day_unknown"})
            continue
        try:
            normalize_program({day: slots})
        except UserError as e:
            problems.append({"day": day, "code": e.code})
        for s in slots:
            edges = [_minutes(s.get("start", "")), _minutes(s.get("end", ""))]
            if any(m is not None and m % step for m in edges):
                problems.append({"day": day, "code": "not_on_step", "step_minutes": step})
            if edges[1] is not None and edges[1] > last_end:
                last = f"{last_end // 60:02d}:{last_end % 60:02d}"
                problems.append({"day": day, "code": "end_after_last", "last": last})
        if day in locked:
            problems.append({"day": day, "code": "day_locked", "reason": locked[day]})
    seen, out = set(), []
    for p in problems:
        key = (p["day"], p["code"])
        if key not in seen:
            seen.add(key)
            out.append(p)
    return out


def programme_estimate(
    *,
    option: str | None,
    rates: dict[str, float],
    peak_kwh: float | None,
    before_peak_minutes: int | None,
    after_peak_minutes: int | None,
    days: int,
) -> dict[str, Any]:
    if option != "hchp":
        return {"estimated_eur": None, "why": "offpeak_peak_option_only"}
    if not peak_kwh or not before_peak_minutes or after_peak_minutes is None:
        return {"estimated_eur": None, "why": "no_peak_consumption_or_programme"}
    removed = max(0, before_peak_minutes - after_peak_minutes)
    gap = rates.get("hp", 0.0) - rates.get("hc", 0.0)
    return {
        "estimated_eur": round(peak_kwh * removed / before_peak_minutes * gap, 2),
        "period_days": days,
        "basis": "estimated",
        "assumptions": [SAME, "consumption_proportional_to_comfort_minutes"],
    }
