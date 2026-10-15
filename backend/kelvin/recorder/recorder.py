"""Periodic samples and energy readings, plus history queries (spec §3.4)."""

from __future__ import annotations

import asyncio
import logging
import time
from bisect import bisect_left, bisect_right
from collections.abc import Callable, Iterable, Iterator
from datetime import datetime, timedelta
from itertools import chain
from typing import Any
from zoneinfo import ZoneInfo

from kelvin.house.model import House
from kelvin.recorder.db import Database, DatabaseClosed
from kelvin.recorder.energy import (
    SAMPLE_STEP_S,
    Bucket,
    RateIndex,
    Span,
    Unit,
    apportion,
    clean_spans,
    local_edges,
)

log = logging.getLogger(__name__)

# Samples feed the history charts (30 days at most today) and leave room for year-on-year;
# the command log is for debugging. Energy readings are kept: they feed the bill.
SAMPLE_RETENTION_S = 400 * 86400
COMMAND_LOG_RETENTION_S = 90 * 86400
PRUNE_EVERY_S = 86400.0
PRUNE_CHUNK = 5000
PAGE_ROWS = 5000  # rows per query when streaming readings and samples
# Counter name in the API → column of the energy table.
COUNTERS = {"total": "total_wh", "t1": "t1_wh", "t2": "t2_wh"}
# Readings are cleaned in fixed, epoch-aligned chunks of time; each chunk replays LOOKBACK_S of
# history before it, so its spans never depend on the window asked (bounded work per bucket).
CHUNK_S = 28 * 86400
LOOKBACK_S = 3 * 86400
RANGES_PER_QUERY = 200  # sample ranges OR-ed in one query


class Recorder:
    def __init__(
        self,
        db: Database,
        house: House,
        *,
        wall: Callable[[], float] = time.time,
        is_fresh: Callable[[], bool] = lambda: True,
        tz: str = "Europe/Paris",
    ) -> None:
        self.db = db
        self.house = house
        self.wall = wall
        self.is_fresh = is_fresh
        self.tz = ZoneInfo(tz)
        # Per radiator: its last row's time and counters, as written.
        self._last_written: dict[str, tuple[int, tuple[float | None, ...]]] = {}
        # Moves when a write can change energy already computed for a past day: a reading that
        # replaces or predates its radiator's last one, a sample not after every sample and
        # reading already written (a wall clock stepped back: it lands in a span already
        # counted and moves its weights), or pruned samples (old spans' weights). Appending a
        # newer reading or sample never does (a span `clean_spans` emitted is final, its weights
        # are samples before its end), so the cache of complete radiator-days
        # (`linky/radiator_cache.py`) is dropped only then.
        self.energy_epoch = 0
        self._high: list[int | None] | None = None  # newest sample, newest reading (`_highs`)

    def sample(self) -> int:
        if not self.is_fresh():
            return 0
        t = int(self.wall())
        rows = [
            (
                t,
                r.id,
                r.temperature,
                r.target,
                r.effective_setpoint,
                r.mode,
                r.heating_level,
                r.working_rate,
                None if r.window_open is None else int(r.window_open),
                None if r.occupied is None else int(r.occupied),
            )
            for r in self.house.radiators.values()
        ]
        sample_high, energy_high = self._highs()
        self.db.executemany("INSERT OR REPLACE INTO samples VALUES (?,?,?,?,?,?,?,?,?,?)", rows)
        # A sample at a reading's own second is safe (a span's weights stop before its end); one
        # at or before an earlier sample, or before a reading, lands in what is already counted.
        if rows and (
            (sample_high is not None and t <= sample_high)
            or (energy_high is not None and t < energy_high)
        ):
            self.energy_epoch += 1
        if rows:
            self._high[0] = t if sample_high is None else max(sample_high, t)  # type: ignore[index]
        return len(rows)

    def _highs(self) -> tuple[int | None, int | None]:
        """The newest sample time and the newest reading time ever written (high-water marks,
        read from the tables once, then kept)."""
        if self._high is None:
            s = self.db.rows("SELECT MAX(ts) FROM samples")
            e = self.db.rows("SELECT MAX(ts) FROM energy")
            self._high = [s[0][0] if s else None, e[0][0] if e else None]
        return self._high[0], self._high[1]

    def _last_row(self, rid: str) -> tuple[int, tuple[float | None, ...]] | None:
        if rid not in self._last_written:
            rows = self.db.query(
                "SELECT ts, total_wh, t1_wh, t2_wh FROM energy WHERE radiator_id = ?"
                " ORDER BY ts DESC LIMIT 1",
                (rid,),
            )
            if not rows:
                return None
            r = rows[0]
            self._last_written[rid] = (r["ts"], (r["total_wh"], r["t1_wh"], r["t2_wh"]))
        return self._last_written[rid]

    def snapshot_energy(self, radiator_ids: Iterable[str] | None = None) -> int:
        """Write a reading for each radiator whose counters changed since its last row.

        The row's time is when Kelvin learned the value: the runtime calls this on every house
        change (events, state reads) and the sampling loop calls it every 5 minutes. Overkiz
        reports a counter only when it moves, at irregular times, so an unchanged value is no
        reading and writes nothing (spec §2.1; rows are kept forever, they feed the bill).
        """
        t = int(self.wall())
        ids = list(radiator_ids) if radiator_ids is not None else list(self.house.radiators)
        rows = []
        rewrites = False
        for rid in ids:
            r = self.house.radiators.get(rid)
            e = r.energy_wh if r is not None else None
            if e is None:
                continue
            values = (e["total"], e["t1"], e["t2"])
            last = self._last_row(rid)
            if last is not None and values == last[1]:
                continue
            rows.append((t, rid, *values))
            rewrites |= last is not None and t <= last[0]  # replaces (same second) or predates it
        self.db.executemany("INSERT OR REPLACE INTO energy VALUES (?,?,?,?,?)", rows)
        for row in rows:  # only once written: a failed insert is retried at the next call
            rid = row[1]
            last = self._last_written.get(rid)
            self._last_written[rid] = (max(t, last[0]) if last else t, row[2:])
        if rewrites:
            self.energy_epoch += 1
        if rows:
            energy_high = self._highs()[1]
            self._high[1] = t if energy_high is None else max(energy_high, t)  # type: ignore[index]
        return len(rows)

    def prune(self, chunk: int = PRUNE_CHUNK) -> int:
        """Delete expired rows in chunks so the database lock is released between them.

        Stops quietly when the database closes under it (shutdown); the next run goes on.
        """
        if chunk <= 0:
            raise ValueError("chunk must be positive")  # the delete loop would never end
        now = self.wall()
        total = 0
        try:
            for table, column, cutoff in (
                ("samples", "ts", int(now - SAMPLE_RETENTION_S)),
                ("command_log", "ts", now - COMMAND_LOG_RETENTION_S),
            ):
                while True:
                    n = self.db.execute(
                        f"DELETE FROM {table} WHERE rowid IN"
                        f" (SELECT rowid FROM {table} WHERE {column} < ? LIMIT ?)",
                        (cutoff, chunk),
                    )
                    total += n
                    if n and table == "samples":  # the weights of old spans changed
                        self.energy_epoch += 1
                    if n < chunk:
                        break
        except DatabaseClosed:
            pass
        return total

    def prune_if_due(self) -> int:
        """Prune at most once a day, across restarts (the last run is stored in settings)."""
        now = self.wall()
        n = 0
        try:
            last = self.db.get_setting("last_prune", 0)
            if now - last < PRUNE_EVERY_S:
                return 0
            n = self.prune()
            self.db.set_setting("last_prune", int(now))
        except DatabaseClosed:  # shutdown: not recorded, so the next start prunes again
            pass
        return n

    def history(
        self, radiator_ids: list[str], start: float, end: float, step: int
    ) -> list[dict[str, Any]]:
        if not radiator_ids:
            return []
        marks = ",".join("?" * len(radiator_ids))
        rows = self.db.query(
            f"SELECT radiator_id, (ts / ?) * ? AS bucket, AVG(temperature) AS temperature,"
            f" AVG(effective_setpoint) AS setpoint, AVG(target) AS target FROM samples"
            f" WHERE radiator_id IN ({marks}) AND ts >= ? AND ts <= ?"
            f" GROUP BY radiator_id, bucket ORDER BY bucket, radiator_id",
            (step, step, *radiator_ids, int(start), int(end)),
        )
        return [
            {
                "radiator_id": r["radiator_id"],
                "ts": r["bucket"],
                "temperature": _r(r["temperature"]),
                "setpoint": _r(r["setpoint"]),
                "target": _r(r["target"]),
            }
            for r in rows
        ]

    def _first_ts(self, rid: str, col: str) -> int | None:
        rows = self.db.rows(
            f"SELECT MIN(ts) FROM energy WHERE radiator_id = ? AND {col} IS NOT NULL", (rid,)
        )
        return rows[0][0] if rows else None

    def _bulk(self, rid: str, cols: list[str], a: int, b: int) -> list[tuple]:
        """Rows (ts, *cols) with a <= ts <= b, PAGE_ROWS a query (keyset pagination)."""
        out: list[tuple] = []
        after = a - 1
        while True:
            page = self.db.rows(
                f"SELECT ts, {', '.join(cols)} FROM energy WHERE radiator_id = ? AND ts > ?"
                " AND ts <= ? ORDER BY ts LIMIT ?",
                (rid, after, b, PAGE_ROWS),
            )
            out += page
            if len(page) < PAGE_ROWS:
                return out
            after = page[-1][0]

    def _head(self, rid: str, col: str, t: int) -> _Head:
        """The anchor of a replay starting at t (see `_Head`), from the database: one scan back
        through the run of equal values, once per request."""
        q = self.db.rows
        last = q(
            f"SELECT ts, {col} FROM energy WHERE radiator_id = ? AND ts < ?"
            f" AND {col} IS NOT NULL ORDER BY ts DESC LIMIT 1",
            (rid, t),
        )
        if not last:
            return None
        v = last[0][1]
        change = q(
            f"SELECT ts, {col} FROM energy WHERE radiator_id = ? AND ts < ?"
            f" AND {col} IS NOT NULL AND {col} != ? ORDER BY ts DESC LIMIT 1",
            (rid, last[0][0], v),
        )
        first = q(
            f"SELECT ts, {col} FROM energy WHERE radiator_id = ? AND ts > ? AND ts <= ?"
            f" AND {col} IS NOT NULL ORDER BY ts LIMIT 1",
            (rid, change[0][0] if change else -(2**62), last[0][0]),
        )
        return (change[0] if change else None, first[0], last[0])

    def _after(self, rid: str, col: str, t: int) -> Iterator[tuple]:
        """Readings after t, in pages growing from 8 rows to PAGE_ROWS: read until the caller
        stops (usually after the first row)."""
        size = min(8, PAGE_ROWS)
        while True:
            page = self.db.rows(
                f"SELECT ts, {col} FROM energy WHERE radiator_id = ? AND ts > ?"
                f" AND {col} IS NOT NULL ORDER BY ts LIMIT ?",
                (rid, t, size),
            )
            yield from page
            if len(page) < size:
                return
            t, size = page[-1][0], min(size * 8, PAGE_ROWS)

    def _chunk_spans(
        self,
        rid: str,
        cols: list[str],
        g: int,
        window: tuple[int, int],
        power_w: float | None,
        first: dict[str, int | None],
        heads: list[_Head],
    ) -> tuple[list[list[Span]], list[tuple]]:
        """Per counter, the spans of chunk [g, g + CHUNK_S) that overlap `window` (inside it),
        and the chunk's rows as columns (ts, *cols).

        The replay always starts at the anchor of g − LOOKBACK_S (`heads`), whatever window is
        asked, and runs past the window's end until a reading is accepted (a glitch or a reset
        candidate after the end never cuts the span crossing it). So a bucket gets the same
        energy in any window that contains it.
        """
        lo, hi = window
        a0 = g - LOOKBACK_S
        columns = list(zip(*self._bulk(rid, cols, a0, hi), strict=True)) or [()] * (len(cols) + 1)
        out: list[list[Span]] = []
        for k, col in enumerate(cols, start=1):
            start = first[col]
            spans: list[Span] = []
            if start is not None and start < hi:
                h = heads[k - 1]
                head = [] if h is None else [h[1]] if h[0] is None else [h[0], h[1]]
                readings = chain(
                    head, zip(columns[0], columns[k], strict=True), self._after(rid, col, hi)
                )
                spans = list(clean_spans(readings, power_w=power_w, stop_at=hi))
                skip = 0
                while skip < len(spans) and spans[skip].end <= lo:  # the replayed lookback
                    skip += 1
                spans = spans[skip:]
            out.append(spans)
        return out, columns

    def _rates(self, rid: str, ranges: list[tuple[int, int]]) -> RateIndex:
        """Working-rate samples over the union of `ranges` (the spans to spread by weight), a
        few ranges and PAGE_ROWS rows a query; bounded by the sample retention."""
        merged: list[list[int]] = []
        for a, b in sorted(ranges):
            a -= SAMPLE_STEP_S  # a sample just before a still covers it
            if merged and a <= merged[-1][1]:
                merged[-1][1] = max(merged[-1][1], b)
            else:
                merged.append([a, b])
        rows: list[tuple] = []
        for i in range(0, len(merged), RANGES_PER_QUERY):
            part = merged[i : i + RANGES_PER_QUERY]
            cond = " OR ".join(["(ts >= ? AND ts < ?)"] * len(part))
            bounds = [x for r in part for x in r]
            after = part[0][0] - 1
            while True:
                page = self.db.rows(
                    f"SELECT ts, working_rate FROM samples WHERE radiator_id = ? AND ts > ?"
                    f" AND ({cond}) ORDER BY ts LIMIT ?",
                    (rid, after, *bounds, PAGE_ROWS),
                )
                rows += page
                if len(page) < PAGE_ROWS:
                    break
                after = page[-1][0]
        return RateIndex(rows)

    def _buckets(self, rid: str, edges: list[int], cols: list[str]) -> list[list[Bucket]]:
        """One radiator, several counters, one pass over its rows (spec §2.1).

        Time is cut into fixed chunks of CHUNK_S (epoch-aligned, not window-aligned); each
        chunk's readings go `clean_spans` → `apportion`, weighted by working-rate samples
        loaded once per chunk for all counters, and the parts are summed per bucket.
        """
        n = len(edges) - 1
        acc = [[_UNKNOWN] * n for _ in cols]
        first = {col: self._first_ts(rid, col) for col in cols}
        if all(v is None for v in first.values()):
            return acc
        radiator = self.house.radiators.get(rid)
        power_w = radiator.power_w if radiator is not None else None
        g = edges[0] // CHUNK_S * CHUNK_S
        a0 = g - LOOKBACK_S
        heads = [
            self._head(rid, col, a0) if first[col] is not None and first[col] < a0 else None
            for col in cols
        ]
        while g < edges[-1]:
            lo, hi = max(g, edges[0]), min(g + CHUNK_S, edges[-1])
            i0 = bisect_right(edges, lo) - 1
            sub = edges[i0 : bisect_left(edges, hi) + 1]
            per, columns = self._chunk_spans(rid, cols, g, (lo, hi), power_w, first, heads)
            # The next chunk's anchors follow from this chunk's rows: no scan back in the table.
            nxt = g + CHUNK_S - LOOKBACK_S
            heads = [_advance(h, columns[0], columns[k], nxt) for k, h in enumerate(heads, start=1)]
            need = [r for spans in per for r in _spread(spans, sub, lo, hi)]
            rates = self._rates(rid, need) if need else None
            for row, spans in zip(acc, per, strict=True):
                if not spans:
                    continue
                part = apportion(spans, sub, rates, power_w=power_w, clip=(lo, hi))
                for j, b in enumerate(part, start=i0):
                    if b.covered_s:
                        row[j] = _merge(row[j], b)
            g += CHUNK_S
        return acc

    def energy_radiator_ids(self) -> list[str]:
        """Every radiator Kelvin ever recorded, including ones no longer in the house (L8)."""
        rows = self.db.query("SELECT DISTINCT radiator_id FROM energy ORDER BY radiator_id")
        return [r["radiator_id"] for r in rows]

    def energy_extent(self) -> dict[str, tuple[int, int]]:
        """First and last reading time of each recorded radiator."""
        rows = self.db.query(
            "SELECT radiator_id, MIN(ts) AS a, MAX(ts) AS b FROM energy GROUP BY radiator_id"
        )
        return {r["radiator_id"]: (r["a"], r["b"]) for r in rows}

    def energy_buckets(
        self, edges: list[int], radiator_ids: list[str] | None = None, *, counter: str = "total"
    ) -> dict[str, list[Bucket]]:
        """Energy of each radiator per bucket [edges[i], edges[i+1]) (spec §2.1).

        Readings → `clean_spans` → `apportion`, weighted by the radiator's working-rate samples.
        `radiator_ids=None` means every radiator present in the energy table. A bucket gets the
        same energy whatever window it is asked in (tested).
        """
        if len(edges) < 2:
            return {}
        col = COUNTERS[counter]
        ids = self.energy_radiator_ids() if radiator_ids is None else radiator_ids
        return {rid: self._buckets(rid, edges, [col])[0] for rid in ids}

    def sample_stats(
        self, radiator_ids: list[str], start: int, end: int
    ) -> dict[str, dict[str, float | None]]:
        """Per radiator over [start, end), from the 5-min samples (aggregated in SQL): the mean
        temperature and effective setpoint, and the heating hours at full power
        Σ(working_rate/100 × 5 min). Each is None below 50 % sample coverage."""
        if not radiator_ids or end <= start:
            return {}
        marks = ",".join("?" * len(radiator_ids))
        rows = self.db.query(
            f"SELECT radiator_id, COUNT(temperature) AS nt, AVG(temperature) AS t,"
            f" COUNT(effective_setpoint) AS ns, AVG(effective_setpoint) AS s,"
            f" COUNT(working_rate) AS nw, SUM(working_rate) AS w FROM samples"
            f" WHERE radiator_id IN ({marks}) AND ts >= ? AND ts < ? GROUP BY radiator_id",
            (*radiator_ids, start, end),
        )
        need = 0.5 * (end - start) / SAMPLE_STEP_S
        return {
            r["radiator_id"]: {
                "temp_avg": r["t"] if r["nt"] >= need else None,
                "setpoint_avg": r["s"] if r["ns"] >= need else None,
                "heating_hours": r["w"] / 100 * SAMPLE_STEP_S / 3600 if r["nw"] >= need else None,
            }
            for r in rows
        }

    def room_samples(self, radiator_ids: list[str], start: int, end: int) -> list[dict[str, Any]]:
        """The room's 5-min samples over [start, end), averaged over its radiators (one day at
        most: the caller bounds it)."""
        if not radiator_ids:
            return []
        marks = ",".join("?" * len(radiator_ids))
        rows = self.db.query(
            f"SELECT ts, AVG(temperature) AS t, AVG(effective_setpoint) AS s,"
            f" AVG(working_rate) AS w FROM samples WHERE radiator_id IN ({marks})"
            f" AND ts >= ? AND ts < ? GROUP BY ts ORDER BY ts",
            (*radiator_ids, start, end),
        )
        return [
            {
                "ts": r["ts"],
                "temperature": _r(r["t"]),
                "setpoint": _r(r["s"]),
                "working_rate": _r(r["w"]),
            }
            for r in rows
        ]

    def _key(self, t: int, unit: Unit) -> str:
        dt = datetime.fromtimestamp(t, self.tz)
        if unit == "hour":
            return dt.isoformat()
        if unit == "day":
            return dt.date().isoformat()
        return f"{dt.year:04d}-{dt.month:02d}"

    def radiator_energy(
        self, radiator_ids: list[str], start: float, end: float, unit: Unit
    ) -> list[dict[str, Any]]:
        """`GET /api/energy/radiators`: per radiator, the local hours, days or months that
        overlap [start, end), with the energy apportioned to each (unknown buckets omitted) and
        whether measured spans cover it whole (`complete`)."""
        if not radiator_ids or end <= start:
            return []
        first = datetime.fromtimestamp(start, self.tz).date()
        last = datetime.fromtimestamp(end, self.tz).date() + timedelta(days=1)
        edges = local_edges(first, last, unit, self.tz)
        keep = [i for i in range(len(edges) - 1) if edges[i] < end and edges[i + 1] > start]
        if not keep:
            return []
        edges = edges[keep[0] : keep[-1] + 2]
        cols = list(COUNTERS.values())  # total, t1, t2
        per = {rid: self._buckets(rid, edges, cols) for rid in radiator_ids}
        out = []
        for i in range(len(edges) - 1):
            for rid in sorted(radiator_ids):
                b = per[rid][0][i]
                if b.wh is None:
                    continue
                t1, t2 = per[rid][1][i].wh, per[rid][2][i].wh
                out.append(
                    {
                        "bucket": self._key(edges[i], unit),
                        "radiator_id": rid,
                        "kwh": round(b.wh / 1000, 3),
                        "t1_kwh": None if t1 is None else round(t1 / 1000, 3),
                        "t2_kwh": None if t2 is None else round(t2 / 1000, 3),
                        "interpolated": b.interpolated,
                        "apportioned": b.apportioned,
                        # Spans cover the whole bucket: false for the bucket a counter's last
                        # change cuts in two (the time after it is unknown) and for a running one.
                        "complete": b.covered_s >= edges[i + 1] - edges[i],
                    }
                )
        return out

    async def run(self, sample_every: float = 300.0) -> None:
        while True:
            try:
                self.sample()
                self.snapshot_energy()
                pruned = await asyncio.to_thread(self.prune_if_due)
                if pruned:
                    log.info("pruned %d old samples and command-log rows", pruned)
            except Exception:
                log.exception("recorder failed")
            await asyncio.sleep(sample_every)


_UNKNOWN = Bucket(None, 0, False, False)

# The anchor of a replay starting at t, for one counter: (the last reading before the run of
# equal values that holds at t, the first reading of that run, the last reading before t), or
# None when nothing was read before t. Starting from the run's first row keeps legacy repeated
# rows (written every 5 min before Plan 5) from cutting a flat span in two at a chunk start;
# starting one change earlier lets `clean_spans` see a glitched anchor as the glitch it is.
_Head = tuple[tuple[int, float] | None, tuple[int, float], tuple[int, float]] | None


def _advance(head: _Head, ts: tuple, values: tuple, t: int) -> _Head:
    """The anchor at t from the anchor at an earlier t' and the rows read in [t', t] (sorted):
    the same as `Recorder._head(t)` without reading the table again."""
    j = bisect_left(ts, t) - 1
    while j >= 0 and values[j] is None:
        j -= 1
    if j < 0:
        return head
    v = values[j]
    last = (ts[j], v)
    first = j
    for i in range(j - 1, -1, -1):
        x = values[i]
        if x is None:
            continue
        if x != v:
            return (ts[i], x), (ts[first], v), last
        first = i
    if head is None:
        return None, (ts[first], v), last
    if head[1][1] == v:  # the run began before t'
        return head[0], head[1], last
    return head[2], (ts[first], v), last


def _spread(spans: list[Span], edges: list[int], lo: int, hi: int) -> Iterator[tuple[int, int]]:
    """(start, end) of the spans (in time order) with energy that reach more than one bucket
    or leave the clip [lo, hi): those are spread by weight and need the samples."""
    k, n = 0, len(edges) - 1
    for s in spans:
        if s.wh <= 0:
            continue
        if s.start < lo or s.end > hi:
            yield s.start, s.end
            continue
        while k + 1 < n and edges[k + 1] <= s.start:
            k += 1
        if s.end > edges[k + 1]:
            yield s.start, s.end


def _merge(a: Bucket, b: Bucket) -> Bucket:
    covered = a.covered_s + b.covered_s
    return Bucket(
        (a.wh or 0.0) + (b.wh or 0.0) if covered else None,
        covered,
        a.interpolated or b.interpolated,
        a.apportioned or b.apportioned,
    )


def _r(v: float | None) -> float | None:
    return None if v is None else round(v, 2)
