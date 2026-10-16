import { afterEach, describe, expect, it } from 'vitest';
import type { LinkyStatus, Sources } from './api/types';
import { applyLocale } from './i18n';
import { lateCount, sourceRows } from './sources';

const at = (h: number, m: number) => new Date(`2026-12-01T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+01:00`).getTime() / 1000;
const NOW = at(9, 0) * 1000;
const LINKY: LinkyStatus = {
  configured: true, prm: '12345678901234', token_set: true, simulator: false, state: 'ok', message: null,
  last_day: '2026-11-30', last_ok_at: at(8, 0), retry_at: null, calls_today: 6, budget: 10, consent_expires: null
};
const GRID: Sources = {
  tempo: { state: 'error', last_ok: at(6, 30), error_since: at(8, 15), next: at(11, 15), enabled: true },
  ecowatt: { state: 'ok', last_ok: at(7, 15), error_since: null, next: at(17, 15), enabled: true },
  med: { calls_today: 6, grid_calls_today: 2, budget: 10 }
};
const status = { connected: true, last_ok_at: at(8, 59), last_error: null };
afterEach(() => applyLocale('fr'));

describe('sourceRows', () => {
  it('one row per source, in order, with its state, words and time', () => {
    const rows = sourceRows({ status, live: true, linky: LINKY, grid: GRID }, NOW);
    expect(rows.map((r) => r.key)).toEqual(['cozytouch', 'linky', 'ecowatt', 'tempo']);
    const [cozy, linky, eco, tempo] = rows;
    expect(cozy).toMatchObject({ state: 'fresh', text: 'Connecté · dernier relevé il y a 1 min', bad: false });
    expect(linky).toMatchObject({ state: 'fresh', text: 'Relié · données jusqu’au 30/11' });
    expect(eco).toMatchObject({ state: 'fresh', text: 'à jour, relevé à 07:15', at: at(7, 15) * 1000 });
    expect(tempo).toMatchObject({ state: 'bad', text: 'indisponible depuis 08:15', bad: true });
    expect(tempo.rows.map((r) => r.label)).toEqual(['Dernier relevé réussi', 'En erreur depuis', 'Prochain relevé']);
    expect(lateCount(rows)).toBe(1);
  });
  it('Tempo only under a Tempo price; a never-asked source is waiting, not failed', () => {
    const grid = { ...GRID, tempo: { ...GRID.tempo, state: 'off', enabled: false }, ecowatt: { state: 'never', last_ok: null, error_since: null, next: at(17, 15), enabled: true } } as Sources;
    const rows = sourceRows({ status, live: true, linky: LINKY, grid }, NOW);
    expect(rows.map((r) => r.key)).toEqual(['cozytouch', 'linky', 'ecowatt']);
    expect(rows[2]).toMatchObject({ state: 'late', text: 'pas encore interrogé', bad: false });
  });
  it('Cozytouch down is bad; before the stream it is waiting; quota is late', () => {
    expect(sourceRows({ status: { ...status, connected: false }, live: true, linky: null, grid: null }, NOW)[0]).toMatchObject({ state: 'bad', text: 'Injoignable' });
    expect(sourceRows({ status, live: false, linky: null, grid: null }, NOW)[0].state).toBe('late');
    const grid = { ...GRID, ecowatt: { ...GRID.ecowatt, state: 'quota' } } as Sources;
    expect(sourceRows({ status, live: true, linky: null, grid }, NOW)[1]).toMatchObject({ state: 'late', text: 'quota du jour atteint, reprise demain' });
  });
  it('Linky: a refused token is bad and worded; the calls are an exact row', () => {
    const rows = sourceRows({ status, live: true, linky: { ...LINKY, state: 'auth' }, grid: null }, NOW);
    expect(rows[1].bad).toBe(true);
    expect(rows[1].state).toBe('bad');
    expect(rows[1].rows.at(-1)).toMatchObject({ label: 'Appels MyElectricalData', value: '6 appels sur 10 aujourd’hui' });
  });
  it('in English', () => {
    applyLocale('en');
    const rows = sourceRows({ status, live: true, linky: LINKY, grid: GRID }, NOW);
    expect(rows[0].text).toMatch(/^Connected · last reading 1\smin ago$/);
    expect(rows[3].text).toMatch(/since 08:15/);
  });
});
