import { render } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { beforeEach, describe, expect, it } from 'vitest';
import { toasts } from '$lib/stores/toasts.svelte';
import Toasts from './Toasts.svelte';
import { applyLocale, m } from '$lib/i18n';

beforeEach(() => {
  for (const t of toasts.items) toasts.remove(t.id);
});

describe('Toasts', () => {
  it('keeps both live regions mounted before any toast, and fills the same nodes', () => {
    const { container } = render(Toasts);
    const assertive = container.querySelector('[aria-live="assertive"]')!;
    const polite = container.querySelector('[aria-live="polite"]')!;
    expect(assertive).toBeInTheDocument();
    expect(polite).toBeInTheDocument();
    toasts.push('Erreur inattendue.');
    toasts.push('Tarif enregistré.', 'info');
    flushSync();
    expect(container.querySelector('[aria-live="assertive"]')).toBe(assertive);
    expect(assertive).toHaveTextContent('Erreur inattendue.');
    expect(polite).toHaveTextContent('Tarif enregistré.');
  });
});

it('a toast pushed in French reads English after the switch', () => {
  const { container } = render(Toasts);
  toasts.push(() => m.error.network);
  flushSync();
  const region = container.querySelector('[aria-live="assertive"]')!;
  expect(region).toHaveTextContent('Kelvin est injoignable.');
  applyLocale('en');
  flushSync();
  expect(region).toHaveTextContent('Can’t reach Kelvin.');
  expect(container.querySelector('button')).toHaveAccessibleName('Close');
});
