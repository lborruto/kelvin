import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { goto } from '$app/navigation';
import { api } from '$lib/api/client';
import { applyLocale, m } from '$lib/i18n';
import { desktop } from '$lib/media.svelte';
import { alerts } from '$lib/stores/alerts.svelte';
import { auth } from '$lib/stores/auth.svelte';
import { awaySheet } from '$lib/stores/away.svelte';
import { detail } from '$lib/stores/detail.svelte';
import { house } from '$lib/stores/house.svelte';
import { toasts } from '$lib/stores/toasts.svelte';
import Page from './+page.svelte';

const LINKY_OFF = {
  configured: false, prm: null, token_set: false, simulator: false, state: 'off', message: null,
  last_day: null, last_ok_at: null, retry_at: null, calls_today: 0, budget: 10, consent_expires: null
};
const TARIFF = {
  option: 'hchp', kva: 9, hc_slots: [{ start: '22:00', end: '06:00' }],
  hc_schedules: [{ valid_from: '2025-01-15', variants: [{ months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], slots: [{ start: '22:00', end: '06:00' }] }] }],
  tempo_hours: { hc_start: '22:00', hc_end: '06:00', day_start: '06:00' },
  prices: [{ valid_from: '2025-01-15', option: 'hchp', subscription_eur_month: 15, rates: { hc: 0.2, hp: 0.27 } }]
};

vi.mock('$lib/api/client', () => ({
  api: {
    houseAway: vi.fn().mockResolvedValue({ pending: null }),
    houseProgram: vi.fn().mockResolvedValue({ pending: null }),
    houseOff: vi.fn().mockResolvedValue({ pending: null }),
    cancelOverride: vi.fn().mockResolvedValue({ pending: null }),
    alerts: vi.fn().mockResolvedValue([]),
    dismissAlert: vi.fn(),
    sessions: vi.fn().mockResolvedValue([
      { id: 's1', browser: 'Firefox', os: 'Linux', current: true, created_at: 1, last_seen: 1 },
      { id: 's2', browser: 'Safari', os: 'iPhone', current: false, created_at: 1, last_seen: 1 }
    ]),
    settings: vi.fn().mockResolvedValue({ tariff: null, prefill: null }),
    status: vi.fn().mockResolvedValue({ sources: null }),
    linkyStatus: vi.fn(),
    me: vi.fn().mockResolvedValue({ email: 'demo@kelvin.local', logged_in: true })
  },
  ApiError: class extends Error {}
}));

let navigated: ((nav: { to: { url: URL } | null }) => void) | null = null;
vi.mock('$app/navigation', () => ({
  goto: vi.fn(),
  replaceState: vi.fn((url: string) => history.replaceState(null, '', url)),
  afterNavigate: (cb: (nav: { to: { url: URL } | null }) => void) => {
    navigated = cb;
    cb({ to: { url: new URL(location.href) } });
  }
}));

const ROOMS = [
  { id: 'p-salon', name: 'Salon', radiator_ids: ['a'] },
  { id: 'p-ch2', name: 'Chambre 2', radiator_ids: ['b'] }
];
const rad = (id: string, reachable: boolean) =>
  ({ id, name: id, room_id: null, mode: 'program', target: 19, temperature: 19, heating: false, max_temperature: 28, light: null, energy_wh: null, reachable }) as never;

function snapshot(overrides: unknown[] = []) {
  house.applySnapshot({
    house: { rooms: ROOMS as never, radiators: [rad('a', true), rad('b', false)] },
    pending: [],
    overrides: overrides as never,
    status: { connected: true, last_ok_at: Date.now() / 1000, last_error: null }
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.linkyStatus).mockResolvedValue(LINKY_OFF as never);
  history.replaceState(null, '', '/home');
  auth.email = 'demo@kelvin.local';
  auth.loggedIn = true;
  auth.server = { id: 'sauter_cozytouch', name: 'Sauter Cozytouch', tier: 'cozytouch', default: true };
  alerts.reset();
  alerts.list = [];
  toasts.items = [];
  awaySheet.close();
  desktop.matches = false;
  house.houseCommandId = null;
  snapshot([{ id: 'o1', kind: 'boost', room_id: 'p-salon', radiator_ids: ['a'], temperature: 22, ends_at: 2e9, restoring: false }]);
});
afterEach(() => {
  applyLocale('fr');
  auth.server = null;
});

describe('Maison overview', () => {
  it('reads in order: header, En ce moment, the section cards, Affichage, the version', async () => {
    const { container } = render(Page);
    expect(screen.getByRole('heading', { level: 1, name: 'Maison' })).toBeInTheDocument();
    const order = [...container.querySelectorAll('h2, h3')].filter((h) => !h.closest('dialog')).map((h) => h.textContent?.trim());
    expect(order).toEqual([m.home.now, m.devices.title, m.tariff.title, 'Linky', m.sources.title, m.account.title, m.home.display]);
    expect(screen.getByText(/^Kelvin \d/)).toBeInTheDocument();
  });

  it('says « Tout va bien » when nothing needs attention, and the alerts and the absence otherwise', async () => {
    render(Page);
    expect(screen.getByText('Tout va bien')).toBeInTheDocument();
  });

  it('has no Alertes section without alerts, and lists them when there are some', async () => {
    const { unmount } = render(Page);
    expect(screen.queryByRole('heading', { name: m.alerts.title })).toBeNull();
    expect(document.getElementById('alerts')).toBeNull();
    unmount();
    alerts.list = [
      { id: 1, kind: 'linky_stalled', severity: 'warn', params: { last_day: '2026-10-10', days: 4 }, first_seen: 0, last_seen: 0, resolved_at: null, dismissed: false }
    ];
    alerts.summary = { active: 1, highest: 'warn' };
    render(Page);
    const section = document.getElementById('alerts')!;
    expect(within(section).getByRole('heading', { name: m.alerts.title })).toBeInTheDocument();
    expect(within(section).getByText(/pas de nouvelle donnée depuis le 10\/10/)).toBeInTheDocument();
    expect(screen.getByText('1 alerte')).toBeInTheDocument();
  });

  it('a failing alerts load shows the error with a retry, not an empty list', async () => {
    alerts.reset();
    alerts.error = true;
    render(Page);
    expect(screen.getByText('Impossible de charger les alertes.')).toBeInTheDocument();
  });

  it('En ce moment: a temporary heating with « Arrêter », an absence with « Terminer »', async () => {
    snapshot([
      { id: 'o1', kind: 'boost', room_id: 'p-salon', radiator_ids: ['a'], temperature: 22, ends_at: 2e9, restoring: false },
      { id: 'o2', kind: 'away', room_id: null, radiator_ids: ['a', 'b'], temperature: 12, ends_at: 2e9, restoring: false }
    ]);
    render(Page);
    expect(screen.getByText('Chauffe temporaire')).toBeInTheDocument();
    expect(screen.getByText(/toutes les pièces · Chambre 2 hors ligne/)).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: /^Arrêter la chauffe temporaire\s: Salon$/ }));
    expect(api.cancelOverride).toHaveBeenCalledWith('o1');
    await fireEvent.click(screen.getByRole('button', { name: 'Terminer l’absence' }));
    expect(api.cancelOverride).toHaveBeenCalledWith('o2');
    expect(screen.getByText(/^Absence jusqu’à/)).toBeInTheDocument(); // the state line
  });

  it('a boost on an offline room pauses « Arrêter », as in the room panel; « Terminer » the absence stays', async () => {
    snapshot([
      { id: 'o3', kind: 'boost', room_id: 'p-ch2', radiator_ids: ['b'], temperature: 22, ends_at: 2e9, restoring: false },
      { id: 'o2', kind: 'away', room_id: null, radiator_ids: ['a', 'b'], temperature: 12, ends_at: 2e9, restoring: false }
    ]);
    render(Page);
    const stop = screen.getByRole('button', { name: /^Arrêter la chauffe temporaire\s: Chambre 2$/ });
    expect(stop).toHaveAttribute('aria-disabled', 'true');
    await fireEvent.click(stop);
    expect(api.cancelOverride).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Terminer l’absence' })).toHaveAttribute('aria-disabled', 'false');
  });

  it('says « Tout suit son réglage habituel. » when nothing is forced', () => {
    snapshot([]);
    render(Page);
    expect(screen.getByText('Tout suit son réglage habituel.')).toBeInTheDocument();
    expect(screen.queryByText('Aucun forçage ni absence.')).toBeNull();
  });

  it('quick actions: put everything back on schedule, with its progress blocking a re-send', async () => {
    vi.mocked(api.houseProgram).mockResolvedValueOnce({
      pending: { id: 'h1', label: 'Tout remettre en programme', radiator_ids: ['a'], status: 'pending', error: null, created_at: 1, expected: {} }
    } as never);
    render(Page);
    const btn = screen.getByRole('button', { name: 'Tout remettre en programme' });
    await fireEvent.click(btn);
    expect(api.houseProgram).toHaveBeenCalled();
    expect(await screen.findByText('Envoi…')).toBeInTheDocument();
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('button', { name: 'Tout éteindre' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('phone: « Partir en absence… » is a quick action that opens the sheet; desktop: in the header', async () => {
    const { unmount } = render(Page);
    await fireEvent.click(screen.getByRole('button', { name: 'Partir en absence…' }));
    expect(awaySheet.open).toBe(true);
    awaySheet.close();
    unmount();
    desktop.matches = true;
    render(Page);
    const header = document.querySelector('.page-header')!;
    await fireEvent.click(within(header as HTMLElement).getByRole('button', { name: 'Partir en absence…' }));
    expect(awaySheet.open).toBe(true);
  });

  it('cards: a link each, named by their title and summary', async () => {
    vi.mocked(api.settings).mockResolvedValueOnce({ tariff: TARIFF, prefill: null } as never);
    render(Page);
    const devices = screen.getByRole('link', { name: /^Pièces et appareils, 2 pièces · 2 radiateurs/ });
    expect(devices).toHaveAttribute('href', '/home/devices');
    expect(screen.getByText('1 hors ligne')).toBeInTheDocument();
    const tariff = await screen.findByRole('link', { name: /^Tarif, HC\/HP · 9\skVA · 15,00\s€\/mois$/ });
    expect(tariff).toHaveAttribute('href', '/home/tariff');
    expect(screen.getByRole('img', { name: /^Heures creuses\s: 22:00–06:00$/ })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Linky, Non relié · reliez-le pour la consommation de la maison' })).toHaveAttribute(
      'href',
      '/home/linky'
    );
    expect(await screen.findByRole('link', { name: 'Sources de données, Tout est à jour' })).toHaveAttribute('href', '/home/sources');
    expect(screen.getByRole('link', { name: 'Compte, demo@kelvin.local' })).toHaveAttribute('href', '/home/account');
    expect(await screen.findByText('Sauter Cozytouch · 2 appareils connectés')).toBeInTheDocument();
  });

  it('a tariff never set says so; a failed load says « Indisponible » in its card', async () => {
    const { unmount } = render(Page);
    expect(await screen.findByText('Pas encore de tarif')).toBeInTheDocument();
    unmount();
    vi.mocked(api.settings).mockRejectedValueOnce(new Error('x'));
    render(Page);
    expect(await screen.findByRole('link', { name: 'Tarif, Indisponible pour le moment' })).toBeInTheDocument();
  });

  it('experimental server: the Pièces et appareils card says read-only', () => {
    auth.server = { id: 'x', name: 'Hitachi Hi Kumo', tier: 'experimental', default: false };
    render(Page);
    expect(screen.getByText('lecture seule sur ce serveur')).toBeInTheDocument();
  });

  it('shows skeletons until the house and the alerts are known, at the cards’ final heights', () => {
    house.reset();
    alerts.reset();
    const { container } = render(Page);
    expect(container.querySelectorAll('.now-sk')).toHaveLength(1);
    expect(container.querySelectorAll('.card-sk')).toHaveLength(6);
    expect(screen.queryByText('Tout suit son réglage habituel.')).toBeNull();
    expect(screen.queryByText('Tout va bien')).toBeNull();
  });

  it('Affichage: the theme radio keyboard model, and the « détails techniques » preference', async () => {
    render(Page);
    const group = screen.getByRole('radiogroup', { name: 'Thème' });
    const checked = group.querySelector('[aria-checked="true"]') as HTMLElement;
    await fireEvent.keyDown(checked, { key: 'End' });
    expect(screen.getByRole('radio', { name: 'Clair' })).toHaveAttribute('aria-checked', 'true');
    const toggle = screen.getByRole('switch', { name: 'Afficher les détails techniques' });
    const before = detail.on;
    await fireEvent.click(toggle);
    expect(detail.on).toBe(!before);
    detail.set(before);
  });
});

describe('old Maison anchors', () => {
  it('#tariff, #linky and #sessions go to their sub-page (replacing the history entry)', () => {
    for (const [hash, to] of [
      ['#tariff', '/home/tariff'],
      ['#linky', '/home/linky'],
      ['#sessions', '/home/account#sessions']
    ]) {
      vi.mocked(goto).mockClear();
      history.replaceState(null, '', `/home${hash}`);
      const { unmount } = render(Page);
      expect(goto).toHaveBeenCalledWith(to, { replaceState: true });
      unmount();
    }
  });
  it('#away opens the Absence sheet on the overview; #alerts stays', () => {
    history.replaceState(null, '', '/home#away');
    render(Page);
    expect(awaySheet.open).toBe(true);
    expect(location.hash).toBe('');
    awaySheet.close();
    vi.mocked(goto).mockClear();
    navigated?.({ to: { url: new URL('http://x/home#alerts') } });
    expect(goto).not.toHaveBeenCalled();
    expect(awaySheet.open).toBe(false);
  });
});

describe('Home in English', () => {
  it('the overview, its rows and the language switch without a remount', async () => {
    snapshot([{ id: 'o1', kind: 'boost', room_id: 'p-salon', radiator_ids: ['a'], temperature: 22, ends_at: 2e9, restoring: false }]);
    render(Page);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(document.title).toBe('Maison · Kelvin');
    const group = screen.getByRole('radiogroup', { name: 'Langue' });
    const fr = within(group).getByRole('radio', { name: 'Français' });
    expect(fr).toHaveAttribute('lang', 'fr');
    await fireEvent.click(within(group).getByRole('radio', { name: 'English' }));
    expect(screen.getByRole('heading', { level: 1 })).toBe(h1);
    expect(h1).toHaveTextContent('Home');
    expect(document.title).toBe('Home · Kelvin');
    expect(screen.getByRole('heading', { name: 'Right now' })).toBeInTheDocument();
    expect(screen.getByText('Boost')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stop boost: Salon' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Theme' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio').map((r) => r.textContent)).toEqual(expect.arrayContaining(['System', 'Dark', 'Light']));
    expect(screen.getByRole('heading', { name: 'Display' })).toBeInTheDocument();
    expect(screen.getByText('All good')).toBeInTheDocument();
    expect(localStorage.getItem('kelvin-locale')).toBe('en');
  });
});
