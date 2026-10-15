import { describe, expect, it } from 'vitest';
import type { Tariff } from '$lib/api/types';
import { ALL_MONTHS, buildDocument, hourBlocks, inForce, monthsProblem, slotsText, withSchedule } from './tariff';

const NIGHT = [{ start: '22:00', end: '06:00' }];
const current: Tariff = {
  option: 'hchp',
  kva: 9,
  hc_slots: NIGHT,
  hc_schedules: [{ valid_from: '2025-01-15', variants: [{ months: ALL_MONTHS, slots: NIGHT }] }],
  tempo_hours: { hc_start: '22:00', hc_end: '06:00', day_start: '06:00' },
  prices: [{ valid_from: '2025-01-15', option: 'hchp', subscription_eur_month: 15, rates: { hc: 0.2, hp: 0.27 }, hc_eur_kwh: 0.2, hp_eur_kwh: 0.27 }]
};
const draft = (over = {}) => ({
  option: 'hchp' as const,
  kva: 9,
  validFrom: '2026-10-14',
  subscription: 15,
  rates: { hc: 0.2, hp: 0.27 },
  schedule: { valid_from: '2026-10-14', variants: [{ months: ALL_MONTHS, slots: NIGHT }] },
  tempoHours: { hc_start: '22:00', hc_end: '06:00' },
  ...over
});

describe('hourBlocks (HoursBar)', () => {
  it('splits a slot past midnight, keeps a day slot whole', () => {
    expect(hourBlocks([{ start: '22:00', end: '06:00' }])).toEqual([
      { left: (1320 / 1440) * 100, width: (120 / 1440) * 100 },
      { left: 0, width: 25 }
    ]);
    expect(hourBlocks([{ start: '12:00', end: '14:00' }])).toEqual([{ left: 50, width: (120 / 1440) * 100 }]);
    expect(hourBlocks([{ start: '00:00', end: '00:00' }])).toEqual([{ left: 0, width: 100 }]);
    expect(slotsText([{ start: '22:00', end: '06:00' }, { start: '12:00', end: '14:00' }])).toBe('22:00–06:00, 12:00–14:00');
  });
});

describe('tariff document', () => {
  it('the row in force: days before the first use the first', () => {
    expect(inForce(current.prices, '2024-01-01')?.valid_from).toBe('2025-01-15');
    expect(inForce([], '2026-01-01')).toBeNull();
  });
  it('unchanged prices and slots add nothing; the v1 fields are dropped', () => {
    const doc = buildDocument(current, draft());
    expect(doc.prices).toEqual([{ valid_from: '2025-01-15', option: 'hchp', subscription_eur_month: 15, rates: { hc: 0.2, hp: 0.27 } }]);
    expect(doc.hc_schedules).toEqual(current.hc_schedules);
  });
  it('a new price is a new dated row; the history stays', () => {
    const doc = buildDocument(current, draft({ validFrom: '2026-11-01', rates: { hc: 0.2068, hp: 0.28 } }));
    expect(doc.prices.map((p) => p.valid_from)).toEqual(['2025-01-15', '2026-11-01']);
  });
  it('a switch to Tempo adds a Tempo row and keeps the HC/HP schedules for the past', () => {
    const rates = { blue_hc: 0.1296, blue_hp: 0.1609, white_hc: 0.1486, white_hp: 0.1894, red_hc: 0.1568, red_hp: 0.7562 };
    const doc = buildDocument(current, draft({ option: 'tempo', validFrom: '2026-11-01', rates, schedule: null, tempoHours: { hc_start: '22:00', hc_end: '06:00' } }));
    expect(doc.prices.at(-1)).toEqual({ valid_from: '2026-11-01', option: 'tempo', subscription_eur_month: 15, rates });
    expect(doc.hc_schedules).toEqual(current.hc_schedules);
  });
  it('changed off-peak hours are a new dated schedule', () => {
    const s = { valid_from: '2026-11-01', variants: [{ months: [11, 12, 1, 2, 3], slots: [{ start: '01:00', end: '07:00' }] }, { months: [4, 5, 6, 7, 8, 9, 10], slots: NIGHT }] };
    expect(buildDocument(current, draft({ schedule: s })).hc_schedules.map((x) => x.valid_from)).toEqual(['2025-01-15', '2026-11-01']);
    expect(withSchedule(current, s).hc_schedules.at(-1)).toEqual(s);
  });
  it('months are covered exactly once', () => {
    expect(monthsProblem([{ months: [1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12] }])).toEqual({ kind: 'missing', months: [4] });
    expect(monthsProblem([{ months: [11, 12, 1, 2, 3] }, { months: [1, 4, 5, 6, 7, 8, 9, 10] }])).toEqual({ kind: 'overlap', months: [1] });
    expect(monthsProblem([{ months: ALL_MONTHS }])).toBeNull();
  });
});
