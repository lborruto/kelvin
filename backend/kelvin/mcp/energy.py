"""Energy results for MCP (spec MCP §3, §4.3): the report's own figures, reshaped and flagged.
Nothing here prices energy; a room's € is the sum of its radiators' `by_radiator` € in whole
cents — the Par pièce rule (CLAUDE.md), the only sum MCP makes."""

from __future__ import annotations

from typing import Any

from kelvin.mcp.shape import Basis, combine, neutral

MAX_BUCKETS = 93  # a result an agent can read: 3 months by day, 2 years by week…


def report_basis(report: dict[str, Any]) -> tuple[Basis, list[str]]:
    total = report["total"]
    parts: list[Basis] = ["measured"]
    notes: list[str] = []
    if total.get("estimated_split"):
        parts.append("estimated")
        notes.append(
            "split_estimated: some days are split into off-peak/peak by a fallback profile"
            " (no complete half-hour curve); their totals are measured"
        )
    rad = total.get("radiators") or {}
    if rad.get("interpolated") or rad.get("apportioned"):
        parts.append("estimated")
        notes.append(
            "radiator_spans_estimated: some radiator kWh are spread over a gap (interpolated)"
            " or shared with a longer span (apportioned)"
        )
    if rad.get("coverage") is not None and rad["coverage"] < 1:
        notes.append(
            f"radiators_partial: radiator figures cover {rad['coverage']:.0%} of radiator-days;"
            " their kWh and € count those days only"
        )
    if total.get("missing_colour_days"):
        notes.append("tempo_colour_missing: some days have kWh but no € (Tempo colour unknown)")
    if total.get("missing_days"):
        notes.append(f"linky_missing_days: {total['missing_days']} days without Linky data")
    if total.get("eur") is not None:
        parts.append("computed")
    if report.get("projection"):
        notes.append("projection: estimated from the trailing rate or last year's months")
    return combine(*parts), notes


def by_room(by_radiator: list[dict[str, Any]], names: dict[str, str]) -> list[dict[str, Any]]:
    groups: dict[str | None, list[dict[str, Any]]] = {}
    for row in by_radiator:
        groups.setdefault(row["room_id"], []).append(row)
    out = []
    for room_id, rows in groups.items():
        kwh = [r["kwh"] for r in rows if r["kwh"] is not None]
        cents = [round(r["eur"] * 100) for r in rows if r["eur"] is not None]
        out.append(
            {
                "room_id": room_id,
                "name": names.get(room_id) if room_id else None,
                "energy_kwh": round(sum(kwh), 3) if kwh else None,
                "cost_eur": sum(cents) / 100 if cents else None,
                "partial": any(r["kwh"] is None or (r.get("coverage") or 0) < 1 for r in rows),
                "radiator_ids": [r["radiator_id"] for r in rows],
            }
        )
    return sorted(out, key=lambda x: -(x["cost_eur"] or 0.0))


def energy_view(report: dict[str, Any], names: dict[str, str]) -> dict[str, Any]:
    return neutral(
        {
            "group": report["group"],
            "from_date": report["from"],
            "to_date_exclusive": report["to"],
            "linky_last_day_date": report["last_day"],
            "tariff_option_today": report["option"],
            "totals": report["total"],
            "buckets": report["buckets"],
            "heating": report["heating"],
            "by_room": by_room(report["by_radiator"], names),
            "by_radiator": report["by_radiator"],
            "comparison": report["comparison"],
            "projection": report["projection"],
            "hc_lens": report["hc_lens"],
            "tempo_lens": report["tempo_lens"],
            "quality": report["quality"],
        }
    )


def room_energy_basis(body: dict[str, Any]) -> tuple[Basis, list[str]]:
    notes = ["radiators' own meters; today is running and counted up to now"]
    parts: list[Basis] = ["measured"]
    if body.get("interpolated") or body.get("apportioned"):
        parts.append("estimated")
        notes.append("radiator_spans_estimated: some kWh are interpolated or apportioned")
    if body.get("coverage") is not None and body["coverage"] < 1:
        notes.append(f"radiators_partial: coverage {body['coverage']:.0%}")
    if body.get("eur") is not None:
        parts.append("computed")
    return combine(*parts), notes
