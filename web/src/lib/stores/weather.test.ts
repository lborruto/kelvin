import { describe, expect, it, vi } from 'vitest';
import { VIEW } from '$lib/weather.fixture';
import { HOURLY_MAX_AGE_MS, WeatherStore } from './weather.svelte';

const H = 3_600_000;
const flush = () => new Promise((r) => setTimeout(r, 0));
const answer = (ts: number[]) => ({ step: 3600, points: ts.map((t) => ({ ts: t, t: 5, model: 'arome_hd' })) });

describe('WeatherStore hourly cache', () => {
  it('one request per window while fresh; refreshed after its max age, extended to the new now, old points kept meanwhile', async () => {
    const s = new WeatherStore();
    s.apply(VIEW);
    const start = Date.UTC(2026, 10, 19, 23);
    const fetcher = vi.fn().mockResolvedValue(answer([start / 1000]));
    s.hourly('k', start, start + 10 * H, fetcher, start + 10 * H);
    await flush();
    s.hourly('k', start, start + 10 * H + 60_000, fetcher, start + 10 * H + 60_000);
    expect(fetcher).toHaveBeenCalledTimes(1);
    // Reopened hours later: the window ends at the new now.
    const later = start + 14 * H;
    fetcher.mockResolvedValue(answer([start / 1000, (start + 13 * H) / 1000]));
    const e = s.hourly('k', start, later, fetcher, later)!;
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenLastCalledWith(start / 1000, later / 1000);
    expect(e.points).toHaveLength(1); // the old points stay on screen while it refreshes
    await flush();
    expect(s.entries.k.points).toHaveLength(2);
    expect(later - (start + 10 * H)).toBeGreaterThan(HOURLY_MAX_AGE_MS);
  });

  it('a new place forgets every window, and an answer for the old place arriving late is dropped', async () => {
    const s = new WeatherStore();
    s.apply(VIEW);
    let late: (v: unknown) => void = () => {};
    const slow = vi.fn(() => new Promise((r) => (late = r)));
    s.hourly('k', 0, H, slow as never, H);
    s.placeChanged();
    expect(s.entries).toEqual({});
    late(answer([0]));
    await flush();
    expect(s.entries.k).toBeUndefined();
    const fetcher = vi.fn().mockResolvedValue(answer([0, 3600]));
    s.hourly('k', 0, H, fetcher, H);
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(s.entries.k.points).toHaveLength(2);
  });

  it('no place: nothing asked, and removing it forgets the windows', async () => {
    const s = new WeatherStore();
    const fetcher = vi.fn().mockResolvedValue(answer([0]));
    s.apply(null);
    expect(s.hourly('k', 0, H, fetcher, H)).toBeUndefined();
    expect(fetcher).not.toHaveBeenCalled();
    s.apply(VIEW);
    s.hourly('k', 0, H, fetcher, H);
    await flush();
    s.apply(null);
    expect(s.entries).toEqual({});
  });
});
