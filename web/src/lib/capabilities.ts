/**
 * Which controls a radiator, or a room, offers (Plan 12). The backend sends each radiator's
 * capabilities; a backend from before Plan 12 sends none, and its radiators were all Sauter
 * adjustable-setpoint heaters with every control. A control no radiator supports is absent.
 */
import type { Capabilities, PilotLevel, Radiator, Room, ServerInfo, SettableMode } from '$lib/api/types';

export const MODE_ORDER: SettableMode[] = ['off', 'manual', 'program'];
export const LEVEL_ORDER: PilotLevel[] = ['comfort', 'comfort-1', 'comfort-2', 'eco', 'frostprotection', 'off'];

export function capsOf(r: Radiator): Capabilities {
  return (
    r.capabilities ?? {
      modes: [...MODE_ORDER],
      manual: [7, r.max_temperature],
      comfort: [12, r.max_temperature],
      eco: [1, 8],
      levels: [],
      program: true,
      dryer: [],
      window_detection: true,
      presence_detection: true,
      night_light: r.light !== null,
      night_light_intensity: r.light !== null,
      identify: true,
      energy: r.energy_wh !== null,
      boost: true,
      read_only: false
    }
  );
}

export const isReadOnly = (r: Radiator): boolean => r.support === 'readonly' || capsOf(r).read_only;

export interface RoomControls {
  total: number;
  controllable: number;
  /** Every mode at least one radiator takes. */
  modes: SettableMode[];
  /** How many radiators each room control reaches. */
  mode: number;
  manual: number;
  comfort: number;
  eco: number;
  program: number;
  boost: number;
}

export function roomControls(rads: Radiator[]): RoomControls {
  const caps = rads.map(capsOf);
  const count = (f: (c: Capabilities) => boolean) => caps.filter(f).length;
  return {
    total: rads.length,
    controllable: count((c) => !c.read_only),
    modes: MODE_ORDER.filter((m) => caps.some((c) => c.modes.includes(m))),
    mode: count((c) => c.modes.length > 0),
    manual: count((c) => c.manual !== null),
    comfort: count((c) => c.comfort !== null),
    eco: count((c) => c.eco !== null),
    program: count((c) => c.program),
    boost: count((c) => c.boost)
  };
}

/** The range a room stepper may offer: what every radiator taking that setpoint accepts. */
export function roomRange(rads: Radiator[], key: 'manual' | 'comfort' | 'eco'): [number, number] | null {
  const ranges = rads.map((r) => capsOf(r)[key]).filter((v): v is [number, number] => v !== null);
  if (!ranges.length) return null;
  return [Math.max(...ranges.map((v) => v[0])), Math.min(...ranges.map((v) => v[1]))];
}

/** Rooms whose programme Kelvin can edit: at least one radiator with the `program` capability. */
export function programRooms(rooms: Room[], radiatorsOf: (id: string) => Radiator[]): Room[] {
  return rooms.filter((room) => radiatorsOf(room.id).some((r) => capsOf(r).program));
}

/** Room and device writes (Plan 8b) are offered on the Cozytouch servers only (Plan 12). */
export const canEditSetup = (server: ServerInfo | null): boolean => server?.tier !== 'experimental';
