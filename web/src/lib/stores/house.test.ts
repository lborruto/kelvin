import { describe, expect, it } from 'vitest';
import type { Pending, Radiator, Room, Snapshot } from '$lib/api/types';
import { HouseStore } from './house.svelte';
import { LOST, pendingError, UNKNOWN } from '$lib/i18n';
import { toasts } from './toasts.svelte';

const rad = (id: string, room: string, extra: Partial<Radiator> = {}): Radiator => ({
  id, room_id: room, name: 'Radiateur', model: 'HEKLA P', power_w: 1500, temperature: 19.5, mode: 'program',
  target: 20, comfort: 20, eco_delta: 3, eco: 17, effective_setpoint: 17, heating_level: 'eco',
  max_temperature: 28, window_open: false, occupied: false, window_detection: true, presence_detection: false,
  light: { on: false, intensity: 1 }, energy_wh: { total: 1000, t1: 400, t2: 600 }, working_rate: 0, rssi: 100,
  program: {}, ...extra
});
const room = (id: string, ids: string[], extra: Partial<Room> = {}): Room => ({
  id, name: id, radiator_ids: ids, temperature: 20, mode: 'program', target: 20, comfort: 20, eco: 17,
  effective_setpoint: 17, heating_level: 'eco', window_open: false, occupied: false, ...extra
});
const pending = (id: string, extra: Partial<Pending> = {}): Pending => ({
  id, label: 'x', radiator_ids: ['a'], status: 'pending', error: null, created_at: 1, expected: {}, ...extra
});
const snap = (): Snapshot => ({
  house: { rooms: [room('salon', ['a', 'b']), room('ch1', ['c'])], radiators: [rad('a', 'salon'), rad('b', 'salon'), rad('c', 'ch1', { working_rate: 40 })] },
  pending: [], overrides: [], status: { connected: true, last_ok_at: 1, last_error: null }
});

describe('HouseStore', () => {
  it('applies a snapshot and diffs', () => {
    const s = new HouseStore();
    s.applySnapshot(snap());
    expect(s.loaded).toBe(true);
    expect(s.roomRadiators('salon').map((r) => r.id)).toEqual(['a', 'b']);
    s.applyHouse({ rooms: [room('salon', ['a', 'b'], { temperature: 21 })], radiators: [rad('a', 'salon', { temperature: 22 })] });
    expect(s.room('salon')?.temperature).toBe(21);
    expect(s.radiators.a.temperature).toBe(22);
    expect(s.rooms.map((r) => r.id)).toEqual(['salon', 'ch1']);
    expect(s.heatingCount).toBe(1);
  });

  it('merges expected values of active pendings in order', () => {
    const s = new HouseStore();
    s.applySnapshot(snap());
    s.applyPending(pending('p1', { created_at: 1, expected: { a: { mode: 'manual', target: 21 } } }));
    s.applyPending(pending('p2', { created_at: 2, expected: { a: { target: 22 } } }));
    expect(s.expectedFor('a')).toEqual({ mode: 'manual', target: 22 });
    expect(s.roomExpected('salon')).toEqual({});
    s.applyPending(pending('p3', { created_at: 3, radiator_ids: ['a', 'b'], expected: { a: { mode: 'off' }, b: { mode: 'off' } } }));
    expect(s.roomExpected('salon')).toEqual({ mode: 'off' });
  });

  it('confirmed pendings linger briefly, superseded vanish, failed stay until dismissed', () => {
    const timers: Array<() => void> = [];
    const s = new HouseStore((fn) => { timers.push(fn); return 0; });
    s.applySnapshot(snap());
    s.applyPending(pending('p1'));
    s.applyPending(pending('p1', { status: 'confirmed' }));
    expect(s.pending.p1.status).toBe('confirmed');
    timers.forEach((f) => f());
    expect(s.pending.p1).toBeUndefined();
    s.applyPending(pending('p2', { status: 'superseded' }));
    expect(s.pending.p2).toBeUndefined();
    s.applyPending(pending('p3', { status: 'failed', error: 'Pas de confirmation du radiateur.' }));
    expect(s.pendingFor(['a'])?.id).toBe('p3');
    s.dismiss('p3');
    expect(s.pendingFor(['a'])).toBeUndefined();
  });

  it('a resync snapshot keeps local failures', () => {
    const s = new HouseStore();
    s.applySnapshot(snap());
    s.applyPending(pending('p1', { status: 'failed', error: 'x' }));
    s.applySnapshot(snap());
    expect(s.pending.p1?.status).toBe('failed');
  });

  it('finds the override for a room', () => {
    const s = new HouseStore();
    s.applySnapshot(snap());
    s.applyOverrides([
      { id: 'o1', kind: 'away', room_id: null, radiator_ids: ['a', 'b', 'c'], temperature: 12, ends_at: 9e9, restoring: false },
      { id: 'o2', kind: 'boost', room_id: 'ch1', radiator_ids: ['c'], temperature: 21, ends_at: 9e9, restoring: false }
    ]);
    expect(s.overrideFor('ch1')?.id).toBe('o2');
    expect(s.overrideFor('salon')?.id).toBe('o1');
    expect(s.away?.id).toBe('o1');
  });

  it('resync: unseen active pending is dropped if state matches, else failed', () => {
    const s = new HouseStore();
    s.applySnapshot(snap());
    s.applyPending(pending('ok', { expected: { a: { target: 20 } } }));
    s.applyPending(pending('ko', { expected: { a: { target: 25 } } }));
    s.applySnapshot(snap());
    expect(s.pending.ok).toBeUndefined();
    expect(s.pending.ko?.status).toBe('failed');
    expect(s.pending.ko?.error_code).toBe(LOST);
    expect(pendingError(s.pending.ko!)).toBe('Commande non confirmée (connexion perdue).');
  });

  it('a newer command re-sending the same values retires the old failure (no stale Réessayer)', () => {
    const timers: Array<() => void> = [];
    const s = new HouseStore((fn) => { timers.push(fn); return 0; });
    s.applySnapshot(snap());
    s.applyPending(pending('p1', { status: 'failed', error: 'x', created_at: 1, expected: { a: { target: 21 } } }));
    s.applyPending(pending('p2', { created_at: 2, expected: { a: { target: 21.5 } } }));
    s.applyPending(pending('p2', { status: 'confirmed', created_at: 2, expected: { a: { target: 21.5 } } }));
    timers.forEach((f) => f());
    expect(s.pendingFor(['a'])).toBeUndefined();
  });

  it('a failure is kept when the newer command does not cover it', () => {
    const s = new HouseStore();
    s.applySnapshot(snap());
    s.applyPending(pending('p1', { status: 'failed', error: 'x', created_at: 1, expected: { a: { target: 21 } } }));
    s.applyPending(pending('p2', { created_at: 2, expected: { a: { comfort: 19 } } }));
    expect(s.pending.p1?.status).toBe('failed');
    // Nothing to compare (programme): only the same command retires it.
    s.applyPending(pending('p3', { status: 'failed', error: 'x', created_at: 3, label: 'Salon : programme' }));
    s.applyPending(pending('p4', { created_at: 4, label: 'a : veilleuse allumée' }));
    expect(s.pending.p3?.status).toBe('failed');
    s.applyPending(pending('p5', { created_at: 5, label: 'Salon : programme' }));
    expect(s.pending.p3).toBeUndefined();
  });

  it('resync: a command with no expected values missing from the snapshot is unknown, never success', () => {
    const s = new HouseStore();
    s.applySnapshot(snap());
    s.applyPending(pending('prog', { label: 'Salon : programme', expected: {} }));
    s.applySnapshot(snap());
    expect(s.pending.prog?.status).toBe('failed');
    expect(s.pending.prog?.error_code).toBe(UNKNOWN);
    expect(toasts.items.some((t) => /Salon : programme\s: résultat inconnu/.test(t.text()))).toBe(true);
  });

  it('resync: the real outcome from snapshot.recent wins over the guess', () => {
    const timers: Array<() => void> = [];
    const s = new HouseStore((fn) => { timers.push(fn); return 0; });
    s.applySnapshot(snap());
    s.applyPending(pending('ok', { expected: {} }));
    s.applyPending(pending('ko', { expected: { a: { target: 20 } } }));
    s.applyPending(pending('sup', { expected: { a: { target: 25 } } }));
    s.applySnapshot({
      ...snap(),
      recent: [
        pending('ok', { status: 'confirmed' }),
        pending('ko', { status: 'failed', error: 'Le radiateur a refusé la commande.' }),
        pending('sup', { status: 'superseded' })
      ]
    });
    expect(s.pending.ok?.status).toBe('confirmed');
    expect(s.pending.ko?.error).toBe('Le radiateur a refusé la commande.');
    expect(s.pending.sup).toBeUndefined();
    timers.forEach((f) => f());
    expect(s.pending.ok).toBeUndefined();
  });

  it('ignores an active update after a terminal status', () => {
    const s = new HouseStore();
    s.applyPending(pending('p1', { status: 'failed', error: 'x' }));
    s.applyPending(pending('p1', { status: 'pending' }));
    expect(s.pending.p1.status).toBe('failed');
  });

  describe('defaultRoomId', () => {
    const three = (): Snapshot => ({
      ...snap(),
      house: {
        rooms: [room('salon', ['a']), room('ch1', ['b']), room('ch2', ['c'])],
        radiators: [rad('a', 'salon'), rad('b', 'ch1'), rad('c', 'ch2')]
      }
    });
    it('is null before any room is known, else the first room when none needs attention', () => {
      const s = new HouseStore();
      expect(s.defaultRoomId).toBeNull();
      s.applySnapshot(three());
      expect(s.defaultRoomId).toBe('salon');
    });
    it('prefers the first room with an open window', () => {
      const s = new HouseStore();
      const x = three();
      x.house.rooms[2] = room('ch2', ['c'], { window_open: true });
      s.applySnapshot(x);
      expect(s.defaultRoomId).toBe('ch2');
    });
    it('prefers a room with an active pending, but not a failed or confirmed one', () => {
      const s = new HouseStore();
      s.applySnapshot(three());
      s.applyPending(pending('p1', { radiator_ids: ['c'], status: 'failed' }));
      expect(s.defaultRoomId).toBe('salon');
      s.applyPending(pending('p2', { radiator_ids: ['b'], status: 'sending' }));
      expect(s.defaultRoomId).toBe('ch1');
    });
    it('prefers a room under an override', () => {
      const s = new HouseStore();
      s.applySnapshot({
        ...three(),
        overrides: [{ id: 'o1', kind: 'boost', room_id: 'ch2', radiator_ids: ['c'], temperature: 22, ends_at: 9, restoring: false }]
      } as never);
      expect(s.defaultRoomId).toBe('ch2');
    });
  });
});

describe('roomHeating', () => {
  it('is true when any radiator of the room draws power now', () => {
    const s = new HouseStore();
    const r = (id: string, working_rate: number | null) => ({ id, room_id: 'x', working_rate, program: {} }) as never;
    s.applySnapshot({
      house: {
        rooms: [{ id: 'x', name: 'X', radiator_ids: ['a', 'b'] } as never, { id: 'y', name: 'Y', radiator_ids: ['c'] } as never],
        radiators: [r('a', 0), r('b', 35), r('c', null)]
      },
      pending: [], overrides: [], status: { connected: true, last_ok_at: 1, last_error: null }
    });
    expect([s.roomHeating('x'), s.roomHeating('y'), s.heatingCount]).toEqual([true, false, 1]);
  });
});
