import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { applyLocale } from '$lib/i18n';
import { fromWeekProgram } from '$lib/program';
import WeekCalendar from './WeekCalendar.svelte';

const weekday = [{ start: '06:30', end: '08:00' }, { start: '17:00', end: '23:00' }];
const week = fromWeekProgram({
  monday: weekday, tuesday: weekday, wednesday: [...weekday, { start: '12:00', end: '14:00' }], thursday: weekday,
  friday: weekday, saturday: [{ start: '08:30', end: '23:00' }], sunday: [{ start: '20:00', end: '24:00' }]
});
const base = { week, today: 'thursday' as const, nowMinute: 1302 };

/** One minute per pixel down a day's column (the 24 h body is 1440 px tall). */
function stubDay(container: HTMLElement, day: string) {
  const el = container.querySelector(`[data-day="${day}"] .bar`)!;
  el.getBoundingClientRect = () => ({ left: 0, width: 100, top: 0, height: 1440, right: 100, bottom: 1440, x: 0, y: 0, toJSON() {} }) as DOMRect;
  return el as HTMLElement;
}

describe('WeekCalendar', () => {
  it('one header button per day, named with its periods, comfort total and today', () => {
    render(WeekCalendar, { ...base, onselect: vi.fn() });
    expect(screen.getAllByRole('button')).toHaveLength(7);
    expect(screen.getByRole('button', { name: 'Jeudi, aujourd’hui, 06:30–08:00 et 17:00–23:00, 7 h 30 confort' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Mercredi, 06:30–08:00, 12:00–14:00 et 17:00–23:00, 9\sh\s30 confort$/ })).toBeInTheDocument();
  });

  it('draws each period as a block down its day, with the hour scale and the now marker on today only', () => {
    const { container } = render(WeekCalendar, { ...base });
    const monday = container.querySelector('[data-day="monday"]')!;
    const blocks = [...monday.querySelectorAll<HTMLElement>('.blk')];
    expect(blocks.map((b) => [b.style.top, b.style.height])).toEqual([
      [`${(390 / 1440) * 100}%`, `${(90 / 1440) * 100}%`],
      [`${(1020 / 1440) * 100}%`, `${(360 / 1440) * 100}%`]
    ]);
    expect(monday.querySelector('.dn')).toHaveTextContent('lun.');
    expect([...container.querySelectorAll('.hours span')].map((s) => s.textContent)).toEqual(
      ['00:00', '03:00', '06:00', '09:00', '12:00', '15:00', '18:00', '21:00', '24:00']
    );
    expect(container.querySelectorAll('.now')).toHaveLength(1);
    expect(container.querySelector('[data-day="thursday"] .now')).not.toBeNull();
    expect(container.querySelector('[data-day="thursday"] .dot')).not.toBeNull();
  });

  it('compact (a phone): letters and a 6 h scale', () => {
    const { container } = render(WeekCalendar, { ...base, compact: true });
    expect([...container.querySelectorAll('.dn')].map((s) => s.textContent)).toEqual(['L', 'M', 'M', 'J', 'V', 'S', 'D']);
    expect([...container.querySelectorAll('.hours span')].map((s) => s.textContent)).toEqual(['00', '06', '12', '18', '24']);
  });

  it('an empty day reads « Éco toute la journée »', () => {
    render(WeekCalendar, { ...base, week: { ...week, monday: [] } });
    expect(screen.getByRole('button', { name: 'Lundi, Éco toute la journée' })).toBeInTheDocument();
  });

  it('marks edited days « ● modifié », in the header and in the name', () => {
    const { container } = render(WeekCalendar, { ...base, changed: ['monday'] });
    expect(container.querySelector('[data-day="monday"] .ed')).toHaveTextContent('modifié');
    expect(screen.getByRole('button', { name: /^Lundi, .*, modifié$/ })).toBeInTheDocument();
    expect(container.querySelectorAll('.ed')).toHaveLength(1);
  });

  it('locked days are hatched with a lock and a short reason; an unrecognised day draws no period', () => {
    const { container } = render(WeekCalendar, { ...base, locks: { sunday: 'midnight', saturday: 'unrecognised' } });
    const sunday = container.querySelector('[data-day="sunday"]')!;
    expect(sunday.querySelector('.hatch')).not.toBeNull();
    expect(sunday.querySelector('.why')).toHaveTextContent('fin à minuit');
    expect(sunday.querySelectorAll('.blk')).toHaveLength(1);
    const saturday = container.querySelector('[data-day="saturday"]')!;
    expect(saturday.querySelectorAll('.blk')).toHaveLength(0);
    expect(saturday.querySelector('.why')).toHaveTextContent('non reconnu');
    expect(screen.getByRole('button', { name: /^Samedi, Plage non reconnue\s:\smodifiez ce jour dans l’app Cozytouch$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Dimanche, 20:00–24:00, 4\sh confort, Fin à minuit/ })).toBeInTheDocument();
  });

  it('beside an editor: the selected day is pressed, arrows move and select, Home/End reach the ends', async () => {
    const onselect = vi.fn();
    render(WeekCalendar, { ...base, selected: 'tuesday', onselect });
    const tuesday = screen.getByRole('button', { name: /^Mardi/ });
    expect(tuesday).toHaveAttribute('aria-pressed', 'true');
    expect(tuesday).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('button', { name: /^Lundi/ })).toHaveAttribute('tabindex', '-1');
    tuesday.focus();
    await fireEvent.keyDown(tuesday, { key: 'ArrowRight' });
    expect(onselect).toHaveBeenLastCalledWith('wednesday');
    expect(screen.getByRole('button', { name: /^Mercredi/ })).toHaveFocus();
    await fireEvent.keyDown(document.activeElement!, { key: 'End' });
    expect(onselect).toHaveBeenLastCalledWith('sunday');
    await fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
    expect(onselect).toHaveBeenLastCalledWith('saturday');
    await fireEvent.keyDown(document.activeElement!, { key: 'Home' });
    expect(screen.getByRole('button', { name: /^Lundi/ })).toHaveFocus();
  });

  it('on a phone: headers are not pressed toggles; arrows move focus only; a tap on a day opens it', async () => {
    const onselect = vi.fn();
    const { container } = render(WeekCalendar, { ...base, compact: true, onselect });
    const thursday = screen.getByRole('button', { name: /^Jeudi/ });
    expect(thursday).not.toHaveAttribute('aria-pressed');
    thursday.focus();
    await fireEvent.keyDown(thursday, { key: 'ArrowRight' });
    expect(screen.getByRole('button', { name: /^Vendredi/ })).toHaveFocus();
    expect(onselect).not.toHaveBeenCalled();
    await fireEvent.click(screen.getByRole('button', { name: /^Vendredi/ }));
    expect(onselect).toHaveBeenCalledWith('friday');
    await fireEvent.click(container.querySelector('[data-day="monday"] .bar')!);
    expect(onselect).toHaveBeenLastCalledWith('monday');
  });

  it('read only (an offline room): no buttons, the summaries stay readable as text, nothing drags', async () => {
    const onedit = vi.fn();
    const { container } = render(WeekCalendar, { ...base, interactive: false, onedit });
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByText(/^Lundi, 06:30–08:00 et 17:00–23:00, 7\sh\s30 confort$/)).toBeInTheDocument();
    const bar = stubDay(container, 'monday');
    const blk = bar.querySelector('.blk')!;
    await fireEvent.pointerDown(blk, { clientY: 400, button: 0, pointerId: 1 });
    await fireEvent.pointerMove(blk, { clientY: 460, pointerId: 1 });
    expect(onedit).not.toHaveBeenCalled();
  });

  it('copied days pulse once per copy', async () => {
    const { container, rerender } = render(WeekCalendar, { ...base, pulse: { days: ['friday'], n: 1 } });
    const bar = (d: string) => container.querySelector<HTMLElement>(`[data-day="${d}"] .bar`)!;
    expect(bar('friday').style.animationName).toBe('kv-pulse-a');
    expect(bar('monday').style.animationName).toBe('none');
    await rerender({ ...base, pulse: { days: ['friday'], n: 2 } });
    expect(bar('friday').style.animationName).toBe('kv-pulse-b');
  });

  it('in English', () => {
    applyLocale('en');
    render(WeekCalendar, { ...base, changed: ['thursday'], locks: { sunday: 'midnight' } });
    expect(screen.getByRole('list', { name: 'Week' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Thursday, today, 06:30–08:00 and 17:00–23:00, 7\sh\s30\smin comfort, edited$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ends at midnight: edit this day in the Cozytouch app$/ })).toBeInTheDocument();
    expect(screen.getByText('ends at midnight')).toBeInTheDocument();
  });
});

describe('WeekCalendar: drag (desktop)', () => {
  it('dragging a block moves it in 15-minute steps with a time bubble; the day is selected', async () => {
    const onedit = vi.fn();
    const onselect = vi.fn();
    const { container } = render(WeekCalendar, { ...base, selected: 'monday', onselect, onedit });
    const bar = stubDay(container, 'monday');
    const blk = bar.querySelector('.blk')!;
    await fireEvent.pointerDown(blk, { clientY: 400, button: 0, pointerId: 1 });
    expect(onselect).toHaveBeenCalledWith('monday');
    await fireEvent.pointerMove(blk, { clientY: 460, pointerId: 1 });
    expect(onedit).toHaveBeenLastCalledWith('monday', [{ start: 450, end: 540 }, { start: 1020, end: 1380 }]);
    expect(bar.querySelector('.bubble')).toHaveTextContent('07:30–09:00');
    await fireEvent.pointerUp(blk, { pointerId: 1 });
    expect(bar.querySelector('.bubble')).toBeNull();
    // A click selected it: its two handles show.
    expect(bar.querySelectorAll('.blk.sel .hdl')).toHaveLength(2);
  });

  it('dragging an edge resizes on the 30-min step; an end never goes past 23:30', async () => {
    const onedit = vi.fn();
    const { container } = render(WeekCalendar, { ...base, selected: 'monday', onedit });
    const bar = stubDay(container, 'monday');
    const end = bar.querySelectorAll('.edge.bottom')[1]!;
    await fireEvent.pointerDown(end, { clientY: 1380, button: 0, pointerId: 1 });
    await fireEvent.pointerMove(end, { clientY: 1439, pointerId: 1 });
    expect(onedit).toHaveBeenLastCalledWith('monday', [{ start: 390, end: 480 }, { start: 1020, end: 1410 }]);
    expect(bar.querySelector('.bubble')).toHaveTextContent('fin 23:30');
    const start = bar.querySelectorAll('.edge.top')[0]!;
    await fireEvent.pointerUp(end, { pointerId: 1 });
    await fireEvent.pointerDown(start, { clientY: 390, button: 0, pointerId: 1 });
    await fireEvent.pointerMove(start, { clientY: 352, pointerId: 1 });
    expect(onedit).toHaveBeenLastCalledWith('monday', [{ start: 360, end: 480 }, { start: 1020, end: 1380 }]);
    expect(bar.querySelector('.bubble')).toHaveTextContent('début 06:00');
  });

  it('dragging on an empty area of a day with fewer than 3 periods draws out a 1 h period', async () => {
    const onedit = vi.fn();
    const { container } = render(WeekCalendar, { ...base, selected: 'monday', onedit });
    const bar = stubDay(container, 'monday');
    await fireEvent.pointerDown(bar, { clientY: 720, button: 0, pointerId: 1 });
    await fireEvent.pointerMove(bar, { clientY: 730, pointerId: 1 });
    expect(onedit).toHaveBeenLastCalledWith('monday', [{ start: 390, end: 480 }, { start: 720, end: 780 }, { start: 1020, end: 1380 }]);
    await fireEvent.pointerMove(bar, { clientY: 870, pointerId: 1 });
    expect(onedit).toHaveBeenLastCalledWith('monday', [{ start: 390, end: 480 }, { start: 720, end: 870 }, { start: 1020, end: 1380 }]);
  });

  it('drawing upward extends the new period upward from where the drag began, snapped and within its gap', async () => {
    const onedit = vi.fn();
    // A room whose radiators keep quarter hours (none verified yet): 15-minute steps.
    const { container } = render(WeekCalendar, { ...base, selected: 'monday', onedit, slotStep: 15 });
    const bar = stubDay(container, 'monday');
    await fireEvent.pointerDown(bar, { clientY: 720, button: 0, pointerId: 1 });
    await fireEvent.pointerMove(bar, { clientY: 700, pointerId: 1 });
    // 15 min up: the period starts there and keeps its hour.
    expect(onedit).toHaveBeenLastCalledWith('monday', [{ start: 390, end: 480 }, { start: 705, end: 765 }, { start: 1020, end: 1380 }]);
    expect(bar.querySelector('.bubble')).toHaveTextContent('début 11:45');
    await fireEvent.pointerMove(bar, { clientY: 557, pointerId: 1 });
    expect(onedit).toHaveBeenLastCalledWith('monday', [{ start: 390, end: 480 }, { start: 555, end: 720 }, { start: 1020, end: 1380 }]);
    // Never over the period above: it stops at its end.
    await fireEvent.pointerMove(bar, { clientY: 300, pointerId: 1 });
    expect(onedit).toHaveBeenLastCalledWith('monday', [{ start: 390, end: 480 }, { start: 480, end: 720 }, { start: 1020, end: 1380 }]);
  });

  it('a cancelled drag puts the day back as it was (no stray « modifié »)', async () => {
    const onedit = vi.fn();
    const { container } = render(WeekCalendar, { ...base, selected: 'monday', onedit });
    const bar = stubDay(container, 'monday');
    const blk = bar.querySelector('.blk')!;
    await fireEvent.pointerDown(blk, { clientY: 400, button: 0, pointerId: 1 });
    await fireEvent.pointerMove(blk, { clientY: 460, pointerId: 1 });
    await fireEvent.pointerCancel(blk, { pointerId: 1 });
    expect(onedit).toHaveBeenLastCalledWith('monday', week.monday);
    expect(bar.querySelector('.bubble')).toBeNull();
    onedit.mockClear();
    await fireEvent.pointerDown(bar, { clientY: 720, button: 0, pointerId: 2 });
    await fireEvent.pointerMove(bar, { clientY: 800, pointerId: 2 });
    await fireEvent.pointerCancel(bar, { pointerId: 2 });
    expect(onedit).toHaveBeenLastCalledWith('monday', week.monday);
    // A cancel before any move changes nothing.
    onedit.mockClear();
    await fireEvent.pointerDown(blk, { clientY: 400, button: 0, pointerId: 3 });
    await fireEvent.pointerCancel(blk, { pointerId: 3 });
    expect(onedit).not.toHaveBeenCalled();
  });

  it('a day with 3 periods, a locked day, a pending send or the phone agenda never take a drag', async () => {
    const onedit = vi.fn();
    const r = render(WeekCalendar, { ...base, selected: 'wednesday', onedit, locks: { sunday: 'midnight' } });
    let bar = stubDay(r.container, 'wednesday');
    await fireEvent.pointerDown(bar, { clientY: 600, button: 0, pointerId: 1 });
    await fireEvent.pointerMove(bar, { clientY: 700, pointerId: 1 });
    bar = stubDay(r.container, 'sunday');
    const blk = bar.querySelector('.blk')!;
    await fireEvent.pointerDown(blk, { clientY: 1250, button: 0, pointerId: 1 });
    await fireEvent.pointerMove(blk, { clientY: 1300, pointerId: 1 });
    expect(bar.querySelector('.edge')).toBeNull();
    r.unmount();
    for (const extra of [{ pending: true }, { compact: true }]) {
      const c = render(WeekCalendar, { ...base, selected: 'monday', onedit, ...extra });
      const b = stubDay(c.container, 'monday');
      const k = b.querySelector('.blk')!;
      await fireEvent.pointerDown(k, { clientY: 400, button: 0, pointerId: 1 });
      await fireEvent.pointerMove(k, { clientY: 460, pointerId: 1 });
      c.unmount();
    }
    expect(onedit).not.toHaveBeenCalled();
  });
});
