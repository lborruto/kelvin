import { describe, expect, it } from 'vitest';
import type { PeriodSummary } from './api/types';
import { addDays, bucketLabel, compareLabel, heroTitle, leadingMissing, periodWindow, spanLabel } from './energy';

const now = Date.UTC(2026, 9, 14, 10); // 14 October 2026, Paris
const ps = (from: string, to: string) => ({ from, to }) as PeriodSummary;

describe('energy periods', () => {
  it('windows in Paris days, end exclusive', () => {
    expect(periodWindow('day', now)).toEqual({ from: '2026-09-14', to: '2026-10-15', group: 'day' });
    expect(periodWindow('month', now)).toEqual({ from: '2025-11-01', to: '2026-11-01', group: 'month' });
    expect(periodWindow('year', now)).toEqual({ from: '2024-01-01', to: '2027-01-01', group: 'year' });
  });
  it('adds days across months and years', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('labels buckets and the hero', () => {
    expect(bucketLabel('2026-10-06', 'day')).toBe('6/10');
    expect(bucketLabel('2026-10', 'month')).toBe('10/26');
    expect(bucketLabel('2026', 'year')).toBe('2026');
    expect(heroTitle('day', ps('2026-10-12', '2026-10-13'))).toBe('12 octobre 2026');
    expect(heroTitle('month', ps('2026-10-01', '2026-10-13'))).toBe('Octobre 2026');
    expect(heroTitle('year', ps('2026-01-01', '2026-10-13'))).toBe('2026');
    expect(compareLabel('day', ps('2026-10-11', '2026-10-12'))).toBe('par rapport à la veille');
    expect(compareLabel('month', ps('2026-09-01', '2026-09-13'))).toBe('par rapport à septembre 2026, mêmes jours');
    expect(compareLabel('year', ps('2025-01-01', '2025-10-13'))).toBe('par rapport à 2025, même période');
    expect(spanLabel(ps('2026-10-01', '2026-10-13'))).toBe('du\u00a01/10\u00a0au\u00a012/10');
    expect(spanLabel(ps('2026-10-12', '2026-10-13'))).toBe('');
  });

  it('counts the leading buckets with no data, never interior or trailing ones', () => {
    expect(leadingMissing([null, null, 3, null, 4, null])).toBe(2);
    expect(leadingMissing([0, null, 1])).toBe(0);
    expect(leadingMissing([null, null])).toBe(0);
    expect(leadingMissing([])).toBe(0);
  });
});
