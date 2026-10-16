import { describe, expect, it } from 'vitest';
import type { Radiator } from '$lib/api/types';
import { applyLocale } from '$lib/i18n';
import { infoRows } from './roomfacts';

const NB = ' ';
const now = Date.parse('2026-10-14T12:10:00Z'); // 14:10 in Paris
const base = {
  id: 'r1', room_id: 'salon', name: 'Radiateur', model: 'HEKLA P', power_w: 1500, temperature: 19.5,
  mode: 'program', target: 20, comfort: 20, eco_delta: 3, eco: 17, effective_setpoint: 17, heating_level: 'eco',
  max_temperature: 28, window_open: false, occupied: false, window_detection: true, presence_detection: false,
  light: null, energy_wh: null, working_rate: 0, rssi: 87.4, program: {},
  reachable: true, unreachable_since: null, last_event_at: now / 1000 - 180
} as Radiator;
const values = (r: Radiator) => Object.fromEntries(infoRows(r, now).map((x) => [x.key, x.value]));

describe('infoRows', () => {
  it('French: model, power, raw RSSI, reachable, last signal', () => {
    applyLocale('fr');
    expect(values(base)).toEqual({
      model: 'HEKLA P', power: `1500${NB}W`, signal: 'RSSI 87', reach: 'En ligne', last: `il y a 3${NB}min`
    });
    expect(infoRows(base, now).map((x) => x.label)).toEqual(['Modèle', 'Puissance', 'Niveau de signal', 'Connexion', 'Dernier signal']);
  });
  it('offline since today shows the time, since an earlier day the date', () => {
    applyLocale('fr');
    const today = { ...base, reachable: false, unreachable_since: Date.parse('2026-10-14T12:05:00Z') / 1000 };
    expect(values(today).reach).toBe('Hors ligne depuis 14:05');
    expect(infoRows(today, now).find((x) => x.key === 'reach')!.bad).toBe(false); // offline is a normal state here: muted, never red
    const earlier = { ...base, reachable: false, unreachable_since: Date.parse('2026-10-12T06:00:00Z') / 1000 };
    expect(values(earlier).reach).toMatch(/^Hors ligne depuis .*12.*08:00$/);
    expect(values({ ...base, reachable: false, unreachable_since: null }).reach).toBe('Hors ligne');
  });
  it('Infos shows — for every unknown', () => {
    applyLocale('fr');
    const unknown = { ...base, model: null, power_w: null, rssi: null, reachable: null, last_event_at: null };
    expect(Object.values(values(unknown))).toEqual(['—', '—', '—', '—', '—']);
    const older = { ...base, reachable: undefined, last_event_at: undefined } as unknown as Radiator;
    expect(values(older).reach).toBe('—');
  });
  it('English', () => {
    applyLocale('en');
    expect(values({ ...base, reachable: false, unreachable_since: Date.parse('2026-10-14T12:05:00Z') / 1000 })).toMatchObject({
      reach: 'Offline since 14:05', last: `3${NB}min ago`
    });
    expect(infoRows(base, now)[2].label).toBe('Signal level');
    applyLocale('fr');
  });
});
