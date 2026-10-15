import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pending } from '$lib/api/types';
import { house } from '$lib/stores/house.svelte';
import { toasts } from '$lib/stores/toasts.svelte';
import { installUndo, runSetup } from './setupActions';

const setupPending = (status: Pending['status']): Pending =>
  ({
    id: 's1', kind: 'setup', label: 'Nouvelle pièce « Bureau »', label_code: 'setup_room_create',
    label_params: { label: 'Bureau' }, radiator_ids: [], room_id: 'p-new', status, error: null, error_code: null,
    error_params: {}, reason_code: null, created_at: 1, expected: {}, progress: { done: 0, total: 1 }
  }) as Pending;

beforeEach(() => {
  house.reset();
  for (const t of toasts.items) toasts.remove(t.id);
  installUndo();
});

describe('runSetup', () => {
  it('offers « Annuler » once Cozytouch confirms, and the undo sends the inverse write', async () => {
    const undo = vi.fn().mockResolvedValue({ pending: null });
    await runSetup(async () => ({ pending: setupPending('pending') }), undo);
    expect(toasts.items).toHaveLength(0);
    house.applyPending(setupPending('confirmed'));
    expect(toasts.items).toHaveLength(1);
    const t = toasts.items[0];
    expect(t.kind).toBe('info');
    expect(t.action?.label()).toBe('Annuler');
    t.action!.run();
    await Promise.resolve();
    expect(undo).toHaveBeenCalledOnce();
  });

  it('offers nothing when the write failed', async () => {
    const undo = vi.fn();
    await runSetup(async () => ({ pending: setupPending('pending') }), undo);
    house.applyPending({ ...setupPending('failed'), error_code: 'setup_failed' } as Pending);
    expect(toasts.items.filter((x) => x.action)).toHaveLength(0);
  });
});
