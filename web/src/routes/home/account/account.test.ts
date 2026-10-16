import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { goto } from '$app/navigation';
import { api } from '$lib/api/client';
import { applyLocale } from '$lib/i18n';
import { auth } from '$lib/stores/auth.svelte';
import { history } from '$lib/stores/history.svelte';
import { house } from '$lib/stores/house.svelte';
import { toasts } from '$lib/stores/toasts.svelte';
import Page from './+page.svelte';

vi.mock('$lib/api/client', () => ({
  api: {
    sessions: vi.fn().mockResolvedValue([]),
    revokeSession: vi.fn(),
    revokeOtherSessions: vi.fn(),
    mcpTokens: vi.fn().mockResolvedValue({ enabled: true, endpoint_path: '/mcp', tokens: [] }),
    mcpAudit: vi.fn().mockResolvedValue([]),
    createMcpToken: vi.fn(),
    revokeMcpToken: vi.fn(),
    logout: vi.fn().mockResolvedValue({ email: null, logged_in: false })
  },
  ApiError: class extends Error {}
}));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  toasts.items = [];
  auth.email = 'demo@kelvin.local';
  auth.loggedIn = true;
  auth.server = { id: 'sauter_cozytouch', name: 'Sauter Cozytouch', tier: 'cozytouch', default: true };
  house.applySnapshot({
    house: { rooms: [], radiators: [] },
    pending: [],
    overrides: [{ id: 'o1', kind: 'boost', room_id: 'p-salon', radiator_ids: ['a'], temperature: 21, ends_at: 2e9, restoring: false }],
    status: { connected: true, last_ok_at: Date.now() / 1000, last_error: null }
  });
});
afterEach(() => {
  applyLocale('fr');
  auth.server = null;
});

describe('Maison › Compte', () => {
  it('the account, its server, the Cozytouch status and the signed-in devices (#sessions)', async () => {
    render(Page);
    expect(screen.getByRole('heading', { level: 1, name: 'Compte' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Réglages' })).toHaveAttribute('href', '/home');
    expect(screen.getAllByText('demo@kelvin.local').length).toBeGreaterThan(0);
    expect(screen.getByText('Sauter Cozytouch')).toBeInTheDocument();
    expect(screen.getByText('Fixé à la première connexion.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Cozytouch · / })).toBeInTheDocument(); // the SourceLine (its Fiche)
    expect(document.getElementById('sessions')).toBeInTheDocument();
    // « Accès MCP » follows the signed-in devices once their list is known, and « Se déconnecter » comes last
    // once the tokens are known, so no list's height ever pushes what is below it (CLS).
    expect(screen.queryByRole('button', { name: 'Se déconnecter' })).toBeNull();
    expect(document.getElementById('mcp')).toBeNull();
    const out = await screen.findByRole('button', { name: 'Se déconnecter' });
    const mcp = document.getElementById('mcp')!;
    expect(screen.getByRole('heading', { level: 2, name: 'Accès MCP' })).toBeInTheDocument();
    expect(document.getElementById('sessions')!.compareDocumentPosition(mcp) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(mcp.compareDocumentPosition(out) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('logs out to the login screen and empties the stores', async () => {
    history.data = { k: [{ t: 1, v: 20, s: 17 }] };
    render(Page);
    await fireEvent.click(await screen.findByRole('button', { name: 'Se déconnecter' }));
    expect(api.logout).toHaveBeenCalled();
    await vi.waitFor(() => expect(goto).toHaveBeenCalledWith('/login', { replaceState: true }));
    expect(house.overrides).toEqual([]);
    expect(house.loaded).toBe(false);
    expect(history.data).toEqual({});
  });

  it('stays with a toast when the logout fails', async () => {
    vi.mocked(api.logout).mockRejectedValueOnce(new Error('network'));
    render(Page);
    await fireEvent.click(await screen.findByRole('button', { name: 'Se déconnecter' }));
    await vi.waitFor(() => expect(toasts.items.map((t) => t.text())).toContain('Déconnexion impossible. Réessayez.'));
    expect(goto).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Se déconnecter' })).toHaveAttribute('aria-disabled', 'false');
  });

  it('an experimental server carries its support chip', () => {
    auth.server = { id: 'x', name: 'Hitachi Hi Kumo', tier: 'experimental', default: false };
    render(Page);
    expect(screen.getByText('Hitachi Hi Kumo')).toBeInTheDocument();
    expect(screen.getByText(/Expérimental/)).toBeInTheDocument();
  });

  it('in English, with the Cozytouch error by code', async () => {
    applyLocale('en');
    house.status = { connected: false, last_ok_at: null, last_error: 'QUOTA_EXCEEDED', last_error_code: 'quota' };
    house.connection = 'open';
    render(Page);
    expect(screen.getByRole('heading', { level: 1, name: 'Account' })).toBeInTheDocument();
    expect(screen.getByText('Cozytouch request limit reached.')).toHaveAttribute('title', 'QUOTA_EXCEEDED');
    expect(screen.getByRole('button', { name: /Unreachable/ })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });
});
