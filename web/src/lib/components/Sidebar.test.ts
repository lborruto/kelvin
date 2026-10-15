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
