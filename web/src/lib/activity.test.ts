import { describe, expect, it } from 'vitest';
import { applyLocale } from '$lib/i18n';
import { activityKey, runText } from './activity';

const at = (iso: string) => Date.parse(iso) / 1000;

describe('activity helpers', () => {
  it('one key per five minutes of the window end', () => {
    expect(activityKey('salon', 0, 600_000)).toBe(activityKey('salon', 0, 899_999));
    expect(activityKey('salon', 0, 600_000)).not.toBe(activityKey('salon', 0, 900_000));
  });
  it('French run texts', () => {
    applyLocale('fr');
    const run = { start: at('2026-10-14T16:05:00Z'), end: at('2026-10-14T16:40:00Z'), open: false };
    expect(runText(run, false, 'window')).toBe('Fenêtre ouverte (signalée par le radiateur) 18:05–18:40');
    expect(runText(run, false, 'presence')).toBe('Présence signalée 18:05–18:40');
    expect(runText(run, true, 'window')).toMatch(/14.*18:05–.*18:40$/);
  });
  it('English', () => {
    applyLocale('en');
    const run = { start: at('2026-10-14T16:05:00Z'), end: at('2026-10-14T16:40:00Z'), open: true };
    expect(runText(run, false, 'window')).toBe('Window open (reported by the radiator) 18:05–18:40');
    applyLocale('fr');
  });
});
