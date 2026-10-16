import { beforeEach, describe, expect, it } from 'vitest';
import type { GridView, Override, Radiator, WeekProgram } from './api/types';
import { applyLocale } from './i18n';
import {
  climate, climateText, ecowattTomorrow, gridNext, gridNextText, isAllOff, monthSpan, nextLevelText, radiatorsText, segsText,
  shortName, tileLine, todaySegs, type RoomFacts
} from './dashboard';
import type { RoomStatus } from './status';

const NB = ' ';
// Friday 16 October 2026, 18:42 Paris (summer time: UTC+2).
const NOW = Date.parse('2026-10-16T18:42:00+02:00');
const week = (slots: { start: string; end: string }[]): WeekProgram =>
  Object.fromEntries(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((d) => [d, slots])) as WeekProgram;
const PROG = week([{ start: '06:30', end: '08:00' }, { start: '17:00', end: '23:00' }]);
const st = (kind: RoomStatus['kind'], extra: Partial<RoomStatus> = {}): RoomStatus =>
  ({ kind, lead: 'Programme', rest: 'Confort jusqu’à 23:00', text: 'Programme · Confort jusqu’à 23:00', tone: 'tx', target: 20, pending: false, ...extra }) as RoomStatus;
const facts = (extra: Partial<RoomFacts> = {}): RoomFacts => ({ reading: 19.6, offline: false, heating: false, controllable: true, off: false, ...extra });
const rad = (extra: Partial<Radiator>): Radiator => ({ id: 'a', name: 'R', temperature: 19.5, working_rate: 0, reachable: true, ...extra }) as Radiator;

beforeEach(() => applyLocale('fr'));

describe('climate (the Climat chip)', () => {
  it('the range of the rooms that answer and how many heat', () => {
    const c = climate([facts({ reading: 19.6, heating: true }), facts({ reading: 19.1 }), facts({ reading: 15, offline: true })]);
    expect(c).toMatchObject({ lo: 19.1, hi: 19.6, heating: 1, offline: 1, allOff: false });
    expect(climateText(c)).toBe('19,1–19,6° · 1 en chauffe');
    expect(climateText(c, true)).toBe('19,1–19,6°');
  });
  it('« tout éteint » when every room Kelvin drives and that answers is off', () => {
    const rooms = [facts({ off: true, reading: 19.4 }), facts({ off: true, reading: 19 }), facts({ offline: true }), facts({ controllable: false, reading: 19.2 })];
    expect(isAllOff(rooms)).toBe(true);
    expect(climateText(climate(rooms))).toBe('19,0–19,4° · tout éteint');
    expect(isAllOff([facts({ off: true }), facts()])).toBe(false);
    expect(isAllOff([facts({ offline: true, off: true })])).toBe(false);
  });
  it('no reading is « — », never 0; one reading is one figure', () => {
    expect(climateText(climate([facts({ reading: null })]))).toBe('—');
    expect(climateText(climate([facts({ reading: 20 })]), true)).toBe('20,0°');
  });
  it('in English', () => {
    applyLocale('en');
    expect(climateText(climate([facts({ reading: 19.6, heating: true }), facts({ reading: 19.1 })]))).toBe('19.1–19.6° · 1 heating');
  });
});

describe('tileLine (what a room tile says)', () => {
  it('Programme heating: desktop « En chauffe · Confort jusqu’à 23:00 », phone « En chauffe · → 23:00 »', () => {
    expect(tileLine(st('comfort'), true, undefined, PROG, NOW, false)).toEqual({ lead: 'En chauffe', tone: 'warm', rest: 'Confort jusqu’à 23:00' });
    expect(tileLine(st('comfort'), true, undefined, PROG, NOW, true)).toEqual({ lead: 'En chauffe', tone: 'warm', rest: '→ 23:00' });
  });
  it('Programme idle: « Confort jusqu’à 23:00 », phone « Confort → 23:00 »; heat colour only while heating', () => {
    expect(tileLine(st('comfort'), false, undefined, PROG, NOW, false)).toEqual({ lead: 'Confort jusqu’à 23:00', tone: 'tx', rest: '' });
    expect(tileLine(st('comfort'), false, undefined, PROG, NOW, true)).toEqual({ lead: 'Confort → 23:00', tone: 'tx', rest: '' });
  });
  it('absence: cool with its temperature; boost: warm with its end', () => {
    const away: Override = { id: 'o', kind: 'away', room_id: null, radiator_ids: ['a'], temperature: 12, ends_at: NOW / 1000 + 3600, restoring: false };
    expect(tileLine(st('away', { lead: 'Absence', tone: 'cool' }), false, away, PROG, NOW, true)).toEqual({ lead: 'Absence', tone: 'cool', rest: `12,0${NB}°C` });
    const boost: Override = { ...away, kind: 'boost', temperature: 22, ends_at: Date.parse('2026-10-16T20:42:00+02:00') / 1000 };
    expect(tileLine(st('boost', { lead: 'Chauffe temporaire', tone: 'warm' }), true, boost, PROG, NOW, true)).toEqual({ lead: 'Chauffe temp.', tone: 'warm', rest: '→ 20:42' });
  });
  it('off and window never take the heat colour', () => {
    expect(tileLine(st('off', { lead: 'Arrêt', rest: '', tone: 'muted' }), true, undefined, PROG, NOW, true)).toEqual({ lead: 'Arrêt', tone: 'muted', rest: '' });
    expect(tileLine(st('window', { lead: 'Fenêtre ouverte', rest: '', tone: 'bad' }), true, undefined, PROG, NOW, true).tone).toBe('bad');
  });
});

describe('programme words', () => {
  it('the next change, today’s periods and their words', () => {
    expect(nextLevelText(PROG, NOW)).toBe('→ Éco 23:00');
    expect(nextLevelText(null, NOW)).toBeNull();
    expect(segsText(todaySegs(PROG, NOW))).toBe('06:30–08:00, 17:00–23:00');
  });
});

describe('the Radiateurs tile', () => {
  it('heating count, then each radiator by its short name and reading', () => {
    const rads = [rad({ name: 'Salon baie', temperature: 19.7, working_rate: 40 }), rad({ id: 'b', name: 'Salon entrée', temperature: 19.5, working_rate: 10 })];
    expect(radiatorsText(rads, 'Salon', false)).toBe('2 en chauffe · baie 19,7° · entrée 19,5°');
    expect(radiatorsText(rads, 'Salon', true)).toBe('2 à l’arrêt');
    expect(shortName('Salon', 'Salon')).toBe('Salon');
  });
});

describe('grid signals', () => {
  const view = (extra: Partial<GridView> = {}): GridView => ({
    tempo: null,
    ecowatt: { days: [{ date: '2026-10-17', level: 2, hours: [{ start: '18:00', end: '20:00', level: 2 }] }], fetched_at: 1 },
    source: 'MED',
    ...extra
  });
  it('the Réseau chip says EcoWatt orange tomorrow; « Rien à signaler » otherwise', () => {
    expect(gridNextText(gridNext(view(), '2026-10-16'))).toBe('EcoWatt orange demain');
    expect(gridNextText(gridNext(view({ ecowatt: { days: [], fetched_at: null } }), '2026-10-16'))).toBe('Rien à signaler');
  });
  it('Tempo only when the backend sends it (Tempo in force)', () => {
    const tempo = { today: { date: '2026-10-16', colour: 'blue' as const }, tomorrow: { date: '2026-10-17', colour: 'white' as const, expected_at: null }, fetched_at: 1 };
    expect(gridNextText(gridNext(view({ tempo, ecowatt: { days: [], fetched_at: null } }), '2026-10-16'))).toBe('Tempo Blanc demain');
  });
  it('tomorrow’s EcoWatt with its hours; null when not published', () => {
    expect(ecowattTomorrow(view(), '2026-10-16')).toEqual({ level: 2, hours: '18:00–20:00' });
    expect(ecowattTomorrow(view(), '2026-10-17')).toBeNull();
  });
});

describe('monthSpan', () => {
  it('this month, last month and how far into it', () => {
    expect(monthSpan('2026-10-16')).toEqual({ prevFrom: '2026-09-01', from: '2026-10-01', to: '2026-11-01', day: 16, days: 31 });
    expect(monthSpan('2027-01-01')).toEqual({ prevFrom: '2026-12-01', from: '2027-01-01', to: '2027-02-01', day: 1, days: 31 });
    expect(monthSpan('2028-02-10').days).toBe(29);
  });
});
