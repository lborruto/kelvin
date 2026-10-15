import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './api/client';
import { retry, run } from './actions';
import { house } from './stores/house.svelte';
import { toasts } from './stores/toasts.svelte';

const p = (id: string, status = 'pending') => ({
  id, label: 'x', radiator_ids: ['a'], status, error: null, created_at: 1, expected: {}
});

describe('actions', () => {
  beforeEach(() => {
    house.pending = {};
    toasts.items = [];
  });

  it('run applies the returned pending', async () => {
    const res = await run(async () => ({ pending: p('p1') as never }));
    expect(res?.id).toBe('p1');
    expect(house.pending.p1).toBeDefined();
  });

  it('run turns API errors into a toast and returns null', async () => {
    const res = await run(async () => { throw new ApiError(422, 'La consigne se règle par pas de 0,5 °C.'); });
    expect(res).toBeNull();
    expect(toasts.items[0].text()).toBe('La consigne se règle par pas de 0,5 °C.');
  });

  it('retry dismisses the failure and re-sends the same request', async () => {
    const fn = vi.fn().mockResolvedValueOnce({ pending: p('p1') }).mockResolvedValueOnce({ pending: p('p2') });
    await run(fn);
    house.applyPending(p('p1', 'failed') as never);
    await retry('p1');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(house.pending.p1).toBeUndefined();
    expect(house.pending.p2).toBeDefined();
  });

  it('retry without a stored replay keeps the failure and toasts', async () => {
    house.applyPending(p('ghost', 'failed') as never);
    expect(await retry('ghost')).toBeNull();
    expect(house.pending.ghost).toBeDefined();
    expect(toasts.items[0].text()).toContain('Impossible de réessayer');
  });

  it('a coded error toasts in the active language, even after a switch', async () => {
    const { applyLocale } = await import('$lib/i18n');
    await run(async () => {
      throw new ApiError(422, 'La consigne se règle par pas de 0,5 °C.', 'temp_step', { kind: 'manual' });
    });
    expect(toasts.items[0].text()).toBe('La consigne se règle par pas de 0,5\u00a0°C.');
    applyLocale('en');
    expect(toasts.items[0].text()).toBe('The setpoint goes in steps of 0.5\u00a0°C.');
  });
});

describe('run with an error handler', () => {
  it('a handled error shows no toast; an unhandled one does', async () => {
    const before = toasts.items.length;
    await run(() => Promise.reject(new ApiError(409, 'x', 'program_changed_elsewhere')), { onError: () => true });
    expect(toasts.items.length).toBe(before);
    await run(() => Promise.reject(new ApiError(500, 'y')), { onError: () => false });
    expect(toasts.items.length).toBe(before + 1);
  });
});
