import { describe, expect, it } from 'vitest';
import type { GridView, Tariff } from './api/types';
import { dayBlocks, hcText, maintenant } from './maintenant';

// Paris is UTC+2 on 16 October 2026 (summer time).
const at = (hhmm: string, day = '2026-10-16') => Date.parse(`${day}T${hhmm}:00+02:00`);

const base = (option: 'base' | 'hchp' | 'tempo', rates: Record<string, number>): Tariff => ({
  option,
  kva: 9,
  hc_slots: [{ start: '22:00', end: '06:00' }],
  hc_schedules: [],
  tempo_hours: { hc_start: '22:00', hc_end: '06:00', day_start: '06:00' },
  prices: [{ valid_from: '2026-01-01', option, subscription_eur_month: 23.48, rates }]
});
const hchp = base('hchp', { hc: 0.2, hp: 0.27 });
const tempo = base('tempo', { blue_hc: 0.1288, blue_hp: 0.1552, white_hc: 0.1447, white_hp: 0.1792, red_hc: 0.1518, red_hp: 0.6586 });
const grid: GridView = {
  tempo: {
    today: { date: '2026-10-16', colour: 'blue' },
    tomorrow: { date: '2026-10-17', colour: 'white', expected_at: null },
    fetched_at: null
  },
  ecowatt: { days: [], fetched_at: null },
  source: 'MyElectricalData'
};

describe('maintenant', () => {
  it('no tariff (or no price row): « Renseigner le tarif »', () => {
    expect(maintenant(null, null, at('18:42'))).toEqual({ kind: 'none' });
    expect(maintenant({ ...hchp, prices: [] }, null, at('18:42'))).toEqual({ kind: 'none' });
  });

  it('Base: one price, no band', () => {
    expect(maintenant(base('base', { base: 0.2516 }), null, at('18:42'))).toEqual({ kind: 'base', price: 0.2516, kva: 9 });
  });

  it('HC/HP at 18:42: peak until 22:00, then off-peak at its price', () => {
    const n = maintenant(hchp, null, at('18:42'));
    expect(n).toMatchObject({ kind: 'hchp', period: 'hp', price: 0.27, next: { period: 'hc', at: at('22:00'), price: 0.2 } });
    if (n.kind !== 'hchp') throw new Error();
    expect(n.blocks).toEqual([
      { from: 0, to: 360, period: 'hc' },
      { from: 360, to: 1320, period: 'hp' },
      { from: 1320, to: 1440, period: 'hc' }
    ]);
  });

  it('HC/HP at 23:10: off-peak until 06:00 tomorrow', () => {
    expect(maintenant(hchp, null, at('23:10'))).toMatchObject({ period: 'hc', price: 0.2, next: { period: 'hp', at: at('06:00', '2026-10-17') } });
  });

  it('the seasonal schedule in force picks the slots of the month', () => {
    const seasonal: Tariff = {
      ...hchp,
      hc_schedules: [{ valid_from: '2026-01-01', variants: [{ months: [10], slots: [{ start: '02:00', end: '07:00' }, { start: '14:00', end: '17:00' }] }, { months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12], slots: [{ start: '22:00', end: '06:00' }] }] }]
    };
    expect(maintenant(seasonal, null, at('15:00'))).toMatchObject({ period: 'hc', next: { period: 'hp', at: at('17:00') } });
  });

  it('Tempo at 18:42: today’s colour, peak until 22:00, off-peak the same Tempo day; tomorrow with its prices', () => {
    expect(maintenant(tempo, grid, at('18:42'))).toMatchObject({
      kind: 'tempo', period: 'hp', price: 0.1552,
      next: { period: 'hc', at: at('22:00'), price: 0.1288, colour: 'blue' },
      tempo: { colour: 'blue', tomorrow: { colour: 'white', hp: 0.1792, hc: 0.1447 } }
    });
  });

  it('Tempo at 23:00: still today’s Tempo day; at 06:00 tomorrow’s colour starts', () => {
    expect(maintenant(tempo, grid, at('23:00'))).toMatchObject({
      period: 'hc', price: 0.1288, next: { period: 'hp', at: at('06:00', '2026-10-17'), price: 0.1792, colour: 'white' }
    });
  });

  it('Tempo at 05:00: the Tempo day in force is yesterday’s, whose colour is unknown here: no price, never a guess', () => {
    expect(maintenant(tempo, grid, at('05:00'))).toMatchObject({
      period: 'hc', price: null, tempo: { colour: null }, next: { period: 'hp', at: at('06:00'), price: 0.1552, colour: 'blue' }
    });
  });

  it('a slot ending at midnight and one crossing it draw as day blocks', () => {
    expect(dayBlocks([{ start: '12:00', end: '14:00' }, { start: '23:00', end: '00:00' }])).toEqual([
      { from: 0, to: 720, period: 'hp' },
      { from: 720, to: 840, period: 'hc' },
      { from: 840, to: 1380, period: 'hp' },
      { from: 1380, to: 1440, period: 'hc' }
    ]);
  });

  it('names the off-peak hours, a slot over midnight joined again', () => {
    expect(hcText(dayBlocks([{ start: '22:00', end: '06:00' }]))).toBe('22:00–06:00');
    expect(hcText(dayBlocks([{ start: '02:00', end: '07:00' }, { start: '14:00', end: '17:00' }]))).toBe('02:00–07:00, 14:00–17:00');
  });
});
