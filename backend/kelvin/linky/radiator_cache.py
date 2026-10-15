"""The radiators' figures per local day, kept for the days that can no longer change (final review
I-4): a report's radiator € are running sums from 1 January, so without this every December
request would replay a year of half-hours.

A day is kept only when it is complete: every half-hour of it lies inside a span `clean_spans`
emitted. Such a figure is final. The generator never takes a span back when later readings
arrive, a span's weights are working-rate samples from before its end, and each chunk's replay
starts at an anchor that older rows fix (the window property in `tests/test_recorder.py`). So a
complete day reads the same forever, unless
- the tariff changes (the day's HC/HP and € are priced here): everything goes;
- a radiator's power changes (it bounds what `clean_spans` accepts): that radiator's days go;
- the recorder rewrites history (`Recorder.energy_epoch`: a reading that replaces or predates its
  radiator's last one, a sample not after the newest sample and reading, or pruned samples):
  everything goes.
Every other day (today, the days since a counter last moved, a gap) is computed on every request,
as before; the days before a radiator's first reading hold nothing and are not computed at all.
Bounded: at most `max_days` radiator-days, the least recently used out first.
"""

from __future__ import annotations

import threading
from collections import OrderedDict
from datetime import date, timedelta
from zoneinfo import ZoneInfo

from kelvin.billing.radiators import RadiatorDay, radiator_days
from kelvin.billing.tariff import Tariff
from kelvin.linky.models import local_day
from kelvin.recorder.energy import local_edges
from kelvin.recorder.recorder import Recorder

MAX_DAYS = 40_000  # radiator-days: 10 radiators × 4 years, about 10 MB
ONE = timedelta(days=1)


class RadiatorDayCache:
    def __init__(self, tz: ZoneInfo, max_days: int = MAX_DAYS) -> None:
        self.tz = tz
        self.max_days = max_days
        self._days: OrderedDict[tuple[str, date], RadiatorDay] = OrderedDict()
        self._power: dict[str, float | None] = {}
        self._tariff: Tariff | None = None
        self._epoch: int | None = None
        self._lock = threading.Lock()  # reports run in worker threads

    def __len__(self) -> int:
        return len(self._days)

    def _check(self, recorder: Recorder, ids: list[str], tariff: Tariff | None) -> None:
        """Drops what a tariff change, a power change or a rewrite made stale (under the lock)."""
        if tariff != self._tariff or recorder.energy_epoch != self._epoch:
            self._days.clear()
            self._power.clear()
            self._tariff, self._epoch = tariff, recorder.energy_epoch
        for rid in ids:
            radiator = recorder.house.radiators.get(rid)
            power = radiator.power_w if radiator is not None else None
            if rid in self._power and self._power[rid] != power:
                for key in [k for k in self._days if k[0] == rid]:
                    del self._days[key]
            self._power[rid] = power

    def days(
        self,
        recorder: Recorder,
        ranges: list[tuple[date, date]],
        tariff: Tariff | None,
        first_reading: dict[str, int],
    ) -> dict[str, dict[date, RadiatorDay]]:
        """Each radiator's RadiatorDay over `ranges` ([lo, hi) local days), as `radiator_days`
        gives them from `recorder.energy_buckets`: the cached days as they are, the others
        computed. `first_reading`: each recorded radiator's first reading time."""
        ids = sorted(first_reading)
        out: dict[str, dict[date, RadiatorDay]] = {}
        with self._lock:
            self._check(recorder, ids, tariff)
            todo: list[tuple[str, date, date]] = []
            for rid in ids:
                first = local_day(first_reading[rid], self.tz)
                for lo, hi in ranges:
                    run: date | None = None
                    d = max(lo, first)
                    while d < hi:
                        rd = self._days.get((rid, d))
                        if rd is not None:
                            self._days.move_to_end((rid, d))
                            out.setdefault(rid, {})[d] = rd
                            if run is not None:
                                todo.append((rid, run, d))
                                run = None
                        elif run is None:
                            run = d
                        d += ONE
                    if run is not None:
                        todo.append((rid, run, hi))
        computed: list[tuple[str, dict[date, RadiatorDay]]] = []
        for rid, lo, hi in todo:  # outside the lock: the long part
            edges = local_edges(lo, hi, "halfhour", self.tz)
            rows = recorder.energy_buckets(edges, [rid])
            computed.append((rid, radiator_days(rows[rid], edges, tariff, self.tz)))
        with self._lock:
            fresh = tariff == self._tariff and recorder.energy_epoch == self._epoch
            for rid, per in computed:
                out.setdefault(rid, {}).update(per)
                if not fresh:
                    continue
                for d, rd in per.items():
                    if rd.complete:
                        self._days[(rid, d)] = rd
                        self._days.move_to_end((rid, d))
            while len(self._days) > self.max_days:
                self._days.popitem(last=False)
        return out
