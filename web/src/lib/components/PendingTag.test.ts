import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import PendingTag from './PendingTag.svelte';
import { forEachLocale } from '$lib/i18n/testing';
import { house } from '$lib/stores/house.svelte';
import type { Radiator } from '$lib/api/types';

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
      pending: { ...base, status: 'failed', error: 'Le radiateur n’a pas confirmé la commande.' },
      onretry,
      ondismiss: vi.fn()
    });
    expect(screen.getByText('Le radiateur n’a pas confirmé la commande.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ignorer' }).querySelector('svg')).not.toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(onretry).toHaveBeenCalledWith('p1');
  });
  it('a command confirmed with offline radiators says so, for the house and for a room', () => {
    const p = { ...base, radiator_ids: ['a', 'b', 'c'], status: 'confirmed' as const, offline: ['b', 'c'] };
    const house = render(PendingTag, { pending: p, onretry: vi.fn(), ondismiss: vi.fn() });
    expect(house.container).toHaveTextContent('Confirmé · 2 hors ligne');
    house.unmount();
    const off = render(PendingTag, { pending: p, radiators: ['c'], onretry: vi.fn(), ondismiss: vi.fn() });
    expect(off.container).toHaveTextContent('Hors ligne : consigne non reçue');
    expect(screen.queryByRole('button', { name: 'Réessayer' })).toBeNull();
    off.unmount();
    render(PendingTag, { pending: p, radiators: ['a'], onretry: vi.fn(), ondismiss: vi.fn() });
    expect(screen.getByText('Confirmé')).toBeInTheDocument();
  });
  it('an offline room back online since says it was offline when the setting was sent', () => {
    house.radiators = { c: { id: 'c', reachable: true } as Radiator };
    const p = { ...base, radiator_ids: ['c'], status: 'confirmed' as const, offline: ['c'] };
    const { container } = render(PendingTag, { pending: p, radiators: ['c'], onretry: vi.fn(), ondismiss: vi.fn() });
    expect(container).toHaveTextContent('Consigne non reçue (hors ligne à l’envoi)');
    house.radiators = {};
  });
  it('shows confirmed', () => {
    render(PendingTag, { pending: { ...base, status: 'confirmed' }, onretry: vi.fn(), ondismiss: vi.fn() });
    expect(screen.getByText('Confirmé')).toBeInTheDocument();
  });
});

forEachLocale((l) => {
  const en = l === 'en';
  it('sending and a coded failure read in the active language', () => {
    render(PendingTag, { pending: { ...base, status: 'pending' }, onretry: vi.fn(), ondismiss: vi.fn() });
    expect(screen.getByText(en ? 'Sending…' : 'Envoi…')).toBeInTheDocument();
  });
  it('a failure shows its code’s text and the retry and dismiss controls', () => {
    render(PendingTag, {
      pending: { ...base, status: 'failed', error: 'Le radiateur n’a pas confirmé la commande.', error_code: 'no_confirmation' },
      onretry: vi.fn(),
      ondismiss: vi.fn()
    });
    expect(screen.getByText(en ? 'The radiator hasn’t confirmed the command.' : 'Le radiateur n’a pas confirmé la commande.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: en ? 'Retry' : 'Réessayer' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: en ? 'Dismiss' : 'Ignorer' })).toBeInTheDocument();
  });
  it('shows a write Cozytouch has not confirmed yet as neutral, without Réessayer', async () => {
    const ondismiss = vi.fn();
    const { container } = render(PendingTag, {
      pending: { ...base, status: 'unconfirmed', error_code: 'setup_no_confirmation' },
      onretry: vi.fn(),
      ondismiss
    });
    expect(screen.getByText(en ? 'Not confirmed yet' : 'Pas encore confirmé')).toBeInTheDocument();
    // The reason is visible text, not a title only (review T8-1).
    expect(container).toHaveTextContent(en ? 'Kelvin checks at the next refresh' : 'Kelvin vérifie au prochain relevé');
    expect(screen.queryByRole('button', { name: en ? 'Retry' : 'Réessayer' })).toBeNull();
    expect(container.querySelector('.bad')).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: en ? 'Dismiss' : 'Ignorer' }));
    expect(ondismiss).toHaveBeenCalledWith('p1');
  });
});
