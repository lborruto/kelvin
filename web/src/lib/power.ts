/** Power-panel and HC-panel arithmetic on measured data (spec §3.2.5, §3.2.6). Pure. */
import type { EnergyInterval } from './api/types';

/**
 * Base load over a day: P10 × the day's hours (23 or 25 on DST days, from the intervals), and its
 * cost at each half-hour's own price. Arithmetic on measured data, shown with « ≈ », never a claim.
 */
export function baseLoad(
  p10W: number | null | undefined,
  intervals: EnergyInterval[]
): { hours: number; kwh: number | null; eur: number | null } {
  const hours = intervals.reduce((a, iv) => a + iv.minutes / 60, 0);
  if (p10W == null || !intervals.length) return { hours, kwh: null, eur: null };
  const priced = intervals.every((iv) => iv.price != null);
  const eur = priced ? intervals.reduce((a, iv) => a + ((p10W * iv.minutes) / 60 / 1000) * (iv.price as number), 0) : null;
  return { hours, kwh: (p10W * hours) / 1000, eur };
}

/** Peak power against the subscribed power, kVA taken as kW (power factor assumed 1). */
export function peakShare(peakW: number | null | undefined, kva: number | null | undefined): number | null {
  return peakW != null && kva ? peakW / (kva * 1000) : null;
}

/** € less if `fraction` of the HP kWh had been in HC, at the same prices: fraction × HP kWh × (P_hp − P_hc). */
export function shiftValue(fraction: number, hpKwh: number, deltaPrice: number): number {
  return fraction * hpKwh * deltaPrice;
}
