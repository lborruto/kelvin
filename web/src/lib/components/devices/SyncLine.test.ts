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

// The Fiche as a desktop card (a phone opens the same rows in a sheet).
vi.mock('$lib/media.svelte', () => ({ desktop: { matches: true } }));

/** Opens the line's Fiche (pinned): the budget, the daily time and the spent reason live there. */
async function fiche() {
  await fireEvent.click(screen.getByRole('button', { name: /^(Synchronisé avec Cozytouch|Synced with Cozytouch|Pas encore|Not synced)/ }));
}

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
afterEach(() => {
  applyLocale('fr');
  document.querySelectorAll('.fiche').forEach((n) => n.remove());
});

describe('SyncLine', () => {
  it('says when Kelvin last read Cozytouch; its Fiche: full reads used, the daily time, the last full read', async () => {
    render(SyncLine, { sync: sync(), now });
    expect(screen.getByText(/^Synchronisé avec Cozytouch il y a 3\sh$/)).toBeInTheDocument();
    await fiche();
    expect(screen.getByText('Dernière synchronisation')).toBeInTheDocument();
    // Testing Library collapses every \s (no-break spaces included) in the page text, not in the query.
    expect(screen.getByText('Synchronisations : 1 sur 3 en 24 h')).toBeInTheDocument();
    expect(screen.getByText('Synchronisation automatique chaque jour à 04:30.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Synchroniser' })).toHaveAttribute('aria-disabled', 'false');
  });

  it('asks for one sync and shows it running at once', async () => {
    let answer!: (v: unknown) => void;
    vi.mocked(api.syncSetup).mockReturnValue(new Promise((r) => (answer = r)) as never);
    vi.mocked(api.setupDevices).mockResolvedValue({ ...setupFixture(), sync: sync({ requested: true }) });
    render(SyncLine, { sync: sync(), now });
    await fireEvent.click(screen.getByRole('button', { name: 'Synchroniser' }));
    expect(api.syncSetup).toHaveBeenCalledOnce();
    expect(house.setup?.sync?.requested).toBe(true); // optimistic, before the 202
    answer({ sync: sync({ requested: true }) });
    await vi.waitFor(() => expect(api.setupDevices).toHaveBeenCalledOnce());
  });

  it('a layout event that lands before the 202 is never overwritten by it (review T10-1)', async () => {
    const done = sync({ used: 2, requested: false, last_full_at: now / 1000 });
    let answer!: (v: unknown) => void;
    vi.mocked(api.syncSetup).mockReturnValue(new Promise((r) => (answer = r)) as never);
    vi.mocked(api.setupDevices).mockResolvedValue({ ...setupFixture(), sync: done });
    render(SyncLine, { sync: sync(), now });
    await fireEvent.click(screen.getByRole('button', { name: 'Synchroniser' }));
    house.applySetup({ ...setupFixture(), sync: done }); // the pump read at once: SSE layout
    answer({ sync: sync({ requested: true }) }); // the stale 202 arrives after it
    await vi.waitFor(() => expect(api.setupDevices).toHaveBeenCalledOnce());
    await Promise.resolve();
    expect(house.setup?.sync).toEqual(done);
  });

  it('when the budget is spent, says when the next sync is possible and does not send', async () => {
    render(SyncLine, { sync: sync({ used: 3, next_possible_at: Date.parse('2026-10-14T12:10:00Z') / 1000 }), now });
    const button = screen.getByRole('button', { name: 'Synchroniser' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAccessibleDescription('possible à 14:10');
    await fiche();
    expect(screen.getByText(/prochaine possible à 14:10/)).toBeInTheDocument();
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
    expect(toasts.items.at(-1)?.text()).toMatch(/Plus de synchronisation disponible/);
    expect(api.setupDevices).toHaveBeenCalledOnce();
  });

  it('says that rooms changed in the Cozytouch app will show after the next sync', () => {
    render(SyncLine, { sync: sync({ stale_since: now / 1000 - 60 }), now });
    expect(screen.getByText(/modifiées dans l’application Cozytouch/)).toBeInTheDocument();
  });

  it('at 2 of 3 the last read is kept for a restart: says so, not « all used »', async () => {
    render(SyncLine, { sync: sync({ used: 2, next_possible_at: Date.parse('2026-10-14T12:10:00Z') / 1000 }), now });
    await fiche();
    expect(screen.getByText(/la dernière reste pour un redémarrage/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Synchroniser' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('speaks English', async () => {
    applyLocale('en');
    render(SyncLine, { sync: sync(), now });
    expect(screen.getByRole('button', { name: 'Sync' })).toBeInTheDocument();
    await fiche();
    expect(screen.getByText('Syncs: 1 of 3 in 24 h')).toBeInTheDocument();
  });
});
