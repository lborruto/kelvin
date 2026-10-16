import { describe, expect, it, vi } from 'vitest';
import type { Override, Radiator } from './api/types';
import { primaryLabel, primarySetpoint, sendPrimary } from './setpoint';
import type { RoomStatus } from './status';

const api = vi.hoisted(() => ({ roomSetpoint: vi.fn(async () => ({ pending: null })), roomBoost: vi.fn(async () => ({ pending: null })) }));
vi.mock('./api/client', () => ({ api, ApiError: class extends Error {} }));

const rad = (extra: Partial<Radiator> = {}): Radiator =>
  ({
    id: 'a', room_id: 'salon', name: 'R', temperature: 19.6, mode: 'program', target: 19.5, comfort: 20, eco_delta: 3, eco: 17,
    effective_setpoint: 20, reachable: true, support: 'tested',
    capabilities: { modes: ['off', 'manual', 'program'], manual: [7, 28], comfort: [12, 28], eco: [1, 6], program: true, boost: true, levels: ['off'], read_only: false },
    ...extra
  }) as unknown as Radiator;
const st = (kind: RoomStatus['kind'], target: number | null = null): RoomStatus =>
  ({ kind, lead: '', rest: '', text: '', tone: 'tx', target, pending: false }) as RoomStatus;
const boost: Override = { id: 'o', kind: 'boost', room_id: 'salon', radiator_ids: ['a'], temperature: 22, ends_at: 1_000_000, restoring: false };

describe('primarySetpoint (what −/+ changes)', () => {
  it('Manuel → manual, its target and range', () => {
    expect(primarySetpoint(st('manual', 19.5), [rad({ mode: 'manual' } as never)], undefined, {})).toEqual({ kind: 'manual', value: 19.5, min: 7, max: 28, pending: false });
  });
  it('Programme in comfort → comfort; in eco → the absolute eco, range in eco terms (decision 4)', () => {
    expect(primarySetpoint(st('comfort'), [rad()], undefined, {})).toMatchObject({ kind: 'comfort', value: 20, min: 12, max: 28 });
    expect(primarySetpoint(st('eco'), [rad()], undefined, {})).toMatchObject({ kind: 'eco', value: 17, min: 14, max: 19 });
  });
  it('a pending request shows its value, dashed', () => {
    expect(primarySetpoint(st('comfort'), [rad()], undefined, { comfort: 20.5 })).toMatchObject({ value: 20.5, pending: true });
    expect(primarySetpoint(st('eco'), [rad()], undefined, { eco_delta: 2 })).toMatchObject({ value: 18, pending: true });
  });
  it('Chauffe temporaire → the boost temperature, keeping its end', () => {
    expect(primarySetpoint(st('boost'), [rad()], boost, {})).toMatchObject({ kind: 'boost', value: 22, endsAt: 1_000_000 });
    expect(primarySetpoint(st('boost'), [rad()], { ...boost, restoring: true }, {})).toBeNull();
  });
  it('no stepper: Arrêt, window open, away, offline, read-only, a mode Kelvin cannot set', () => {
    for (const k of ['off', 'window', 'away', 'offline', 'mixed', 'other', 'none'] as const) expect(primarySetpoint(st(k), [rad()], undefined, {}), k).toBeNull();
    expect(primarySetpoint(st('comfort'), [rad({ reachable: false } as never)], undefined, {})).toBeNull();
    expect(primarySetpoint(st('comfort'), [rad({ support: 'readonly' } as never)], undefined, {})).toBeNull();
  });
  it('labels follow the kind', () => {
    expect(['manual', 'comfort', 'eco', 'boost'].map((k) => primaryLabel(k as never))).toEqual(['Manuel', 'Confort', 'Éco', 'Chauffe temp.']);
  });
});

describe('sendPrimary', () => {
  it('eco is sent as the lowering below comfort; boost again with the minutes left; the rest as is', async () => {
    await sendPrimary('salon', { kind: 'eco', value: 17, min: 14, max: 19, pending: false }, 17.5, 20, 0);
    expect(api.roomSetpoint).toHaveBeenLastCalledWith('salon', 'eco', 2.5);
    await sendPrimary('salon', { kind: 'comfort', value: 20, min: 12, max: 28, pending: false }, 20.5, 20, 0);
    expect(api.roomSetpoint).toHaveBeenLastCalledWith('salon', 'comfort', 20.5);
    await sendPrimary('salon', { kind: 'boost', value: 22, min: 7, max: 28, pending: false, endsAt: 7200 }, 22.5, null, 0);
    expect(api.roomBoost).toHaveBeenLastCalledWith('salon', 22.5, 120);
  });
});
