import { flushSync } from 'svelte';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import ModeSwitch from './ModeSwitch.svelte';
import { applyLocale } from '$lib/i18n';

describe('ModeSwitch', () => {
  it('marks the current mode and emits changes', async () => {
    const onchange = vi.fn();
    render(ModeSwitch, { value: 'program', onchange });
    expect(screen.getByRole('radio', { name: 'Programme' })).toHaveAttribute('aria-checked', 'true');
    await fireEvent.click(screen.getByRole('radio', { name: 'Arrêt' }));
    expect(onchange).toHaveBeenCalledWith('off');
    await fireEvent.click(screen.getByRole('radio', { name: 'Programme' }));
    expect(onchange).toHaveBeenCalledTimes(1);
  });

  it('shows a pending mode as checked and dashed', () => {
    render(ModeSwitch, { value: 'program', pending: 'manual', onchange: vi.fn() });
    const manual = screen.getByRole('radio', { name: 'Manuel (en attente)' });
    expect(manual).toHaveAttribute('aria-checked', 'true');
    expect(manual).toHaveClass('pending');
    expect(manual.querySelector('svg.edge')).toHaveClass('pending');
    expect(screen.getByRole('radiogroup')).toHaveAttribute('aria-busy', 'true');
  });

  it('closes the dashed edge solid when the radiator reports the requested mode', async () => {
    vi.useFakeTimers();
    const r = render(ModeSwitch, { value: 'program', pending: 'manual', onchange: vi.fn() });
    await r.rerender({ value: 'manual', pending: null });
    flushSync();
    const edge = () => screen.getByRole('radio', { name: 'Manuel' }).querySelector('svg.edge')!;
    expect(edge()).toHaveClass('confirmed');
    expect(screen.getByRole('radiogroup')).toHaveAttribute('aria-busy', 'false');
    await vi.advanceTimersByTimeAsync(250);
    expect(edge()).not.toHaveClass('confirmed');
    vi.useRealTimers();
  });

  it('a mode the radiator did not take never closes solid', async () => {
    const r = render(ModeSwitch, { value: 'program', pending: 'manual', onchange: vi.fn() });
    await r.rerender({ value: 'program', pending: null });
    flushSync();
    expect(screen.getByRole('radio', { name: 'Programme' }).querySelector('svg.edge')).not.toHaveClass('confirmed');
  });

  it('mixed rooms check nothing', () => {
    render(ModeSwitch, { value: 'mixed', onchange: vi.fn() });
    for (const r of screen.getAllByRole('radio')) expect(r).toHaveAttribute('aria-checked', 'false');
  });

  it('uses a roving tabindex; arrows only move focus, activation sends (one command)', async () => {
    const onchange = vi.fn();
    render(ModeSwitch, { value: 'off', onchange });
    const off = screen.getByRole('radio', { name: 'Arrêt' });
    const manual = screen.getByRole('radio', { name: 'Manuel' });
    const program = screen.getByRole('radio', { name: 'Programme' });
    expect(off).toHaveAttribute('tabindex', '0');
    expect(manual).toHaveAttribute('tabindex', '-1');
    off.focus();
    await fireEvent.keyDown(off, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(manual);
    await fireEvent.keyDown(manual, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(program);
    expect(onchange).not.toHaveBeenCalled();
    // Enter/Space activate the focused button natively (a click).
    await fireEvent.click(program);
    expect(onchange).toHaveBeenCalledTimes(1);
    expect(onchange).toHaveBeenCalledWith('program');
  });

  it('first radio is the tab stop when nothing is checked', () => {
    render(ModeSwitch, { value: 'mixed', onchange: vi.fn() });
    expect(screen.getByRole('radio', { name: 'Arrêt' })).toHaveAttribute('tabindex', '0');
  });

  it('paused (disconnected): segments are aria-disabled, keep focus and send nothing', async () => {
    const onchange = vi.fn();
    const r = render(ModeSwitch, { value: 'off', onchange });
    const manual = screen.getByRole('radio', { name: 'Manuel' });
    manual.focus();
    await r.rerender({ disabled: true });
    expect(manual).toHaveAttribute('aria-disabled', 'true');
    expect(manual).not.toBeDisabled();
    expect(document.activeElement).toBe(manual);
    await fireEvent.click(manual);
    expect(onchange).not.toHaveBeenCalled();
  });
});

it('in English: Off / Manual / Schedule, “Sched.” when compact, and the pending name', () => {
  applyLocale('en');
  render(ModeSwitch, { value: 'off', pending: 'manual', compact: true, onchange: vi.fn() });
  expect(screen.getAllByRole('radio').map((r) => r.textContent?.trim())).toEqual(['Off', 'Manual', 'Sched.']);
  expect(screen.getByRole('radio', { name: 'Manual (pending)' })).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: 'Schedule' })).toBeInTheDocument();
});
