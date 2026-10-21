import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyLocale } from '$lib/i18n';
import Sidebar from './Sidebar.svelte';

const state = vi.hoisted(() => ({ url: new URL('http://kelvin.test/schedule') }));
vi.mock('$app/state', () => ({
  page: {
    get url() {
      return state.url;
    }
  }
}));
vi.mock('$lib/api/client', () => ({ api: {}, ApiError: class extends Error {} }));

const rad = (id: string, room_id: string, extra: Record<string, unknown> = {}) => ({
  id, room_id, name: 'Radiateur', model: 'HEKLA P', power_w: 1500, temperature: 19.6, mode: 'program' as const, target: 20,
  comfort: 20, eco_delta: 3, eco: 17, effective_setpoint: 17, heating_level: 'eco', max_temperature: 28, window_open: false,
  occupied: false, window_detection: true, presence_detection: false, light: null, energy_wh: null, working_rate: 0, rssi: 100,
  program: {}, ...extra
});
const room = (id: string, name: string, ids: string[], temperature: number | null) => ({
  id, name, radiator_ids: ids, temperature, mode: 'program' as const, target: 20, comfort: 20, eco: 17,
  effective_setpoint: 17, heating_level: 'eco', window_open: false, occupied: false
});

async function seed() {
  const { house } = await import('$lib/stores/house.svelte');
  house.applySnapshot({
    house: {
      rooms: [room('ch2', 'Chambre 2', ['c'], null), room('salon', 'Salon', ['a'], 19.6), room('ch1', 'Chambre 1', ['b'], 19.1)],
      radiators: [rad('c', 'ch2', { reachable: false, temperature: null }), rad('a', 'salon', { working_rate: 80 }), rad('b', 'ch1', { temperature: 19.1 })]
    },
    pending: [], overrides: [], status: { connected: true, last_ok_at: 1, last_error: null }
  } as never);
  return house;
}

afterEach(async () => {
  const { house } = await import('$lib/stores/house.svelte');
  const { alerts } = await import('$lib/stores/alerts.svelte');
  house.reset();
  alerts.reset();
  applyLocale('fr');
  state.url = new URL('http://kelvin.test/schedule');
});

describe('Sidebar (Tableau)', () => {
  it('Maison, Programme, Énergie on top and Réglages at the bottom; re-renders in English without remounting', () => {
    render(Sidebar);
    const nav = screen.getByRole('navigation', { name: 'Navigation principale' });
    const link = within(nav).getByRole('link', { name: 'Programme' });
    expect(link).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Maison' })).toHaveAttribute('href', '/');
    expect(within(nav).getByRole('link', { name: 'Réglages' })).toHaveAttribute('href', '/home');
    applyLocale('en');
    flushSync();
    expect(screen.getByRole('link', { name: 'Schedule' })).toBe(link);
    const names = screen.getAllByRole('link').map((a) => a.textContent?.trim());
    expect(names.slice(0, 3)).toEqual(['Home', 'Schedule', 'Energy']);
    expect(names.at(-1)).toBe('Settings');
    expect(screen.getByRole('button', { name: 'Go away…' })).toBeInTheDocument();
  });

  it('the « PIÈCES » rows: Cozytouch order, offline last and faint without a temperature, a heat flame while heating', async () => {
    await seed();
    render(Sidebar);
    const group = screen.getByRole('group', { name: 'Pièces' });
    const rows = within(group).getAllByRole('link');
    expect(rows.map((r) => r.getAttribute('aria-label'))).toEqual([
      'Salon, 19,6 °C, en chauffe',
      'Chambre 1, 19,1 °C',
      'Chambre 2, hors ligne'
    ]);
    // A row opens the room's sheet over the page the user is on (here Programme), never a trip to Maison.
    expect(rows[0]).toHaveAttribute('href', '/schedule?sheet=salon');
    expect(rows[0]).toHaveAttribute('data-sveltekit-noscroll');
    expect(rows[0]).toHaveAttribute('data-sveltekit-keepfocus');
    expect(rows[0].querySelector('.t')).toHaveTextContent('19,6°');
    expect(rows[0].querySelector('.ic')).toHaveClass('heat');
    expect(rows[1].querySelector('.ic')).not.toHaveClass('heat');
    expect(rows[2]).toHaveClass('off');
    expect(rows[2].querySelector('.t')).toBeNull();
  });

  it('a room sheet open over Énergie: its row is current, Énergie stays current underneath', async () => {
    state.url = new URL('http://kelvin.test/energy?x=1&sheet=salon');
    await seed();
    render(Sidebar);
    expect(screen.getByRole('link', { name: /^Salon,/ })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('link', { name: /^Chambre 1,/ })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Énergie' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Maison' })).not.toHaveAttribute('aria-current');
    // Another row keeps the page's own parameters and swaps the sheet.
    expect(screen.getByRole('link', { name: /^Chambre 1,/ })).toHaveAttribute('href', '/energy?x=1&sheet=ch1');
  });

  it('on Maison: no « Pièces » rows (the tiles are the rooms), with or without a sheet open', async () => {
    await seed();
    for (const url of ['http://kelvin.test/', 'http://kelvin.test/?sheet=salon']) {
      state.url = new URL(url);
      const { unmount } = render(Sidebar);
      expect(screen.queryByRole('group', { name: /Pièces/ })).toBeNull();
      expect(screen.queryByRole('link', { name: /^Salon,/ })).toBeNull();
      expect(screen.getByRole('link', { name: 'Maison' })).toHaveAttribute('aria-current', 'page');
      unmount();
    }
  });

  it('the alert dot on Maison only for a must-fix alert; the count is in the name', async () => {
    const { alerts } = await import('$lib/stores/alerts.svelte');
    alerts.summary = { active: 2, highest: 'bad' };
    alerts.list = [
      { id: 1, kind: 'radiator_unreachable', severity: 'bad' },
      { id: 2, kind: 'ecowatt', severity: 'warn' }
    ] as never;
    render(Sidebar);
    const home = screen.getByRole('link', { name: 'Maison, 2 alertes' });
    // An offline radiator is never red: no dot at all.
    expect(home.querySelector('.dot')).toBeNull();
    alerts.list = [...alerts.list, { id: 3, kind: 'hc_changed', severity: 'bad' }] as never;
    flushSync();
    expect(home.querySelector('.dot')).toHaveAttribute('aria-hidden', 'true');
  });

  it('Partir… opens the Absence sheet; the wordmark and the Cozytouch status footer', async () => {
    const { house } = await import('$lib/stores/house.svelte');
    const { awaySheet } = await import('$lib/stores/away.svelte');
    const now = Date.parse('2026-10-15T19:11:00Z');
    house.status = { connected: true, last_ok_at: (now - 60_000) / 1000, last_error: null };
    house.loaded = true;
    house.connection = 'open';
    const { container } = render(Sidebar, { now });
    expect(container.querySelector('.brand .wordmark')).toHaveTextContent('Kelvin');
    await fireEvent.click(screen.getByRole('button', { name: 'Partir…' }));
    expect(awaySheet.open).toBe(true);
    awaySheet.close();
    expect(container.querySelector('.status')).toHaveTextContent('Cozytouch · il y a 1 min');
    expect(container.querySelector('.status [data-fresh="fresh"]')).not.toBeNull();
    house.status = { connected: false, last_ok_at: (now - 60_000) / 1000, last_error: 'x' };
    flushSync();
    expect(container.querySelector('.status')).toHaveTextContent('Cozytouch · Injoignable');
    expect(container.querySelector('.status [data-fresh="bad"]')).not.toBeNull();
  });
});
