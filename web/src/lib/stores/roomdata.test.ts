import { describe, expect, it, vi } from 'vitest';
import { Cache } from './roomdata.svelte';

describe('room data cache', () => {
  it('fetches once while fresh, again when stale; a failure keeps the last value', async () => {
    let t = 0;
    const c = new Cache<number>(1000, () => t);
    const fetch = vi.fn().mockResolvedValueOnce(1).mockRejectedValueOnce(new Error('x'));
    await c.load('k', fetch);
    await c.load('k', fetch);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(c.data.k).toEqual({ value: 1, error: false });
    t = 2000;
    await c.load('k', fetch);
    expect(c.data.k).toEqual({ value: 1, error: false });
    const g = vi.fn().mockRejectedValue(new Error('x'));
    await c.load('other', g);
    expect(c.data.other).toEqual({ value: null, error: true });
  });
  it('reset drops data and ignores answers of the previous session', async () => {
    const c = new Cache<number>(1000);
    let resolve!: (v: number) => void;
    const p = c.load('k', () => new Promise<number>((r) => (resolve = r)));
    c.reset();
    resolve(5);
    await p;
    expect(c.data.k).toBeUndefined();
  });
});
