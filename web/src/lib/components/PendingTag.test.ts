import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import PendingTag from './PendingTag.svelte';

const base = { id: 'p1', label: 'Salon : Manuel', radiator_ids: ['a'], error: null, created_at: 1, expected: {} };

describe('PendingTag', () => {
  it('renders nothing without a pending', () => {
    const { container } = render(PendingTag, { onretry: vi.fn(), ondismiss: vi.fn() });
    expect(container.textContent?.trim()).toBe('');
  });
  it('shows sending', () => {
    render(PendingTag, { pending: { ...base, status: 'pending' }, onretry: vi.fn(), ondismiss: vi.fn() });
    expect(screen.getByText('Envoi…')).toBeInTheDocument();
  });
  it('shows a failure with Réessayer', async () => {
    const onretry = vi.fn();
    render(PendingTag, {
      pending: { ...base, status: 'failed', error: 'Pas de confirmation du radiateur.' },
      onretry,
      ondismiss: vi.fn()
    });
    expect(screen.getByText('Pas de confirmation du radiateur.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ignorer' }).querySelector('svg')).not.toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(onretry).toHaveBeenCalledWith('p1');
  });
  it('shows confirmed', () => {
    render(PendingTag, { pending: { ...base, status: 'confirmed' }, onretry: vi.fn(), ondismiss: vi.fn() });
    expect(screen.getByText('Confirmé')).toBeInTheDocument();
  });
});
