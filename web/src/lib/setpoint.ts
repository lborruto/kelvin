import { api } from './api/client';
import type { CommandResult, Expected, Override, Radiator, WeekProgram } from './api/types';
import { capsOf, isReadOnly, roomRange } from './capabilities';
import { m } from './i18n';
import { nextChange } from './program';
import { agg } from './room';
import type { RoomStatus } from './status';

/** What the tile and sheet −/+ change (owner decision 2026-10-29, replacing Tableau decision 4): Manuel → `manual`;
 * Programme → always **Confort** (`comfort`), whichever level runs now: during an Éco period the new Confort
 * applies from the next comfort slot (`waiting`, the line « Pris en compte à la prochaine plage Confort »), and
 * Éco stays editable in « Températures du programme »; Chauffe temporaire → the boost temperature (sent again
 * with the same end). Arrêt, an open window, offline, read-only, an absence, a restore in progress or a mode
 * Kelvin cannot set → no stepper (`null`). */
export type PrimaryKind = 'manual' | 'comfort' | 'boost';

export interface PrimarySetpoint {
  kind: PrimaryKind;
  /** The value shown. */
  value: number | null;
  /** The stepper's bounds. */
  min: number;
  max: number;
  /** A pending request for this value (the stepper's dashed mark). */
  pending: boolean;
  /** For `boost`: the end (epoch s) the resend keeps. */
  endsAt?: number;
  /** For `comfort` during an Éco period: the change applies at the next comfort slot, not now. */
  waiting?: boolean;
}

/** The stepper caption: « Manuel », « Confort », « Chauffe temp. ». Read at render time (i18n). */
export function primaryLabel(kind: PrimaryKind): string {
  return kind === 'manual' ? m.mode.manual : kind === 'comfort' ? m.level.comfort : m.kit.boostShort;
}

/** When the next comfort slot starts (epoch ms), during an Éco period; null without a programme or a slot. */
export function nextComfortAt(program: WeekProgram | null | undefined, now: number): number | null {
  const c = program ? nextChange(program, now) : null;
  return c && c.to === 'comfort' ? c.atMs : null;
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
    case 'comfort':
    case 'eco': {
      const range = roomRange(controllable, 'comfort');
      if (!range) return null;
      const value = expected.comfort ?? agg(controllable.map((r) => r.comfort)).value;
      return {
        kind: 'comfort', value, min: range[0], max: range[1], pending: expected.comfort !== undefined,
        ...(status.kind === 'eco' ? { waiting: true } : {})
      };
    }
    case 'boost': {
      if (!override || override.kind !== 'boost' || override.restoring || !controllable.some((r) => capsOf(r).boost)) return null;
      const range = roomRange(controllable, 'manual') ?? [7, 28];
      return { kind: 'boost', value: override.temperature, min: range[0], max: range[1], pending: inFlight, endsAt: override.ends_at ?? undefined };
    }
    default:
      return null;
  }
}

/** Send one −/+ result (once the owner stops: the Stepper's 1,5 s idle rule), clamped to the setpoint's bounds.
 * `boost` is sent again with the minutes left to its end. */
export function sendPrimary(roomId: string, p: PrimarySetpoint, value: number, now: number): Promise<CommandResult> {
  const v = Math.min(p.max, Math.max(p.min, value));
  if (p.kind === 'boost') {
    const left = Math.max(1, Math.round(((p.endsAt ?? now / 1000) * 1000 - now) / 60_000));
    return api.roomBoost(roomId, v, left);
  }
  return api.roomSetpoint(roomId, p.kind, v);
}
