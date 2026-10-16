import { render, screen } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterEach, expect, it, vi } from 'vitest';
import { applyLocale } from '$lib/i18n';
import TabBar from './TabBar.svelte';

vi.mock('$app/state', () => ({ page: { url: new URL('http://kelvin.test/rooms/salon') } }));

afterEach(async () => {
  (await import('$lib/stores/alerts.svelte')).alerts.reset();
  applyLocale('fr');
});

it('four tabs, Maison · Programme · Énergie · Réglages; a room sheet keeps Maison current', () => {
  render(TabBar);
  const links = screen.getAllByRole('link');
  expect(links.map((a) => a.textContent?.trim())).toEqual(['Maison', 'Programme', 'Énergie', 'Réglages']);
  expect(links.map((a) => a.getAttribute('href'))).toEqual(['/', '/schedule', '/energy', '/home']);
  expect(links[0]).toHaveAttribute('aria-current', 'page');
  applyLocale('en');
  flushSync();
  expect(screen.getAllByRole('link').map((a) => a.textContent?.trim())).toEqual(['Home', 'Schedule', 'Energy', 'Settings']);
});

it('the alert dot sits on Maison, only for a must-fix alert', async () => {
  const { alerts } = await import('$lib/stores/alerts.svelte');
  alerts.summary = { active: 1, highest: 'bad' };
  alerts.list = [{ id: 1, kind: 'radiator_unreachable', severity: 'bad' }] as never;
  render(TabBar);
  const home = screen.getByRole('link', { name: 'Maison, 1 alerte' });
  expect(home.querySelector('.dot')).toBeNull();
  alerts.list = [{ id: 2, kind: 'hc_changed', severity: 'bad' }] as never;
  flushSync();
  expect(home.querySelector('.dot')).not.toBeNull();
});
