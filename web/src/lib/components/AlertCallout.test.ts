import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { forEachLocale } from '$lib/i18n/testing';
import { alerts } from '$lib/stores/alerts.svelte';
import AlertCallout from './AlertCallout.svelte';

vi.mock('$lib/api/client', () => ({ api: { alerts: vi.fn().mockResolvedValue([]), dismissAlert: vi.fn().mockResolvedValue(undefined) }, ApiError: class extends Error {} }));

const price = { id: 3, kind: 'price_change', severity: 'info' as const, params: { date: '2027-02-01' }, first_seen: 0, last_seen: 0, resolved_at: null, dismissed: false };

describe('AlertCallout', () => {
  it('text, link and a dismiss button; a bad alert is an alert role, others a status', async () => {
    const spy = vi.spyOn(alerts, 'dismiss');
    const a = render(AlertCallout, { alert: price });
    expect(screen.getByRole('status')).toHaveTextContent(/les prix changent le 1er février/);
    expect(screen.getByRole('link', { name: 'Ajouter les prix' })).toHaveAttribute('href', '/home/tariff');
    await fireEvent.click(screen.getByRole('button', { name: /^Masquer/ }));
    expect(spy).toHaveBeenCalledWith(3);
    a.unmount();
    render(AlertCallout, { alert: { ...price, kind: 'linky_stalled', severity: 'bad', params: { last_day: '2026-10-01', days: 13 } } });
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
  it('an offline radiator is calm: a status in the neutral style, even when the backend rates it bad', () => {
    const { container } = render(AlertCallout, {
      alert: { ...price, kind: 'radiator_unreachable', severity: 'bad', params: { radiator_id: 'a', room_id: 'p-ch2', since: null } }
    });
    expect(screen.getByRole('status')).toHaveTextContent(/hors ligne depuis plus de 30/);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(container.querySelector('.callout')).not.toHaveClass('bad');
  });
  it('an unknown kind renders nothing', () => {
    const { container } = render(AlertCallout, { alert: { ...price, kind: 'budget' } });
    expect(container.textContent?.trim()).toBe('');
  });
});

forEachLocale((l) => {
  it('dismiss label', () => {
    render(AlertCallout, { alert: price });
    expect(screen.getByRole('button', { name: new RegExp(l === 'fr' ? '^Masquer' : '^Dismiss') })).toBeInTheDocument();
  });
});
