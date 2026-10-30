import { describe, expect, it, vi } from 'vitest';
import type { Override, Radiator } from './api/types';
import { nextComfortAt, primaryLabel, primarySetpoint, sendPrimary } from './setpoint';
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
  it('Programme → always Confort (owner, 2026-10-29): in comfort as it runs; in eco too, waiting for the next comfort slot', () => {
    expect(primarySetpoint(st('comfort'), [rad()], undefined, {})).toEqual({ kind: 'comfort', value: 20, min: 12, max: 28, pending: false });
    expect(primarySetpoint(st('eco'), [rad()], undefined, {})).toEqual({ kind: 'comfort', value: 20, min: 12, max: 28, pending: false, waiting: true });
  });
  it('a pending request shows its value, dashed; an eco change is no −/+ value', () => {
    expect(primarySetpoint(st('comfort'), [rad()], undefined, { comfort: 20.5 })).toMatchObject({ value: 20.5, pending: true });
    expect(primarySetpoint(st('eco'), [rad()], undefined, { comfort: 21 })).toMatchObject({ kind: 'comfort', value: 21, pending: true, waiting: true });
    expect(primarySetpoint(st('eco'), [rad()], undefined, { eco_delta: 2 })).toMatchObject({ kind: 'comfort', value: 20, pending: false });
  });
  it('Chauffe temporaire → the boost temperature, keeping its end', () => {
    expect(primarySetpoint(st('boost'), [rad()], boost, {})).toMatchObject({ kind: 'boost', value: 22, endsAt: 1_000_000 });
    expect(primarySetpoint(st('boost'), [rad()], { ...boost, restoring: true }, {})).toBeNull();
  });
  it('a boost resend on its way is dashed like any setpoint', () => {
    expect(primarySetpoint(st('boost'), [rad()], boost, {}, true)).toMatchObject({ kind: 'boost', pending: true });
    expect(primarySetpoint(st('boost'), [rad()], boost, {})).toMatchObject({ pending: false });
  });
  it('Confort is the one of the radiators it can reach, not of an offline one', () => {
    const off = rad({ id: 'b', comfort: 23, reachable: false } as never);
    expect(primarySetpoint(st('eco'), [rad(), off], undefined, {})).toMatchObject({ kind: 'comfort', value: 20 });
  });
  it('no stepper: Arrêt, window open, away, offline, read-only, a mode Kelvin cannot set, no Confort to set', () => {
    for (const k of ['off', 'window', 'away', 'offline', 'mixed', 'other', 'none'] as const) expect(primarySetpoint(st(k), [rad()], undefined, {}), k).toBeNull();
    expect(primarySetpoint(st('comfort'), [rad({ reachable: false } as never)], undefined, {})).toBeNull();
    expect(primarySetpoint(st('comfort'), [rad({ support: 'readonly' } as never)], undefined, {})).toBeNull();
    const noComfort = rad({ capabilities: { ...rad().capabilities, comfort: null } } as never);
    expect(primarySetpoint(st('eco'), [noComfort], undefined, {})).toBeNull();
  });
  it('labels follow the kind', () => {
    expect(['manual', 'comfort', 'boost'].map((k) => primaryLabel(k as never))).toEqual(['Manuel', 'Confort', 'Chauffe temp.']);
  });
});

describe('nextComfortAt', () => {
  it('during eco, when the next comfort slot starts; during comfort or without a programme, null', () => {
    const week = { monday: [{ start: '06:00', end: '08:00' }, { start: '17:30', end: '22:00' }], tuesday: [{ start: '06:00', end: '08:00' }, { start: '17:30', end: '22:00' }], wednesday: [{ start: '06:00', end: '08:00' }, { start: '17:30', end: '22:00' }] };
    // Wednesday 28 October 2026, 13:00 in Paris (UTC+1): eco until 17:30.
    const at = nextComfortAt(week, Date.parse('2026-10-28T12:00:00Z'));
    expect(at).toBe(Date.parse('2026-10-28T16:30:00Z'));
    expect(nextComfortAt(week, Date.parse('2026-10-28T17:00:00Z'))).toBeNull(); // 18:00, comfort runs
    expect(nextComfortAt(null, Date.parse('2026-10-28T12:00:00Z'))).toBeNull();
  });
});

describe('sendPrimary', () => {
  it('Confort and Manuel as is, clamped; boost again with the minutes left', async () => {
    await sendPrimary('salon', { kind: 'comfort', value: 20, min: 12, max: 28, pending: false, waiting: true }, 20.5, 0);
    expect(api.roomSetpoint).toHaveBeenLastCalledWith('salon', 'comfort', 20.5);
    await sendPrimary('salon', { kind: 'manual', value: 20, min: 7, max: 28, pending: false }, 30, 0);
    expect(api.roomSetpoint).toHaveBeenLastCalledWith('salon', 'manual', 28);
    await sendPrimary('salon', { kind: 'boost', value: 22, min: 7, max: 28, pending: false, endsAt: 7200 }, 22.5, 0);
    expect(api.roomBoost).toHaveBeenLastCalledWith('salon', 22.5, 120);
  });
});
