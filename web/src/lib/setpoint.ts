import { api } from './api/client';
import type { CommandResult, Expected, Override, Radiator } from './api/types';
import { capsOf, isReadOnly, roomRange } from './capabilities';
import { m } from './i18n';
import { agg } from './room';
import type { RoomStatus } from './status';

/** What the tile and sheet −/+ change (Tableau spec §4 « What −/+ changes », decision 4): the setpoint in force.
 * Manuel → `manual`; Programme → the level running now (`comfort` or `eco`, labelled « Confort » / « Éco »);
 * Chauffe temporaire → the boost temperature (sent again with the same end). Arrêt, an open window, offline,
 * read-only, an absence, a restore in progress or a mode Kelvin cannot set → no stepper (`null`). */
export type PrimaryKind = 'manual' | 'comfort' | 'eco' | 'boost';

export interface PrimarySetpoint {
  kind: PrimaryKind;
  /** The value shown: for `eco`, the absolute eco temperature (comfort − lowering). */
  value: number | null;
  /** The stepper's bounds, in the shown value's terms. */
  min: number;
  max: number;
  /** A pending request for this value (the stepper's dashed mark). */
  pending: boolean;
  /** For `boost`: the end (epoch s) the resend keeps. */
  endsAt?: number;
  /** For `eco`: the comfort (of the controllable radiators) the lowering is taken from. */
  comfort?: number;
}

/** The stepper caption: « Manuel », « Confort », « Éco », « Chauffe temp. ». Read at render time (i18n). */
export function primaryLabel(kind: PrimaryKind): string {
  return kind === 'manual' ? m.mode.manual : kind === 'comfort' ? m.level.comfort : kind === 'eco' ? m.level.eco : m.kit.boostShort;
}

/** `inFlight`: a command for this room is on its way (`house.pendingFor(room.radiator_ids)` sending or pending).
 * Overrides carry no expected value, so a boost resend is dashed while it travels. */
export function primarySetpoint(
  status: RoomStatus,
  rads: Radiator[],
  override: Override | undefined,
  expected: Expected,
  inFlight = false
): PrimarySetpoint | null {
  const controllable = rads.filter((r) => !isReadOnly(r) && r.reachable !== false);
  if (!controllable.length) return null;
  switch (status.kind) {
    case 'manual': {
      const range = roomRange(controllable, 'manual');
      if (!range) return null;
      const value = expected.target ?? agg(controllable.map((r) => r.target)).value ?? status.target;
      return { kind: 'manual', value, min: range[0], max: range[1], pending: expected.target !== undefined };
    }
    case 'comfort': {
      const range = roomRange(controllable, 'comfort');
      if (!range) return null;
      const value = expected.comfort ?? agg(controllable.map((r) => r.comfort)).value;
      return { kind: 'comfort', value, min: range[0], max: range[1], pending: expected.comfort !== undefined };
    }
    case 'eco': {
      const range = roomRange(controllable, 'eco');
      const comfort = expected.comfort ?? agg(controllable.map((r) => r.comfort)).value;
      const delta = expected.eco_delta ?? agg(controllable.map((r) => r.eco_delta)).value;
      if (!range || comfort == null) return null;
      // The radiators take the lowering below comfort: the shown range is comfort minus the lowering's range.
      return {
        kind: 'eco', value: delta == null ? null : comfort - delta, min: comfort - range[1], max: comfort - range[0],
        pending: expected.eco_delta !== undefined, comfort
      };
    }
    case 'boost': {
      if (!override || override.kind !== 'boost' || override.restoring || !controllable.some((r) => capsOf(r).boost)) return null;
      const range = roomRange(controllable, 'manual') ?? [7, 28];
      return { kind: 'boost', value: override.temperature, min: range[0], max: range[1], pending: inFlight, endsAt: override.ends_at };
    }
    default:
      return null;
  }
}

/** Send one −/+ result (after the Stepper's 600 ms debounce), clamped to the setpoint's bounds. `eco` is sent as
 * the lowering below `p.comfort` (the `comfort` argument is kept for compatibility and ignored when `p` carries
 * one); with no comfort known nothing is sent. `boost` is sent again with the minutes left to its end. */
export function sendPrimary(roomId: string, p: PrimarySetpoint, value: number, comfort: number | null, now: number): Promise<CommandResult> {
  const v = Math.min(p.max, Math.max(p.min, value));
  if (p.kind === 'boost') {
    const left = Math.max(1, Math.round(((p.endsAt ?? now / 1000) * 1000 - now) / 60_000));
    return api.roomBoost(roomId, v, left);
  }
  if (p.kind === 'eco') {
    const base = p.comfort ?? comfort;
    if (base == null) return Promise.resolve({ pending: null });
    return api.roomSetpoint(roomId, 'eco', Math.round((base - v) * 2) / 2);
  }
  return api.roomSetpoint(roomId, p.kind, v);
}
