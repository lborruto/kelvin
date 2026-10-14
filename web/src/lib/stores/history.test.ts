import { describe, expect, it, vi } from 'vitest';
import type { HistoryPoint } from '$lib/api/types';
import { averageByTs, HistoryCache } from './history.svelte';

describe('history', () => {
  it('averages radiators per timestamp and converts to ms', () => {
    expect(
      averageByTs([
        { radiator_id: 'a', ts: 100, temperature: 20, setpoint: 17, target: 20 },
        { radiator_id: 'b', ts: 100, temperature: 22, setpoint: 17, target: 20 },
        { radiator_id: 'a', ts: 200, temperature: null, setpoint: null, target: null }
      ])
    ).toEqual([
      { t: 100_000, v: 21, s: 17 },
      { t: 200_000, v: null, s: null }
    ]);
  });

  it('caches per key and dedupes in-flight loads', async () => {
    const fetcher = vi.fn().mockResolvedValue([{ radiator_id: 'a', ts: 1, temperature: 20, setpoint: 17, target: 20 }]);
    let now = 0;
    const cache = new HistoryCache(fetcher, () => now);
    await Promise.all([cache.load('k', ['a'], 0, 1000, 900), cache.load('k', ['a'], 0, 1000, 900)]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(['a'], 0, 1, 900);
    expect(cache.data.k).toHaveLength(1);
    now = 299_000;
    await cache.load('k', ['a'], 0, 1000, 900);
    expect(fetcher).toHaveBeenCalledTimes(1);
    now = 301_000;
    await cache.load('k', ['a'], 0, 1000, 900);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

it('a fetch still in flight at reset() never writes into the new session', async () => {
  let resolve!: (rows: HistoryPoint[]) => void;
  const fetcher = vi
    .fn<() => Promise<HistoryPoint[]>>()
    .mockImplementationOnce(() => new Promise<HistoryPoint[]>((r) => (resolve = r)))
    .mockResolvedValue([]);
  const cache = new HistoryCache(fetcher, () => 1_000);
  const p = cache.load('k', ['a'], 0, 3_600_000, 300);
  cache.reset();
  resolve([{ radiator_id: 'a', ts: 60, temperature: 20, setpoint: 19, target: 19 }]);
  await p;
  expect(cache.data).toEqual({});
  await cache.load('k', ['a'], 0, 3_600_000, 300);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
