import { describe, expect, it } from 'vitest';
import { awayPresets, parisLocal, parisLocalMs } from './away';

// 2026-10-15 is a Thursday; October 2026 is summer time (UTC+2) until the 25th.
const at = (local: string) => parisLocalMs(local)!;

describe('parisLocal / parisLocalMs', () => {
  it('round-trip Paris wall time in both seasons', () => {
    expect(parisLocal(Date.UTC(2026, 9, 15, 12, 0))).toBe('2026-10-15T14:00');
    expect(parisLocal(Date.UTC(2026, 11, 1, 12, 0))).toBe('2026-12-01T13:00');
    expect(at('2026-10-15T14:00')).toBe(Date.UTC(2026, 9, 15, 12, 0));
    expect(at('2026-12-01T13:00')).toBe(Date.UTC(2026, 11, 1, 12, 0));
  });
  it('refuses what is not a datetime-local value', () => {
    expect(parisLocalMs('')).toBeNull();
    expect(parisLocalMs('2026-10-15')).toBeNull();
    expect(parisLocalMs('2026-10-15T25:00')).toBeNull();
    expect(parisLocalMs('nonsense')).toBeNull();
  });
});

describe('awayPresets', () => {
  it('Monday morning: tomorrow by default, the coming Sunday as the other preset', () => {
    const p = awayPresets(at('2026-10-12T09:30'));
    expect(p.preset).toBe('tomorrow');
    expect(parisLocal(p.tomorrow)).toBe('2026-10-13T18:00');
    expect(parisLocal(p.sunday)).toBe('2026-10-18T18:00');
    expect(p.min).toBe('2026-10-12T09:45');
  });
  it('Thursday 14:00 switches the default to Sunday (13:59 does not)', () => {
    expect(awayPresets(at('2026-10-15T13:59')).preset).toBe('tomorrow');
    const p = awayPresets(at('2026-10-15T14:00'));
    expect(p.preset).toBe('sunday');
    expect(parisLocal(p.sunday)).toBe('2026-10-18T18:00');
  });
  it('Friday and Saturday default to Sunday', () => {
    expect(awayPresets(at('2026-10-16T08:00')).preset).toBe('sunday');
    expect(awayPresets(at('2026-10-17T22:00')).preset).toBe('sunday');
  });
  it('Sunday before noon: today 18:00; from noon, tomorrow by default', () => {
    const morning = awayPresets(at('2026-10-18T11:59'));
    expect(morning.preset).toBe('sunday');
    expect(parisLocal(morning.sunday)).toBe('2026-10-18T18:00');
    expect(awayPresets(at('2026-10-18T12:00')).preset).toBe('tomorrow');
  });
  it('Sunday 17:50: today 18:00 is too close, the Sunday preset is next week', () => {
    const p = awayPresets(at('2026-10-18T17:50'));
    expect(parisLocal(p.sunday)).toBe('2026-10-25T18:00');
    expect(parisLocal(p.tomorrow)).toBe('2026-10-19T18:00');
  });
  it('crosses the autumn clock change at 18:00 wall time', () => {
    const p = awayPresets(at('2026-10-24T10:00'));
    expect(parisLocal(p.tomorrow)).toBe('2026-10-25T18:00');
    expect(p.tomorrow).toBe(Date.UTC(2026, 9, 25, 17, 0)); // winter time, UTC+1
  });
  it('the minimum is now + 15 min, rounded up to the minute', () => {
    expect(awayPresets(at('2026-10-12T09:30') + 20_000).min).toBe('2026-10-12T09:46');
  });
});
