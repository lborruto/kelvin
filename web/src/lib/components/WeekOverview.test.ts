import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { applyLocale } from '$lib/i18n';
import { fromWeekProgram } from '$lib/program';
import WeekOverview from './WeekOverview.svelte';

const weekday = [{ start: '06:30', end: '08:00' }, { start: '17:00', end: '23:00' }];
const week = fromWeekProgram({
  monday: weekday, tuesday: weekday, wednesday: [...weekday, { start: '12:00', end: '14:00' }], thursday: weekday,
  friday: weekday, saturday: [{ start: '08:30', end: '23:00' }], sunday: [{ start: '20:00', end: '24:00' }]
});
const base = { week, today: 'thursday' as const, nowMinute: 1302 };

describe('WeekOverview', () => {
  it('one button per day, named with its periods, comfort total and today', () => {
    render(WeekOverview, { ...base, onselect: vi.fn() });
    expect(screen.getAllByRole('button')).toHaveLength(7);
    expect(screen.getByRole('button', { name: 'Jeudi, aujourd’hui, 06:30–08:00 et 17:00–23:00, 7\u00a0h\u00a030 confort' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Mercredi, 06:30–08:00, 12:00–14:00 et 17:00–23:00, 9 h 30 confort$/ })).toBeInTheDocument();
  });

  it('writes the times out per day, with the hour scale and the now marker on today only', () => {
    const { container } = render(WeekOverview, { ...base });
    const monday = container.querySelector('[data-day="monday"]')!;
    expect(monday.querySelector('.times')).toHaveTextContent('06:30–08:00 · 17:00–23:00');
    expect([...container.querySelectorAll('.ticks.wide span')].map((s) => s.textContent)).toEqual(
      ['00', '03', '06', '09', '12', '15', '18', '21', '24']
    );
    expect([...container.querySelectorAll('.ticks.narrow span')].map((s) => s.textContent)).toEqual(['00', '06', '12', '18', '24']);
    expect(container.querySelectorAll('.now')).toHaveLength(1);
    expect(container.querySelector('[data-day="thursday"] .now')).not.toBeNull();
  });

  it('an empty day reads « Éco toute la journée »', () => {
    render(WeekOverview, { ...base, week: { ...week, monday: [] } });
    expect(screen.getByRole('button', { name: 'Lundi, Éco toute la journée' })).toBeInTheDocument();
  });

  it('marks edited days « modifié », in the text and in the name', () => {
    const { container } = render(WeekOverview, { ...base, changed: ['monday'] });
    expect(container.querySelector('[data-day="monday"] .ed')).toHaveTextContent('modifié');
    expect(screen.getByRole('button', { name: /^Lundi, .*, modifié$/ })).toBeInTheDocument();
    expect(container.querySelectorAll('.ed')).toHaveLength(1);
  });

  it('locked days are hatched with their reason on their own line; an unrecognised day draws no period', () => {
    const { container } = render(WeekOverview, { ...base, locks: { sunday: 'midnight', saturday: 'unrecognised' } });
    const sunday = container.querySelector('[data-day="sunday"]')!;
    expect(sunday.querySelector('.bar.locked')).not.toBeNull();
    expect(sunday.querySelector('.lock')).toHaveTextContent(/^Fin à minuit\s:\smodifiez ce jour dans l’app Cozytouch$/);
    expect(sunday.querySelector('.times')).toHaveTextContent('20:00–24:00');
    const saturday = container.querySelector('[data-day="saturday"]')!;
    expect(saturday.querySelectorAll('.blk')).toHaveLength(0);
    expect(saturday.querySelector('.bar.unknown')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Samedi, Plage non reconnue : modifiez ce jour dans l’app Cozytouch' })).toBeInTheDocument();
  });

  it('beside an editor: the selected day is pressed, arrows move and select, Home/End reach the ends', async () => {
    const onselect = vi.fn();
    render(WeekOverview, { ...base, selected: 'tuesday', onselect });
    const tuesday = screen.getByRole('button', { name: /^Mardi/ });
    expect(tuesday).toHaveAttribute('aria-pressed', 'true');
    expect(tuesday).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('button', { name: /^Lundi/ })).toHaveAttribute('tabindex', '-1');
    tuesday.focus();
    await fireEvent.keyDown(tuesday, { key: 'ArrowDown' });
    expect(onselect).toHaveBeenLastCalledWith('wednesday');
    expect(screen.getByRole('button', { name: /^Mercredi/ })).toHaveFocus();
    await fireEvent.keyDown(document.activeElement!, { key: 'End' });
    expect(onselect).toHaveBeenLastCalledWith('sunday');
    await fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' });
    expect(onselect).toHaveBeenLastCalledWith('saturday');
    await fireEvent.keyDown(document.activeElement!, { key: 'Home' });
    expect(screen.getByRole('button', { name: /^Lundi/ })).toHaveFocus();
  });

  it('on a phone: rows are not pressed toggles; arrows move focus only; a click opens the day', async () => {
    const onselect = vi.fn();
    render(WeekOverview, { ...base, onselect });
    const thursday = screen.getByRole('button', { name: /^Jeudi/ });
    expect(thursday).not.toHaveAttribute('aria-pressed');
    expect(thursday).toHaveAttribute('tabindex', '0');
    thursday.focus();
    await fireEvent.keyDown(thursday, { key: 'ArrowDown' });
    expect(screen.getByRole('button', { name: /^Vendredi/ })).toHaveFocus();
    expect(onselect).not.toHaveBeenCalled();
    await fireEvent.click(screen.getByRole('button', { name: /^Vendredi/ }));
    expect(onselect).toHaveBeenCalledWith('friday');
  });

  it('read only (an offline room): no buttons, the summaries stay readable as text', () => {
    render(WeekOverview, { ...base, interactive: false });
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByText(/^Lundi, 06:30–08:00 et 17:00–23:00, 7\sh\s30 confort$/)).toBeInTheDocument();
  });

  it('copied days pulse once per copy', async () => {
    const { container, rerender } = render(WeekOverview, { ...base, pulse: { days: ['friday'], n: 1 } });
    const bar = (d: string) => container.querySelector<HTMLElement>(`[data-day="${d}"] .bar`)!;
    expect(bar('friday').style.animationName).toBe('kv-pulse-a');
    expect(bar('monday').style.animationName).toBe('none');
    await rerender({ ...base, pulse: { days: ['friday'], n: 2 } });
    expect(bar('friday').style.animationName).toBe('kv-pulse-b');
  });

  it('in English', () => {
    applyLocale('en');
    render(WeekOverview, { ...base, changed: ['thursday'], locks: { sunday: 'midnight' } });
    expect(screen.getByRole('list', { name: 'Week' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thursday, today, 06:30–08:00 and 17:00–23:00, 7 h 30 min comfort, edited' })).toBeInTheDocument();
    expect(screen.getByText('Ends at midnight: edit this day in the Cozytouch app')).toBeInTheDocument();
  });
});
