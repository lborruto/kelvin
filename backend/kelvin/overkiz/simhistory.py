"""Synthetic history for simulator mode (KELVIN_FAKE=1) only.

Gives the web UI realistic 24 h strips, history charts and energy bars in demos and e2e runs.
Never called against a real installation.
"""

from __future__ import annotations

import json
import logging
import math
import random
from collections.abc import Callable
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from kelvin.house.model import DAY_ORDER, House, Radiator
from kelvin.linky.models import day_bounds
from kelvin.recorder.db import Database

log = logging.getLogger(__name__)

SAMPLE_STEP = 300
ENERGY_STEP = 3600
TAU_S = 2 * 3600.0  # heating time constant
COOL_PER_S = 0.3 / 3600  # passive drift, degrees per second
COOL_FLOOR = 15.0
OFF_TARGET = 16.0
NOISE = 0.15
FULL_POWER_GAP = 2.5  # below setpoint by this much or more = full power
OFFPEAK = (22, 6)
SIM_DB_KEY = "sim_db"
# Invented runs so the room strip shows its bands in demos (spec §10.2): a window opened every
# morning in Chambre 1, presence every evening in the Salon. (radiator id, from, to) local minutes.
SIM_WINDOW = ("9000011", 7 * 60 + 30, 7 * 60 + 50)
SIM_PRESENCE = ("10000001", 18 * 60, 22 * 60 + 30)
# Plan 15 (weather coupling): heat lost per second per °C of room − outdoor; at 8 °C apart, the
# old constant drift.
K_LOSS = COOL_PER_S / 8.0
# The demo's absence, from 23 to 21 days ago (spec 2026-10-18 §9): three local days.
SIM_AWAY_DAYS = (23, 21)


def seed_demo_away(db: Database, now: float, tz: str = "Europe/Paris") -> None:
    """The demo house's absence (simulator only): three days the weather model leaves out."""
    zone = ZoneInfo(tz)
    today = datetime.fromtimestamp(now, zone).date()
    a = day_bounds(today - timedelta(days=SIM_AWAY_DAYS[0]), zone)[0]
    b = day_bounds(today - timedelta(days=SIM_AWAY_DAYS[1]), zone)[0] + 12 * 3600
    if not db.rows("SELECT 1 FROM away_log WHERE id = 'sim-away'"):
        db.execute(
            "INSERT INTO away_log (id, start, end, ended) VALUES ('sim-away', ?, ?, 1)", (a, b)
        )


def _minutes(hhmm: str) -> int:
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def _in_comfort(r: Radiator, local: datetime) -> bool:
    slots = r.program.get(DAY_ORDER[local.weekday()], [])
    now = local.hour * 60 + local.minute
    for s in slots:
        a, b = _minutes(s["start"]), _minutes(s["end"])
        if (a <= now < b) if a < b else (now >= a or now < b):
            return True
    return False


def _is_offpeak(local: datetime) -> bool:
    return local.hour >= OFFPEAK[0] or local.hour < OFFPEAK[1]


def _plan(r: Radiator, local: datetime) -> tuple[float, str]:
    """Setpoint and heating level the radiator would hold at this wall time."""
    comfort = r.comfort if r.comfort is not None else 19.0
    eco = r.eco if r.eco is not None else comfort - 3.5
    if r.mode == "off":
        return OFF_TARGET, "off"
    if r.mode == "manual":
        return (r.target if r.target is not None else comfort), "comfort"
    return (comfort, "comfort") if _in_comfort(r, local) else (eco, "eco")


def _flag(r: Radiator, local: datetime, run: tuple[str, int, int]) -> int:
    minute = local.hour * 60 + local.minute
    return 1 if r.id == run[0] and run[1] <= minute < run[2] else 0


def _simulate(
    r: Radiator,
    times: list[int],
    tz: ZoneInfo,
    current: float | None,
    outdoor: Callable[[int], float] | None = None,
) -> list[tuple]:
    rng = random.Random(r.id)
    temp = _plan(r, datetime.fromtimestamp(times[0], tz))[0] - 0.5
    rows: list[tuple] = []
    blend_from = len(times) - 12
    for i, t in enumerate(times):
        local = datetime.fromtimestamp(t, tz)
        setpoint, level = _plan(r, local)
        rate = 0.0
        if temp < setpoint:
            if r.mode != "off":  # proportional: full power far below the setpoint, less near it
                rate = min(100.0, (setpoint - temp) / FULL_POWER_GAP * 100.0)
            if outdoor is not None:  # the room loses heat to the outdoor while it heats
                temp -= K_LOSS * (temp - outdoor(t)) * SAMPLE_STEP
            temp += (setpoint - temp) * (1 - math.exp(-SAMPLE_STEP / TAU_S))
        elif temp > setpoint:
            drift = COOL_PER_S if outdoor is None else max(0.0, K_LOSS * (temp - outdoor(t)))
            temp = max(max(setpoint, COOL_FLOOR), temp - drift * SAMPLE_STEP)
        shown = temp
        if current is not None and i >= blend_from:
            w = (i - blend_from + 1) / (len(times) - blend_from)
            shown = temp * (1 - w) + current * w
        noise = 0.0 if (current is not None and i == len(times) - 1) else rng.uniform(-NOISE, NOISE)
        rows.append(
            (
                t,
                r.id,
                round(shown + noise, 2),
                setpoint if r.mode == "program" else r.target,
                setpoint,
                r.mode,
                level,
                round(rate, 1),
                _flag(r, local, SIM_WINDOW),
                _flag(r, local, SIM_PRESENCE),
            )
        )
    return rows


def seed_history(
    db: Database,
    house: House,
    now: float,
    days: int = 7,
    tz: str = "Europe/Paris",
    outdoor: Callable[[int], float] | None = None,
) -> int:
    """Insert synthetic samples and energy readings if the samples table is empty. `outdoor`
    (Plan 15, the demo house): the rooms lose heat to it, so their energy follows the cold."""
    if db.query("SELECT 1 FROM samples LIMIT 1") or db.query("SELECT 1 FROM energy LIMIT 1"):
        return 0
    zone = ZoneInfo(tz)
    end = int(now) // SAMPLE_STEP * SAMPLE_STEP
    times = list(range(end - days * 86400, end + 1, SAMPLE_STEP))
    hours = list(range(end // ENERGY_STEP * ENERGY_STEP - days * 86400, end + 1, ENERGY_STEP))
    sample_rows: list[tuple] = []
    energy_rows: list[tuple] = []
    for r in house.radiators.values():
        rows = _simulate(r, times, zone, r.temperature, outdoor)
        sample_rows += rows
        energy_rows += _energy_rows(r, rows, hours, zone)
    # One transaction: a crash must not leave samples without energy, nor an unmarked sim DB.
    with db._lock:
        db.conn.execute("BEGIN")
        try:
            db.conn.executemany(
                "INSERT OR REPLACE INTO samples VALUES (?,?,?,?,?,?,?,?,?,?)", sample_rows
            )
            db.conn.executemany("INSERT OR REPLACE INTO energy VALUES (?,?,?,?,?)", energy_rows)
            db.conn.execute(
                "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
                (SIM_DB_KEY, json.dumps(True)),
            )
            db.conn.execute("COMMIT")
        except BaseException:
            db.conn.execute("ROLLBACK")
            raise
    return len(sample_rows) + len(energy_rows)


def _energy_rows(
    r: Radiator, samples: list[tuple], hours: list[int], zone: ZoneInfo
) -> list[tuple]:
    end_counters = r.energy_wh
    if r.power_w is None or end_counters is None or None in end_counters.values():
        return []
    rate: dict[int, list[float]] = {}
    for s in samples:
        t = s[0]
        hour_end = -(-t // ENERGY_STEP) * ENERGY_STEP
        rate.setdefault(hour_end, []).append(s[7] or 0.0)
    # consumption of the hour ending at each reading after the first
    cons: list[tuple[int, float, float]] = []  # (reading ts, t1 Wh, t2 Wh)
    for h in hours[1:]:
        vals = rate.get(h, [])
        wh = r.power_w * (sum(vals) / (100.0 * len(vals)) if vals else 0.0)
        offpeak = _is_offpeak(datetime.fromtimestamp(h - ENERGY_STEP, zone))
        cons.append((h, wh if offpeak else 0.0, 0.0 if offpeak else wh))
    sum_t1 = sum(c[1] for c in cons)
    sum_t2 = sum(c[2] for c in cons)
    scale = 1.0
    for total, s in (
        (end_counters["t1"], sum_t1),
        (end_counters["t2"], sum_t2),
        (end_counters["total"], sum_t1 + sum_t2),
    ):
        if s > total:
            scale = min(scale, total / s)
    t1, t2 = end_counters["t1"], end_counters["t2"]
    total = end_counters["total"]
    out = []
    for h, c1, c2 in reversed(cons):
        out.append((h, r.id, total, t1, t2))
        c1, c2 = c1 * scale, c2 * scale
        t1, t2, total = t1 - c1, t2 - c2, total - c1 - c2
    out.append((hours[0], r.id, total, t1, t2))
    out.reverse()
    return out
