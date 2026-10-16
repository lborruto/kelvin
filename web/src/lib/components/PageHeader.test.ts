import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';
import PageHeader from './PageHeader.svelte';

describe('PageHeader', () => {
  it('h1, one state line, actions on the right; a sub-page puts its back link first', () => {
    const actions = createRawSnippet(() => ({ render: () => '<button type="button" class="btn">Partir</button>' }));
    const { container } = render(PageHeader, { title: 'Tarif', state: 'Option HC/HP depuis le 15/10/2026', back: { href: '/home', label: 'Maison' }, actions });
    expect(screen.getByRole('heading', { level: 1, name: 'Tarif' })).toBeInTheDocument();
    expect(container.querySelector('.state')).toHaveTextContent('Option HC/HP depuis le 15/10/2026');
    expect(container.querySelector('header')!.firstElementChild).toBe(screen.getByRole('link', { name: 'Maison' }));
    expect(screen.getByRole('button', { name: 'Partir' })).toBeInTheDocument();
  });
  it('no state, no line', () => {
    const { container } = render(PageHeader, { title: 'Énergie' });
    expect(container.querySelector('.state')).toBeNull();
  });
});
