import { describe, expect, it } from 'vitest';
import type { Capabilities, Radiator, Room } from '$lib/api/types';
import { canEditSetup, capsOf, isReadOnly, programRooms, roomControls, roomRange } from './capabilities';

const BASE = {
  id: 'a', room_id: 'r', name: 'Radiateur', model: null, power_w: null, temperature: 20, mode: 'program' as const,
  target: 20, comfort: 20, eco_delta: 3, eco: 17, effective_setpoint: 17, heating_level: 'eco',
  max_temperature: 28, window_open: false, occupied: false, window_detection: true, presence_detection: false,
  light: { on: false, intensity: 1 }, energy_wh: { total: 1, t1: null, t2: null }, working_rate: 0, rssi: 100,
  program: {}
};
const rad = (extra: Partial<Radiator> = {}): Radiator => ({ ...BASE, ...extra }) as Radiator;
const NONE: Capabilities = {
  modes: [], manual: null, comfort: null, eco: null, levels: [], program: false, dryer: [],
  window_detection: false, presence_detection: false, night_light: false, night_light_intensity: false,
  identify: false, energy: false, boost: false, rename: false, read_only: true
};
const PILOT: Capabilities = { ...NONE, levels: ['comfort', 'eco', 'frostprotection', 'off'], read_only: false };
const DRYER: Capabilities = {
  ...NONE, modes: ['off', 'manual', 'program'], manual: [7, 26], dryer: ['boost', 'drying'], identify: true,
  boost: true, read_only: false
};

describe('capsOf', () => {
  it('reads a radiator from an older backend as the Sauter set', () => {
    const c = capsOf(rad());
    expect(c.modes).toEqual(['off', 'manual', 'program']);
    expect([c.manual, c.comfort, c.eco]).toEqual([[7, 28], [12, 28], [2, 8]]);
    expect([c.program, c.boost, c.night_light, c.read_only]).toEqual([true, true, true, false]);
    expect(capsOf(rad({ light: null, energy_wh: null })).night_light).toBe(false);
  });

  it('uses the backend capabilities when present', () => {
    expect(capsOf(rad({ capabilities: PILOT })).levels).toEqual(['comfort', 'eco', 'frostprotection', 'off']);
  });

  it('knows a read-only device', () => {
    expect(isReadOnly(rad({ support: 'readonly', capabilities: { ...NONE, energy: true } }))).toBe(true);
    expect(isReadOnly(rad({ capabilities: PILOT }))).toBe(false);
    expect(isReadOnly(rad())).toBe(false);
  });
});

describe('room controls', () => {
  const sauter = rad({ id: 's' });
  const dryer = rad({ id: 'd', capabilities: DRYER });
  const pilot = rad({ id: 'p', capabilities: PILOT });
  const zone = rad({ id: 'z', support: 'readonly', capabilities: NONE });

  it('counts what each control reaches in a mixed room', () => {
    expect(roomControls([sauter, dryer, zone])).toEqual({
      total: 3, controllable: 2, modes: ['off', 'manual', 'program'], mode: 2, manual: 2, comfort: 1, eco: 1, program: 1, boost: 2
    });
    expect(roomControls([pilot])).toEqual({
      total: 1, controllable: 1, modes: [], mode: 0, manual: 0, comfort: 0, eco: 0, program: 0, boost: 0
    });
  });

  it('offers the range every radiator taking it accepts', () => {
    expect(roomRange([sauter, dryer], 'manual')).toEqual([7, 26]);
    expect(roomRange([sauter, dryer], 'comfort')).toEqual([12, 28]);
    expect(roomRange([pilot, zone], 'manual')).toBeNull();
  });

  it('lists only rooms with an editable programme', () => {
    const rooms = [{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }] as Room[];
    const of = (id: string) => ({ r1: [sauter], r2: [pilot, zone], r3: [dryer, sauter] })[id] ?? [];
    expect(programRooms(rooms, of).map((r) => r.id)).toEqual(['r1', 'r3']);
  });
});

describe('canEditSetup', () => {
  it('is false on an experimental server only', () => {
    expect(canEditSetup({ id: 'sauter_cozytouch', name: 'Sauter Cozytouch', tier: 'cozytouch', default: true })).toBe(true);
    expect(canEditSetup({ id: 'flexom', name: 'Flexom', tier: 'experimental', default: false })).toBe(false);
    expect(canEditSetup(null)).toBe(false); // unknown yet: hidden until the server is known
  });
});
