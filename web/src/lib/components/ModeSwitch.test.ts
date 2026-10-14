import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import ModeSwitch from './ModeSwitch.svelte';

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
    const manual = screen.getByRole('radio', { name: 'Manuel' });
    expect(manual).toHaveAttribute('aria-checked', 'true');
    expect(manual).toHaveClass('pending');
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
});
