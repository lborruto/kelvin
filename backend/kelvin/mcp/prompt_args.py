"""Natural prompt arguments (Claude Code passes positional free text: `/kelvin:explain_bill
september english`). Pure parsers; a refusal is an `MCPError` (invalid params) whose text
reaches the client instead of an opaque internal error."""

from __future__ import annotations

import re
import unicodedata
from datetime import date, timedelta

from mcp.shared.exceptions import MCPError
from mcp_types import INVALID_PARAMS

LANGUAGES = {
    "fr": "French",
    "french": "French",
    "francais": "French",
    "en": "English",
    "english": "English",
    "anglais": "English",
}
_MONTHS_EN = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
]
_MONTHS_FR = [
    "janvier",
    "fevrier",
    "mars",
    "avril",
    "mai",
    "juin",
    "juillet",
    "aout",
    "septembre",
    "octobre",
    "novembre",
    "decembre",
]
_MONTH_NUMBER = {n: i + 1 for i, n in enumerate(_MONTHS_EN)} | {
    n: i + 1 for i, n in enumerate(_MONTHS_FR)
}
_LAST = {"last", "last month", "previous", "dernier", "mois dernier", "le mois dernier"}


def fold(text: str) -> str:
    """Lower-case, accent-free, trimmed, single-spaced."""
    s = unicodedata.normalize("NFKD", text or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    return " ".join(s.casefold().replace(chr(0x2019), "'").split())


def refuse(message: str) -> MCPError:
    return MCPError(INVALID_PARAMS, message)


def language(raw: str) -> str:
    key = fold(raw)
    if not key:
        return "French"
    if key in LANGUAGES:
        return LANGUAGES[key]
    raise refuse(
        f"Unknown language {raw.strip()!r}. Accepted: fr, french, francais, en, english, anglais"
        " (default fr)."
    )


def month(raw: str, today: date) -> tuple[str, str]:
    """(`YYYY-MM`, human name) for a month argument, `today` being Paris's date."""
    key = fold(raw)
    examples = f"Examples: {today:%Y-%m}, september, septembre, september 2026, last, dernier."
    if not key or key in _LAST:
        y, m = (today.year, today.month - 1) if today.month > 1 else (today.year - 1, 12)
        return _fmt(y, m)
    iso = re.fullmatch(r"(\d{4})-(\d{1,2})", key)
    if iso:
        y, m = int(iso[1]), int(iso[2])
        if 1 <= m <= 12:
            return _fmt(y, m)
    named = re.fullmatch(r"([a-z]+)(?: (\d{4}))?", key)
    if named and named[1] in _MONTH_NUMBER:
        m = _MONTH_NUMBER[named[1]]
        if named[2]:
            return _fmt(int(named[2]), m)
        y = today.year if m <= today.month else today.year - 1
        return _fmt(y, m)
    raise refuse(f"Unknown month {raw.strip()!r}. {examples}")


def _fmt(y: int, m: int) -> tuple[str, str]:
    return f"{y:04d}-{m:02d}", f"{_MONTHS_EN[m - 1].capitalize()} {y}"


def day(raw: str, today: date) -> str:
    key = fold(raw)
    if key in ("", "tomorrow", "demain"):
        return (today + timedelta(days=1)).isoformat()
    if key in ("today", "aujourd'hui", "aujourdhui"):
        return today.isoformat()
    try:
        return date.fromisoformat(key).isoformat()
    except ValueError:
        raise refuse(
            f"Unknown date {raw.strip()!r}. Examples: tomorrow, demain, today, aujourd'hui,"
            f" {today.isoformat()}."
        ) from None


def room(raw: str, rooms: dict[str, str] | None) -> str:
    """A room id, from an id or a name; `rooms` is {id: name}, None when Kelvin is not running
    (the text is then taken as is)."""
    text = raw.strip()
    if rooms is None or text in rooms:
        return text
    key = fold(text)
    hits = [rid for rid, name in rooms.items() if fold(name) == key]
    if len(hits) == 1:
        return hits[0]
    names = ", ".join(sorted(rooms.values()))
    raise refuse(f"Unknown room {text!r}. Room names: {names}.")
