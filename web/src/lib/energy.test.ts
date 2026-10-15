import { describe, expect, it } from 'vitest';
import { addDays, bucketLabel, firstCounted, leadingMissing, spanLabel } from './energy';

describe('energy periods', () => {
  it('adds days across months and years', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('labels buckets and spans', () => {
    expect(bucketLabel('2026-10-06', 'day')).toBe('6/10');
    expect(bucketLabel('2026-10', 'month')).toBe('10/26');
    expect(bucketLabel('2026', 'year')).toBe('2026');
    expect(spanLabel({ from: '2026-10-01', to: '2026-10-13' })).toBe('du\u00a01/10\u00a0au\u00a012/10');
    expect(spanLabel({ from: '2026-10-12', to: '2026-10-13' })).toBe('');
  });
  it('counts the leading buckets with no data, never interior or trailing ones', () => {
    expect(leadingMissing([null, null, 3, null, 4, null])).toBe(2);
    expect(leadingMissing([0, null, 1])).toBe(0);
    expect(leadingMissing([null, null])).toBe(0);
    expect(leadingMissing([])).toBe(0);
  });
  it('the house chart starts at the first counted bucket: a counted day without Linky data is a gap, not history (final review minor 4)', () => {
    const b = (kwh: number | null, missing_days: number) => ({ kwh, missing_days });
    expect(firstCounted([b(null, 0), b(null, 0), b(3, 0)])).toBe(2); // before the report's first day
    expect(firstCounted([b(null, 0), b(null, 2), b(3, 0)])).toBe(1); // from the contract start, before Linky's data
    expect(firstCounted([b(null, 0)])).toBe(0);
  });
});

import {
  bucketSpan, canStep, chartWindow, dataSpan, halfHoursIn, isLatest, isoWeek, periodOf, periodTitle, previousName,
  spokenTitle, stepPeriod, weekStart
} from './energy';

describe('periods and the navigator (spec §3.2.2)', () => {
  it('a period is [from, to) in Paris days; weeks are ISO weeks from Monday', () => {
    expect(periodOf('day', '2026-10-14')).toEqual({ from: '2026-10-14', to: '2026-10-15' });
    expect(periodOf('week', '2026-10-14')).toEqual({ from: '2026-10-12', to: '2026-10-19' });
    expect(periodOf('week', '2026-10-18')).toEqual({ from: '2026-10-12', to: '2026-10-19' });
    expect(periodOf('month', '2026-10-14')).toEqual({ from: '2026-10-01', to: '2026-11-01' });
    expect(periodOf('year', '2026-10-14')).toEqual({ from: '2026-01-01', to: '2027-01-01' });
    expect(weekStart('2027-01-01')).toBe('2026-12-28');
  });

  it('steps across months and years', () => {
    expect(stepPeriod('week', periodOf('week', '2026-12-30'), 1)).toEqual({ from: '2027-01-04', to: '2027-01-11' });
    expect(stepPeriod('month', periodOf('month', '2027-01-15'), -1)).toEqual({ from: '2026-12-01', to: '2027-01-01' });
    expect(stepPeriod('day', periodOf('day', '2026-03-01'), -1)).toEqual({ from: '2026-02-28', to: '2026-03-01' });
    expect(stepPeriod('year', periodOf('year', '2026-06-01'), 1)).toEqual({ from: '2027-01-01', to: '2028-01-01' });
  });

  it('draws 7 days for Jour, day bars for Semaine and Mois, month bars for Année', () => {
    expect(chartWindow('day', periodOf('day', '2026-10-13'))).toEqual({ from: '2026-10-07', to: '2026-10-14', group: 'day' });
    expect(chartWindow('week', periodOf('week', '2026-10-13'))).toEqual({ from: '2026-10-12', to: '2026-10-19', group: 'day' });
    expect(chartWindow('month', periodOf('month', '2026-10-13'))).toEqual({ from: '2026-10-01', to: '2026-11-01', group: 'day' });
    expect(chartWindow('year', periodOf('year', '2026-10-13'))).toEqual({ from: '2026-01-01', to: '2027-01-01', group: 'month' });
  });

  it('‹ stops at the first period with data and › at the period of the last day', () => {
    const first = '2026-08-05';
    const last = '2026-10-12';
    expect(canStep('month', periodOf('month', '2026-08-20'), -1, first, last)).toBe(false);
    expect(canStep('month', periodOf('month', '2026-09-20'), -1, first, last)).toBe(true);
    expect(canStep('month', periodOf('month', '2026-10-01'), 1, first, last)).toBe(false);
    expect(canStep('month', periodOf('month', '2026-09-01'), 1, first, last)).toBe(true);
    expect(canStep('day', periodOf('day', '2026-10-12'), 1, first, last)).toBe(false);
    expect(canStep('day', periodOf('day', '2026-10-11'), 1, first, last)).toBe(true);
    expect(canStep('week', periodOf('week', '2026-10-12'), -1, null, last)).toBe(false);
    expect(isLatest(periodOf('month', '2026-10-01'), last)).toBe(true);
    expect(isLatest(periodOf('month', '2026-09-01'), last)).toBe(false);
  });

  it('a period still running is described up to its last day with data', () => {
    expect(dataSpan(periodOf('month', '2026-10-01'), '2026-10-12')).toEqual({ from: '2026-10-01', to: '2026-10-13' });
    expect(dataSpan(periodOf('month', '2026-09-01'), '2026-10-12')).toEqual({ from: '2026-09-01', to: '2026-10-01' });
    expect(dataSpan(periodOf('month', '2026-09-01'), null)).toEqual({ from: '2026-09-01', to: '2026-10-01' });
  });

  it('numbers ISO weeks, week 53 and week 1 included', () => {
    expect(isoWeek('2026-10-12')).toEqual({ year: 2026, week: 42 });
    expect(isoWeek('2026-12-31')).toEqual({ year: 2026, week: 53 });
    expect(isoWeek('2027-01-04')).toEqual({ year: 2027, week: 1 });
    expect(isoWeek('2021-01-01')).toEqual({ year: 2020, week: 53 });
  });

  it('titles a period, says it aloud, and names the previous one', () => {
    expect(periodTitle('day', periodOf('day', '2026-10-13'))).toBe('Mardi 13 octobre 2026');
    expect(periodTitle('week', periodOf('week', '2026-10-13'))).toBe('Semaine 42 · 12–18 oct. 2026');
    expect(periodTitle('week', periodOf('week', '2026-10-28'))).toBe('Semaine 44 · 26 oct. – 1 nov. 2026');
    expect(periodTitle('week', periodOf('week', '2026-12-30'))).toBe('Semaine 53 · 28 déc. 2026 – 3 janv. 2027');
    expect(periodTitle('month', periodOf('month', '2026-10-13'))).toBe('Octobre 2026');
    expect(periodTitle('year', periodOf('year', '2026-10-13'))).toBe('2026');
    expect(spokenTitle('day', periodOf('day', '2026-10-13'))).toBe('13 octobre');
    expect(spokenTitle('week', periodOf('week', '2026-10-13'))).toBe('semaine 42');
    expect(spokenTitle('month', periodOf('month', '2026-10-13'))).toBe('octobre 2026');
    expect(spokenTitle('year', periodOf('year', '2026-10-13'))).toBe('2026');
    expect(previousName('day', '2026-10-12')).toBe('la veille');
    expect(previousName('week', '2026-10-05')).toBe('la semaine précédente');
    expect(previousName('month', '2026-09-01')).toBe('septembre 2026');
    expect(previousName('year', '2025-01-01')).toBe('2025');
  });

  it('turns bucket keys back into their days', () => {
    expect(bucketSpan('2026-10-13', 'day')).toEqual({ from: '2026-10-13', to: '2026-10-14' });
    expect(bucketSpan('2026-W42', 'week')).toEqual({ from: '2026-10-12', to: '2026-10-19' });
    expect(bucketSpan('2026-W53', 'week')).toEqual({ from: '2026-12-28', to: '2027-01-04' });
    expect(bucketSpan('2027-W01', 'week')).toEqual({ from: '2027-01-04', to: '2027-01-11' });
    expect(bucketSpan('2026-10', 'month')).toEqual({ from: '2026-10-01', to: '2026-11-01' });
    expect(bucketSpan('2026', 'year')).toEqual({ from: '2026-01-01', to: '2027-01-01' });
    expect(bucketLabel('2026-W42', 'week')).toBe('S42');
  });

  it('counts the half-hours of a Paris day: 46 in spring, 50 in autumn', () => {
    expect(halfHoursIn('2026-10-14')).toBe(48);
    expect(halfHoursIn('2026-10-25')).toBe(50);
    expect(halfHoursIn('2026-03-29')).toBe(46);
  });
});
