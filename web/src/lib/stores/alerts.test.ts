import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '$lib/api/client';
import { AlertsStore } from './alerts.svelte';

vi.mock('$lib/api/client', () => ({ api: { alerts: vi.fn(), dismissAlert: vi.fn() }, ApiError: class extends Error {} }));

const one = { id: 7, kind: 'linky_stalled', severity: 'warn', params: {}, first_seen: 0, last_seen: 0, resolved_at: null, dismissed: false };

beforeEach(() => {
  vi.mocked(api.alerts).mockReset().mockResolvedValue([one] as never);
  vi.mocked(api.dismissAlert).mockReset().mockResolvedValue(undefined as never);
});

describe('AlertsStore', () => {
  it('loads on a changed summary only', async () => {
    const s = new AlertsStore();
    s.applySummary({ active: 1, highest: 'warn' });
    await vi.waitFor(() => expect(s.list).toHaveLength(1));
    s.applySummary({ active: 1, highest: 'warn' });
    expect(api.alerts).toHaveBeenCalledTimes(1);
  });
  it('dismiss removes the alert at once and asks the server', async () => {
    const s = new AlertsStore();
    await s.load();
    await s.dismiss(7);
    expect(api.dismissAlert).toHaveBeenCalledWith(7);
    expect(s.list).toEqual([]);
  });
  it('of() filters by kind and predicate', async () => {
    const s = new AlertsStore();
    await s.load();
    expect(s.of(['linky_stalled'])).toHaveLength(1);
    expect(s.of(['price_change'])).toHaveLength(0);
    expect(s.of(['linky_stalled'], () => false)).toHaveLength(0);
  });
  it('reset forgets everything', async () => {
    const s = new AlertsStore();
    await s.load();
    s.reset();
    expect([s.list, s.summary]).toEqual([null, { active: 0, highest: null }]);
  });
});
