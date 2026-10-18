import { beforeEach, describe, expect, it } from 'vitest';
import {
  fmtAgo, fmtAmount, fmtDateLong, fmtDay, fmtKwh, fmtPct, fmtPrice, fmtTemp, fmtTime, fmtWh,
  fmtDayShort, fmtWeekdayDay, monthName, monthYear, parseDecimal, premier
} from './format';
import { applyLocale } from '$lib/i18n';

const NB = ' ';

describe('format', () => {
  it('a weekday and its day, Paris calendar (Plan 15 strip)', () => {
    applyLocale('fr');
    expect(fmtWeekdayDay('2026-10-19')).toBe('lun. 19');
    expect(fmtWeekdayDay('2026-11-01')).toBe('dim. 1er');
    applyLocale('en');
    expect(fmtWeekdayDay('2026-10-19')).toBe('Mon 19');
    applyLocale('fr');
  });
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
    expect(fmtAgo(now - 12 * 60_000, now)).toBe(`il y a 12${NB}min`);
    expect(fmtAgo(now - 3 * 3_600_000, now)).toBe(`il y a 3${NB}h`);
    expect(fmtAgo(now - 3570_000, now)).toBe(`il y a 59${NB}min`);
  });
});


describe('energy formats', () => {
  const NB = ' ';
  it('watt-hours: whole, grouped, NBSP before the unit', () => {
    expect(fmtWh(1500)).toBe(`1\u202f500${NB}Wh`);
    expect(fmtWh(399.6)).toBe(`400${NB}Wh`);
    expect(fmtWh(null)).toBe('—');
  });
  it('prices, amounts and shares, NBSP before the unit', () => {
    expect(fmtPrice(0.2068)).toBe(`0,2068${NB}€/kWh`);
    expect(fmtAmount(0.2068, 4)).toBe('0,2068');
    expect(fmtAmount(16.2, 2)).toBe('16,20');
    expect(fmtAmount(null, 2)).toBe('—');
    expect(fmtPct(0.574)).toBe(`57${NB}%`);
  });
  it('reads French decimals', () => {
    expect(parseDecimal('0,2068')).toBe(0.2068);
    expect(parseDecimal(' 19.5 ')).toBe(19.5);
    expect(parseDecimal('1 234,5')).toBe(1234.5);
    expect(parseDecimal('abc')).toBeNull();
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('-1')).toBeNull();
    expect(parseDecimal('0.2068')).toBe(0.2068);
    expect(parseDecimal('1,234.5')).toBe(1234.5);
    expect(parseDecimal('1.234,5')).toBe(1234.5);
  });
  it('dates from ISO days, whatever the browser zone', () => {
    expect(fmtDay('2026-10-12')).toBe('12/10');
    expect(fmtDateLong('2026-10-12')).toBe('12 octobre 2026');
    expect(monthName('2026-10-01')).toBe('Octobre 2026');
    expect(monthYear('2026-09-01')).toBe('septembre 2026');
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

import { fmtDateTime, parisTodayIso } from './format';

/** Every formatter over a grid of values, in French: pins that French output is byte-identical to
 * Plan 6's (taken before the formatters followed the locale). Changed since, on purpose: fmtAgo's
 * spaces; negatives in fmtTemp, fmtKwh, fmtWh, fmtPrice, fmtAmount and fmtPct (true minus, no sign
 * on a figure that rounds to zero, fmtKwh's decimals judged on the magnitude: −1 235 kWh). */
function frenchGrid(): Record<string, unknown> {
  const nums = [
    -1234.567, -999.96, -3.5, -0.125, -0.004, -0, 0, 0.001, 0.0049, 0.00005, 0.125, 0.152, 0.2068, 0.384,
    0.995, 1, 12.34, 19.5, 99.995, 100, 412.64, 999.95, 999.96, 1000, 1234.4, 1234.56, 2050, 12345.678,
    1234567.891, null, undefined, Number.NaN
  ];
  const label = (v: number | null | undefined) => String(v === 0 && Object.is(v, -0) ? '-0' : v);
  const each = (fn: (v: number | null | undefined) => unknown) => Object.fromEntries(nums.map((v) => [label(v), fn(v)]));
  const times = [
    '2026-01-01T00:05:00Z', '2026-03-29T00:59:00Z', '2026-03-29T01:00:00Z', '2026-06-30T22:00:00Z',
    '2026-10-25T00:30:00Z', '2026-10-25T01:30:00Z', '2026-12-31T23:59:00Z'
  ].map((t) => Date.parse(t));
  const days = ['2026-01-01', '2026-02-28', '2026-08-15', '2026-10-12', '2026-12-31'];
  return {
    fmtTemp: each((v) => [fmtTemp(v), fmtTemp(v, false)]),
    fmtKwh: each((v) => [fmtKwh(v), fmtKwh(v, false)]),
    fmtWh: each(fmtWh),
    fmtPrice: each(fmtPrice),
    fmtAmount: each((v) => [fmtAmount(v, 2), fmtAmount(v, 4)]),
    fmtPct: each(fmtPct),
    kwhDigits: each((v) => (v == null || Number.isNaN(v) ? null : kwhDigits(v))),
    fmtKwhHero: each((v) => [fmtKwhHero(v), fmtKwhHero(v, false)]),
    fmtKwhExact: each((v) => [fmtKwhExact(v), fmtKwhExact(v, false)]),
    fmtW: each(fmtW),
    fmtEurHero: each(fmtEurHero),
    fmtEurExact: each((v) => [fmtEurExact(v), fmtEurExact(v, false)]),
    fmtEurHalfHour: each(fmtEurHalfHour),
    fmtPct1: each(fmtPct1),
    fmtChangeShare: each(fmtChangeShare),
    fmtSigned: each((v) => [fmtSigned(v, 'kWh'), fmtSigned(v, '€')]),
    fmtSignedPrice: each(fmtSignedPrice),
    fmtHours: each((v) => [fmtHours(v), fmtHours(v, false)]),
    fmtShares: [[1, 2], [1, 1, 1], [0.5, null, 2], [0, 0], [3, -1, 7]].map((s) => [fmtShares(s), fmtShares(s, 1)]),
    fmtKwhParts: [
      [412.64, [158.3, 254.34]], [2050.4, [1000.2, 1050.2]], [22.04, [8.975, 13.065]], [10, [3.336, null]],
      [null, [1]], [999.96, [500, 499.96]]
    ].map(([t, p]) => fmtKwhParts(t as number | null, p as (number | null)[])),
    fmtTime: times.map(fmtTime),
    fmtDateTime: times.map(fmtDateTime),
    parisTodayIso: times.map((t) => parisTodayIso(t)),
    fmtDay: days.map(fmtDay),
    fmtDateLong: days.map(fmtDateLong),
    monthName: days.map(monthName),
    parseDecimal: ['0,2068', ' 19.5 ', '1 234,5', '1 234,5', '1 234,5', '12', 'abc', '', '-1', '1,2,3'].map(
      parseDecimal
    )
  };
}

describe('French output is unchanged (snapshot of Plan 6)', () => {
  it('every formatter over a grid of values', () => {
    expect(frenchGrid()).toMatchSnapshot();
  });
});


describe('format in English (en-GB)', () => {
  beforeEach(() => applyLocale('en'));
  const NB = '\u00a0';
  it('decimal point, NBSP before °C and kWh, € before the figure, no space before %', () => {
    expect(fmtTemp(20.5)).toBe(`20.5${NB}°C`);
    expect(fmtKwh(2400)).toBe(`2,400${NB}kWh`);
    expect(fmtKwh(12.34)).toBe(`12.3${NB}kWh`);
    expect(fmtWh(1500)).toBe(`1,500${NB}Wh`);
    expect(fmtPrice(0.2068)).toBe('€0.2068/kWh');
    expect(fmtAmount(16.2, 2)).toBe('16.20');
    expect(fmtPct(0.574)).toBe('57%');
    expect(fmtTemp(null)).toBe('—');
  });
  it('Énergie precision (spec §3.2.1) in en-GB: the same digits, English signs', () => {
    expect(fmtKwhHero(412.64)).toBe(`412.6${NB}kWh`);
    expect(fmtKwhHero(2050)).toBe(`2,050${NB}kWh`);
    expect(fmtKwhExact(22.041)).toBe(`22.04${NB}kWh`);
    expect(fmtKwhParts(412.64, [158.3, 254.34])).toEqual({ total: `412.6${NB}kWh`, parts: [`158.3${NB}kWh`, `254.3${NB}kWh`] });
    expect(fmtEurHero(98.4)).toBe('€98.40');
    expect(fmtEurHero(1234.4)).toBe('€1,234');
    expect(fmtEurHero(-3.5)).toBe('−€3.50');
    expect(fmtEurExact(1234.56)).toBe('€1,234.56');
    expect(fmtEurExact(1234.56, false)).toBe('1,234.56');
    expect(fmtEurHalfHour(0.152)).toBe('€0.152');
    expect(fmtPct1(0.384)).toBe('38.4%');
    expect(fmtShares([1, 2], 1)).toEqual(['33.3%', '66.7%']);
    expect([fmtChangeShare(0.12), fmtChangeShare(-0.08), fmtChangeShare(0)]).toEqual(['+12%', '−8%', '0%']);
    expect(fmtSigned(-14.2, 'kWh')).toBe(`−14.20${NB}kWh`);
    expect([fmtSigned(3.61, '€'), fmtSigned(-3.61, '€'), fmtSigned(0, '€')]).toEqual(['+€3.61', '−€3.61', '€0.00']);
    expect(fmtSignedPrice(-0.0632)).toBe('−€0.0632/kWh');
    expect([fmtW(734), fmtW(3420)]).toEqual([`734${NB}W`, `3.42${NB}kW`]);
    expect(fmtHours(2.8)).toBe(`2.8${NB}h`);
    expect(fmtEurExact(-0.001)).toBe('€0.00');
  });
  it('en-GB dates and a 24 h clock in Paris time', () => {
    expect(fmtDateLong('2026-10-12')).toBe('12 October 2026');
    expect(monthName('2026-10-01')).toBe('October 2026');
    expect(monthYear('2026-09-01')).toBe('September 2026');
    expect(fmtDateTime(Date.parse('2026-10-13T16:05:00Z'))).toBe('Tue 13 Oct, 18:05');
    expect(fmtTime(Date.parse('2026-12-01T05:30:00Z'))).toBe('06:30');
    expect(fmtDay('2026-10-12')).toBe('12/10');
  });
  it('relative ages', () => {
    const now = Date.parse('2026-10-13T12:00:00Z');
    expect(fmtAgo(now - 20_000, now)).toBe('just now');
    expect(fmtAgo(now - 12 * 60_000, now)).toBe(`12${NB}min ago`);
    expect(fmtAgo(now - 3 * 3_600_000, now)).toBe(`3${NB}h ago`);
    expect(fmtAgo(now - 2 * 86_400_000, now)).toBe(`on ${fmtDateTime(now - 2 * 86_400_000)}`);
  });
  it('a comma or a point reads the same in English', () => {
    expect(parseDecimal('0,2068')).toBe(0.2068);
    expect(parseDecimal('1,234.5')).toBe(1234.5);
  });
});

describe('shown parts add up in both languages (matchParts is digits only)', () => {
  for (const l of ['fr', 'en'] as const) {
    // The locale's own decimal mark; grouping and units dropped.
    const read = (s: string) => Number(s.replace(l === 'en' ? /[^\d.]/g : /[^\d,]/g, '').replace(',', '.'));
    it(`${l}: kWh parts and shares`, () => {
      applyLocale(l);
      const r = rng(7);
      for (let n = 0; n < 300; n++) {
        const parts = Array.from({ length: 2 + Math.floor(r() * 2) }, () => Math.round(r() * 1_500_000) / 1000);
        const total = Math.round(parts.reduce((a, b) => a + b, 0) * 1000) / 1000;
        const shown = fmtKwhParts(total, parts);
        const k = 10 ** kwhDigits(total);
        const sum = shown.parts.reduce((a, p) => a + read(p), 0);
        expect(Math.round(sum * k), shown.total).toBe(Math.round(read(shown.total) * k));
        const shares = fmtShares(parts, 1).reduce((a, p) => a + read(p), 0);
        expect(Math.round(shares * 10)).toBe(1000);
      }
    });
  }
});

describe('negatives use the true minus in every formatter, in both languages', () => {
  const NB = ' ';
  const NN = ' ';
  it('French', () => {
    expect([fmtTemp(-3.5), fmtTemp(-3.5, false), fmtTemp(-0.04)]).toEqual([`−3,5${NB}°C`, '−3,5', `0,0${NB}°C`]);
    expect([fmtKwh(-12.34), fmtKwh(-2400), fmtKwh(-0.01, false)]).toEqual([`−12,3${NB}kWh`, `−2${NN}400${NB}kWh`, '0,0']);
    expect([fmtWh(-1500), fmtWh(-0.4)]).toEqual([`−1${NN}500${NB}Wh`, `0${NB}Wh`]);
    expect([fmtAmount(-3.5, 2), fmtAmount(-0.1, 4), fmtAmount(-0.001, 2)]).toEqual(['−3,50', '−0,1000', '0,00']);
    expect([fmtPct(-0.12), fmtPct(-0.004)]).toEqual([`−12${NB}%`, `0${NB}%`]);
    expect([fmtPrice(-0.1), fmtPrice(-0.00001)]).toEqual([`−0,1000${NB}€/kWh`, `0,0000${NB}€/kWh`]);
  });
  it('English: the sign comes before the euro', () => {
    applyLocale('en');
    expect([fmtTemp(-3.5), fmtKwh(-2400), fmtWh(-1500)]).toEqual([`−3.5${NB}°C`, `−2,400${NB}kWh`, `−1,500${NB}Wh`]);
    expect([fmtAmount(-3.5, 2), fmtPct(-0.12), fmtPct(-0.004)]).toEqual(['−3.50', '−12%', '0%']);
    expect([fmtPrice(-0.1), fmtPrice(0.1), fmtPrice(-0.00001)]).toEqual(['−€0.1000/kWh', '€0.1000/kWh', '€0.0000/kWh']);
  });
  it('no formatter ever prints an ASCII hyphen as a sign', () => {
    for (const l of ['fr', 'en'] as const) {
      applyLocale(l);
      for (const v of [-1234.567, -3.5, -0.125, -0.004, -0]) {
        const out = [
          fmtTemp(v), fmtKwh(v), fmtWh(v), fmtPrice(v), fmtAmount(v, 2), fmtAmount(v, 4), fmtPct(v), fmtKwhHero(v),
          fmtKwhExact(v), fmtW(v), fmtEurHero(v), fmtEurExact(v), fmtEurHalfHour(v), fmtPct1(v), fmtSigned(v, '€'),
          fmtSignedPrice(v), fmtHours(v), fmtChangeShare(v) ?? ''
        ];
        for (const s of out) expect(s, `${l} ${v}`).not.toMatch(/-/);
      }
    }
  });
});

describe('parseDecimal: separators', () => {
  it('a lone comma or point is the decimal mark; with both, the other one only groups thousands', () => {
    expect(parseDecimal('1,234')).toBe(1.234);
    expect(parseDecimal('1.234')).toBe(1.234);
    expect(parseDecimal('1.234.567,5')).toBe(1234567.5);
    expect(parseDecimal('1,234,567.5')).toBe(1234567.5);
  });
  it('ambiguous mixed separators are rejected', () => {
    expect(parseDecimal('1,2.3')).toBeNull();
    expect(parseDecimal('12,34.5')).toBeNull();
    expect(parseDecimal('1.2,3')).toBeNull();
    expect(parseDecimal('1,234,5.6')).toBeNull();
    expect(parseDecimal('1.234,567.8')).toBeNull();
    expect(parseDecimal(',5.0')).toBeNull();
  });
});

describe('the first of the month in French (« 1er »)', () => {
  it('fmtDateLong, fmtDayShort and fmtDateTime write « 1er » in French only', () => {
    applyLocale('fr');
    expect(fmtDateLong('2000-01-01')).toBe('1er janvier 2000');
    expect(fmtDateLong('2026-10-11')).toBe('11 octobre 2026');
    expect(fmtDateLong('2026-10-21')).toBe('21 octobre 2026');
    expect(fmtDayShort(Date.UTC(2026, 10, 1, 12))).toBe('1er nov.');
    expect(fmtDateTime(Date.UTC(2026, 10, 1, 17))).toMatch(/^dim\. 1er nov\.,? 18:00$/);
    expect(premier('11 h')).toBe('11 h');
    applyLocale('en');
    expect(fmtDateLong('2000-01-01')).toBe('1 January 2000');
    applyLocale('fr');
  });
});
