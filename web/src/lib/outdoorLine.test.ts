import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ForecastDay, Outdoor } from './api/types';
import { bucketTemps, halfHourTemps, hourlyLine, linePaths, maxTicks, tempScale, type Pt } from './outdoorLine';
import { parisDayStart } from './time';

const out = (mean_c: number | null): Outdoor => ({ mean_c, min_c: null, max_c: null, dju: null, days: mean_c == null ? 0 : 1, of: 1 });
const fc = (date: string, t_c: number | null) => ({ date, t_c }) as ForecastDay;
/** The half-hours of a Paris day (46, 48 or 50), epoch seconds. */
const halfHours = (iso: string, n = 48) => Array.from({ length: n }, (_, i) => ({ ts: parisDayStart(iso) / 1000 + i * 1800 }));

describe('bucketTemps: one value per bar', () => {
  it('Semaine / Mois: a day over reads its mean; today and the days to come read the forecast, else nothing', () => {
    const buckets = [
      { key: '2026-10-14', outdoor: out(6.3) },
      { key: '2026-10-15', outdoor: out(null) }, // a day over without weather: a gap, never interpolated
      { key: '2026-10-16', outdoor: out(5.1) },
      { key: '2026-10-17', outdoor: null }, // today
      { key: '2026-10-18', outdoor: null },
      { key: '2026-10-25', outdoor: null } // beyond the 7-day forecast
    ];
    const forecast = [fc('2026-10-17', 3.4), fc('2026-10-18', 2), fc('2026-10-19', null)];
    expect(bucketTemps(buckets, 'day', '2026-10-17', forecast)).toEqual([
      { v: 6.3, kind: 'obs' },
      { v: null, kind: 'obs' },
      { v: 5.1, kind: 'obs' },
      { v: 3.4, kind: 'fc' },
      { v: 2, kind: 'fc' },
      { v: null, kind: 'obs' }
    ]);
    // Without the forecast (not loaded, or none), the days to come stay empty.
    expect(bucketTemps(buckets, 'day', '2026-10-17', null).slice(3).every((t) => t.v == null)).toBe(true);
    // A past day never takes a forecast, even when one is listed for it.
    expect(bucketTemps([{ key: '2026-10-14', outdoor: out(null) }], 'day', '2026-10-17', [fc('2026-10-14', 9)])).toEqual([{ v: null, kind: 'obs' }]);
  });

  it('Année: each month its elapsed days’ mean, never a forecast', () => {
    const months = [
      { key: '2026-09', outdoor: out(15.2) },
      { key: '2026-10', outdoor: out(9.8) },
      { key: '2026-11', outdoor: null }
    ];
    expect(bucketTemps(months, 'month', '2026-10-17', [fc('2026-11-01', 4)])).toEqual([
      { v: 15.2, kind: 'obs' },
      { v: 9.8, kind: 'obs' },
      { v: null, kind: 'obs' }
    ]);
  });
});

describe('the Courbe: half-hours against published hours', () => {
  it('each half-hour reads the hour holding it', () => {
    const ivs = halfHours('2026-10-14');
    const t0 = ivs[0].ts * 1000;
    const points = [
      { t: t0, v: 4 },
      { t: t0 + 3_600_000, v: 3.5 }
    ];
    expect(halfHourTemps(ivs, points).slice(0, 5)).toEqual([4, 4, 3.5, 3.5, null]);
  });

  it('one point per hour, on the half-hour that starts it; a missing hour is a break', () => {
    const ivs = halfHours('2026-10-14');
    const t0 = ivs[0].ts * 1000;
    const line = hourlyLine(ivs, [
      { t: t0, v: 4 },
      { t: t0 + 2 * 3_600_000, v: 3 }
    ]);
    expect(line).toHaveLength(24);
    expect(line.slice(0, 3)).toEqual([
      { i: 0, v: 4 },
      { i: 2, v: null },
      { i: 4, v: 3 }
    ]);
  });

  it('the autumn DST day has 25 hours, each on its own half-hour', () => {
    const ivs = halfHours('2026-10-25', 50);
    expect(hourlyLine(ivs, []).map((h) => h.i)).toEqual(Array.from({ length: 25 }, (_, k) => 2 * k));
  });
});

describe('tempScale: the °C axis', () => {
  it('pads by 1 °C, whole ticks, at most the intervals asked', () => {
    expect(tempScale([3.2, 9.8], 4)).toEqual({ lo: 0, hi: 15, step: 5, ticks: [0, 5, 10, 15] });
    expect(tempScale([3.2, 6.8], 4)).toEqual({ lo: 2, hi: 8, step: 2, ticks: [2, 4, 6, 8] });
    const s = tempScale([3.2, 9.8], 4)!;
    expect(s.lo).toBeLessThanOrEqual(2.2);
    expect(s.hi).toBeGreaterThanOrEqual(10.8);
    expect((s.hi - s.lo) / s.step).toBeLessThanOrEqual(4);
    expect(s.ticks[0]).toBe(s.lo);
    expect(s.ticks.at(-1)).toBe(s.hi);
    const narrow = tempScale([-6, 14], 3)!;
    expect(narrow.ticks.length - 1).toBeLessThanOrEqual(3);
    expect(narrow.lo).toBeLessThanOrEqual(-7);
    expect(narrow.hi).toBeGreaterThanOrEqual(15);
  });
  it('a flat week still spans whole degrees; nothing to draw is no scale', () => {
    const flat = tempScale([5, 5, null])!;
    expect(flat.hi - flat.lo).toBeGreaterThanOrEqual(2);
    expect(tempScale([null, null])).toBeNull();
    expect(tempScale([])).toBeNull();
  });
  it('fewer ticks on a phone floor', () => {
    expect(maxTicks(280)).toBe(3);
    expect(maxTicks(900)).toBe(4);
    expect(maxTicks(0)).toBe(4);
  });
});

describe('linePaths: gaps, forecast, lone points', () => {
  const p = (x: number, kind: Pt['kind'] = 'obs'): Pt => ({ x, y: 10, kind });
  it('joins measured neighbours solid; a null breaks the line (never bridged)', () => {
    const r = linePaths([p(0), p(10), null, p(30), p(40)]);
    expect(r.solid).toBe('M0,10L10,10M30,10L40,10');
    expect(r.dashed).toBe('');
    expect(r.dots).toEqual([]);
  });
  it('the forecast carries on from the last measured day, dashed', () => {
    const r = linePaths([p(0), p(10), p(20, 'fc'), p(30, 'fc')]);
    expect(r.solid).toBe('M0,10L10,10');
    expect(r.dashed).toBe('M10,10L20,10M20,10L30,10');
  });
  it('a lone point between gaps is a dot', () => {
    const r = linePaths([p(0), null, p(20), null, p(40, 'fc')]);
    expect(r.solid).toBe('');
    expect(r.dots.map((d) => d.x)).toEqual([0, 20, 40]);
  });
});

describe('the line’s switch, remembered per device', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });
  it('on by default; hiding it is kept across a reload, showing it again forgets the choice', async () => {
    const a = await import('./stores/outdoorLine.svelte');
    expect(a.outdoorLine.on).toBe(true);
    a.outdoorLine.toggle();
    expect(a.outdoorLine.on).toBe(false);
    expect(localStorage.getItem(a.OUTDOOR_LINE_KEY)).toBe('off');
    vi.resetModules();
    const b = await import('./stores/outdoorLine.svelte');
    expect(b.outdoorLine.on).toBe(false);
    b.outdoorLine.set(true);
    expect(localStorage.getItem(b.OUTDOOR_LINE_KEY)).toBeNull();
  });
  it('without storage (private mode) it still switches, for the visit', async () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { OutdoorLineStore } = await import('./stores/outdoorLine.svelte');
    const s = new OutdoorLineStore();
    expect(s.on).toBe(true);
    s.toggle();
    expect(s.on).toBe(false);
    get.mockRestore();
    set.mockRestore();
  });
});
