import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import Scrubber from './Scrubber.svelte';

const base = { centers: [50, 150, 250, 350, 450, 550, 650, 750], W: 800, label: 'Parcourir', idle: 'rien', valuetext: (i: number) => `n° ${i}` };

describe('Scrubber', () => {
  it('is a slider: arrows step, PageUp jumps 3 h, Home/End, Esc clears; the first key starts at an end', async () => {
    const onchange = vi.fn();
    const { rerender } = render(Scrubber, { ...base, index: null, onchange });
    const s = screen.getByRole('slider', { name: 'Parcourir' });
    expect(s).toHaveAttribute('aria-valuetext', 'rien');
    expect(s).toHaveAttribute('aria-valuemax', '7');
    await fireEvent.keyDown(s, { key: 'ArrowRight' });
    expect(onchange).toHaveBeenLastCalledWith(0, expect.anything());
    await fireEvent.keyDown(s, { key: 'ArrowLeft' });
    expect(onchange).toHaveBeenLastCalledWith(7, expect.anything());
    await rerender({ ...base, index: 1, onchange });
    expect(s).toHaveAttribute('aria-valuenow', '1');
    expect(s).toHaveAttribute('aria-valuetext', 'n° 1');
    await fireEvent.keyDown(s, { key: 'PageUp' });
    expect(onchange).toHaveBeenLastCalledWith(7, expect.anything());
    await fireEvent.keyDown(s, { key: 'Home' });
    expect(onchange).toHaveBeenLastCalledWith(0, expect.anything());
    await fireEvent.keyDown(s, { key: 'Escape' });
    expect(onchange).toHaveBeenLastCalledWith(null, expect.anything());
    onchange.mockClear();
    await fireEvent.keyDown(s, { key: 'a' });
    expect(onchange).not.toHaveBeenCalled();
  });

  it('snaps the pointer to the nearest interval; a touch moves only while pressed', async () => {
    const onchange = vi.fn();
    render(Scrubber, { ...base, index: null, onchange });
    const s = screen.getByRole('slider');
    await fireEvent.pointerMove(s, { clientX: 260, pointerType: 'mouse' });
    expect(onchange).toHaveBeenLastCalledWith(2, expect.anything());
    await fireEvent.pointerDown(s, { clientX: 640, pointerType: 'touch', pointerId: 1 });
    expect(onchange).toHaveBeenLastCalledWith(6, expect.anything());
    onchange.mockClear();
    await fireEvent.pointerMove(s, { clientX: 40, pointerType: 'touch', buttons: 0 });
    expect(onchange).not.toHaveBeenCalled();
    await fireEvent.pointerMove(s, { clientX: 40, pointerType: 'touch', buttons: 1 });
    expect(onchange).toHaveBeenLastCalledWith(0, expect.anything());
  });

  it('starts the keyboard at `start`, clears on a mouse leaving with `leave`, and on a second tap with `toggle`', async () => {
    const onchange = vi.fn();
    const { rerender } = render(Scrubber, { ...base, index: null, onchange, start: 4, leave: true, toggle: true });
    const s = screen.getByRole('slider');
    await fireEvent.keyDown(s, { key: 'ArrowRight' });
    expect(onchange).toHaveBeenLastCalledWith(4, 'key');
    await fireEvent.keyDown(s, { key: 'End' });
    expect(onchange).toHaveBeenLastCalledWith(7, 'key');
    await rerender({ ...base, index: 2, onchange, start: 4, leave: true, toggle: true });
    await fireEvent.pointerLeave(s, { pointerType: 'mouse' });
    expect(onchange).toHaveBeenLastCalledWith(null, 'hover');
    await fireEvent.pointerDown(s, { clientX: 260, pointerType: 'touch', pointerId: 1 });
    expect(onchange).toHaveBeenLastCalledWith(2, 'press');
    await fireEvent.pointerUp(s, { clientX: 260, pointerType: 'touch', pointerId: 1 });
    expect(onchange).toHaveBeenLastCalledWith(null, 'press');
    onchange.mockClear();
    await fireEvent.pointerDown(s, { clientX: 640, pointerType: 'touch', pointerId: 1 });
    await fireEvent.pointerUp(s, { clientX: 640, pointerType: 'touch', pointerId: 1 });
    expect(onchange).toHaveBeenLastCalledWith(6, 'press');
  });

  it('Esc with a moment chosen stays in the chart (a modal sheet around it does not close)', async () => {
    const onchange = vi.fn();
    render(Scrubber, { ...base, index: 3, onchange });
    const outer = vi.fn();
    document.addEventListener('keydown', outer);
    await fireEvent.keyDown(screen.getByRole('slider'), { key: 'Escape' });
    document.removeEventListener('keydown', outer);
    expect(onchange).toHaveBeenLastCalledWith(null, 'key');
    expect(outer).not.toHaveBeenCalled();
  });
});
