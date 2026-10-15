import { describe, expect, it } from 'vitest';
import { applyLocale } from '$lib/i18n';
import type { ByRadiator, Radiator, Room } from './api/types';
import { NO_ROOM, roomEnergy } from './roomEnergy';

const NB = ' ';
const rooms = [
  { id: 'salon', name: 'Salon', radiator_ids: ['a', 'b'] },
  { id: 'chambre', name: 'Chambre', radiator_ids: ['c'] },
  { id: 'bureau', name: 'Bureau', radiator_ids: ['d'] }
] as Room[];
const radiators = {
  a: { id: 'a', name: 'Salon fenêtre' },
  b: { id: 'b', name: 'Salon porte' },
  c: { id: 'c', name: 'Chambre' },
  d: { id: 'd', name: 'Bureau' }
} as unknown as Record<string, Radiator>;
const row = (id: string, room: string | null, o: Partial<ByRadiator> = {}): ByRadiator => ({
  radiator_id: id, room_id: room, kwh: 100, hc_kwh: 40, hp_kwh: 60, eur: 25, coverage: 1, interpolated: false,
  apportioned: false, from: '2026-09-01', temp_avg: 19.4, setpoint_avg: 20, heating_hours: 3, ...o
});
const span = { from: '2026-10-01', to: '2026-10-14' };

describe('roomEnergy (spec §3.2.7)', () => {
  const byRadiator = [
    row('a', 'salon'),
    row('b', 'salon', { kwh: 50.25, hc_kwh: 20, hp_kwh: 30.25, eur: 12.5, temp_avg: 19.8, heating_hours: 1, coverage: 0.6, from: '2026-10-07', apportioned: true }),
    row('c', 'chambre', { kwh: 80, hc_kwh: 30, hp_kwh: 50, eur: 20, temp_avg: 18, setpoint_avg: 18.5, heating_hours: 2.2 }),
    row('x', null, { kwh: 10, hc_kwh: 4, hp_kwh: 6, eur: 2.5, temp_avg: null, setpoint_avg: null, heating_hours: null })
  ];
  const list = roomEnergy(byRadiator, rooms, radiators, span);

  it('groups radiators by their current room; unassigned or removed ones under « Sans pièce »', () => {
    expect(list.map((r) => r.name)).toEqual(['Salon', 'Chambre', 'Bureau', 'Sans pièce']);
    expect(list[3].radiators.map((r) => r.name)).toEqual(['Radiateur retiré']);
    expect(list[0].radiators.map((r) => r.name)).toEqual(['Salon fenêtre', 'Salon porte']);
  });
  it('in English: the unassigned group and a removed radiator', () => {
    applyLocale('en');
    const en = roomEnergy(byRadiator, rooms, radiators, span);
    expect(en.at(-1)!.name).toBe('No room');
    expect(en.at(-1)!.id).toBe(NO_ROOM);
    expect(en.at(-1)!.radiators.map((r) => r.name)).toEqual(['Removed radiator']);
    expect(en[0].partial).toBe('1 of 2 radiators recorded from 7/10');
  });

  it('sums energy and €, averages temperature, setpoint and heating hours; a room never recorded reads null', () => {
    expect(list[0]).toMatchObject({ kwh: 150.25, hc: 60, hp: 90.25, eur: 37.5, temp: 19.6, setpoint: 20, hours: 2, est: true });
    expect(list[2]).toMatchObject({ kwh: null, hc: null, eur: null, temp: null, est: false, partial: null });
    expect(list[3]).toMatchObject({ temp: null, hours: null });
  });

  it('°C, setpoint or heating hours without a figure say why (sampled under half the period)', () => {
    expect(list[3].statsWhy).toBe('moins de la moitié de la période mesurée');
    expect(list[3].radiators[0].statsWhy).toBe('moins de la moitié de la période mesurée');
    expect(list[0].statsWhy).toBeNull();
    expect(list[2].statsWhy).toBeNull(); // no radiator recorded: that is its reason
  });

  it('a room mean that leaves out a radiator says so', () => {
    const [salon] = roomEnergy(
      [row('a', 'salon'), row('b', 'salon', { temp_avg: null, setpoint_avg: null, heating_hours: null })],
      rooms,
      radiators,
      span
    );
    expect(salon).toMatchObject({ temp: 19.4, hours: 3 });
    expect(salon.statsWhy).toBe(`moyenne de 1 radiateur sur 2 (l’autre${NB}: moins de la moitié de la période mesurée)`);
  });

  it('L3: shares by largest remainder, adding up to 100,0 %', () => {
    expect(list.map((r) => r.share)).toEqual([`62,5${NB}%`, `33,3${NB}%`, '—', `4,2${NB}%`]);
    expect(list[0].fraction).toBeCloseTo(150.25 / 240.25, 9);
    expect(list[2].fraction).toBe(0);
  });

  it('marks a room recorded from mid-period as partial, and says from when', () => {
    expect(list[0].partial).toBe('1 radiateur sur 2 enregistré à partir du 7/10');
    expect(list[0].radiators[1].partial).toBe('enregistré à partir du 7/10');
    const gappy = roomEnergy([row('a', 'salon', { coverage: 0.8 }), row('b', 'salon', { coverage: 0.9 })], rooms, radiators, span);
    expect(gappy[0].partial).toBe('2 radiateurs sur 2 enregistrés en partie');
    expect(gappy[0].radiators[0].partial).toBe(`couverture 80,0${NB}%`);
  });

  it('a radiator without any figure reads « — » with its reason, and its room’s sum says it is partial', () => {
    const none = { kwh: null, hc_kwh: null, hp_kwh: null, eur: null, coverage: null };
    const unknown = roomEnergy([row('a', 'salon'), row('b', 'salon', none), row('c', 'chambre', none)], rooms, radiators, span);
    expect(unknown[0]).toMatchObject({ kwh: 100, partial: '1 radiateur sur 2 enregistré en partie' });
    expect(unknown[0].radiators[1]).toMatchObject({ name: 'Salon porte', kwh: null, partial: 'aucun relevé sur la période' });
    expect(unknown[1]).toMatchObject({ kwh: null, share: '—', partial: 'aucun relevé sur la période' });
  });

  it('shown figures add up: radiators to their room, HC + HP to kWh, at the table’s 2 decimals', () => {
    // Each radiator rounded on its own would read 1,01 + 1,01 + 1,01 = 3,03 under a room of 3,02.
    const thirds = { kwh: 1.006, hc_kwh: 0.503, hp_kwh: 0.503, eur: 0.25 };
    const [salon] = roomEnergy(
      [row('a', 'salon', thirds), row('b', 'salon', thirds), row('x', 'salon', thirds)],
      [{ id: 'salon', name: 'Salon', radiator_ids: ['a', 'b', 'x'] }] as Room[],
      radiators,
      span
    );
    const cents = (v: number | null) => Math.round((v as number) * 100);
    expect(salon.shown).toEqual({ kwh: 3.02, hc: 1.51, hp: 1.51 });
    expect(salon.radiators.reduce((a, r) => a + cents(r.shown.kwh), 0)).toBe(302);
    expect(salon.radiators.reduce((a, r) => a + cents(r.shown.hc), 0)).toBe(151);
    expect(salon.radiators.reduce((a, r) => a + cents(r.shown.hp), 0)).toBe(151);
    for (const r of salon.radiators) expect(cents(r.shown.hc) + cents(r.shown.hp)).toBe(cents(r.shown.kwh));
  });
});
