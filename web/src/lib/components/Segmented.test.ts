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
});
