import { fireEvent, render, screen } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '$lib/api/client';
import type { SyncStatus } from '$lib/api/types';
import { applyLocale } from '$lib/i18n';
import { house } from '$lib/stores/house.svelte';
import { toasts } from '$lib/stores/toasts.svelte';
import SyncLine from './SyncLine.svelte';
import { setupFixture } from './fixture';

vi.mock('$lib/api/client', async (importActual) => {
  // The real ApiError: errorText (already loaded by the test setup) checks against that class.
  const actual = await importActual<typeof import('$lib/api/client')>();
  return { api: { syncSetup: vi.fn(), setupDevices: vi.fn() }, ApiError: actual.ApiError };
});

const now = Date.parse('2026-10-14T10:00:00Z'); // 12:00 in Paris
const sync = (extra: Partial<SyncStatus> = {}): SyncStatus => ({
  used: 1, limit: 3, next_possible_at: null, last_full_at: now / 1000 - 3 * 3600, stale_since: null,
  requested: false, next_daily_at: Date.parse('2026-10-15T02:30:00Z') / 1000, ...extra
});

beforeEach(() => {
  vi.clearAllMocks();
  for (const t of toasts.items) toasts.remove(t.id);
  house.applySetup(setupFixture());
});
afterEach(() => applyLocale('fr'));

describe('SyncLine', () => {
  it('says when Kelvin last read Cozytouch, how many full reads are used, and the daily time', () => {
    render(SyncLine, { sync: sync(), now });
    expect(screen.getByText(/^Synchronisé avec Cozytouch il y a 3\sh$/)).toBeInTheDocument();
    // Testing Library collapses every \s (no-break spaces included) in the page text, not in the query.
    expect(screen.getByText('Lectures complètes : 1 sur 3 en 24 h')).toBeInTheDocument();
    expect(screen.getByText('Synchronisation automatique chaque jour à 04:30.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Synchroniser' })).toHaveAttribute('aria-disabled', 'false');
  });

  it('asks for one sync and shows it running', async () => {
    vi.mocked(api.syncSetup).mockResolvedValue({ sync: sync({ requested: true }) });
    render(SyncLine, { sync: sync(), now });
    await fireEvent.click(screen.getByRole('button', { name: 'Synchroniser' }));
    expect(api.syncSetup).toHaveBeenCalledOnce();
    expect(house.setup?.sync?.requested).toBe(true);
  });

  it('when the budget is spent, says when the next sync is possible and does not send', async () => {
    render(SyncLine, { sync: sync({ used: 3, next_possible_at: Date.parse('2026-10-14T12:10:00Z') / 1000 }), now });
    expect(screen.getByText(/prochaine synchronisation possible à 14:10/)).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Synchroniser' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    await fireEvent.click(button);
    expect(api.syncSetup).not.toHaveBeenCalled();
  });

  it('a refusal from the server is shown and the status reloaded', async () => {
    vi.mocked(api.syncSetup).mockRejectedValue(
      new ApiError(429, '', 'setup_sync_spent', { used: 3, limit: 3, next_at: 1 })
    );
    vi.mocked(api.setupDevices).mockResolvedValue(setupFixture());
    render(SyncLine, { sync: sync(), now });
    await fireEvent.click(screen.getByRole('button', { name: 'Synchroniser' }));
    flushSync();
    expect(toasts.items.at(-1)?.text()).toMatch(/lectures complètes de Cozytouch/);
    expect(api.setupDevices).toHaveBeenCalledOnce();
  });

  it('says that rooms changed in the Cozytouch app will show after the next sync', () => {
    render(SyncLine, { sync: sync({ stale_since: now / 1000 - 60 }), now });
    expect(screen.getByText(/modifiées dans l’application Cozytouch/)).toBeInTheDocument();
  });

  it('at 2 of 3 the last read is kept for a restart: says so, not « all used »', () => {
    render(SyncLine, { sync: sync({ used: 2, next_possible_at: Date.parse('2026-10-14T12:10:00Z') / 1000 }), now });
    expect(screen.getByText(/la dernière reste pour un redémarrage/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Synchroniser' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('speaks English', () => {
    applyLocale('en');
    render(SyncLine, { sync: sync(), now });
    expect(screen.getByRole('button', { name: 'Sync' })).toBeInTheDocument();
    expect(screen.getByText('Full reads: 1 of 3 in 24 hours')).toBeInTheDocument();
  });
});
