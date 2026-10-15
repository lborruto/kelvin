import { describe, expect, it } from 'vitest';
import type { GridView } from '$lib/api/types';
import { hoursText, stripLines } from './grid';

const view = (over: Partial<GridView> = {}): GridView => ({
  tempo: null,
  ecowatt: { days: [{ date: '2026-12-01', level: 1, hours: null }, { date: '2026-12-02', level: 2, hours: null }], fetched_at: 1000 },
  source: 'MyElectricalData',
  ...over
});

describe('stripLines', () => {
  it('says nothing without data, or when every signal is green and there is no Tempo', () => {
    expect(stripLines(null, '2026-12-01')).toBeNull();
    expect(stripLines(view({ ecowatt: { days: [{ date: '2026-12-01', level: 1, hours: null }], fetched_at: 1 } }), '2026-12-01')).toBeNull();
  });
  it('keeps EcoWatt 2 and 3 for today and tomorrow only', () => {
    const v = view({
      ecowatt: {
        days: [
          { date: '2026-12-01', level: 3, hours: null },
          { date: '2026-12-02', level: 2, hours: [{ start: '18:00', end: '20:00', level: 2 }] },
          { date: '2026-12-03', level: 3, hours: null }
        ],
        fetched_at: 1000
      }
    });
    expect(stripLines(v, '2026-12-01')!.ecowatt).toEqual([
      { date: '2026-12-01', when: 'today', level: 3, hours: null },
      { date: '2026-12-02', when: 'tomorrow', level: 2, hours: '18:00–20:00' }
    ]);
  });
  it('carries Tempo only when the backend sends it, with the pending state', () => {
    const v = view({
      tempo: { today: { date: '2026-12-01', colour: 'blue' }, tomorrow: { date: '2026-12-02', colour: null, expected_at: '11:00' }, fetched_at: 2000 }
    });
    const s = stripLines(v, '2026-12-01')!;
    expect(s.tempo).toEqual({ today: 'blue', tomorrow: null, expectedAt: '11:00' });
    expect(s.updatedAt).toBe(2000);
    expect(stripLines(view(), '2026-12-01')!.tempo).toBeNull();
  });
  it('joins hour runs', () => {
    expect(hoursText([{ start: '08:00', end: '10:00', level: 2 }, { start: '18:00', end: '20:00', level: 3 }])).toBe('08:00–10:00, 18:00–20:00');
    expect(hoursText(null)).toBeNull();
  });
});
