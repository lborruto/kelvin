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
  it('reads the tariff in force without an input, the state line says since when', async () => {
    vi.mocked(api.settings).mockResolvedValueOnce({ tariff: TARIFF, prefill: null } as never);
    const { container } = render(Page);
    expect(await screen.findByRole('heading', { name: 'Tarif en vigueur' })).toBeInTheDocument();
    expect(screen.getByText('Option Heures creuses / pleines depuis le 15 janvier 2025')).toBeInTheDocument();
    expect(container.querySelector('main input, section input, select')).toBeNull();
    expect(screen.getByRole('button', { name: /^Historique des prix/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('1 ligne')).toBeInTheDocument();
  });

  it('« Nouveau prix… » opens the editor with the date focused; saving closes it, pulses and says « Tarif enregistré. »', async () => {
    vi.mocked(api.settings).mockResolvedValueOnce({ tariff: TARIFF, prefill: null } as never);
    const next = { ...TARIFF, prices: [...TARIFF.prices, { valid_from: '2026-10-15', option: 'hchp', subscription_eur_month: 15, rates: { hc: 0.2, hp: 0.27 } }] };
    vi.mocked(api.putTariffDoc).mockResolvedValueOnce({ tariff: next, prefill: null } as never);
    render(Page);
    await fireEvent.click(await screen.findByRole('button', { name: 'Nouveau prix…' }));
    expect(screen.getByRole('heading', { name: 'Nouveau prix' })).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByLabelText('Applicable à partir du'));
    await fireEvent.input(screen.getByLabelText('Prix heures creuses (€/kWh)'), { target: { value: '0,2' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le tarif' }));
    expect(await screen.findByText('Tarif enregistré.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Tarif en vigueur' })).toBeInTheDocument();
    expect(document.querySelectorAll('.pulse').length).toBeGreaterThan(0);
  });

  it('« Corriger le tarif en vigueur » locks the date; « Annuler » goes back to the summary', async () => {
    vi.mocked(api.settings).mockResolvedValueOnce({ tariff: TARIFF, prefill: null } as never);
    render(Page);
    await fireEvent.click(await screen.findByRole('button', { name: 'Corriger le tarif en vigueur' }));
    expect(screen.getByLabelText('Applicable à partir du')).toHaveAttribute('readonly');
    await fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(screen.getByRole('heading', { name: 'Tarif en vigueur' })).toBeInTheDocument();
    expect(api.putTariffDoc).not.toHaveBeenCalled();
  });

  it('never set: the editor is the page, without « Annuler »', async () => {
    vi.mocked(api.settings).mockResolvedValueOnce({ tariff: null, prefill: null } as never);
    render(Page);
    expect(await screen.findByRole('button', { name: 'Enregistrer le tarif' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Annuler' })).toBeNull();
    expect(screen.getByText(/^Pas encore de tarif/)).toBeInTheDocument();
  });

  it('an Enedis notice sits above; its link opens the editor', async () => {
    vi.mocked(api.settings).mockResolvedValueOnce({ tariff: TARIFF, prefill: null } as never);
    alerts.list = [
      { id: 4, kind: 'price_change', severity: 'info', params: { date: '2027-02-01' }, first_seen: 0, last_seen: 0, resolved_at: null, dismissed: false }
    ];
    render(Page);
    const link = await screen.findByRole('link', { name: 'Ajouter les prix' });
    await fireEvent.click(link);
    expect(screen.getByRole('heading', { name: 'Nouveau prix' })).toBeInTheDocument();
  });

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
    await fireEvent.click(await screen.findByRole('button', { name: 'Nouveau prix…' }));
    expect(screen.getAllByText(/Enedis indique de nouvelles heures creuses\s: 23:00–07:00\./).length).toBeGreaterThan(0);
  });
});
