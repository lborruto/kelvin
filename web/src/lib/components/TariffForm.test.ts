import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '$lib/api/client';
import { parisTodayIso } from '$lib/format';
import { applyLocale } from '$lib/i18n';
import TariffForm from './TariffForm.svelte';

// The real ApiError: the i18n module (loaded by the test setup) checks `instanceof` against it.
vi.mock('$lib/api/client', async (orig) => ({
  ApiError: (await orig<typeof import('$lib/api/client')>()).ApiError,
  api: { putTariff: vi.fn() }
}));

const prefillOnly = {
  tariff: null,
  prefill: { kva: 6, hc_slots: [{ start: '01:30', end: '07:30' }, { start: '12:30', end: '14:30' }] }
};

beforeEach(() => vi.clearAllMocks());

describe('TariffForm', () => {
  it('is prefilled from the Enedis contract', () => {
    render(TariffForm, { settings: prefillOnly, onsaved: vi.fn() });
    expect(screen.getByText(/Prérempli d’après votre contrat Enedis/)).toBeInTheDocument();
    expect((screen.getByLabelText('Puissance souscrite') as HTMLSelectElement).value).toBe('6');
    expect(screen.getByLabelText('Début de la plage 2')).toHaveValue('12:30');
  });

  it('sends French decimals as numbers, from today', async () => {
    const saved = { tariff: { option: 'hchp', kva: 6, hc_slots: prefillOnly.prefill.hc_slots, prices: [] }, prefill: null };
    vi.mocked(api.putTariff).mockResolvedValue(saved as never);
    const onsaved = vi.fn();
    render(TariffForm, { settings: prefillOnly, onsaved });
    await fireEvent.input(screen.getByLabelText('Abonnement (€/mois)'), { target: { value: '19,50' } });
    await fireEvent.input(screen.getByLabelText('Prix heures creuses (€/kWh)'), { target: { value: '0,2068' } });
    await fireEvent.input(screen.getByLabelText('Prix heures pleines (€/kWh)'), { target: { value: '0,27' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le tarif' }));
    expect(api.putTariff).toHaveBeenCalledWith({
      option: 'hchp', kva: 6, hc_slots: prefillOnly.prefill.hc_slots,
      subscription_eur_month: 19.5, hc_eur_kwh: 0.2068, hp_eur_kwh: 0.27, valid_from: parisTodayIso()
    });
    expect(await screen.findByText('Tarif enregistré.')).toBeInTheDocument();
    expect(onsaved).toHaveBeenCalledWith(saved);
  });

  it('refuses amounts it cannot read, and shows the server message', async () => {
    render(TariffForm, { settings: prefillOnly, onsaved: vi.fn() });
    await fireEvent.input(screen.getByLabelText('Abonnement (€/mois)'), { target: { value: 'abc' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le tarif' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Saisissez des montants valides (ex. 0,2068).');
    expect(api.putTariff).not.toHaveBeenCalled();
    vi.mocked(api.putTariff).mockRejectedValue(new ApiError(422, 'Les plages d’heures creuses se chevauchent.'));
    for (const [label, v] of [['Abonnement (€/mois)', '19'], ['Prix heures creuses (€/kWh)', '0,2'], ['Prix heures pleines (€/kWh)', '0,3']]) {
      await fireEvent.input(screen.getByLabelText(label), { target: { value: v } });
    }
    await fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le tarif' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Les plages d’heures creuses se chevauchent.');
  });

  it('adds up to three slots and removes one', async () => {
    render(TariffForm, { settings: prefillOnly, onsaved: vi.fn() });
    const add = screen.getByRole('button', { name: 'Ajouter une plage' });
    await fireEvent.click(add);
    expect(screen.getByLabelText('Début de la plage 3')).toBeInTheDocument();
    expect(add).toHaveAttribute('aria-disabled', 'true');
    await fireEvent.click(screen.getByRole('button', { name: 'Retirer la plage 1' }));
    expect(screen.getByLabelText('Début de la plage 1')).toHaveValue('12:30');
  });

  it('lists the price history in mono columns', () => {
    const settings = {
      tariff: {
        option: 'hchp' as const, kva: 9, hc_slots: [{ start: '22:00', end: '06:00' }],
        prices: [
          { valid_from: '2026-02-01', subscription_eur_month: 15, hc_eur_kwh: 0.2, hp_eur_kwh: 0.27 },
          { valid_from: '2026-08-01', subscription_eur_month: 16.2, hc_eur_kwh: 0.21, hp_eur_kwh: 0.28 }
        ]
      },
      prefill: null
    };
    render(TariffForm, { settings, onsaved: vi.fn() });
    const table = screen.getByRole('table', { name: 'Historique des prix' });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(rows[2]).toHaveTextContent('1 août 2026');
    // Units live in the headers; the cells hold bare figures.
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Depuis', 'Abonnement (€/mois)', 'HC (€/kWh)', 'HP (€/kWh)'
    ]);
    expect(rows[2]).toHaveTextContent('0,2100');
    expect(rows[2]).not.toHaveTextContent('€');
    // Phone: the same history as one two-column list per price.
    const lists = [...document.querySelectorAll('.history-list dl')];
    expect(lists).toHaveLength(2);
    expect([...lists[1].querySelectorAll('dt')].map((d) => d.textContent)).toEqual([
      'Depuis', 'Abonnement (€/mois)', 'HC (€/kWh)', 'HP (€/kWh)'
    ]);
    expect([...lists[1].querySelectorAll('dd')].map((d) => d.textContent)).toEqual(['1 août 2026', '16,20', '0,2100', '0,2800']);
    expect((screen.getByLabelText('Prix heures creuses (€/kWh)') as HTMLInputElement).value).toBe('0,21');
  });

  const withHistory = (prices: { valid_from: string; subscription_eur_month: number; hc_eur_kwh: number; hp_eur_kwh: number }[]) => ({
    tariff: { option: 'hchp' as const, kva: 9, hc_slots: [{ start: '22:00', end: '06:00' }], prices },
    prefill: null
  });
  const click = () => fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le tarif' }));

  it('a power-only change reuses the price in force instead of adding a row', async () => {
    vi.mocked(api.putTariff).mockResolvedValue(withHistory([]) as never);
    const settings = withHistory([
      { valid_from: '2026-02-01', subscription_eur_month: 15, hc_eur_kwh: 0.2, hp_eur_kwh: 0.27 },
      { valid_from: '2026-03-01', subscription_eur_month: 16, hc_eur_kwh: 0.21, hp_eur_kwh: 0.28 },
      { valid_from: '2999-01-01', subscription_eur_month: 99, hc_eur_kwh: 0.9, hp_eur_kwh: 0.9 }
    ]);
    render(TariffForm, { settings, onsaved: vi.fn() });
    expect((screen.getByLabelText('Abonnement (€/mois)') as HTMLInputElement).value).toBe('16');
    await fireEvent.change(screen.getByLabelText('Puissance souscrite'), { target: { value: '12' } });
    await click();
    expect(api.putTariff).toHaveBeenLastCalledWith(
      expect.objectContaining({ kva: 12, valid_from: '2026-03-01', subscription_eur_month: 16, hc_eur_kwh: 0.21, hp_eur_kwh: 0.28 })
    );
  });

  it('a changed price starts today', async () => {
    vi.mocked(api.putTariff).mockResolvedValue(withHistory([]) as never);
    render(TariffForm, {
      settings: withHistory([{ valid_from: '2026-03-01', subscription_eur_month: 16, hc_eur_kwh: 0.21, hp_eur_kwh: 0.28 }]),
      onsaved: vi.fn()
    });
    await fireEvent.input(screen.getByLabelText('Prix heures pleines (€/kWh)'), { target: { value: '0,3' } });
    await click();
    expect(api.putTariff).toHaveBeenLastCalledWith(expect.objectContaining({ hp_eur_kwh: 0.3, valid_from: parisTodayIso() }));
  });

  it('blocks an empty start date in French', async () => {
    render(TariffForm, { settings: prefillOnly, onsaved: vi.fn() });
    for (const [label, v] of [['Abonnement (€/mois)', '19'], ['Prix heures creuses (€/kWh)', '0,2'], ['Prix heures pleines (€/kWh)', '0,3']]) {
      await fireEvent.input(screen.getByLabelText(label), { target: { value: v } });
    }
    await fireEvent.input(screen.getByLabelText('Applicable à partir du'), { target: { value: '' } });
    await click();
    expect(screen.getByRole('alert')).toHaveTextContent('Choisissez une date.');
    expect(api.putTariff).not.toHaveBeenCalled();
  });

  it('falls back to a default slot and keeps an unlisted power', () => {
    render(TariffForm, { settings: { tariff: null, prefill: { kva: 10, hc_slots: [] } }, onsaved: vi.fn() });
    expect(screen.getByLabelText('Début de la plage 1')).toHaveValue('22:00');
    expect((screen.getByLabelText('Puissance souscrite') as HTMLSelectElement).value).toBe('10');
    expect(screen.getByRole('option', { name: /^10\s*kVA$/ })).toBeInTheDocument();
  });

  it('drops « Tarif enregistré. » as soon as a field changes', async () => {
    vi.mocked(api.putTariff).mockResolvedValue(withHistory([]) as never);
    render(TariffForm, { settings: prefillOnly, onsaved: vi.fn() });
    for (const [label, v] of [['Abonnement (€/mois)', '19'], ['Prix heures creuses (€/kWh)', '0,2'], ['Prix heures pleines (€/kWh)', '0,3']]) {
      await fireEvent.input(screen.getByLabelText(label), { target: { value: v } });
    }
    await click();
    expect(await screen.findByText('Tarif enregistré.')).toBeInTheDocument();
    await fireEvent.input(screen.getByLabelText('Abonnement (€/mois)'), { target: { value: '20' } });
    expect(screen.queryByText('Tarif enregistré.')).toBeNull();
  });
});

describe('TariffForm in English', () => {
  it('prefill sentence, field labels, English decimals, and a backend code in English', async () => {
    applyLocale('en');
    vi.mocked(api.putTariff).mockRejectedValue(
      Object.assign(new ApiError(422, 'Les plages d’heures creuses se chevauchent.'), { code: 'slots_overlap', params: {} })
    );
    render(TariffForm, { settings: prefillOnly, onsaved: vi.fn() });
    expect(
      screen.getByText('Prefilled from your Enedis contract (6 kVA, off-peak 01:30–07:30 and 12:30–14:30). Add your prices including VAT.')
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Subscribed power')).toBeInTheDocument();
    expect(screen.getByLabelText('Start of period 2')).toHaveValue('12:30');
    await fireEvent.input(screen.getByLabelText('Standing charge (€/month)'), { target: { value: '19.50' } });
    await fireEvent.input(screen.getByLabelText('Off-peak price (€/kWh)'), { target: { value: '0.2068' } });
    await fireEvent.input(screen.getByLabelText('Peak price (€/kWh)'), { target: { value: '0.27' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Save the tariff' }));
    expect(api.putTariff).toHaveBeenCalledWith(expect.objectContaining({ subscription_eur_month: 19.5, hc_eur_kwh: 0.2068 }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Off-peak periods overlap.');
  });
});

describe('TariffForm fix round 1', () => {
  const one = {
    tariff: {
      option: 'hchp' as const, kva: 6, hc_slots: [{ start: '22:00', end: '06:00' }],
      prices: [{ valid_from: '2026-02-01', subscription_eur_month: 19.5, hc_eur_kwh: 0.2068, hp_eur_kwh: 0.27 }]
    },
    prefill: null
  };
  it('the last slot’s Retirer is paused with aria-disabled, focusable, and does nothing', async () => {
    render(TariffForm, { settings: one, onsaved: vi.fn() });
    const remove = screen.getByRole('button', { name: 'Retirer la plage 1' });
    expect(remove).not.toBeDisabled();
    expect(remove).toHaveAttribute('aria-disabled', 'true');
    await fireEvent.click(remove);
    expect(screen.getByLabelText('Début de la plage 1')).toHaveValue('22:00');
  });
  it('a switch re-seeds the untouched amounts in the new decimal mark and keeps the edited one', async () => {
    render(TariffForm, { settings: one, onsaved: vi.fn() });
    expect(screen.getByLabelText('Abonnement (€/mois)')).toHaveValue('19,5');
    await fireEvent.input(screen.getByLabelText('Prix heures creuses (€/kWh)'), { target: { value: '0,21' } });
    applyLocale('en');
    flushSync();
    expect(screen.getByLabelText('Standing charge (€/month)')).toHaveValue('19.5');
    expect(screen.getByLabelText('Peak price (€/kWh)')).toHaveValue('0.27');
    expect(screen.getByLabelText('Off-peak price (€/kWh)')).toHaveValue('0,21');
    applyLocale('fr');
    flushSync();
    expect(screen.getByLabelText('Abonnement (€/mois)')).toHaveValue('19,5');
  });
});
