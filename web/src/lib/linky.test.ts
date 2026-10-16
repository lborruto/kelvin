import { afterEach, describe, expect, it } from 'vitest';
import type { LinkyStatus } from './api/types';
import { applyLocale } from './i18n';
import { linkyFresh, linkyLine, linkyProblem, maskPdl } from './linky';

const base: LinkyStatus = {
  configured: true, prm: '12345678901234', token_set: true, simulator: false, state: 'ok', message: null,
  last_day: '2026-10-14', last_ok_at: 1, retry_at: null, calls_today: 3, budget: 10, consent_expires: null
};
const NOW = Date.UTC(2026, 9, 15, 9, 0);
afterEach(() => applyLocale('fr'));

describe('linky words', () => {
  it('progress is neutral, problems are problems', () => {
    expect(linkyLine({ ...base, state: 'off' })).toBe('Non relié.');
    expect(linkyLine(base)).toBe('Relié · données jusqu’au 14/10');
    expect(linkyLine({ ...base, state: 'never' })).toBe('Relié · première synchronisation en attente.');
    expect(linkyLine({ ...base, state: 'auth' })).toBeNull();
    expect(linkyProblem({ ...base, state: 'auth' })).toBeTruthy();
    expect(linkyProblem(base)).toBeNull();
  });
  it('freshness: none when off, bad on a problem, late while waiting', () => {
    expect(linkyFresh({ ...base, state: 'off' }, NOW)).toBe('none');
    expect(linkyFresh({ ...base, state: 'auth' }, NOW)).toBe('bad');
    expect(linkyFresh({ ...base, state: 'quota' }, NOW)).toBe('late');
    expect(linkyFresh(base, NOW)).toBe('fresh');
  });
});

describe('maskPdl', () => {
  it('shows only the last four digits, grouped like the bill', () => {
    expect(maskPdl('12345678901234')).toBe('•••• •••• ••12 34');
    expect(maskPdl('12345678901234')).not.toContain('5678');
    expect(maskPdl(null)).toBe('—');
  });
});
