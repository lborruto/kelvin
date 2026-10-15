import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import Segmented from './Segmented.svelte';

const options = [
  { value: 'day', label: 'Jour' },
  { value: 'month', label: 'Mois' },
  { value: 'year', label: 'Année' }
];

describe('Segmented', () => {
  it('is a radiogroup with one tab stop on the checked option', () => {
    render(Segmented, { options, value: 'month', label: 'Période', onchange: vi.fn() });
    expect(screen.getByRole('radiogroup', { name: 'Période' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Mois' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Mois' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('radio', { name: 'Jour' })).toHaveAttribute('tabindex', '-1');
  });

  it('arrows, Home and End move and select', async () => {
    const onchange = vi.fn();
    render(Segmented, { options, value: 'month', label: 'Période', onchange });
    const mois = screen.getByRole('radio', { name: 'Mois' });
    await fireEvent.keyDown(mois, { key: 'ArrowRight' });
    expect(onchange).toHaveBeenLastCalledWith('year');
    await fireEvent.keyDown(mois, { key: 'ArrowLeft' });
    expect(onchange).toHaveBeenLastCalledWith('day');
    await fireEvent.keyDown(mois, { key: 'End' });
    expect(onchange).toHaveBeenLastCalledWith('year');
    await fireEvent.keyDown(mois, { key: 'Home' });
    expect(onchange).toHaveBeenLastCalledWith('day');
    await fireEvent.click(screen.getByRole('radio', { name: 'Année' }));
    expect(onchange).toHaveBeenLastCalledWith('year');
  });

  it('a refused change (the value stays) keeps focus on the checked choice', async () => {
    const opts = [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }];
    render(Segmented, { options: opts, value: 'a', label: 'Choix', onchange: () => {} });
    const a = screen.getByRole('radio', { name: 'A' });
    a.focus();
    await fireEvent.keyDown(a, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(a);
  });
});

it('an option can carry its own lang and accessible name', () => {
  render(Segmented, {
    options: [
      { value: 'fr', label: 'FR', lang: 'fr', ariaLabel: 'Français' },
      { value: 'en', label: 'EN', lang: 'en', ariaLabel: 'English' }
    ],
    value: 'fr',
    label: 'Langue',
    onchange: () => {}
  });
  const en = screen.getByRole('radio', { name: 'English' });
  expect(en).toHaveAttribute('lang', 'en');
  expect(en).toHaveTextContent('EN');
});
