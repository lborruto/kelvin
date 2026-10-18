"""The MCP result shape (spec MCP §4): one envelope, one units table, neutral key names, a basis
on every result, and a redaction backstop. Figures are never recomputed here."""

from __future__ import annotations

import re
from collections.abc import Iterable
from datetime import datetime
from typing import Any, Literal
from zoneinfo import ZoneInfo

from kelvin.billing.tariff import RATE_KEYS

Basis = Literal["measured", "computed", "estimated", "mixed", "unknown", "static", "published"]

UNITS: dict[str, dict[str, str]] = {
    "suffixes": {
        "_kwh": "kWh",
        "_wh": "Wh",
        "_eur": "euros incl. VAT, as entered in Kelvin's tariff",
        "_eur_kwh": "euros per kWh incl. VAT",
        "_eur_per_kwh": "euros per kWh incl. VAT",
        "_eur_month": "euros per month incl. VAT",
        "_c": "degrees Celsius",
        "_w": "watts",
        "_kva": "kVA",
        "_minutes": "minutes",
        "_hours": "hours (heating_hours: hours at full power)",
        "_share": "ratio from 0 to 1",
        "_at": "ISO 8601 date-time, house time zone",
        "_date": "ISO 8601 date",
        "_days": "days",
    },
    "names": {
        "kwh": "kWh",
        "eur": "euros incl. VAT",
        "coverage": "ratio 0-1 of radiator-days fully measured (elapsed days only)",
        "temp_avg": "degrees Celsius",
        "setpoint_avg": "degrees Celsius",
        "temperature": "degrees Celsius",
        "setpoint": "degrees Celsius",
        "target": "degrees Celsius",
        "avg_price": "euros per kWh incl. VAT",
        "delta_price": "euros per kWh incl. VAT (peak minus off-peak, today's prices)",
        "duty": "ratio 0-1 of time heating",
        "level": "EcoWatt level: 1 normal, 2 strained, 3 cut risk",
        "ts": "epoch seconds",
        "date": "ISO 8601 date",
        "from": "ISO 8601 date (inclusive)",
        "to": "ISO 8601 date (exclusive in reports)",
        "heating_degree_days": "heating degree days (DJU), base 18 °C:"
        " max(0, 18 − (Tmin + Tmax) / 2) of each Paris civil day",
        "heating_degree_days_cur": "heating degree days of the current side's paired days",
        "heating_degree_days_ref": "heating degree days of the reference side's paired days",
        "kwh_per_degree_day": "kWh per heating degree day (slope of the reference fit)",
        "baseload_kwh_per_day": "kWh per day that does not scale with cold"
        " (intercept of the reference fit)",
        "r2": "coefficient of determination of the reference fit, 0–1",
        "kwh_per_degree_c": "kWh per day per °C colder below the balance point (get_weather_model)",
        "eur_per_degree_c": "euros per day per °C colder below the balance point, today's prices",
        "baseload_range_kwh_per_day": "80 % interval of baseload_kwh_per_day",
        "kwh_low": "kWh, low end of the 80 % interval",
        "kwh_high": "kWh, high end of the 80 % interval",
        "eur_low": "euros, low end of the 80 % interval",
        "eur_high": "euros, high end of the 80 % interval",
        "change": "ratio: +0.12 is 12 % more (weather_normalised.change: at equal weather)",
    },
}

_TOKENS = {"hc": "offpeak", "hp": "peak"}
_RATE_VALUES = {k for keys in RATE_KEYS.values() for k in keys} | {"unknown_hc", "unknown_hp"}


def neutral_key(key: str) -> str:
    return "_".join(_TOKENS.get(part, part) for part in key.split("_"))


def neutral(value: Any) -> Any:
    """French tariff words out of every key (and of rate-key values): `hc`/`hp` become
    `offpeak`/`peak`, so field names read the same to a French or an English owner."""
    if isinstance(value, dict):
        return {neutral_key(k) if isinstance(k, str) else k: neutral(v) for k, v in value.items()}
    if isinstance(value, list):
        return [neutral(v) for v in value]
    if isinstance(value, str) and value in _RATE_VALUES:
        return neutral_key(value)
    return value


def combine(*parts: Basis) -> Basis:
    s = {p for p in parts if p != "unknown"}
    if not s:
        return "unknown"
    if len(s) == 1:
        return next(iter(s))
    # Published model data (weather) beside other figures reads like a measurement.
    s = {"measured" if p == "published" else p for p in s}
    if len(s) == 1:
        return next(iter(s))
    if "estimated" in s or "mixed" in s:
        return "mixed"
    if "computed" in s:
        return "computed"
    return "measured" if "measured" in s else "static"


def iso(ts: float | None, tz: str) -> str | None:
    if ts is None:
        return None
    return datetime.fromtimestamp(ts, ZoneInfo(tz)).isoformat(timespec="seconds")


SECRET_KEYS = frozenset(
    {
        "prm",
        "pdl",
        "email",
        "password",
        "token",
        "token_set",
        "secret",
        "med_token",
        "device_url",
        "heater_url",
        "urls",
        "gateway",
        "gateway_id",
        "serial",
        "user_agent",
        "hash",
        "cookie",
        "authorization",
    }
)
_LEAK = re.compile(
    r"io://|internal://|rts://|zigbee://|ovp://"
    r"|[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+"
    r"|(?<![0-9])[0-9]{14}(?![0-9])"
)


class Leak(Exception):
    """A value that must never leave Kelvin reached an MCP result. The message is its path."""


def redact(value: Any, path: str = "$") -> Any:
    """Drop secret keys at any depth; refuse device URLs, emails and PDL-like strings."""
    if isinstance(value, dict):
        return {
            k: redact(v, f"{path}.{k}")
            for k, v in value.items()
            if not (isinstance(k, str) and k.lower() in SECRET_KEYS)
        }
    if isinstance(value, list):
        return [redact(v, f"{path}[{i}]") for i, v in enumerate(value)]
    if isinstance(value, str) and _LEAK.search(value):
        raise Leak(path)
    return value


def envelope(
    tool: str,
    data: Any,
    *,
    ctx: Any,
    sources: Iterable[str],
    basis: Basis,
    notes: Iterable[str] = (),
) -> dict[str, Any]:
    tz = ctx.settings.tz
    return {
        "data": data,
        "meta": {
            "tool": tool,
            "generated_at": iso(ctx.wall(), tz),
            "timezone": tz,
            "simulator": bool(ctx.settings.kelvin_fake),
            "sources": list(sources),
            "basis": basis,
            "notes": list(notes),
            "units": UNITS,
        },
    }
