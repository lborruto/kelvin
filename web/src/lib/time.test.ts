import { describe, expect, it } from 'vitest';
import { addParisDays, parisAt, parisMidnight, parisMinuteOfDay, parisParts } from './time';

describe('Paris time', () => {
  it('parts and weekday', () => {
    const p = parisParts(Date.parse('2026-10-13T11:48:00Z'));
    expect(p).toMatchObject({ year: 2026, month: 10, day: 13, hour: 13, minute: 48, weekday: 'tuesday' });
  });
  it('midnight in summer and winter', () => {
    expect(parisMidnight(Date.parse('2026-10-13T12:00:00Z'))).toBe(Date.parse('2026-10-12T22:00:00Z'));
    expect(parisMidnight(Date.parse('2026-12-01T12:00:00Z'))).toBe(Date.parse('2026-11-30T23:00:00Z'));
  });
  it('minute of day', () => {
    expect(parisMinuteOfDay(Date.parse('2026-10-13T16:30:00Z'))).toBe(18 * 60 + 30);
  });
  it('adding days across the DST change keeps local midnight', () => {
    const sat = parisMidnight(Date.parse('2026-10-24T12:00:00Z'));
    expect(addParisDays(sat, 1)).toBe(Date.parse('2026-10-24T22:00:00Z'));
    expect(addParisDays(sat, 2)).toBe(Date.parse('2026-10-25T23:00:00Z'));
  });
  it('parisAt handles DST days', () => {
    const spring = Date.parse('2026-03-28T23:00:00Z');
    expect(parisAt(spring, 270)).toBe(Date.parse('2026-03-29T02:30:00Z'));
    expect(parisAt(spring, 150)).toBe(Date.parse('2026-03-29T01:30:00Z')); // skipped 02:30 -> 03:30
    const autumn = Date.parse('2026-10-24T22:00:00Z');
    expect(parisAt(autumn, 150)).toBe(Date.parse('2026-10-25T00:30:00Z')); // first 02:30
    expect(parisAt(autumn, 270)).toBe(Date.parse('2026-10-25T03:30:00Z'));
  });
});

import { isoParis, parisDayStart, parisOffsetMinutes } from './time';

describe('Paris offsets (CSV timestamps, DST labels)', () => {
  it('knows summer and winter time', () => {
    expect(parisOffsetMinutes(Date.parse('2026-07-01T12:00:00Z'))).toBe(120);
    expect(parisOffsetMinutes(Date.parse('2026-12-01T12:00:00Z'))).toBe(60);
  });
  it('writes the repeated autumn hour with two different offsets', () => {
    expect(isoParis(Date.parse('2026-10-25T00:30:00Z'))).toBe('2026-10-25T02:30:00+02:00');
    expect(isoParis(Date.parse('2026-10-25T01:30:00Z'))).toBe('2026-10-25T02:30:00+01:00');
  });
  it('finds a Paris midnight from an ISO day, DST days included', () => {
    expect(parisDayStart('2026-10-25')).toBe(Date.parse('2026-10-24T22:00:00Z'));
    expect(parisDayStart('2026-10-26')).toBe(Date.parse('2026-10-25T23:00:00Z'));
    expect(parisDayStart('2026-03-29')).toBe(Date.parse('2026-03-28T23:00:00Z'));
  });
});
