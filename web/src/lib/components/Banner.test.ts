import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import Banner from './Banner.svelte';

const now = Date.parse('2026-10-13T12:00:00Z');

describe('Banner', () => {
  it('is silent when everything is fine', () => {
    const { container } = render(Banner, {
      connection: 'open', status: { connected: true, last_ok_at: now / 1000, last_error: null }, now
    });
    expect(container.textContent?.trim()).toBe('');
    // the live region stays mounted (so announcements work) but shows nothing
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });
  it('keeps the same live region when the message appears', async () => {
    const { rerender } = render(Banner, {
      connection: 'open', status: { connected: true, last_ok_at: now / 1000, last_error: null }, now
    });
    const region = screen.getByRole('status');
    await rerender({ connection: 'reconnecting', status: { connected: true, last_ok_at: null, last_error: null }, now });
    expect(screen.getByRole('status')).toBe(region);
    expect(region).toHaveTextContent('Reconnexion à Kelvin…');
  });
  it('tells the user Kelvin is reconnecting', () => {
    render(Banner, { connection: 'reconnecting', status: { connected: true, last_ok_at: null, last_error: null }, now });
    expect(screen.getByRole('status')).toHaveTextContent('Reconnexion à Kelvin…');
  });
  it('tells the user Cozytouch is unreachable and how old the data is', () => {
    render(Banner, {
      connection: 'open',
      status: { connected: false, last_ok_at: (now - 12 * 60_000) / 1000, last_error: 'QUOTA_EXCEEDED' },
      now
    });
    expect(screen.getByRole('status')).toHaveTextContent('Cozytouch injoignable — données il y a 12 min');
  });
  it('asks for a new login when the stored Cozytouch password is refused', () => {
    render(Banner, {
      connection: 'open',
      status: { connected: false, last_ok_at: now / 1000, last_error: 'bad credentials', auth_rejected: true },
      now
    });
    expect(screen.getByRole('status')).toHaveTextContent('Mot de passe Cozytouch modifié : reconnectez-vous');
    expect(screen.getByRole('link', { name: 'Se reconnecter' })).toHaveAttribute('href', '/login?reauth=1');
  });
});
