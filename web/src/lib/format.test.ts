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
