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
    if any((b.get("outdoor") or {}).get("days") for b in report["buckets"]):
        notes.append(
            "outdoor: model data (Meteo-France AROME HD / ERA5-Land via Open-Meteo), not a"
            " measurement at the home; weather_normalised is Kelvin's regression (computed)"
        )
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


def room_totals(by_radiator: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Per room, the report's `by_radiator` rows over the report's own window: kWh by rate, €
    as whole cents summed (the Par pièce rule, as `by_room`), the lowest coverage, the heating
    hours summed. Unknown is None, never 0."""

    def total(rows: list[dict[str, Any]], key: str) -> float | None:
        known = [r[key] for r in rows if r.get(key) is not None]
        return round(sum(known), 3) if known else None

    groups: dict[str, list[dict[str, Any]]] = {}
    for row in by_radiator:
        if row["room_id"] is not None:
            groups.setdefault(row["room_id"], []).append(row)
    out = {}
    for room_id, rows in groups.items():
        cents = [round(r["eur"] * 100) for r in rows if r["eur"] is not None]
        cover = [r["coverage"] for r in rows if r.get("coverage") is not None]
        hours = total(rows, "heating_hours")
        out[room_id] = {
            "peak_kwh": total(rows, "hp_kwh"),
            "offpeak_kwh": total(rows, "hc_kwh"),
            "cost_eur": sum(cents) / 100 if cents else None,
            "coverage_share": min(cover) if cover else None,
            "heating_hours": None if hours is None else round(hours, 1),
        }
    return out


def _outdoor(o: dict[str, Any] | None) -> dict[str, Any] | None:
    if o is None:
        return None
    return {
        "mean_c": o["mean_c"],
        "min_c": o["min_c"],
        "max_c": o["max_c"],
        "heating_degree_days": o["dju"],
        "days_with_weather": o["days"],
        "elapsed_days": o["of"],
    }


def _weather_row(w: dict[str, Any] | None) -> dict[str, Any] | None:
    if w is None:
        return None
    m = w["model"]
    return {
        "change": w["change"],
        "why": w["why"],
        "heating_degree_days_cur": w["dju_cur"],
        "heating_degree_days_ref": w["dju_ref"],
        "expected_cur_kwh": w["expected_cur_kwh"],
        "expected_ref_kwh": w["expected_ref_kwh"],
        "model": None
        if m is None
        else {
            "baseload_kwh_per_day": m["baseload_kwh_day"],
            "kwh_per_degree_day": m["kwh_per_dju"],
            "r2": m["r2"],
            "fit_days": m["fit_days"],
        },
    }


def _with_weather(summary: dict[str, Any]) -> dict[str, Any]:
    out = {k: v for k, v in summary.items() if k != "outdoor"}
    out["outdoor"] = _outdoor(summary.get("outdoor"))
    return out


def _comparison(c: dict[str, Any]) -> dict[str, Any]:
    out = dict(c)
    for k in ("previous", "last_year"):
        row = c.get(k)
        if row is not None:
            out[k] = {
                **{x: v for x, v in row.items() if x != "weather"},
                "weather_normalised": _weather_row(row.get("weather")),
            }
    return out


def energy_view(report: dict[str, Any], names: dict[str, str]) -> dict[str, Any]:
    return neutral(
        {
            "group": report["group"],
            "from_date": report["from"],
            "to_date_exclusive": report["to"],
            "linky_last_day_date": report["last_day"],
            "tariff_option_today": report["option"],
            "totals": _with_weather(report["total"]),
            "buckets": [_with_weather(b) for b in report["buckets"]],
            "heating": report["heating"],
            "by_room": by_room(report["by_radiator"], names),
            "by_radiator": report["by_radiator"],
            "comparison": _comparison(report["comparison"]),
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


def weather_model_view(
    view: dict[str, Any], names: dict[str, str], include_days: bool, location_set: bool
) -> dict[str, Any]:
    """`get_weather_model` (spec 2026-10-18 §8.6): the API view with MCP's neutral,
    unit-suffixed keys."""
    h, fc = view["house"], view["forecast"]
    out: dict[str, Any] = {
        "location_set": location_set,
        "state": h["state"],
        "why": h["why"],
        "estimate_reasons": h["thin"],
        "balance_point_c": h["balance_point_c"],
        "balance_point_source": h["balance_point_source"],
        "baseload_kwh_per_day": h["baseload_kwh_day"],
        "baseload_range_kwh_per_day": h["baseload_kwh_day_range"],
        "kwh_per_degree_c": h["kwh_per_c"],
        "kwh_per_degree_c_range": h["kwh_per_c_range"],
        "eur_per_degree_c": h["eur_per_c"],
        "r2": h["r2"],
        "fit_days": h["fit_days"],
        "heating_days": h["heating_days"],
        "excluded_days": h["excluded"],
        "window": {"from_date": view["window"]["from"], "to_date_exclusive": view["window"]["to"]},
        "interval_level_share": view["level"],
        "period_share_due_to_cold": (h["period_share"] or {}).get("share"),
        "price_eur_per_kwh": (view["price"] or {}).get("eur_kwh"),
        "rooms": [
            {
                "room_id": r["room_id"],
                "room_name": names.get(r["room_id"]),
                "state": r["state"],
                "why": r["why"],
                "kwh_per_degree_c": r["kwh_per_c"],
                "kwh_per_degree_c_range": r["kwh_per_c_range"],
                "eur_per_degree_c": r["eur_per_c"],
                "coverage_share": (r["coverage"] or {}).get("share"),
                "fit_days": r["fit_days"],
            }
            for r in view["rooms"]["items"]
        ],
        "forecast": {
            "state": fc["state"],
            "why": fc["why"],
            "days": [
                {
                    "date": d["date"],
                    "mean_c": d["t_c"],
                    "kwh": d["kwh"],
                    "kwh_low": d["kwh_lo"],
                    "kwh_high": d["kwh_hi"],
                    "heating_kwh": d["heating_kwh"],
                    "eur": d["eur"],
                    "eur_low": d["eur_lo"],
                    "eur_high": d["eur_hi"],
                    "heating_eur": d["heating_eur"],
                    "eur_missing_reason": d["eur_why"],
                    "model": d["model"],
                }
                for d in fc["days"]
            ],
            "week_kwh": (fc["week"] or {}).get("kwh"),
            "week_eur": (fc["week"] or {}).get("eur"),
        },
    }
    if include_days:
        out["days"] = neutral(h["points"])
    return out
