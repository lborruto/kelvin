import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { applyLocale } from '$lib/i18n';
import PeriodNav from './PeriodNav.svelte';

describe('PeriodNav', () => {
  it('names the period and steps with the buttons and the arrow keys; the ends stay visible but inert', async () => {
    const onstep = vi.fn();
    const onlatest = vi.fn();
    render(PeriodNav, { title: 'Octobre 2026', canPrev: true, canNext: false, latest: true, onstep, onlatest });
    expect(screen.getByRole('heading', { level: 2, name: 'Octobre 2026' })).toHaveAttribute('id', 'period-label');
    const prev = screen.getByRole('button', { name: 'Période précédente' });
    const next = screen.getByRole('button', { name: 'Période suivante' });
    expect(next).toHaveAttribute('aria-disabled', 'true');
    expect(prev).toHaveAttribute('aria-disabled', 'false');
    await fireEvent.click(next);
    expect(onstep).not.toHaveBeenCalled();
    await fireEvent.click(prev);
    expect(onstep).toHaveBeenLastCalledWith(-1);
    await fireEvent.keyDown(next, { key: 'ArrowLeft' });
    expect(onstep).toHaveBeenCalledTimes(2);
    await fireEvent.keyDown(prev, { key: 'ArrowRight' });
    expect(onstep).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('button', { name: 'Dernier jour' })).toBeNull();
  });

  it('« Dernier jour » and Home return to the latest period, and focus stays in the row', async () => {
    const onlatest = vi.fn();
    render(PeriodNav, { title: 'Août 2026', canPrev: false, canNext: true, latest: false, onstep: vi.fn(), onlatest });
    await fireEvent.keyDown(screen.getByRole('button', { name: 'Période suivante' }), { key: 'Home' });
    expect(onlatest).toHaveBeenCalledTimes(1);
    const latest = screen.getByRole('button', { name: 'Dernier jour' });
    latest.focus();
    await fireEvent.click(latest);
    expect(onlatest).toHaveBeenCalledTimes(2);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Période suivante' }));
  });
});

it('in English: the group and its buttons', () => {
  applyLocale('en');
  render(PeriodNav, { title: 'October 2026', canPrev: true, canNext: true, latest: false, onstep: vi.fn(), onlatest: vi.fn() });
  expect(screen.getByRole('group', { name: 'Period shown' })).toBeInTheDocument();
  for (const name of ['Previous period', 'Next period', 'Latest day']) expect(screen.getByRole('button', { name })).toBeInTheDocument();
});
