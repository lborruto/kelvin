import { describe, expect, it } from 'vitest';
import {
  fmtAgo, fmtAmount, fmtChange, fmtDateLong, fmtDay, fmtDelta, fmtEur, fmtKwh, fmtPct, fmtPrice, fmtTemp, fmtTime, fmtWh,
  LEVEL_LABEL, MODE_LABEL, monthName, parseDecimal
} from './format';

const NB = ' ';

describe('format', () => {
  it('temperatures in French with a non-breaking space', () => {
    expect(fmtTemp(20.5)).toBe(`20,5${NB}°C`);
    expect(fmtTemp(17)).toBe(`17,0${NB}°C`);
    expect(fmtTemp(18.66)).toBe(`18,7${NB}°C`);
    expect(fmtTemp(21, false)).toBe('21,0');
  });
  it('missing values never render NaN', () => {
    expect(fmtTemp(null)).toBe('—');
    expect(fmtTemp(undefined)).toBe('—');
    expect(fmtTemp(Number.NaN)).toBe('—');
    expect(fmtKwh(null)).toBe('—');
  });
  it('eco lowering is shown as a negative delta', () => {
    expect(fmtDelta(3)).toBe(`−3,0${NB}°C`);
    expect(fmtDelta(null)).toBe('—');
    expect(fmtDelta(0)).toBe(`0,0${NB}°C`);
  });
  it('energy groups thousands the French way', () => {
    expect(fmtKwh(2400)).toBe(`2 400${NB}kWh`);
    expect(fmtKwh(12.34)).toBe(`12,3${NB}kWh`);
    expect(fmtKwh(0.4)).toBe(`0,4${NB}kWh`);
  });
  it('clock times are Paris time', () => {
    expect(fmtTime(Date.parse('2026-10-13T16:00:00Z'))).toBe('18:00');
    expect(fmtTime(Date.parse('2026-12-01T05:30:00Z'))).toBe('06:30');
  });
  it('relative ages', () => {
    const now = Date.parse('2026-10-13T12:00:00Z');
    expect(fmtAgo(now - 20_000, now)).toBe('à l’instant');
    expect(fmtAgo(now - 12 * 60_000, now)).toBe('il y a 12 min');
    expect(fmtAgo(now - 3 * 3_600_000, now)).toBe('il y a 3 h');
    expect(fmtAgo(now - 3570_000, now)).toBe('il y a 59 min');
  });
  it('labels', () => {
    expect(MODE_LABEL.program).toBe('Programme');
    expect(MODE_LABEL.mixed).toBe('Mixte');
    expect(LEVEL_LABEL.eco).toBe('Éco');
    expect(LEVEL_LABEL.comfort).toBe('Confort');
  });
});


describe('energy formats', () => {
  const NB = ' ';
  it('watt-hours: whole, grouped, NBSP before the unit', () => {
    expect(fmtWh(1500)).toBe(`1\u202f500${NB}Wh`);
    expect(fmtWh(399.6)).toBe(`400${NB}Wh`);
    expect(fmtWh(null)).toBe('—');
  });
  it('euros: cents under 100, whole above, NBSP before the unit', () => {
    expect(fmtEur(12.5)).toBe(`12,50${NB}€`);
    expect(fmtEur(1234.4)).toBe(`1 234${NB}€`);
    expect(fmtEur(null)).toBe('—');
    expect(fmtPrice(0.2068)).toBe(`0,2068${NB}€/kWh`);
    expect(fmtAmount(0.2068, 4)).toBe('0,2068');
    expect(fmtAmount(16.2, 2)).toBe('16,20');
    expect(fmtAmount(null, 2)).toBe('—');
    expect(fmtPct(0.574)).toBe(`57${NB}%`);
  });
  it('change with a sign and the true minus', () => {
    expect(fmtChange(110, 100)).toBe(`+10${NB}%`);
    expect(fmtChange(90, 100)).toBe(`−10${NB}%`);
    expect(fmtChange(100, 100)).toBe(`0${NB}%`);
    expect(fmtChange(5, 0)).toBeNull();
    expect(fmtChange(null, 3)).toBeNull();
  });
  it('reads French decimals', () => {
    expect(parseDecimal('0,2068')).toBe(0.2068);
    expect(parseDecimal(' 19.5 ')).toBe(19.5);
    expect(parseDecimal('1 234,5')).toBe(1234.5);
    expect(parseDecimal('abc')).toBeNull();
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('-1')).toBeNull();
  });
  it('dates from ISO days, whatever the browser zone', () => {
    expect(fmtDay('2026-10-12')).toBe('12/10');
    expect(fmtDateLong('2026-10-12')).toBe('12 octobre 2026');
    expect(monthName('2026-10-01')).toBe('Octobre 2026');
  });
});

import {
  fmtChangeShare, fmtEurExact, fmtEurHalfHour, fmtEurHero, fmtHours, fmtKwhExact, fmtKwhHero, fmtKwhParts,
  fmtPct1, fmtShares, fmtSigned, fmtSignedPrice, fmtW, kwhDigits, largestRemainder, matchParts
} from './format';

/** A small seeded generator (mulberry32): random cases that replay identically. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const NBSP = '\u00a0';
const NNBSP = '\u202f'; // fr-FR groups thousands with a narrow no-break space

describe('Énergie precision (spec §3.2.1)', () => {
  it('kWh in a hero: 1 decimal below 1 000, none above; exact: 2 decimals', () => {
    expect(kwhDigits(999.9)).toBe(1);
    expect(kwhDigits(1000)).toBe(0);
    expect(fmtKwhHero(412.64)).toBe(`412,6${NBSP}kWh`);
    expect(fmtKwhHero(2050.4)).toBe(`2${NNBSP}050${NBSP}kWh`);
    expect(fmtKwhHero(null)).toBe('—');
    expect(fmtKwhExact(22.041)).toBe(`22,04${NBSP}kWh`);
    expect(fmtKwhExact(1234.5, false)).toBe(`1${NNBSP}234,50`);
    expect(fmtKwhExact(undefined)).toBe('—');
  });

  it('L1: the parts use the total’s decimals and add up to it', () => {
    expect(fmtKwhParts(200.4, [42.2, 158.2])).toEqual({
      total: `200,4${NBSP}kWh`,
      parts: [`42,2${NBSP}kWh`, `158,2${NBSP}kWh`]
    });
    // Rounded one by one these would read 3,4 + 3,4 + 3,4 = 10,2 under a 10,1 total.
    expect(fmtKwhParts(10.1, [3.36, 3.36, 3.38]).parts).toEqual([`3,4${NBSP}kWh`, `3,3${NBSP}kWh`, `3,4${NBSP}kWh`]);
    // 400 + 804 would read 1 204 under a 1 205 total: the part with the larger remainder takes the unit.
    expect(fmtKwhParts(1204.6, [400.4, 804.2])).toEqual({
      total: `1${NNBSP}205${NBSP}kWh`,
      parts: [`401${NBSP}kWh`, `804${NBSP}kWh`]
    });
    expect(fmtKwhParts(null, [1, 2])).toEqual({ total: '—', parts: ['—', '—'] });
    expect(fmtKwhParts(5, [null, 2]).parts).toEqual(['—', `2,0${NBSP}kWh`]);
  });

  it('L1: random parts always add up to the shown total', () => {
    const r = rng(42);
    for (let n = 0; n < 500; n++) {
      const parts = Array.from({ length: 2 + Math.floor(r() * 2) }, () => Math.round(r() * 5000) / 1000);
      const total = parts.reduce((a, b) => a + b, 0);
      const shown = fmtKwhParts(total, parts);
      const num = (s: string) => Number(s.replace(/[^\d,]/g, '').replace(',', '.'));
      const sum = shown.parts.reduce((a, s) => a + num(s), 0);
      expect(Math.round(sum * 10)).toBe(Math.round(num(shown.total) * 10));
    }
  });

  it('power: whole watts below 1 kW, then kW with 2 decimals', () => {
    expect(fmtW(734.4)).toBe(`734${NBSP}W`);
    expect(fmtW(999.6)).toBe(`1,00${NBSP}kW`); // rounds to 1 000 W, so it reads in kW
    expect(fmtW(3420)).toBe(`3,42${NBSP}kW`);
    expect(fmtW(null)).toBe('—');
  });

  it('euros: compact in a hero, exact in tooltips, 3 decimals for a half-hour', () => {
    expect(fmtEurHero(96.414)).toBe(`96,41${NBSP}€`);
    expect(fmtEurHero(1234.56)).toBe(`1${NNBSP}235${NBSP}€`);
    expect(fmtEurExact(1234.56)).toBe(`1${NNBSP}234,56${NBSP}€`);
    expect(fmtEurExact(5.31, false)).toBe('5,31');
    expect(fmtEurHalfHour(0.15204)).toBe(`0,152${NBSP}€`);
    expect(fmtEurHero(undefined)).toBe('—');
  });

  it('percentages with one decimal, and changes with a sign and the true minus', () => {
    expect(fmtPct1(0.384)).toBe(`38,4${NBSP}%`);
    expect(fmtPct1(null)).toBe('—');
    expect(fmtChangeShare(0.12)).toBe(`+12${NBSP}%`);
    expect(fmtChangeShare(-0.0849)).toBe(`−8${NBSP}%`);
    expect(fmtChangeShare(0.004)).toBe(`0${NBSP}%`);
    expect(fmtChangeShare(null)).toBeNull();
    expect(fmtSigned(-14.2, 'kWh')).toBe(`−14,20${NBSP}kWh`);
    expect(fmtSigned(3.614, '€')).toBe(`+3,61${NBSP}€`);
    expect(fmtSigned(0.001, '€')).toBe(`0,00${NBSP}€`);
    expect(fmtSigned(null, '€')).toBe('—');
    expect(fmtSignedPrice(-0.0632)).toBe(`−0,0632${NBSP}€/kWh`);
    expect(fmtHours(2.84)).toBe(`2,8${NBSP}h`);
    expect(fmtHours(2.84, false)).toBe('2,8');
  });

  it('L3: largest remainder keeps nulls and sums to the units', () => {
    expect(largestRemainder([1, 1, 1], 100)).toEqual([34, 33, 33]);
    expect(largestRemainder([2, null, 1], 1000)).toEqual([667, null, 333]);
    expect(largestRemainder([0, 0], 100)).toEqual([0, 0]);
    expect(fmtShares([1, 1, 1])).toEqual([`34${NBSP}%`, `33${NBSP}%`, `33${NBSP}%`]);
    expect(fmtShares([1, 2], 1)).toEqual([`33,3${NBSP}%`, `66,7${NBSP}%`]);
    expect(fmtShares([null, 3])).toEqual(['—', `100${NBSP}%`]);
  });

  it('L3: random sets of shares always total 100', () => {
    const r = rng(7);
    for (let n = 0; n < 500; n++) {
      const values = Array.from({ length: 1 + Math.floor(r() * 8) }, () => r() * 100);
      for (const units of [100, 1000]) {
        const out = largestRemainder(values, units) as number[];
        expect(out.reduce((a, b) => a + b, 0)).toBe(units);
        out.forEach((u, i) => expect(Math.abs(u - (values[i] / values.reduce((a, b) => a + b, 0)) * units)).toBeLessThan(1));
      }
    }
  });
});

describe('review fixes: signs, ties, digits, parts', () => {
  it('signed formatters round the magnitude: ties are symmetric', () => {
    expect(fmtChangeShare(0.125)).toBe(`+13${NBSP}%`);
    expect(fmtChangeShare(-0.125)).toBe(`−13${NBSP}%`);
    expect(fmtSigned(0.125, '€')).toBe(`+0,13${NBSP}€`);
    expect(fmtSigned(-0.125, '€')).toBe(`−0,13${NBSP}€`);
    expect(fmtSignedPrice(0.00005)).toBe(`+0,0001${NBSP}€/kWh`);
    expect(fmtSignedPrice(-0.00005)).toBe(`−0,0001${NBSP}€/kWh`);
  });

  it('every displayed negative uses the true minus, and never reads −0', () => {
    expect(fmtKwhExact(-0.125)).toBe(`−0,13${NBSP}kWh`);
    expect(fmtKwhExact(-0.001)).toBe(`0,00${NBSP}kWh`);
    expect(fmtKwhHero(-12.34)).toBe(`−12,3${NBSP}kWh`);
    expect(fmtEurExact(-5.5)).toBe(`−5,50${NBSP}€`);
    expect(fmtEurHero(-0.001)).toBe(`0,00${NBSP}€`);
    expect(fmtEurHalfHour(-0.0004)).toBe(`0,000${NBSP}€`);
    expect(fmtPct1(-0.0123)).toBe(`−1,2${NBSP}%`);
    expect(fmtHours(-1.5)).toBe(`−1,5${NBSP}h`);
    expect(fmtW(-1500)).toBe(`−1,50${NBSP}kW`);
  });

  it('the digits follow the rounded value: 999,96 kWh reads 1 000 kWh', () => {
    expect(fmtKwhHero(999.96)).toBe(`1${NNBSP}000${NBSP}kWh`);
    expect(fmtEurHero(999.996)).toBe(`1${NNBSP}000${NBSP}€`);
    expect(fmtKwhHero(999.94)).toBe(`999,9${NBSP}kWh`);
  });

  it('shares of nothing are unknown, not 0 % totalling 0', () => {
    expect(fmtShares([0, 0])).toEqual(['—', '—']);
  });

  it('matchParts: parts add up to the total at any precision', () => {
    for (const parts of [[8.975, 13.065], [14.205, 7.835]]) {
      const m = matchParts(22.04, parts, 2);
      expect(m.total).toBe(22.04);
      expect(Math.round((m.parts as number[]).reduce((a, b) => a + b, 0) * 100)).toBe(2204);
    }
    expect(matchParts(734, [400.5, 333.5], 0)).toEqual({ total: 734, parts: [401, 333] });
    expect(matchParts(5.79, [5.31, 0.48], 2)).toEqual({ total: 5.79, parts: [5.31, 0.48] });
    // Parts that do not make the total (a missing one) are rounded on their own.
    expect(matchParts(10, [3.336, null], 2)).toEqual({ total: 10, parts: [3.34, null] });
    expect(matchParts(null, [1], 2)).toEqual({ total: null, parts: [null] });
  });

  it('matchParts: random realistic parts always add up (kWh, €, Wh)', () => {
    const r = rng(11);
    for (const digits of [0, 1, 2]) {
      const k = 10 ** digits;
      for (let n = 0; n < 500; n++) {
        const parts = Array.from({ length: 2 + Math.floor(r() * 2) }, () => Math.round(r() * 40_000) / 1000);
        const total = Math.round(parts.reduce((a, b) => a + b, 0) * 1000) / 1000;
        const m = matchParts(total, parts, digits);
        const sum = (m.parts as number[]).reduce((a, b) => a + b, 0);
        expect(Math.round(sum * k)).toBe(Math.round((m.total as number) * k));
      }
    }
  });
});
