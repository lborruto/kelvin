import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import SupportChip from './SupportChip.svelte';

describe('SupportChip', () => {
  it('says how far Kelvin vouches for a device, and nothing for tested hardware', () => {
    const { container, rerender } = render(SupportChip, { support: 'tested' });
    expect(container.textContent?.trim()).toBe('');
    rerender({ support: 'expected' });
    expect(screen.getByText('Devrait fonctionner')).toBeInTheDocument();
    rerender({ support: 'experimental' });
    expect(screen.getByText('Expérimental')).toBeInTheDocument();
    rerender({ support: 'readonly' });
    expect(screen.getByText('Lecture seule')).toBeInTheDocument();
    rerender({ support: undefined });
    expect(container.textContent?.trim()).toBe('');
  });
});
