import { render } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { beforeEach, describe, expect, it } from 'vitest';
import { toasts } from '$lib/stores/toasts.svelte';
import Toasts from './Toasts.svelte';

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
