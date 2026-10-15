import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '$lib/api/client';
import type { SessionInfo } from '$lib/api/types';
import { forEachLocale } from '$lib/i18n/testing';
import SessionsPanel, { deviceName } from './SessionsPanel.svelte';

vi.mock('$lib/api/client', () => ({
  api: { sessions: vi.fn(), revokeSession: vi.fn(), revokeOtherSessions: vi.fn() },
  ApiError: class extends Error {
    constructor(public status: number, message: string, public code: string | null = null, public params = {}) {
      super(message);
    }
  }
}));

const now = Date.now() / 1000;
const rows: SessionInfo[] = [
  { id: '0000000000000001', created: now - 900, last_seen: now - 60, browser: 'Firefox', os: 'Linux', current: true },
  { id: '0000000000000002', created: now - 9000, last_seen: now - 7200, browser: 'Safari', os: 'iPhone', current: false },
  { id: '0000000000000003', created: now - 99000, last_seen: now - 90000, browser: null, os: null, current: false }
];

beforeEach(() => {
  vi.mocked(api.sessions).mockReset().mockResolvedValue(rows);
  vi.mocked(api.revokeSession).mockReset().mockResolvedValue(undefined);
  vi.mocked(api.revokeOtherSessions).mockReset().mockResolvedValue({ revoked: 2 });
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false;
  };
});

describe('SessionsPanel', () => {
  it('a skeleton, then one row per device; the current one cannot be signed out here', async () => {
    const { container } = render(SessionsPanel);
    expect(container.querySelector('.skeleton')).not.toBeNull();
    expect(await screen.findByText('Firefox · Linux')).toBeInTheDocument();
    expect(screen.getByText('Safari · iPhone')).toBeInTheDocument();
    expect(screen.getByText('Navigateur inconnu')).toBeInTheDocument();
    expect(screen.getByText('cet appareil')).toBeInTheDocument();
    expect(screen.getByText(/dernière activité il y a 2\sh/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Déconnecter Firefox · Linux' })).toBeNull();
  });

  it('shows when each device signed in', async () => {
    render(SessionsPanel);
    await screen.findByText('Firefox · Linux');
    expect(screen.getAllByText(/^connecté le /)).toHaveLength(3);
  });

  it('signs out one device and removes its row', async () => {
    render(SessionsPanel);
    await fireEvent.click(await screen.findByRole('button', { name: 'Déconnecter Safari · iPhone' }));
    expect(api.revokeSession).toHaveBeenCalledWith('0000000000000002');
    await waitFor(() => expect(screen.queryByText('Safari · iPhone')).toBeNull());
  });

  it('a device already gone is removed without an error', async () => {
    vi.mocked(api.revokeSession).mockRejectedValue(new ApiError(404, 'x', 'session_unknown'));
    render(SessionsPanel);
    await fireEvent.click(await screen.findByRole('button', { name: 'Déconnecter Safari · iPhone' }));
    await waitFor(() => expect(screen.queryByText('Safari · iPhone')).toBeNull());
  });

  it('« Déconnecter les autres appareils » asks first, Annuler focused, then reloads the list', async () => {
    render(SessionsPanel);
    await fireEvent.click(await screen.findByRole('button', { name: 'Déconnecter les autres appareils' }));
    const dialog = screen.getByRole('dialog', { hidden: true });
    expect(dialog).toHaveAttribute('open');
    expect(document.activeElement).toHaveTextContent('Annuler');
    vi.mocked(api.sessions).mockResolvedValue([rows[0]]);
    await fireEvent.click(screen.getByRole('button', { name: 'Déconnecter', hidden: true }));
    expect(api.revokeOtherSessions).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByText('Safari · iPhone')).toBeNull());
    expect(screen.queryByRole('button', { name: 'Déconnecter les autres appareils' })).toBeNull();
  });

  it('a failed load says so and offers to try again', async () => {
    vi.mocked(api.sessions).mockRejectedValueOnce(new ApiError(0, '', 'network'));
    render(SessionsPanel);
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger les appareils connectés.');
    await fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('Firefox · Linux')).toBeInTheDocument();
  });
});

forEachLocale((l) => {
  it('device names and actions', async () => {
    render(SessionsPanel);
    await screen.findByText('Firefox · Linux');
    expect(deviceName(rows[2])).toBe(l === 'fr' ? 'Navigateur inconnu' : 'Unknown browser');
    expect(screen.getByText(l === 'fr' ? 'cet appareil' : 'this device')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: l === 'fr' ? 'Déconnecter les autres appareils' : 'Sign out other devices' })).toBeInTheDocument();
  });
});
