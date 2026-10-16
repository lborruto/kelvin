import { render } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
    toasts.push('Erreur inattendue. Réessayez.');
    toasts.push('Tarif enregistré.', 'info');
    flushSync();
    expect(container.querySelector('[aria-live="assertive"]')).toBe(assertive);
    expect(assertive).toHaveTextContent('Erreur inattendue. Réessayez.');
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
  expect(region).toHaveTextContent('Can’t reach Kelvin. Check your connection.');
  expect(container.querySelector('button')).toHaveAccessibleName('Close');
});

  it('shows an action as a button that runs it and closes the toast', async () => {
    const run = vi.fn();
    const { getByRole, queryByText } = render(Toasts);
    toasts.push('Salon — confirmé', 'info', 10_000, { label: () => 'Annuler', run });
    flushSync();
    getByRole('button', { name: 'Annuler' }).click();
    flushSync();
    expect(run).toHaveBeenCalledOnce();
    expect(queryByText('Salon — confirmé')).toBeNull();
  });
