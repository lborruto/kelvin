"""Window bounds shared by the REST routes and the MCP tools (CLAUDE.md « Bounded work »)."""

from __future__ import annotations

import re
import time
from datetime import date

from kelvin.errors import UserError
from kelvin.linky.service import LinkyService

MAX_REPORT_DAYS = 4 * 366
MAX_HOUR_DAYS = 62  # hourly radiator buckets: two months at most
MAX_HISTORY_POINTS = 10_000  # per radiator
MAX_RADIATORS = 50
RADIATOR_ID = re.compile(r"[A-Za-z0-9_.-]{1,64}")
FIRST_TS = 946_684_800  # 2000-01-01T00:00:00Z
FIRST_DAY = date(2000, 1, 1)


def check_span(start: float, end: float, max_days: int = MAX_REPORT_DAYS) -> None:
    """Epoch windows get the same bounds as the dated reports: from 2000-01-01 to two years
    ahead, `end` after `start`, at most `max_days` long. Every query below is bounded."""
    hi = time.time() + 2 * 366 * 86400
    if not (FIRST_TS <= start < end <= hi) or end - start > max_days * 86400:
        raise UserError("period_invalid")


def check_days(linky: LinkyService, *days: date) -> None:
    """Dates from 2000-01-01 to two years ahead: no overflow near date.max."""
    today = linky.today()
    try:
        last = today.replace(year=today.year + 2)
    except ValueError:  # 29 February
        last = today.replace(year=today.year + 2, day=28)
    if any(not FIRST_DAY <= d <= last for d in days):
        raise UserError("period_invalid")


def check_ids(ids: list[str]) -> list[str]:
    """Radiator ids, deduplicated in order; at most MAX_RADIATORS, each well formed."""
    out = list(dict.fromkeys(i for i in ids if i))
    if len(out) > MAX_RADIATORS:
        raise UserError("too_many_radiators")
    if not all(RADIATOR_ID.fullmatch(i) for i in out):
        raise UserError("radiator_unknown")
    return out
