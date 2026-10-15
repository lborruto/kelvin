import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '$lib/api/client';
import type { SettingsView, Tariff } from '$lib/api/types';
import { applyLocale } from '$lib/i18n';
import TariffForm from './TariffForm.svelte';

vi.mock('$lib/api/client', async (orig) => ({
  ...(await orig<object>()),
  api: { putTariffDoc: vi.fn(), tempoPrices: vi.fn() }
}));

const NB = ' ';
const ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const NIGHT = [{ start: '22:00', end: '06:00' }];
const TEMPO = { blue_hc: 0.1296, blue_hp: 0.1609, white_hc: 0.1486, white_hp: 0.1894, red_hc: 0.1568, red_hp: 0.7562 };
const hchp: Tariff = {
  option: 'hchp',
  kva: 9,
  hc_slots: NIGHT,
  hc_schedules: [{ valid_from: '2025-01-15', variants: [{ months: ALL, slots: NIGHT }] }],
  tempo_hours: { hc_start: '22:00', hc_end: '06:00', day_start: '06:00' },
  prices: [{ valid_from: '2025-01-15', option: 'hchp', subscription_eur_month: 15, rates: { hc: 0.2068, hp: 0.27 } }]
};
const settings: SettingsView = { tariff: hchp, prefill: null };
const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.putTariffDoc).mockResolvedValue(settings as never);
});
afterEach(() => applyLocale('fr'));

describe('TariffForm v2', () => {
  it('a migrated HC/HP tariff opens on HC/HP with the prices in force', () => {
    render(TariffForm, { settings, onsaved: vi.fn() });
    expect(screen.getByRole('radio', { name: 'HC/HP' })).toHaveAttribute('aria-checked', 'true');
    expect(field('Prix heures creuses (€/kWh)').value).toBe('0,2068');
    expect(field('Début de la plage 1').value).toBe('22:00');
  });

  it('compact fields: intrinsic widths, the HC/HP swatch before each price, one line per off-peak slot', async () => {
    const { container } = render(TariffForm, { settings, onsaved: vi.fn() });
    expect(field('Prix heures creuses (€/kWh)')).toHaveClass('w-price');
    expect(field('Abonnement (€/mois)')).toHaveClass('w-price');
    expect(container.querySelector('select')).toHaveClass('w-kva');
    const swatch = (l: string) => field(l).closest('label')!.querySelector('.sw')!.getAttribute('data-series');
    expect([swatch('Prix heures creuses (€/kWh)'), swatch('Prix heures pleines (€/kWh)')]).toEqual(['hc', 'hp']);
    // « [22:00] → [06:00] [Retirer] » on one line: both times and the button share the slot row.
    const row = field('Début de la plage 1').closest('.slot')!;
    expect(within(row as HTMLElement).getByLabelText('Fin de la plage 1')).toBeTruthy();
    expect(within(row as HTMLElement).getByRole('button', { name: 'Retirer la plage 1' })).toBeTruthy();
    // Tempo keeps the day colour (round TempoDot) and adds the hour type (square swatch).
    await fireEvent.click(screen.getByRole('radio', { name: 'Tempo' }));
    const cap = field('Rouge HC (€/kWh)').closest('label')!;
    expect(cap.querySelector('.dot.red')).toBeTruthy();
    expect(cap.querySelector('.sw')!.getAttribute('data-series')).toBe('hc');
  });

  it('a new price is added as a dated row and the history is kept', async () => {
    render(TariffForm, { settings, onsaved: vi.fn() });
    await fireEvent.input(field('Prix heures pleines (€/kWh)'), { target: { value: '0,28' } });
    await fireEvent.input(field('Applicable à partir du'), { target: { value: '2026-11-01' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le tarif' }));
    const doc = vi.mocked(api.putTariffDoc).mock.calls[0][0];
    expect(doc.prices.map((p) => [p.valid_from, p.rates.hp])).toEqual([['2025-01-15', 0.27], ['2026-11-01', 0.28]]);
    expect(doc.hc_schedules).toEqual(hchp.hc_schedules);
  });

  it('Tempo: six prices, prefilled on request with their source and date, saved as a Tempo row', async () => {
    vi.mocked(api.tempoPrices).mockResolvedValue({ rates: TEMPO, fetched_at: 1_760_400_000, source: 'MyElectricalData' });
    render(TariffForm, { settings, onsaved: vi.fn() });
    await fireEvent.click(screen.getByRole('radio', { name: 'Tempo' }));
    for (const l of ['Bleu HC', 'Bleu HP', 'Blanc HC', 'Blanc HP', 'Rouge HC', 'Rouge HP']) expect(field(`${l} (€/kWh)`)).toBeTruthy();
    expect(screen.queryByText('Heures creuses', { selector: 'legend' })).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Préremplir avec les prix Tempo publiés' }));
    expect(await screen.findByText(/relevés via MyElectricalData le/)).toBeTruthy();
    expect(field('Rouge HP (€/kWh)').value).toBe('0,7562');
    expect(field('Début').value).toBe('22:00');
    await fireEvent.input(field('Applicable à partir du'), { target: { value: '2026-11-01' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le tarif' }));
    const doc = vi.mocked(api.putTariffDoc).mock.calls[0][0];
    expect(doc.prices.at(-1)).toEqual({ valid_from: '2026-11-01', option: 'tempo', subscription_eur_month: 15, rates: TEMPO });
    expect(doc.tempo_hours).toEqual({ hc_start: '22:00', hc_end: '06:00' });
  });

  it('Base: one price and no off-peak hours', async () => {
    render(TariffForm, { settings, onsaved: vi.fn() });
    await fireEvent.click(screen.getByRole('radio', { name: 'Base' }));
    expect(field('Prix du kWh (€/kWh)')).toBeTruthy();
    expect(screen.queryByLabelText('Prix heures creuses (€/kWh)')).toBeNull();
    expect(screen.queryByText('Heures creuses', { selector: 'legend' })).toBeNull();
  });

  it('seasonal off-peak hours split the months, and a month left out is named', async () => {
    render(TariffForm, { settings, onsaved: vi.fn() });
    await fireEvent.click(screen.getByLabelText('Heures creuses différentes selon la saison'));
    const seasons = screen.getAllByRole('group', { name: 'Mois' });
    expect(seasons.length).toBe(2);
    await fireEvent.click(within(seasons[1]).getByLabelText(/avr/));
    await fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le tarif' }));
    expect(screen.getByRole('alert').textContent).toBe(`Chaque mois doit avoir ses heures creuses${NB}: avril.`);
    expect(api.putTariffDoc).not.toHaveBeenCalled();
  });

  it('Enedis’ new off-peak hours are added from the chosen date', async () => {
    render(TariffForm, { settings, onsaved: vi.fn(), contractSlots: [{ start: '23:00', end: '07:00' }] });
    expect(screen.getByText(/Enedis indique de nouvelles heures creuses\s: 23:00–07:00\./)).toBeTruthy();
    await fireEvent.input(field('À partir du'), { target: { value: '2026-12-01' } });
    await fireEvent.click(screen.getByRole('button', { name: /Ajouter ces heures creuses à partir du/ }));
    const doc = vi.mocked(api.putTariffDoc).mock.calls[0][0];
    expect(doc.hc_schedules.at(-1)).toEqual({ valid_from: '2026-12-01', variants: [{ months: ALL, slots: [{ start: '23:00', end: '07:00' }] }] });
    expect(doc.prices).toEqual(hchp.prices);
  });

  it('reads in English', async () => {
    applyLocale('en');
    render(TariffForm, { settings, onsaved: vi.fn() });
    expect(screen.getByRole('radiogroup', { name: 'Tariff option' })).toBeTruthy();
    expect(field('Off-peak price (€/kWh)').value).toBe('0.2068');
    await fireEvent.click(screen.getByRole('radio', { name: 'Tempo' }));
    expect(field('Red peak (€/kWh)')).toBeTruthy();
  });
});
