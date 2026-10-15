import { afterEach, describe, expect, it } from 'vitest';
import type { Override, Radiator, Room } from './api/types';
import { applyLocale } from './i18n';
import { isOffline, roomReading, roomStatus, sharedProgram } from './status';

const NB = ' ';
// Tuesday 13 October 2026, 13:48 in Paris.
const now = Date.parse('2026-10-13T11:48:00Z');
const program = {
  tuesday: [{ start: '06:15', end: '08:00' }, { start: '17:30', end: '22:30' }],
  wednesday: [{ start: '06:30', end: '08:00' }]
};
const rad = (over: Partial<Radiator> = {}): Radiator => ({
  id: 'a', room_id: 'salon', name: 'Radiateur', model: null, power_w: 1000, temperature: 19.5, mode: 'program', target: 20,
  comfort: 20, eco_delta: 3, eco: 17, effective_setpoint: 17, heating_level: 'eco', max_temperature: 28, window_open: false,
  occupied: false, window_detection: true, presence_detection: false, light: null, energy_wh: null, working_rate: 0, rssi: null,
  program, reachable: true, ...over
});
const room = (over: Partial<Room> = {}): Room => ({
  id: 'salon', name: 'Salon', radiator_ids: ['a'], temperature: 19.5, mode: 'program', target: 20, comfort: 20, eco: 17,
  effective_setpoint: 17, heating_level: 'eco', window_open: false, occupied: false, ...over
});
const override = (over: Partial<Override>): Override => ({
  id: 'o', kind: 'boost', room_id: 'salon', radiator_ids: ['a'], temperature: 22, ends_at: Date.parse('2026-10-13T19:45:00Z') / 1000,
  restoring: false, ...over
});

afterEach(() => applyLocale('fr'));

describe('roomStatus: one sentence, first row wins', () => {
  it('programme, eco now: until the next comfort period today', () => {
    const s = roomStatus(room(), [rad()], undefined, {}, now);
    expect(s).toMatchObject({ kind: 'eco', lead: 'Programme', rest: 'Éco jusqu’à 17:30', tone: 'tx', target: 17, pending: false });
    expect(s.text).toBe('Programme · Éco jusqu’à 17:30');
  });

  it('programme, comfort now: until its end, with the comfort target', () => {
    const at = Date.parse('2026-10-13T16:00:00Z'); // 18:00
    expect(roomStatus(room(), [rad()], undefined, {}, at)).toMatchObject({ kind: 'comfort', rest: 'Confort jusqu’à 22:30', target: 20 });
  });

  it('after the last period: until tomorrow, then a weekday', () => {
    const late = Date.parse('2026-10-13T21:00:00Z'); // Tuesday 23:00
    expect(roomStatus(room(), [rad()], undefined, {}, late).rest).toBe('Éco jusqu’à demain 06:30');
    const wed = Date.parse('2026-10-14T07:00:00Z'); // Wednesday 09:00: next is Tuesday 06:15
    expect(roomStatus(room(), [rad()], undefined, {}, wed).rest).toBe('Éco jusqu’à mardi 06:15');
  });

  it('a week with no change says so', () => {
    expect(roomStatus(room(), [rad({ program: {} })], undefined, {}, now).rest).toBe('Éco toute la semaine');
  });

  it('manual: the setpoint is the sentence and the target', () => {
    const s = roomStatus(room({ mode: 'manual' }), [rad({ mode: 'manual', target: 19 })], undefined, {}, now);
    expect(s).toMatchObject({ kind: 'manual', text: `Manuel · 19,0${NB}°C`, target: 19 });
  });

  it('off: « Arrêt », muted, no target', () => {
    expect(roomStatus(room({ mode: 'off' }), [rad({ mode: 'off' })], undefined, {}, now)).toMatchObject({
      kind: 'off', text: 'Arrêt', tone: 'muted', target: null
    });
  });

  it('mixed modes', () => {
    expect(roomStatus(room({ mode: 'mixed' }), [rad()], undefined, {}, now)).toMatchObject({
      kind: 'mixed', text: 'Modes différents selon les radiateurs', tone: 'muted'
    });
  });

  it('window open beats the mode, in the red of things to fix', () => {
    expect(roomStatus(room({ window_open: true }), [rad()], undefined, {}, now)).toMatchObject({
      kind: 'window', text: 'Fenêtre ouverte', tone: 'bad', target: null
    });
  });

  it('boost beats the window: warm lead, its temperature until its end', () => {
    const s = roomStatus(room({ window_open: true }), [rad()], override({}), {}, now);
    expect(s).toMatchObject({ kind: 'boost', lead: 'Chauffe temporaire', rest: `22,0${NB}°C jusqu’à 21:45`, tone: 'warm', target: 22 });
  });

  it('away beats boost: cool lead, the end on another day by its weekday', () => {
    const away = override({ kind: 'away', temperature: 16, ends_at: Date.parse('2026-10-18T16:00:00Z') / 1000 });
    const s = roomStatus(room(), [rad()], away, {}, now);
    expect(s).toMatchObject({ kind: 'away', lead: 'Absence', rest: `16,0${NB}°C jusqu’à dimanche 18:00`, tone: 'cool', target: 16 });
  });

  it('a restoring override says so', () => {
    expect(roomStatus(room(), [rad()], override({ restoring: true }), {}, now).text).toBe('Rétablissement…');
  });

  it('offline beats everything: since today’s time, no target', () => {
    const since = Date.parse('2026-10-13T12:32:00Z') / 1000; // 14:32
    const s = roomStatus(room({ window_open: true }), [rad({ reachable: false, unreachable_since: since })], override({}), {}, now + 3_600_000);
    expect(s).toMatchObject({
      kind: 'offline', text: 'Hors ligne depuis 14:32', hint: 'Radiateur hors tension ou hors de portée', tone: 'muted', target: null
    });
  });

  it('offline since another day reads the date; unknown since reads « Hors ligne »; plural hint', () => {
    const since = Date.parse('2026-10-02T08:00:00Z') / 1000;
    expect(roomStatus(room(), [rad({ reachable: false, unreachable_since: since })], undefined, {}, now).text).toBe('Hors ligne depuis le 2 oct.');
    const two = [rad({ reachable: false, unreachable_since: null }), rad({ id: 'b', reachable: false, unreachable_since: since })];
    const s = roomStatus(room({ radiator_ids: ['a', 'b'] }), two, undefined, {}, now);
    expect(s.text).toBe('Hors ligne');
    expect(s.hint).toBe('Radiateurs hors tension ou hors de portée');
  });

  it('some radiators offline: the sentence is unchanged and the count is given', () => {
    const s = roomStatus(room({ radiator_ids: ['a', 'b'] }), [rad(), rad({ id: 'b', reachable: false })], undefined, {}, now);
    expect(s.kind).toBe('eco');
    expect(s.someOffline).toEqual({ k: 1, n: 2 });
  });

  it('a pending request wins over what the radiators report, and is flagged', () => {
    const s = roomStatus(room(), [rad()], undefined, { mode: 'manual', target: 21 }, now);
    expect(s).toMatchObject({ kind: 'manual', text: `Manuel · 21,0${NB}°C`, pending: true, target: 21 });
    const c = roomStatus(room(), [rad()], undefined, { comfort: 22 }, Date.parse('2026-10-13T16:00:00Z'));
    expect(c).toMatchObject({ kind: 'comfort', target: 22, pending: true });
    expect(roomStatus(room(), [rad()], undefined, { eco_delta: 4 }, now).target).toBe(16);
  });

  it('radiators with different programmes: no horizon is invented', () => {
    const b = rad({ id: 'b', program: { monday: [{ start: '07:00', end: '09:00' }] } });
    expect(roomStatus(room({ radiator_ids: ['a', 'b'] }), [rad(), b], undefined, {}, now).text).toBe(
      'Programme · horaires différents selon les radiateurs'
    );
  });

  it('a device without a programme Kelvin reads: its mode and level', () => {
    const caps = { ...{ modes: [], manual: null, comfort: null, eco: null, levels: ['comfort', 'eco'], program: false, dryer: [] },
      window_detection: false, presence_detection: false, night_light: false, night_light_intensity: false, identify: false,
      energy: false, boost: false, rename: true, read_only: false } as never;
    const s = roomStatus(room({ mode: 'other', heating_level: 'comfort' }), [rad({ mode: 'other', capabilities: caps })], undefined, {}, now);
    expect(s).toMatchObject({ kind: 'other', text: 'Autre · Confort' });
  });

  it('in English', () => {
    applyLocale('en');
    expect(roomStatus(room(), [rad()], undefined, {}, now).text).toBe('Schedule · Eco until 17:30');
    expect(roomStatus(room(), [rad()], undefined, {}, Date.parse('2026-10-13T21:00:00Z')).rest).toBe('Eco until tomorrow 06:30');
    expect(roomStatus(room(), [rad()], override({}), {}, now).text).toBe(`Boost · 22.0${NB}°C until 21:45`);
    expect(roomStatus(room({ mode: 'manual' }), [rad({ mode: 'manual', target: 19 })], undefined, {}, now).text).toBe(`Manual · 19.0${NB}°C`);
    const since = Date.parse('2026-10-02T08:00:00Z') / 1000;
    const off = roomStatus(room(), [rad({ reachable: false, unreachable_since: since })], undefined, {}, now);
    expect(off.text).toBe('Offline since 2 Oct');
    expect(off.hint).toBe('Radiator switched off or out of range');
    expect(roomStatus(room({ window_open: true }), [rad()], undefined, {}, now).text).toBe('Window open');
  });
});

describe('roomReading and helpers', () => {
  it('the mean of the radiators that answer when some do not', () => {
    const rads = [rad({ temperature: 21 }), rad({ id: 'b', temperature: 22 }), rad({ id: 'c', temperature: 14, reachable: false })];
    expect(roomReading(room({ temperature: 19 }), rads)).toBe(21.5);
  });
  it('the backend value otherwise', () => {
    expect(roomReading(room({ temperature: 19.4 }), [rad()])).toBe(19.4);
  });
  it('isOffline only when every radiator is unreachable (unknown is not offline)', () => {
    expect(isOffline([rad({ reachable: false }), rad({ reachable: null })])).toBe(false);
    expect(isOffline([rad({ reachable: false })])).toBe(true);
    expect(isOffline([])).toBe(false);
  });
  it('sharedProgram ignores key order', () => {
    const a = rad({ program: { monday: [{ start: '07:00', end: '08:00' }], tuesday: [] } });
    const b = rad({ id: 'b', program: { tuesday: [], monday: [{ end: '08:00', start: '07:00' }] } });
    expect(sharedProgram([a, b])).not.toBeNull();
  });
});
