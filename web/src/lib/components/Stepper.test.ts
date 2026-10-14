import { flushSync } from 'svelte';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Stepper from './Stepper.svelte';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const tap = async (el: HTMLElement) => {
  await fireEvent.pointerDown(el);
  await fireEvent.pointerUp(el);
};

describe('Stepper', () => {
  it('rapid taps send one command with the final value', async () => {
    const onchange = vi.fn();
    render(Stepper, { value: 20, min: 7, max: 28, label: 'Consigne', onchange });
    const plus = screen.getByRole('button', { name: 'Augmenter Consigne' });
    await tap(plus);
    await tap(plus);
    await tap(plus);
    expect(screen.getByRole('status')).toHaveTextContent('21,5');
    expect(onchange).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(600);
    expect(onchange).toHaveBeenCalledTimes(1);
    expect(onchange).toHaveBeenCalledWith(21.5);
  });

  it('holding repeats', async () => {
    const onchange = vi.fn();
    render(Stepper, { value: 20, min: 7, max: 28, label: 'Consigne', onchange });
    const minus = screen.getByRole('button', { name: 'Diminuer Consigne' });
    await fireEvent.pointerDown(minus);
    await vi.advanceTimersByTimeAsync(400 + 120 * 3);
    await fireEvent.pointerUp(minus);
    expect(screen.getByRole('status')).toHaveTextContent('18,0');
  });

  it('draws its −/+ as icons, named by their aria-labels', () => {
    render(Stepper, { value: 20, min: 7, max: 28, label: 'Consigne', onchange: vi.fn() });
    for (const name of ['Diminuer Consigne', 'Augmenter Consigne']) {
      const b = screen.getByRole('button', { name });
      expect(b.querySelector('svg')).not.toBeNull();
      expect(b.textContent?.trim()).toBe('');
    }
  });

  it('clamps and disables at the bounds', async () => {
    render(Stepper, { value: 28, min: 7, max: 28, label: 'Consigne', onchange: vi.fn() });
    expect(screen.getByRole('button', { name: 'Augmenter Consigne' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('keeps keyboard focus on the button that reaches a bound', async () => {
    const onchange = vi.fn();
    render(Stepper, { value: 7.5, min: 7, max: 28, label: 'Absence', debounceMs: 0, onchange });
    const minus = screen.getByRole('button', { name: 'Diminuer Absence' });
    minus.focus();
    await fireEvent.keyDown(minus, { key: 'Enter' });
    await vi.advanceTimersByTimeAsync(0);
    expect(screen.getByRole('status')).toHaveTextContent('7,0');
    expect(minus).toHaveAttribute('aria-disabled', 'true');
    expect(minus).not.toBeDisabled();
    expect(document.activeElement).toBe(minus);
    // A press at the bound does nothing.
    await fireEvent.keyDown(minus, { key: 'Enter' });
    await vi.advanceTimersByTimeAsync(0);
    expect(onchange).toHaveBeenCalledTimes(1);
  });

  it('announces the committed value once, not every step', async () => {
    const { announcer } = await import('$lib/stores/announcer.svelte');
    announcer.clear();
    render(Stepper, { value: 20, min: 7, max: 28, label: 'Confort', onchange: vi.fn() });
    const plus = screen.getByRole('button', { name: 'Augmenter Confort' });
    await tap(plus);
    await tap(plus);
    expect(announcer.polite).toBe('');
    await vi.advanceTimersByTimeAsync(600);
    expect(announcer.polite).toBe('Confort : 21,0\u00a0°C');
    expect(screen.getByRole('status')).not.toHaveAttribute('aria-live');
  });

  it('keyboard Enter steps once', async () => {
    const onchange = vi.fn();
    render(Stepper, { value: 20, min: 7, max: 28, label: 'Consigne', onchange });
    await fireEvent.keyDown(screen.getByRole('button', { name: 'Augmenter Consigne' }), { key: 'Enter' });
    await vi.advanceTimersByTimeAsync(600);
    expect(onchange).toHaveBeenCalledWith(20.5);
  });

  it('shows a dash for an unknown value and marks pending', () => {
    const { container } = render(Stepper, { value: null, min: 7, max: 28, label: 'Consigne', pending: true, onchange: vi.fn() });
    expect(screen.getByRole('status')).toHaveTextContent('—');
    expect(container.querySelector('.stepper')).toHaveClass('pending');
  });

  it('without a value, − and + are disabled and never send a bound', async () => {
    const onchange = vi.fn();
    render(Stepper, { value: null, min: 7, max: 28, label: 'Consigne', onchange });
    const minus = screen.getByRole('button', { name: 'Diminuer Consigne' });
    const plus = screen.getByRole('button', { name: 'Augmenter Consigne' });
    expect(minus).toHaveAttribute('aria-disabled', 'true');
    expect(plus).toHaveAttribute('aria-disabled', 'true');
    await fireEvent.keyDown(minus, { key: 'Enter' });
    await tap(plus);
    await vi.advanceTimersByTimeAsync(600);
    expect(onchange).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('—');
  });

  it('a rejected send (null result) shows the server value again at once', async () => {
    const onchange = vi.fn().mockResolvedValue(null);
    render(Stepper, { value: 20, min: 7, max: 28, label: 'Consigne', onchange });
    await tap(screen.getByRole('button', { name: 'Augmenter Consigne' }));
    await vi.advanceTimersByTimeAsync(600);
    expect(onchange).toHaveBeenCalledWith(20.5);
    await vi.advanceTimersByTimeAsync(0);
    flushSync();
    expect(screen.getByRole('status')).toHaveTextContent('20,0');
  });

  it('an accepted send keeps the optimistic value', async () => {
    const onchange = vi.fn().mockResolvedValue({ id: 'p1' });
    render(Stepper, { value: 20, min: 7, max: 28, label: 'Consigne', onchange });
    await tap(screen.getByRole('button', { name: 'Augmenter Consigne' }));
    await vi.advanceTimersByTimeAsync(600);
    flushSync();
    expect(screen.getByRole('status')).toHaveTextContent('20,5');
  });

  it('adopts a changed server value after a commit', async () => {
    const onchange = vi.fn();
    const r = render(Stepper, { props: { value: 20, min: 7, max: 28, label: 'Consigne', onchange } });
    await tap(screen.getByRole('button', { name: 'Augmenter Consigne' }));
    await vi.advanceTimersByTimeAsync(600);
    expect(onchange).toHaveBeenCalledWith(20.5);
    await r.rerender({ value: 20 });
    expect(screen.getByRole('status')).toHaveTextContent('20,5');
    await r.rerender({ value: 19 });
    flushSync();
    expect(screen.getByRole('status')).toHaveTextContent('19,0');
  });

  it('shows the server value when pending ends unchanged', async () => {
    const r = render(Stepper, { props: { value: 20, min: 7, max: 28, label: 'Consigne', onchange: vi.fn() } });
    await tap(screen.getByRole('button', { name: 'Augmenter Consigne' }));
    await vi.advanceTimersByTimeAsync(600);
    await r.rerender({ pending: true });
    expect(screen.getByRole('status')).toHaveTextContent('20,5');
    await r.rerender({ pending: false });
    flushSync();
    expect(screen.getByRole('status')).toHaveTextContent('20,0');
  });

  it('falls back to the server value after 10 s', async () => {
    render(Stepper, { value: 20, min: 7, max: 28, label: 'Consigne', onchange: vi.fn() });
    await tap(screen.getByRole('button', { name: 'Augmenter Consigne' }));
    await vi.advanceTimersByTimeAsync(600);
    await vi.advanceTimersByTimeAsync(10_000);
    flushSync();
    expect(screen.getByRole('status')).toHaveTextContent('20,0');
  });

  it('unmounting mid-hold stops all timers', async () => {
    const onchange = vi.fn();
    const r = render(Stepper, { value: 20, min: 7, max: 28, label: 'Consigne', onchange });
    await fireEvent.pointerDown(screen.getByRole('button', { name: 'Augmenter Consigne' }));
    await vi.advanceTimersByTimeAsync(500);
    r.unmount();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(2000);
    expect(onchange).not.toHaveBeenCalled();
  });

  it('ignores non-primary buttons and stops repeating at a bound', async () => {
    render(Stepper, { value: 27.5, min: 7, max: 28, label: 'Consigne', onchange: vi.fn() });
    const plus = screen.getByRole('button', { name: 'Augmenter Consigne' });
    await fireEvent.pointerDown(plus, { button: 2 });
    expect(screen.getByRole('status')).toHaveTextContent('27,5');
    await fireEvent.pointerDown(plus);
    await vi.advanceTimersByTimeAsync(400 + 120 * 3);
    expect(screen.getByRole('status')).toHaveTextContent('28,0');
    await vi.advanceTimersByTimeAsync(120);
    // repeat interval cleared at the bound: only the commit timer remains
    expect(vi.getTimerCount()).toBe(1);
  });

  it('the dashed pending underline morphs to solid when the radiator confirms the sent value', async () => {
    const r = render(Stepper, { props: { value: 20, min: 7, max: 28, label: 'Consigne', onchange: vi.fn() } });
    const line = () => r.container.querySelector('.val svg.edge')!;
    await tap(screen.getByRole('button', { name: 'Augmenter Consigne' }));
    await vi.advanceTimersByTimeAsync(600);
    await r.rerender({ pending: true });
    expect(r.container.querySelector('.stepper')).toHaveClass('pending');
    await r.rerender({ value: 20.5, pending: false });
    flushSync();
    expect(line()).toHaveClass('confirmed');
    await vi.advanceTimersByTimeAsync(250);
    expect(line()).not.toHaveClass('confirmed');
  });

  it('a failed command does not morph to solid', async () => {
    const r = render(Stepper, { props: { value: 20, min: 7, max: 28, label: 'Consigne', onchange: vi.fn() } });
    await tap(screen.getByRole('button', { name: 'Augmenter Consigne' }));
    await vi.advanceTimersByTimeAsync(600);
    await r.rerender({ pending: true });
    await r.rerender({ pending: false });
    flushSync();
    expect(r.container.querySelector('.val svg.edge')).not.toHaveClass('confirmed');
  });

  it('sizes the underline to the value, not the whole control', () => {
    const { container } = render(Stepper, { value: 20, min: 7, max: 28, label: 'Consigne', onchange: vi.fn() });
    const val = container.querySelector('output .val')!;
    expect(val).toHaveTextContent('20,0');
    expect(val.querySelector('svg.edge')).not.toBeNull();
  });
});
