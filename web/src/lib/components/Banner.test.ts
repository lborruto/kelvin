import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Banner, { DOWN_MS, QUIET_MS } from './Banner.svelte';
import { applyLocale } from '$lib/i18n';

// 13 Oct 2026, 14:00 in Paris (UTC+2): the injected clock; « données de 13:58 » is two minutes before.
const now = Date.parse('2026-10-13T12:00:00Z');
const ok = { connected: true, last_ok_at: now / 1000, last_error: null };
const dataAt = now - 2 * 60_000;
const banner = () => screen.getByRole('status');
const tone = () => banner().className.match(/\b(neutral|bad)\b/)?.[1] ?? null;

afterEach(() => applyLocale('fr'));

describe('Banner', () => {
  it('is silent when everything is fine', () => {
    const { container } = render(Banner, { connection: 'open', status: ok, now });
    expect(container.textContent?.trim()).toBe('');
    // the live region stays mounted (so announcements work) but shows nothing
    expect(banner()).toBeEmptyDOMElement();
  });
  it('the browser offline: neutral at once, with the age of the data', () => {
    render(Banner, { connection: 'reconnecting', status: ok, now, offline: true, lostAt: now, dataAt });
    expect(banner()).toHaveTextContent('Hors connexion · données de 13:58');
    expect(tone()).toBe('neutral');
  });
  it('Kelvin lost: silent under 60 s, neutral after, bad with « Réessayer » after 3 min (injected clock)', async () => {
    const props = { connection: 'reconnecting' as const, status: ok, dataAt, lostAt: now };
    const { rerender } = render(Banner, { ...props, now: now + QUIET_MS - 1 });
    const region = banner();
    expect(region).toBeEmptyDOMElement();
    await rerender({ ...props, now: now + QUIET_MS });
    expect(banner()).toBe(region);
    expect(region).toHaveTextContent('Reconnexion à Kelvin… · données de 13:58');
    expect(tone()).toBe('neutral');
    expect(screen.queryByRole('button', { name: 'Réessayer' })).toBeNull();
    const onretry = vi.fn();
    await rerender({ ...props, now: now + DOWN_MS, onretry });
    expect(region).toHaveTextContent('Kelvin ne répond pas depuis 3 min · données de 13:58');
    expect(tone()).toBe('bad');
    await fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(onretry).toHaveBeenCalled();
  });
  it('a retry in between (tab back, online: « connecting ») neither hides the banner nor restarts its stages', async () => {
    const props = { status: ok, dataAt, lostAt: now - 5 * 60_000, now };
    const { rerender } = render(Banner, { ...props, connection: 'reconnecting' });
    expect(tone()).toBe('bad');
    await rerender({ ...props, connection: 'connecting' });
    expect(tone()).toBe('bad');
    expect(banner()).toHaveTextContent('Kelvin ne répond pas depuis 5 min');
    await rerender({ ...props, connection: 'reconnecting' });
    expect(tone()).toBe('bad');
  });
  it('data from another day is dated', () => {
    render(Banner, { connection: 'reconnecting', status: ok, now, offline: true, dataAt: now - 26 * 3_600_000 });
    expect(banner()).toHaveTextContent(/Hors connexion · données de lun\. 12 oct\., 12:00/);
  });
  it('Kelvin unreachable at load (nothing ever arrived): neutral « Reconnexion » at once', () => {
    render(Banner, { connection: 'reconnecting', status: ok, now, lostAt: now, dataAt: null });
    expect(banner()).toHaveTextContent('Reconnexion à Kelvin…');
    expect(tone()).toBe('neutral');
  });
  it('tells the user Cozytouch is unreachable and how old the data is (bad, unchanged)', () => {
    render(Banner, {
      connection: 'open',
      status: { connected: false, last_ok_at: (now - 12 * 60_000) / 1000, last_error: 'QUOTA_EXCEEDED' },
      now
    });
    expect(banner()).toHaveTextContent('Cozytouch injoignable — données de 13:48');
    expect(tone()).toBe('bad');
  });
  it('asks for a new login when the stored Cozytouch password is refused', () => {
    render(Banner, {
      connection: 'open',
      status: { connected: false, last_ok_at: now / 1000, last_error: 'bad credentials', auth_rejected: true },
      now
    });
    expect(banner()).toHaveTextContent('Mot de passe Cozytouch modifié : reconnectez-vous');
    expect(screen.getByRole('link', { name: 'Se reconnecter' })).toHaveAttribute('href', '/login?reauth=1');
    expect(tone()).toBe('bad');
  });
});

describe('Banner in English', () => {
  it('says what happened and how old the data is', async () => {
    applyLocale('en');
    const { rerender } = render(Banner, { connection: 'open', status: { connected: false, last_ok_at: (now - 12 * 60_000) / 1000, last_error: 'Q' }, now });
    expect(banner()).toHaveTextContent('Can’t reach Cozytouch — data from 13:48');
    await rerender({ connection: 'reconnecting', status: ok, now, offline: true, dataAt });
    expect(banner()).toHaveTextContent('Offline · data from 13:58');
    await rerender({ connection: 'reconnecting', status: ok, now: now + DOWN_MS + 60_000, offline: false, lostAt: now, dataAt });
    expect(banner()).toHaveTextContent('Kelvin hasn’t answered for 4 min · data from 13:58');
  });
});
