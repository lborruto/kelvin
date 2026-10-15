import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
    houseAway: vi.fn().mockResolvedValue({ pending: null }),
    houseProgram: vi.fn().mockResolvedValue({ pending: null }),
    houseOff: vi.fn().mockResolvedValue({ pending: null }),
    cancelOverride: vi.fn().mockResolvedValue({ pending: null }),
    settings: vi.fn().mockResolvedValue({ tariff: null, prefill: null }),
    linkyStatus: vi.fn().mockResolvedValue({
      configured: false, prm: null, token_set: false, simulator: false, state: 'off', message: null,
      last_day: null, last_ok_at: null, retry_at: null, calls_today: 0, budget: 10, consent_expires: null
    }),
    putTariff: vi.fn(),
    putLinky: vi.fn(),
    logout: vi.fn().mockResolvedValue({ email: null, logged_in: false }),
    me: vi.fn().mockResolvedValue({ email: 'demo@kelvin.local', logged_in: true })
  },
  ApiError: class extends Error {}
}));

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  auth.email = null;
  toasts.items = [];
  house.houseCommandId = null;
  house.applySnapshot({
    house: { rooms: [], radiators: [] },
    pending: [],
    overrides: [{ id: 'o1', kind: 'boost', room_id: 'p-salon', radiator_ids: ['a'], temperature: 21, ends_at: 2e9, restoring: false }],
    status: { connected: true, last_ok_at: Date.now() / 1000, last_error: null }
  });
});

describe('Maison', () => {
  it('starts an absence with a local date and a temperature', async () => {
    render(Page);
    const until = screen.getByLabelText(/Jusqu’au/);
    await fireEvent.input(until, { target: { value: '2026-10-20T18:00' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Activer l’absence' }));
    expect(api.houseAway).toHaveBeenCalledWith('2026-10-20T18:00', 12);
  });

  it('refuses an absence ending in the past', async () => {
    render(Page);
    await fireEvent.input(screen.getByLabelText(/Jusqu’au/), { target: { value: '2020-01-01T10:00' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Activer l’absence' }));
    expect(screen.getByText('La fin doit être dans le futur.')).toBeInTheDocument();
    expect(api.houseAway).not.toHaveBeenCalled();
  });

  it('lists active overrides with a cancel action', async () => {
    render(Page);
    await fireEvent.click(screen.getByRole('button', { name: 'Annuler Forçage — Toute la maison' }));
    expect(api.cancelOverride).toHaveBeenCalledWith('o1');
  });

  it('puts every radiator back in programme', async () => {
    render(Page);
    await fireEvent.click(screen.getByRole('button', { name: 'Tout remettre en programme' }));
    expect(api.houseProgram).toHaveBeenCalled();
  });

  it('house-wide actions show their progress on Maison and block a re-send', async () => {
    vi.mocked(api.houseProgram).mockResolvedValueOnce({
      pending: { id: 'h1', label: 'Tout en programme', radiator_ids: ['a'], status: 'pending', error: null, created_at: 1, expected: {} }
    } as never);
    render(Page);
    const btn = screen.getByRole('button', { name: 'Tout remettre en programme' });
    await fireEvent.click(btn);
    expect(await screen.findByText('Envoi…')).toBeInTheDocument();
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('button', { name: 'Tout éteindre' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('shows the Cozytouch status', async () => {
    render(Page);
    expect(await screen.findByText('Connecté')).toBeInTheDocument();
  });

  it('shows the account and logs out to the login screen', async () => {
    auth.email = 'demo@kelvin.local';
    render(Page);
    expect(await screen.findByText('demo@kelvin.local')).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Se déconnecter' }));
    expect(api.logout).toHaveBeenCalled();
    await vi.waitFor(() => expect(goto).toHaveBeenCalledWith('/login', { replaceState: true }));
  });

  it('stays on Maison with a toast when the logout fails, and logs out when the session is already gone', async () => {
    auth.email = 'demo@kelvin.local';
    vi.mocked(api.logout).mockRejectedValueOnce(new Error('network'));
    render(Page);
    await fireEvent.click(await screen.findByRole('button', { name: 'Se déconnecter' }));
    await vi.waitFor(() => expect(toasts.items.map((t) => t.text())).toContain('Déconnexion impossible. Réessayez.'));
    expect(goto).not.toHaveBeenCalled();
    expect(auth.email).toBe('demo@kelvin.local');
    expect(screen.getByRole('button', { name: 'Se déconnecter' })).toHaveAttribute('aria-disabled', 'false');
  });

  it('empties the house and history stores on logout', async () => {
    auth.email = 'demo@kelvin.local';
    history.data = { k: [{ t: 1, v: 20, s: 17 }] };
    render(Page);
    expect(house.overrides).toHaveLength(1);
    await fireEvent.click(await screen.findByRole('button', { name: 'Se déconnecter' }));
    await vi.waitFor(() => expect(goto).toHaveBeenCalled());
    expect(house.overrides).toEqual([]);
    expect(house.rooms).toEqual([]);
    expect(house.loaded).toBe(false);
    expect(history.data).toEqual({});
  });

  it('loads the tariff and Linky sections', async () => {
    render(Page);
    expect(await screen.findByRole('button', { name: 'Enregistrer le tarif' })).toBeInTheDocument();
    expect(await screen.findByText('Non relié.')).toBeInTheDocument();
    expect(api.settings).toHaveBeenCalled();
    expect(api.linkyStatus).toHaveBeenCalled();
  });

  it('the theme switch follows the radio keyboard model', async () => {
    render(Page);
    const group = await screen.findByRole('radiogroup', { name: 'Thème' });
    const checked = group.querySelector('[aria-checked="true"]') as HTMLElement;
    await fireEvent.keyDown(checked, { key: 'End' });
    expect(screen.getByRole('radio', { name: 'Clair' })).toHaveAttribute('aria-checked', 'true');
  });

  it('shows skeletons, not « Aucun forçage », before the house and settings are known', () => {
    house.reset();
    const { container } = render(Page);
    expect(screen.queryByText('Aucun forçage ni absence.')).toBeNull();
    expect(container.querySelectorAll('.skeleton').length).toBe(3);
    expect(screen.queryByText('Chargement…')).toBeNull();
  });

  it('a failed tariff load says so inside its panel, with Réessayer', async () => {
    vi.mocked(api.settings).mockRejectedValueOnce(new Error('x'));
    render(Page);
    const retry = await screen.findByRole('button', { name: 'Réessayer' });
    expect(retry.closest('#tariff')).not.toBeNull();
    expect(screen.getByText(/Impossible de charger le tarif/)).toBeInTheDocument();
    await fireEvent.click(retry);
    expect(await screen.findByRole('button', { name: 'Enregistrer le tarif' })).toBeInTheDocument();
  });

  it('does not offer « Absence… » on the page that holds the Absence panel', () => {
    render(Page);
    expect(screen.queryByRole('link', { name: 'Absence…' })).toBeNull();
  });

  it('the Tarif and Linky anchors exist from the first render, skeleton included', () => {
    vi.mocked(api.settings).mockReturnValueOnce(new Promise(() => {}));
    render(Page);
    expect(document.getElementById('tariff')).toHaveAttribute('aria-busy', 'true');
    expect(document.getElementById('linky')).toBeInTheDocument();
  });
});

describe('Home in English', () => {
  it('panels, the active override, settings and the Cozytouch status by code', async () => {
    applyLocale('en');
    house.status = { connected: false, last_ok_at: null, last_error: 'QUOTA_EXCEEDED', last_error_code: 'quota' };
    render(Page);
    expect(screen.getByRole('heading', { name: 'Home', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Away' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start away mode' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Active' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Cancel Boost — / })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Theme' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio').map((r) => r.textContent)).toEqual(expect.arrayContaining(['System', 'Dark', 'Light']));
    const status = screen.getByText('Cozytouch request limit reached.');
    expect(status).toHaveAttribute('title', 'QUOTA_EXCEEDED');
    expect(screen.getByText('Unreachable')).toBeInTheDocument();
  });
  it('an away period ending in the past is refused in English', async () => {
    applyLocale('en');
    render(Page);
    await fireEvent.input(screen.getByLabelText(/Until/), { target: { value: '2020-01-01T10:00' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Start away mode' }));
    expect(screen.getByText('The end must be in the future.')).toBeInTheDocument();
  });
});
