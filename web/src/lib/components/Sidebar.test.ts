import { render, screen } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { expect, it, vi } from 'vitest';
import { applyLocale } from '$lib/i18n';
import Sidebar from './Sidebar.svelte';

vi.mock('$app/state', () => ({ page: { url: new URL('http://kelvin.test/schedule') } }));
vi.mock('$lib/api/client', () => ({ api: {}, ApiError: class extends Error {} }));

it('the nav re-renders in the new language without remounting, current page kept', () => {
  render(Sidebar);
  const link = screen.getByRole('link', { name: 'Programme' });
  expect(link).toHaveAttribute('aria-current', 'page');
  applyLocale('en');
  flushSync();
  expect(screen.getByRole('link', { name: 'Schedule' })).toBe(link);
  expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
  // The first four links are the nav; the house actions (Away…) follow.
  expect(screen.getAllByRole('link').slice(0, 4).map((a) => a.textContent?.trim())).toEqual(['Rooms', 'Schedule', 'Energy', 'Home']);
});

it('the wordmark mark, an alert dot on Maison (count in the name only), the Cozytouch status footer', async () => {
  const { alerts } = await import('$lib/stores/alerts.svelte');
  const { house } = await import('$lib/stores/house.svelte');
  const now = Date.parse('2026-10-15T19:11:00Z');
  alerts.summary = { active: 2, highest: 'bad' };
  alerts.list = [
    { id: 1, kind: 'radiator_unreachable', severity: 'bad' },
    { id: 2, kind: 'ecowatt', severity: 'warn' }
  ] as never;
  house.status = { connected: true, last_ok_at: (now - 60_000) / 1000, last_error: null };
  house.loaded = true;
  house.connection = 'open';
  const { container } = render(Sidebar, { now });
  expect(container.querySelector('.brand svg')).not.toBeNull();
  const home = screen.getByRole('link', { name: 'Maison, 2 alertes' });
  const dot = home.querySelector('.dot')!;
  expect(dot).toHaveAttribute('aria-hidden', 'true');
  // An offline radiator is never red: the dot stays muted.
  expect(dot).not.toHaveClass('bad');
  expect(container.querySelector('.status')).toHaveTextContent('Cozytouch · il y a 1 min');
  expect(container.querySelector('.status [data-fresh="fresh"]')).not.toBeNull();
  expect(screen.getByRole('button', { name: /^Cozytouch · il y a 1\smin, détails$/ })).toBeInTheDocument();
  // Cozytouch down: a bad dot and the word.
  house.status = { connected: false, last_ok_at: (now - 60_000) / 1000, last_error: 'x' };
  flushSync();
  expect(container.querySelector('.status')).toHaveTextContent('Cozytouch · Injoignable');
  expect(container.querySelector('.status [data-fresh="bad"]')).not.toBeNull();
  alerts.reset();
  house.reset();
});
