import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '$lib/api/client';
import { alerts } from '$lib/stores/alerts.svelte';
import Page from './+page.svelte';

vi.mock('$lib/api/client', () => ({
  api: { settings: vi.fn(), putTariffDoc: vi.fn(), tempoPrices: vi.fn() },
  ApiError: class extends Error {}
}));

const NIGHT = [{ start: '22:00', end: '06:00' }];
const TARIFF = {
  option: 'hchp', kva: 9, hc_slots: NIGHT,
  hc_schedules: [{ valid_from: '2025-01-15', variants: [{ months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], slots: NIGHT }] }],
  tempo_hours: { hc_start: '22:00', hc_end: '06:00', day_start: '06:00' },
  prices: [{ valid_from: '2025-01-15', option: 'hchp', subscription_eur_month: 15, rates: { hc: 0.2068, hp: 0.27 } }]
};

beforeEach(() => {
  vi.clearAllMocks();
  alerts.reset();
  alerts.list = [];
});

describe('Maison › Tarif', () => {
  it('a failed load says so, with Réessayer', async () => {
    vi.mocked(api.settings).mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce({ tariff: null, prefill: null } as never);
    render(Page);
    const retry = await screen.findByRole('button', { name: 'Réessayer' });
    expect(screen.getByText(/Impossible de charger le tarif/)).toBeInTheDocument();
    await fireEvent.click(retry);
    expect(await screen.findByRole('button', { name: 'Enregistrer le tarif' })).toBeInTheDocument();
  });

  it('an hc_changed alert offers its off-peak hours inside the tariff form', async () => {
    vi.mocked(api.settings).mockResolvedValueOnce({ tariff: TARIFF, prefill: null } as never);
    alerts.list = [
      { id: 3, kind: 'hc_changed', severity: 'info', params: { slots: [{ start: '23:00', end: '07:00' }] }, first_seen: 0, last_seen: 0, resolved_at: null, dismissed: false }
    ];
    render(Page);
    expect(await screen.findByText(/Enedis indique de nouvelles heures creuses\s: 23:00–07:00\./)).toBeInTheDocument();
  });
});
