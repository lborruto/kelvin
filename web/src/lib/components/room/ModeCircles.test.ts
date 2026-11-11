import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ModeCircles from './ModeCircles.svelte';

afterEach(() => vi.restoreAllMocks());

describe('ModeCircles', () => {
  const props = { value: 'manual' as const, modes: ['off', 'manual', 'program'] as never, label: 'Mode', onchange: vi.fn() };

  it('renders without a Svelte warning (the buttons are bound to reactive state)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(ModeCircles, props);
    expect(warn.mock.calls.map((c) => c.join(' ')).filter((t) => /binding_property_non_reactive/.test(t))).toEqual([]);
  });

  it('a radio group: the arrows move focus between the modes and wrap; one tab stop on the current mode', async () => {
    render(ModeCircles, props);
    const [off, manual, program] = ['Arrêt', 'Manuel', 'Programme'].map((name) => screen.getByRole('radio', { name }));
    expect([off, manual, program].map((b) => b.tabIndex)).toEqual([-1, 0, -1]);
    manual.focus();
    await fireEvent.keyDown(manual, { key: 'ArrowRight' });
    expect(program).toHaveFocus();
    await fireEvent.keyDown(program, { key: 'ArrowDown' });
    expect(off).toHaveFocus();
    await fireEvent.keyDown(off, { key: 'ArrowLeft' });
    expect(program).toHaveFocus();
  });
});
