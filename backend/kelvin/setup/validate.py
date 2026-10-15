"""Labels typed by the user, checked before they reach Overkiz (spec §6, §9.4)."""

from __future__ import annotations

import unicodedata
from collections.abc import Iterable

from kelvin.errors import UserError
from kelvin.setup.client import RESERVED_SEGMENTS

MAX_LABEL = 32
# Control, format (zero-width), surrogate, private-use, unassigned, line and paragraph separators.
_INVISIBLE = {"Cc", "Cf", "Cs", "Co", "Cn", "Zl", "Zp"}


def clean_label(raw: str) -> str | None:
    """NFC, trimmed, 1–32 code points, nothing invisible, not only dots; else None."""
    s = unicodedata.normalize("NFC", raw).strip()
    if not 1 <= len(s) <= MAX_LABEL:
        return None
    if any(unicodedata.category(ch) in _INVISIBLE for ch in s):
        return None
    if set(s) <= {"."}:
        return None
    return s


def room_label(raw: str, existing: Iterable[str]) -> str:
    s = clean_label(raw)
    if s is None:
        raise UserError("room_label_invalid")
    if s.casefold() in {e.strip().casefold() for e in existing}:
        raise UserError("room_label_taken", 409, label=s)
    return s


def device_label(raw: str) -> str:
    s = clean_label(raw)
    if s is None or s.casefold() in RESERVED_SEGMENTS:
        raise UserError("device_label_invalid")
    return s
