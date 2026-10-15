import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import CommandSwitch from './CommandSwitch.svelte';

const options = [
  { value: 'eco', label: 'Éco' },
  { value: 'off', label: 'Arrêt' }
];

describe('CommandSwitch', () => {
  it('checks the reported value and sends another one', async () => {
    const onchange = vi.fn();
    render(CommandSwitch, { options, value: 'eco', label: 'Allure', onchange });
    expect(screen.getByRole('radio', { name: 'Éco' })).toHaveAttribute('aria-checked', 'true');
    await fireEvent.click(screen.getByRole('radio', { name: 'Éco' }));
    expect(onchange).not.toHaveBeenCalled();
    await fireEvent.click(screen.getByRole('radio', { name: 'Arrêt' }));
    expect(onchange).toHaveBeenCalledWith('off');
  });

  it('shows the requested value as pending', () => {
    render(CommandSwitch, { options, value: 'eco', pending: 'off', label: 'Allure', onchange: vi.fn() });
    expect(screen.getByRole('radio', { name: 'Arrêt (en attente)' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radiogroup', { name: 'Allure' })).toHaveAttribute('aria-busy', 'true');
  });

  it('checks nothing for an unknown value and sends nothing while paused', async () => {
    const onchange = vi.fn();
    render(CommandSwitch, { options, value: null, disabled: true, label: 'Allure', onchange });
    expect(screen.queryByRole('radio', { checked: true })).toBeNull();
    expect(screen.getByRole('radio', { name: 'Éco' })).toHaveAttribute('tabindex', '0');
    await fireEvent.click(screen.getByRole('radio', { name: 'Arrêt' }));
    expect(onchange).not.toHaveBeenCalled();
  });
});
