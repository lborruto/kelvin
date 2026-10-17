import { api } from '$lib/api/client';
import type { HistoryPoint } from '$lib/api/types';

/** One radiator's bucket, as the room chart's inspector reads it. */
export interface StripRadiator {
  id: string;
  v: number | null;
  lo: number | null;
  hi: number | null;
  s: number | null;
  rate: number | null;
  modes: string[];
  levels: string[];
}

/**
 * A room's bucket: `v` the mean temperature of the radiators that read one, `s` the mean effective setpoint of
 * those not off. The rest is optional (the Maison sparkline and older backends leave it out): the room's lowest
 * and highest reading, the mean working rate, the modes and levels seen, and each radiator's own bucket.
 */
export interface StripPoint {
  t: number;
  v: number | null;
  s: number | null;
  lo?: number | null;
  hi?: number | null;
  rate?: number | null;
  modes?: string[];
  levels?: string[];
  rads?: StripRadiator[];
}

type Fetcher = (ids: string[], start: number, end: number, step: number) => Promise<HistoryPoint[]>;

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const nums = (xs: (number | null | undefined)[]) => xs.filter((x): x is number => x != null && !Number.isNaN(x));
const union = (xs: string[][]) => [...new Set(xs.flat())].sort();
/** A radiator that was only off in the bucket has no setpoint in force (its reported value is no target). */
const offOnly = (r: HistoryPoint) => r.modes?.length === 1 && r.modes[0] === 'off';

export function averageByTs(rows: HistoryPoint[]): StripPoint[] {
  const groups = new Map<number, HistoryPoint[]>();
  for (const r of rows) groups.set(r.ts, [...(groups.get(r.ts) ?? []), r]);
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([ts, rs]) => {
      const los = nums(rs.map((r) => r.temperature_min ?? r.temperature));
      const his = nums(rs.map((r) => r.temperature_max ?? r.temperature));
      return {
        t: ts * 1000,
        v: mean(nums(rs.map((r) => r.temperature))),
        s: mean(nums(rs.filter((r) => !offOnly(r)).map((r) => r.setpoint))),
        lo: los.length ? Math.min(...los) : null,
        hi: his.length ? Math.max(...his) : null,
        rate: mean(nums(rs.map((r) => r.working_rate))),
        modes: union(rs.map((r) => r.modes ?? [])),
        levels: union(rs.map((r) => r.levels ?? [])),
        rads: rs.map((r) => ({
          id: r.radiator_id,
          v: r.temperature,
          lo: r.temperature_min ?? null,
          hi: r.temperature_max ?? null,
          s: offOnly(r) ? null : r.setpoint,
          rate: r.working_rate ?? null,
          modes: r.modes ?? [],
          levels: r.levels ?? []
        }))
      };
    });
}

export class HistoryCache {
  data = $state<Record<string, StripPoint[]>>({});
  #inflight = new Map<string, Promise<void>>();
  #stamp = new Map<string, number>();
  /** Bumped by reset(): a fetch started before it must not write into the next session. */
  #gen = 0;
  fetcher: Fetcher;
  now: () => number;

  constructor(fetcher: Fetcher = api.history, now: () => number = () => Date.now()) {
    this.fetcher = fetcher;
    this.now = now;
  }

  reset(): void {
    this.#gen++;
    this.data = {};
    this.#inflight.clear();
    this.#stamp.clear();
  }

  load(key: string, radiatorIds: string[], startMs: number, endMs: number, stepSec: number, maxAgeMs = 300_000): Promise<void> {
    const at = this.#stamp.get(key);
    if (at !== undefined && this.now() - at < maxAgeMs) return Promise.resolve();
    const running = this.#inflight.get(key);
    if (running) return running;
    const gen = this.#gen;
    const p = this.fetcher(radiatorIds, Math.floor(startMs / 1000), Math.floor(endMs / 1000), stepSec)
      .then((rows) => {
        if (gen !== this.#gen) return;
        this.data[key] = averageByTs(rows);
        this.#stamp.set(key, this.now());
      })
      .catch(() => {
        /* the strip simply stays empty; the banner reports connectivity */
      })
      .finally(() => {
        if (gen === this.#gen) this.#inflight.delete(key);
      });
    this.#inflight.set(key, p);
    return p;
  }
}

export const history = new HistoryCache();
