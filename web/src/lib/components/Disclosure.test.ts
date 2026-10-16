import { fireEvent, render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { detail } from '$lib/stores/detail.svelte';
import Disclosure from './Disclosure.svelte';

const children = createRawSnippet(() => ({ render: () => '<p>Le détail caché</p>' }));
afterEach(() => detail.set(false));

describe('Disclosure', () => {
  it('a 44 px row button with a chevron and its meta; closed, the region is hidden until found', async () => {
    render(Disclosure, { title: 'Détails', meta: '3 lignes', children });
    const btn = screen.getByRole('button', { name: /Détails/ });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    expect(btn).toHaveTextContent('3 lignes');
    const region = document.getElementById(btn.getAttribute('aria-controls')!)!;
    expect(region).toHaveAttribute('hidden', 'until-found');
    expect(region).toHaveTextContent('Le détail caché'); // in the DOM: find-in-page reaches it
    await fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    expect(region).not.toHaveAttribute('hidden');
  });

  it('a find-in-page match (beforematch) opens it', async () => {
    render(Disclosure, { title: 'Détails', children });
    const btn = screen.getByRole('button', { name: 'Détails' });
    const region = document.getElementById(btn.getAttribute('aria-controls')!)!;
    await fireEvent(region, new Event('beforematch', { bubbles: true }));
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    expect(region).not.toHaveAttribute('hidden');
  });

  it('the heading holds the button, never the other way round', () => {
    render(Disclosure, { title: 'Qualité des données', heading: 'h2', children });
    const h = screen.getByRole('heading', { level: 2, name: 'Qualité des données' });
    expect(h.querySelector('button')).not.toBeNull();
    expect(h.closest('button')).toBeNull();
  });

  it('« Afficher les détails techniques » opens a `detail` disclosure from the start, not the others', () => {
    detail.set(true);
    render(Disclosure, { title: 'Avec', detail: true, children });
    render(Disclosure, { title: 'Sans', children });
    expect(screen.getByRole('button', { name: 'Avec' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Sans' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('inline: a dotted text button with the help glyph (Programme « Comment modifier ? »)', () => {
    const { container } = render(Disclosure, { title: 'Comment modifier ?', variant: 'inline', children });
    expect(container.querySelector('.disclosure.inline')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Comment modifier ?' }).querySelector('svg')).not.toBeNull();
  });
});
