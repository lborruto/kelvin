import { api } from '$lib/api/client';
import type { HistoryPoint } from '$lib/api/types';

export interface StripPoint {
  t: number;
  v: number | null;
  s: number | null;
}

type Fetcher = (ids: string[], start: number, end: number, step: number) => Promise<HistoryPoint[]>;

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function averageByTs(rows: HistoryPoint[]): StripPoint[] {
  const groups = new Map<number, HistoryPoint[]>();
  for (const r of rows) groups.set(r.ts, [...(groups.get(r.ts) ?? []), r]);
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([ts, rs]) => ({
      t: ts * 1000,
      v: mean(rs.flatMap((r) => (r.temperature == null ? [] : [r.temperature]))),
      s: mean(rs.flatMap((r) => (r.setpoint == null ? [] : [r.setpoint])))
    }));
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
