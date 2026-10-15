import { describe, expect, it } from 'vitest';
import type { EnergyInterval } from './api/types';
import { baseLoad, peakShare, shiftValue } from './power';

const day = (n: number, price: number | null = 0.25): EnergyInterval[] =>
  Array.from({ length: n }, (_, i) => ({
    ts: i * 1800, minutes: 30, wh: 500, w: 1000, offpeak: null, boundary: false, price, eur: null,
    radiators_wh: null, radiators_known: 0, radiators_total: 0, radiators_interp: false, radiators_apportioned: false, by_room: {}
  }));

describe('power figures (spec §3.2.5, §3.2.6)', () => {
  it('base load is P10 over the day’s real hours, 23 or 25 on DST days', () => {
    expect(baseLoad(310, day(48))).toEqual({ hours: 24, kwh: 7.44, eur: expect.closeTo(1.86, 6) });
    expect(baseLoad(310, day(50)).kwh).toBeCloseTo(7.75, 6);
    expect(baseLoad(310, day(46)).hours).toBe(23);
  });
  it('prices each half-hour at its own price, and gives no € unless every half-hour is priced', () => {
    const mixed = day(48).map((iv, i) => ({ ...iv, price: i < 16 ? 0.2 : 0.3 }));
    expect(baseLoad(400, mixed).eur).toBeCloseTo(0.4 * 8 * 0.2 + 0.4 * 16 * 0.3, 6);
    expect(baseLoad(310, day(48, null)).eur).toBeNull();
    expect(baseLoad(null, day(48))).toEqual({ hours: 24, kwh: null, eur: null });
  });
  it('the peak against the subscribed power, kVA taken as kW', () => {
    expect(peakShare(6840, 12)).toBeCloseTo(0.57, 6);
    expect(peakShare(6840, null)).toBeNull();
    expect(peakShare(null, 12)).toBeNull();
  });
  it('the value of moving a share of HP to HC', () => {
    expect(shiftValue(0.1, 254.3, 0.0632)).toBeCloseTo(1.607176, 6);
    expect(shiftValue(0, 254.3, 0.0632)).toBe(0);
  });
});
