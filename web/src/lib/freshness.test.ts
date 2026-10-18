import { describe, expect, it } from 'vitest';
import { CADENCE_MS, freshness, type FreshSource } from './freshness';

// 15 Oct 2026, Paris = UTC+2.
const at = (iso: string) => Date.parse(iso);
const morning = at('2026-10-15T09:30:00+02:00');
const afternoon = at('2026-10-15T14:00:00+02:00');

describe('freshness: the cadence matrix', () => {
  it('failed wins over everything, then waiting', () => {
    for (const s of ['cozytouch', 'linky-day', 'linky-curve', 'rte-ecowatt', 'tempo'] as FreshSource[]) {
      expect(freshness(s, { at: afternoon, day: '2026-10-14', failed: true, waiting: true }, afternoon), s).toBe('bad');
      expect(freshness(s, { at: afternoon, day: '2026-10-14', waiting: true }, afternoon), s).toBe('late');
    }
  });
  it('nothing known: nothing to say', () => {
    expect(freshness('cozytouch', {}, afternoon)).toBe('none');
    expect(freshness('linky-day', { day: null }, afternoon)).toBe('none');
  });
  it('Cozytouch: fresh within 15 min, late after', () => {
    expect(freshness('cozytouch', { at: afternoon - CADENCE_MS.cozytouch }, afternoon)).toBe('fresh');
    expect(freshness('cozytouch', { at: afternoon - CADENCE_MS.cozytouch - 1 }, afternoon)).toBe('late');
  });
  it('Linky: yesterday is due by 12:00; before noon the day before still counts', () => {
    expect(freshness('linky-day', { day: '2026-10-13' }, morning)).toBe('fresh');
    expect(freshness('linky-day', { day: '2026-10-12' }, morning)).toBe('late');
    expect(freshness('linky-day', { day: '2026-10-13' }, afternoon)).toBe('late');
    expect(freshness('linky-curve', { day: '2026-10-14' }, afternoon)).toBe('fresh');
  });
  it('RTE EcoWatt: 6 h', () => {
    expect(freshness('rte-ecowatt', { at: afternoon - 5 * 3_600_000 }, afternoon)).toBe('fresh');
    expect(freshness('rte-ecowatt', { at: afternoon - 7 * 3_600_000 }, afternoon)).toBe('late');
  });
  it('Tempo: 24 h, and tomorrow’s colour is due after 11:00', () => {
    expect(freshness('tempo', { at: morning - 3_600_000, tomorrowKnown: false }, morning)).toBe('fresh');
    expect(freshness('tempo', { at: afternoon - 3_600_000, tomorrowKnown: false }, afternoon)).toBe('late');
    expect(freshness('tempo', { at: afternoon - 3_600_000, tomorrowKnown: true }, afternoon)).toBe('fresh');
    expect(freshness('tempo', { at: afternoon - 25 * 3_600_000, tomorrowKnown: true }, afternoon)).toBe('late');
  });
  it('weather: 2 h', () => {
    expect(freshness('weather', { at: afternoon - 30 * 60_000 }, afternoon)).toBe('fresh');
    expect(freshness('weather', { at: afternoon - 3 * 3_600_000 }, afternoon)).toBe('late');
    expect(CADENCE_MS.weather).toBe(2 * 3_600_000);
  });
});
