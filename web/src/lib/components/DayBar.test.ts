import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import DayBar from './DayBar.svelte';
import { applyLocale } from '$lib/i18n';

const segs = [
  { start: 375, end: 480 },
  { start: 1050, end: 1350 }
];

function stubRect(el: Element) {
  el.getBoundingClientRect = () => ({ left: 0, width: 1440, top: 0, height: 48, right: 1440, bottom: 48, x: 0, y: 0, toJSON() {} }) as DOMRect;
}

describe('DayBar (the day bar)', () => {
  it('names each period and labels the hours under the bar, every 3 h or every 6 h', () => {
    const { container, unmount } = render(DayBar, { day: 'monday', segs, onchange: vi.fn() });
    expect(screen.getByRole('button', { name: 'Lundi 06:15–08:00' })).toHaveAttribute('aria-roledescription', 'plage');
    expect([...container.querySelectorAll('.hours span')].map((s) => s.textContent)).toEqual(
      ['00', '03', '06', '09', '12', '15', '18', '21', '24']
    );
    expect(container.querySelectorAll('.tick')).toHaveLength(7);
    unmount();
    const phone = render(DayBar, { day: 'monday', segs, step: 6, onchange: vi.fn() });
    expect([...phone.container.querySelectorAll('.hours span')].map((s) => s.textContent)).toEqual(['00', '06', '12', '18', '24']);
  });

  it('clicking an empty part of the bar adds a slot there', async () => {
    const onchange = vi.fn();
    render(DayBar, { day: 'monday', segs, onchange });
    const bar = screen.getByTestId('bar-monday');
    stubRect(bar);
    await fireEvent.click(bar, { clientX: 600 });
    expect(onchange).toHaveBeenCalledWith([segs[0], { start: 600, end: 720 }, segs[1]]);
  });

  it('dragging a slot moves it', async () => {
    const onchange = vi.fn();
    render(DayBar, { day: 'monday', segs, onchange });
    stubRect(screen.getByTestId('bar-monday'));
    const block = screen.getByRole('button', { name: 'Lundi 06:15–08:00' });
    await fireEvent.pointerDown(block, { clientX: 400, pointerId: 1 });
    await fireEvent.pointerMove(block, { clientX: 460, pointerId: 1 });
    await fireEvent.pointerUp(block, { pointerId: 1 });
    expect(onchange).toHaveBeenLastCalledWith([{ start: 435, end: 540 }, segs[1]]);
  });

  it('dragging an edge resizes the slot', async () => {
    const onchange = vi.fn();
    const { container } = render(DayBar, { day: 'monday', segs, onchange });
    stubRect(screen.getByTestId('bar-monday'));
    const end = container.querySelector('.handle.end')!;
    await fireEvent.pointerDown(end, { clientX: 480, pointerId: 1 });
    await fireEvent.pointerMove(end, { clientX: 540, pointerId: 1 });
    await fireEvent.pointerUp(end, { pointerId: 1 });
    expect(onchange).toHaveBeenLastCalledWith([{ start: 375, end: 540 }, segs[1]]);
  });

  it('a click on the empty bar after a drag still adds a slot', async () => {
    const onchange = vi.fn();
    render(DayBar, { day: 'monday', segs, onchange });
    const bar = screen.getByTestId('bar-monday');
    stubRect(bar);
    const block = screen.getByRole('button', { name: 'Lundi 06:15–08:00' });
    await fireEvent.pointerDown(block, { clientX: 400, pointerId: 1 });
    await fireEvent.pointerMove(block, { clientX: 460, pointerId: 1 });
    await fireEvent.pointerUp(block, { pointerId: 1 });
    onchange.mockClear();
    await fireEvent.pointerDown(bar, { clientX: 600, pointerId: 1 });
    await fireEvent.click(bar, { clientX: 600 });
    expect(onchange).toHaveBeenCalledWith([segs[0], { start: 600, end: 720 }, segs[1]]);
  });

  it('keyboard: arrows move a period by 15 min, Delete removes it', async () => {
    const onchange = vi.fn();
    render(DayBar, { day: 'monday', segs, onchange });
    const block = screen.getByRole('button', { name: 'Lundi 06:15–08:00' });
    await fireEvent.keyDown(block, { key: 'ArrowRight' });
    expect(onchange).toHaveBeenLastCalledWith([{ start: 390, end: 495 }, segs[1]]);
    await fireEvent.keyDown(block, { key: 'ArrowLeft' });
    expect(onchange).toHaveBeenLastCalledWith([{ start: 360, end: 465 }, segs[1]]);
    await fireEvent.keyDown(block, { key: 'Delete' });
    expect(onchange).toHaveBeenLastCalledWith([segs[1]]);
  });

  it('is read-only while pending', async () => {
    const onchange = vi.fn();
    render(DayBar, { day: 'monday', segs, pending: true, onchange });
    const bar = screen.getByTestId('bar-monday');
    stubRect(bar);
    await fireEvent.click(bar, { clientX: 600 });
    await fireEvent.keyDown(screen.getByRole('button', { name: 'Lundi 06:15–08:00' }), { key: 'Delete' });
    expect(onchange).not.toHaveBeenCalled();
  });
});

describe('locked days', () => {
  it('a midnight day shows its periods, hatched, with no handles and no edits', async () => {
    const onchange = vi.fn();
    const { container } = render(DayBar, { day: 'sunday', segs: [{ start: 1200, end: 1440 }], locked: 'midnight', onchange });
    expect(container.querySelector('.bar.locked')).not.toBeNull();
    expect(container.querySelector('.handle')).toBeNull();
    const block = screen.getByRole('button', { name: 'Dimanche 20:00–24:00' });
    expect(block).toHaveAttribute('tabindex', '-1');
    await fireEvent.keyDown(block, { key: 'Delete' });
    stubRect(screen.getByTestId('bar-sunday'));
    await fireEvent.click(screen.getByTestId('bar-sunday'), { clientX: 600 });
    expect(onchange).not.toHaveBeenCalled();
  });
  it('an unrecognised day is hatched, never all eco', () => {
    applyLocale('en');
    const { container } = render(DayBar, { day: 'saturday', segs: [], locked: 'unrecognised', onchange: vi.fn() });
    expect(container.querySelector('.bar.unknown')).not.toBeNull();
    expect(screen.getByTestId('bar-saturday')).toHaveAttribute('aria-label', 'Saturday: unrecognised periods');
    // A labelled picture (axe: aria-label needs a role).
    expect(screen.getByRole('img', { name: 'Saturday: unrecognised periods' })).toBe(screen.getByTestId('bar-saturday'));
  });
  it('read-only: one labelled picture, no buttons, no hours unless asked', () => {
    const { container } = render(DayBar, { segs, label: 'Salon : confort 06:00–08:00' });
    expect(screen.getByRole('img', { name: 'Salon : confort 06:00–08:00' })).toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(container.querySelector('.handle')).toBeNull();
    expect(container.querySelector('.hours')).toBeNull();
    expect(container.querySelectorAll('.block')).toHaveLength(segs.length);
  });
  it('read-only: ghost dims the blocks, ticks write 00 · 06 · 12 · 18 · 24', () => {
    const { container } = render(DayBar, { segs, label: 'x', ghost: true, ticks: true, now: 600 });
    expect(container.querySelector('.bar.ro.ghost')).not.toBeNull();
    expect([...container.querySelectorAll('.hours span')].map((e) => e.textContent)).toEqual(['00', '06', '12', '18', '24']);
    expect(container.querySelector('.now')).not.toBeNull();
  });
});
