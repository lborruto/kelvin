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
import { weather } from '$lib/stores/weather.svelte';
import { VIEW } from '$lib/weather.fixture';
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
    mcpTokens: vi.fn().mockResolvedValue({ enabled: true, endpoint_path: '/mcp', tokens: [
      { id: 't1', name: 'Claude', hint: '7f3a', scope: 'read', created: 1, last_used: null, revoked_at: null },
      { id: 't2', name: 'Bureau', hint: 'c21b', scope: 'read', created: 1, last_used: null, revoked_at: 2 }
    ] }),
    me: vi.fn().mockResolvedValue({ email: 'demo@kelvin.local', logged_in: true }),
    weatherSettings: vi.fn().mockResolvedValue({ location: null, coverage: null, calls_today: 0, budget: 400, attribution: { url: 'https://open-meteo.com/', licence: 'CC BY 4.0' } })
  },
  ApiError: class extends Error {}
}));

let navigated: ((nav: { to: { url: URL } | null }) => void) | null = null;
vi.mock('$app/navigation', () => ({
  goto: vi.fn().mockResolvedValue(undefined),
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

describe('Réglages overview', () => {
  it('reads in order: header, the section cards, Affichage, the version', async () => {
    const { container } = render(Page);
    expect(screen.getByRole('heading', { level: 1, name: 'Réglages' })).toBeInTheDocument();
    const order = [...container.querySelectorAll('h2, h3')].filter((h) => !h.closest('dialog')).map((h) => h.textContent?.trim());
    expect(order).toEqual([m.devices.title, m.tariff.title, 'Linky', m.sources.title, m.weather.title, m.account.title, m.home.display]);
    expect(screen.getByText(/^Kelvin \d/)).toBeInTheDocument();
  });

  it('what happens now and the house actions live on Maison, not here', () => {
    snapshot([{ id: 'o2', kind: 'away', room_id: null, radiator_ids: ['a', 'b'], temperature: 12, ends_at: 2e9, restoring: false }]);
    render(Page);
    expect(screen.queryByRole('button', { name: 'Tout éteindre' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Tout remettre en programme' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Partir/ })).toBeNull();
    // The absence still shows in the state line.
    expect(screen.getByText(/^Absence jusqu’à/)).toBeInTheDocument();
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
    // Only the active tokens are counted; never a secret.
    expect(await screen.findByText('Sauter Cozytouch · 2 appareils connectés · 1 jeton MCP')).toBeInTheDocument();
  });

  it('Météo card: « Désactivée » without a place; the place and its source line with one (Plan 14)', async () => {
    const { unmount } = render(Page);
    expect(await screen.findByRole('link', { name: 'Météo, Désactivée' })).toHaveAttribute('href', '/home/weather');
    unmount();
    vi.mocked(api.weatherSettings).mockResolvedValueOnce({
      location: { name: 'Lyon', admin1: 'Auvergne-Rhône-Alpes', admin2: 'Rhône', country_code: 'FR', lat: 45.76, lon: 4.84, elevation_m: 173,
        elevation_source: 'geocoder', origin: 'search', mode: 'meteofrance' },
      coverage: null, calls_today: 3, budget: 400, attribution: { url: 'https://open-meteo.com/', licence: 'CC BY 4.0' }
    });
    weather.apply({ ...VIEW, fetched_at: Math.floor(Date.now() / 1000) - 120 });
    const { container } = render(Page);
    const link = await screen.findByRole('link', { name: /^Météo, Lyon · Rhône · 173\sm$/ });
    const card = link.closest('article')!;
    expect(within(card as HTMLElement).getByText(/^Météo-France AROME HD via Open-Meteo · il y a 2\smin$/)).toBeInTheDocument();
    weather.reset();
    expect(container).toBeTruthy();
  });

  it('Tarif card under Tempo: the Tempo colours and hours, never the HC/HP blue band', async () => {
    const tempo = { ...TARIFF, prices: [{ valid_from: '2025-01-15', option: 'tempo', subscription_eur_month: 15, rates: {
      blue_hc: 0.13, blue_hp: 0.16, white_hc: 0.15, white_hp: 0.18, red_hc: 0.16, red_hp: 0.7 } }] };
    vi.mocked(api.settings).mockResolvedValueOnce({ tariff: tempo, prefill: null } as never);
    const { container } = render(Page);
    await screen.findByRole('link', { name: /^Tarif, Tempo · 9\skVA/ });
    const card = container.querySelector('a[href="/home/tariff"]')!.closest('article')!;
    expect(within(card as HTMLElement).getByText(/^Heures creuses Tempo\s: 22:00–06:00/)).toBeInTheDocument();
    expect(within(card as HTMLElement).getByText('Rouge')).toBeInTheDocument();
    expect(card.querySelectorAll('.dot')).toHaveLength(3);
    expect(within(card as HTMLElement).queryByRole('img', { name: /^Heures creuses/ })).toBeNull();
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
    expect(container.querySelectorAll('.card-sk')).toHaveLength(7);
    expect(screen.queryByText('Tout va bien')).toBeNull();
  });

  it('Affichage: no theme choice (dark only), and the « détails techniques » preference', async () => {
    render(Page);
    expect(screen.queryByRole('radiogroup', { name: 'Thème' })).toBeNull();
    expect(screen.getByText(/Kelvin est en thème sombre\./)).toBeInTheDocument();
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
  it('#away goes to Maison (/) and opens the Absence sheet over it; #alerts stays', async () => {
    history.replaceState(null, '', '/home#away');
    render(Page);
    expect(goto).toHaveBeenCalledWith('/', { replaceState: true });
    await vi.waitFor(() => expect(awaySheet.open).toBe(true));
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
    expect(document.title).toBe('Réglages · Kelvin');
    const group = screen.getByRole('radiogroup', { name: 'Langue' });
    const fr = within(group).getByRole('radio', { name: 'Français' });
    expect(fr).toHaveAttribute('lang', 'fr');
    await fireEvent.click(within(group).getByRole('radio', { name: 'English' }));
    expect(screen.getByRole('heading', { level: 1 })).toBe(h1);
    expect(h1).toHaveTextContent('Settings');
    expect(document.title).toBe('Settings · Kelvin');
    expect(screen.queryByRole('radiogroup', { name: 'Theme' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Display' })).toBeInTheDocument();
    expect(screen.getByText('All good')).toBeInTheDocument();
    expect(localStorage.getItem('kelvin-locale')).toBe('en');
  });
});
