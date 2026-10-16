import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyLocale } from '$lib/i18n';
import { api, ApiError } from '$lib/api/client';
import type { EnergyDay, EnergyReport, EnergySummary, LinkyStatus, Quality } from '$lib/api/types';
import { download } from '$lib/csv';
import { addDays, bucketLabel } from '$lib/energy';
import { fmtTime } from '$lib/format';
import { alerts } from '$lib/stores/alerts.svelte';
import { announcer } from '$lib/stores/announcer.svelte';
import { house } from '$lib/stores/house.svelte';
import { parisDayStart } from '$lib/time';
import { today } from '$lib/today.svelte';
import { desktop } from '$lib/media.svelte';
import Page from './+page.svelte';

vi.mock('$lib/csv', async (orig) => ({ ...(await orig<typeof import('$lib/csv')>()), download: vi.fn() }));
vi.mock('$lib/stores/history.svelte', () => ({ history: { data: {}, load: vi.fn() } }));
// The real ApiError: the i18n module (loaded by the test setup) checks `instanceof` against it.
vi.mock('$lib/api/client', async (orig) => ({
  ...(await orig<typeof import('$lib/api/client')>()),
  api: { energyReport: vi.fn(), energyDay: vi.fn(), linkyStatus: vi.fn(), history: vi.fn().mockResolvedValue([]),
    alerts: vi.fn().mockResolvedValue([]), dismissAlert: vi.fn() }
}));

const summary = (o: Partial<EnergySummary> = {}): EnergySummary => ({
  kwh: 300, hc_kwh: 120, hp_kwh: 180, radiators_kwh: 140, energy_eur: 70, subscription_eur: 15, eur: 85,
  days: 30, missing_days: 0, estimated_split: false, split_method: 'curve',
  prices: [{ valid_from: '2026-01-01', subscription_eur_month: 15, rates: { hc: 0.2, hp: 0.3 } }],
  retro_priced: false, present_days: 30, curve: null,
  radiators: { kwh: 140, hc_kwh: 60, hp_kwh: 80, eur: 35, interpolated: false, apportioned: false, coverage: 1 },
  rest_kwh: 160, tempo: null, by_rate: null, missing_colour_days: 0, retro_scheduled: false, ...o
});
const NONE: Partial<EnergySummary> = {
  kwh: null, hc_kwh: null, hp_kwh: null, energy_eur: null, eur: null, rest_kwh: null, present_days: 0, prices: []
};
/** October 2026 by day: data until the 12th, nothing after (not yet published). */
const october = () =>
  Array.from({ length: 31 }, (_, i) => ({
    key: addDays('2026-10-01', i),
    ...summary({
      kwh: 10, hc_kwh: 4, hp_kwh: 6, eur: 3, energy_eur: 2.5, subscription_eur: 0.5, days: 1, present_days: 1, radiators_kwh: 5,
      radiators: { kwh: 5, hc_kwh: 2, hp_kwh: 3, eur: 1.2, interpolated: false, apportioned: false, coverage: 1 }, rest_kwh: 5,
      ...(i >= 12 ? { ...NONE, radiators: null, radiators_kwh: null, subscription_eur: null } : {})
    })
  }));

const QUALITY: Quality = {
  fallback_share: null, fallback_method: null, estimated_days: 0, curve_vs_daily_pct: null, linky_since: '2025-11-01',
  curve_since: '2025-11-01', radiators_since: '2026-09-01', retro_priced_days: 0,
  missing_colour_days: 0, retro_scheduled_days: 0
};

function report(o: Partial<EnergyReport> = {}): EnergyReport {
  return {
    option: 'hchp', tempo_lens: null,
    group: 'day', from: '2026-10-01', to: '2026-11-01', last_day: '2026-10-12', linky: true, tariff: true,
    buckets: october(),
    total: summary(),
    heating_share: 0.47, heating_share_since: '2026-10-01', linky_since: '2025-11-01',
    radiators: [{ radiator_id: 'a', kwh: 140 }],
    projection: {
      month: { key: '2026-10', kwh: 310, eur: 120.5, actual_kwh: 120, actual_eur: 98.4, actual_energy_eur: 92.1, filled_days: 0, method: 'linear' },
      year: { from: '2026-10', to: '2027-09', kwh: 3650, eur: 1234.4, method: 'linear', months: [] },
      rolling: { from: '2026-10-15', to: '2027-10-15', kwh: 3650, eur: 1234.4, per_day_kwh: 10, price_eur_kwh: 0.25, method: 'linear' }
    },
    period: {
      from: '2026-10-01', to: '2026-11-01',
      ...summary({ kwh: 412.64, hc_kwh: 158.3, hp_kwh: 254.34, eur: 98.4, energy_eur: 92.11, subscription_eur: 6.29, days: 31, present_days: 12 }),
      quality: QUALITY
    },
    heating: { value: 0.47, days: 12, of_days: 12, since: '2026-10-01', inconsistent: false },
    by_radiator: [],
    comparison: {
      basis: 'unit',
      previous: {
        from: '2026-09-01', to: '2026-09-13', pairs: 12, of: 12, comparable: true, cur_kwh: 120, prev_kwh: 125,
        cur_energy_eur: 30, prev_energy_eur: 31, change: -0.04, change_energy_eur: -0.0323
      },
      last_year: null,
      avg4: null
    },
    hc_lens: null,
    boundary_prorated: false,
    quality: QUALITY,
    ...o
  };
}
const periodWith = (o: Partial<EnergySummary>) => ({ period: { from: '2026-10-01', to: '2026-11-01', ...summary(o), quality: QUALITY } });

function energyDay(date: string, o: Partial<EnergyDay> = {}): EnergyDay {
  const a = parisDayStart(date) / 1000;
  return {
    date, complete: true, points: 2,
    intervals: [
      { ts: a, minutes: 30, wh: 400, w: 800, offpeak: 1, tempo_colour: null, boundary: false, price: 0.2, eur: 0.08, radiators_wh: 200, radiators_known: 1, radiators_total: 1, radiators_interp: false, radiators_apportioned: false, by_room: { salon: 200 } },
      { ts: a + 1800, minutes: 30, wh: 300, w: 600, offpeak: 0, tempo_colour: null, boundary: false, price: 0.3, eur: 0.09, radiators_wh: 100, radiators_known: 1, radiators_total: 1, radiators_interp: false, radiators_apportioned: false, by_room: { salon: 100 } }
    ],
    totals: { curve_kwh: 21.6, daily_kwh: 22.03, hc_kwh: 8.98, hp_kwh: 13.05, split_method: 'curve', hc_kwh_curve: 8.8, hp_kwh_curve: 12.8 },
    power: { peak_w: 6840, peak_ts: a + 3600 * 19, base_w_p10: 310, night_min_w: 280, kva: 12 },
    available: ['2026-10-10', '2026-10-11', '2026-10-12'],
    counted_from: '2025-11-01',
    not_counted: null,
    room: null,
    ...o
  };
}

/** One cell of a chart's visually hidden data table, by its row and column headers. */
function cell(container: HTMLElement, caption: string, row: string, column: string): string {
  const table = [...container.querySelectorAll('.visually-hidden > table')].find((t) => t.querySelector('caption')?.textContent === caption)!;
  const col = [...table.querySelectorAll('thead th')].findIndex((t) => t.textContent === column);
  const tr = [...table.querySelectorAll('tbody tr')].find((r) => r.querySelector('th')?.textContent === row)!;
  return tr.children[col]?.textContent ?? '';
}

/** Mois opens the Courbe in a sheet from its board widget (« par demi-heure › »); Jour and Semaine show it on the board. */
async function openCurve() {
  if (document.getElementById('curve')) return;
  await fireEvent.click(await screen.findByRole('button', { name: /^par demi-heure, courbe du / }));
  await waitFor(() => {
    if (!document.getElementById('curve')) throw new Error('no Courbe yet');
  });
}
/** A Fiche row's value by its label (the desktop card is portalled to <body>). */
const ficheRow = (card: Element, label: string) =>
  [...card.querySelectorAll('.row')].find((r) => r.querySelector('dt')?.textContent === label)?.querySelector('dd')?.textContent ?? null;
const clearFiches = () => document.querySelectorAll('.fiche, .pop').forEach((n) => n.remove());

const linkyOk: LinkyStatus = {
  configured: true, prm: '12345678901234', token_set: true, simulator: false, state: 'ok', message: null,
  last_day: '2026-10-12', last_ok_at: null, retry_at: null, calls_today: 2, budget: 10, consent_expires: null
};

beforeEach(() => {
  // The Courbe sheet is a modal <dialog> (jsdom has no showModal).
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
  vi.clearAllMocks();
  announcer.clear();
  vi.mocked(api.linkyStatus).mockResolvedValue(linkyOk);
  vi.mocked(api.energyReport).mockResolvedValue(report());
  vi.mocked(api.energyDay).mockImplementation(async (d: string) => energyDay(d));
  house.applySnapshot({
    house: {
      rooms: [{ id: 'salon', name: 'Salon', radiator_ids: ['a'] }] as never,
      radiators: [{ id: 'a', room_id: 'salon', energy_wh: { total: 1000, t1: 400, t2: 600 }, model: 'HEKLA', name: 'R' }] as never
    },
    pending: [], overrides: [], status: { connected: true, last_ok_at: null, last_error: null }
  });
});

describe('Énergie', () => {
  it('shows the period’s estimate in euros: the range with its kWh, a split that adds up, a comparison on comparable days', async () => {
    const { container } = render(Page);
    expect(await screen.findByRole('heading', { level: 2, name: 'Octobre 2026' })).toBeInTheDocument();
    expect(container.querySelector('.hero')).toHaveAttribute('aria-labelledby', 'period-label');
    expect(container.querySelector('.hero .big')).toHaveTextContent('98,40 €');
    expect(container.querySelector('.hero .tag')).toHaveTextContent('est.');
    expect(screen.getByRole('button', { name: /^98,40\s€, estimation, détails$/ })).toBeInTheDocument();
    // A running month is described up to its last day with data, then the kWh its parts add up to.
    expect(container.querySelector('.hero .range')!.textContent).toBe('du\u00a01/10\u00a0au\u00a012/10 · 412,6\u00a0kWh');
    expect(screen.getByRole('img', { name: 'Heures creuses 158,3\u00a0kWh, heures pleines 254,3\u00a0kWh' })).toBeInTheDocument();
    expect(container.querySelector('.hero .words')).toHaveTextContent('Heures creuses 158,3 kWh Heures pleines 254,3 kWh');
    expect(screen.getByText('−4 % de consommation par rapport à septembre 2026, sur 12 jours comparables')).toBeInTheDocument();
    // The Linky source line on the context row, fresh ring and words.
    const line = container.querySelector('.context .source-line')!;
    expect(line).toHaveTextContent('Linky · données jusqu’au 12/10');
    expect(line.querySelector('[data-fresh]')).not.toBeNull();
  });

  it('renders the report although the alerts cannot be loaded (re-review)', async () => {
    alerts.reset();
    vi.mocked(api.alerts).mockRejectedValue(new Error('x'));
    const { container } = render(Page);
    expect(await screen.findByRole('heading', { level: 2, name: 'Octobre 2026' })).toBeInTheDocument();
    expect(container.querySelector('.hero .big')).toHaveTextContent('98,40 €');
    vi.mocked(api.alerts).mockResolvedValue([]);
    alerts.reset();
  });

  it('omits the comparison when too few days are comparable', async () => {
    const r = report();
    r.comparison.previous = { ...r.comparison.previous!, pairs: 9, comparable: false, change: null };
    vi.mocked(api.energyReport).mockResolvedValue(r);
    const { container } = render(Page);
    await screen.findByRole('heading', { level: 2, name: 'Octobre 2026' });
    expect(container.querySelector('.hero .delta')).toBeNull();
  });

  it('the hero figure opens the period’s Fiche: the inspection, its notes and where it comes from; Esc gives focus back', async () => {
    desktop.matches = true;
    try {
      render(Page);
      const fig = await screen.findByRole('button', { name: /^98,40\s€, estimation, détails$/ });
      await fireEvent.click(fig);
      const card = document.querySelector('.fiche')!;
      expect(card.querySelector('.title')).toHaveTextContent('Octobre 2026');
      expect(ficheRow(card, 'Maison')).toBe('412,64\u00a0kWh');
      expect(ficheRow(card, 'Coût estimé')).toBe('98,40\u00a0€');
      expect(ficheRow(card, 'dont énergie')).toBe('92,11\u00a0€');
      expect(ficheRow(card, 'dont abonnement')).toBe('6,29\u00a0€');
      expect(ficheRow(card, 'Source')).toBe('Linky · Enedis via MyElectricalData');
      expect(ficheRow(card, 'Nature')).toBe('estimé · kWh Linky × votre tarif');
      await fireEvent.keyDown(card, { key: 'Escape' });
      await tick();
      expect(document.querySelector('.fiche')).toBeNull();
      expect(document.activeElement).toBe(fig);
    } finally {
      desktop.matches = false;
      clearFiches();
    }
  });

  it('phone: the hero figure opens the same Fiche in the bottom sheet', async () => {
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    render(Page);
    await fireEvent.click(await screen.findByRole('button', { name: /^98,40\s€, estimation, détails$/ }));
    const dialog = [...document.querySelectorAll('dialog')].find((d) => d.hasAttribute('open'))!;
    expect(dialog.querySelector('h2')).toHaveTextContent('Octobre 2026');
    expect(ficheRow(dialog, 'Coût estimé')).toBe('98,40\u00a0€');
  });

  it('key figures link to their sections: the full month, the heating share and the off-peak share', async () => {
    vi.mocked(api.energyReport).mockResolvedValue(report({ hc_lens: { hc_share: 0.384, slot_share: 0.3333, avg_price: 0.2437, delta_price: 0.0632 } }));
    render(Page);
    const month = await screen.findByRole('link', { name: 'Mois complet, ≈\u00a0120,50\u00a0€' });
    expect(month).toHaveAttribute('href', '#projection');
    expect(screen.getByRole('link', { name: 'Chauffage, 47\u00a0% de la maison' })).toHaveAttribute('href', '#energy-where');
    expect(screen.getByRole('link', { name: 'Heures creuses, 38\u00a0% 33\u00a0% du temps' })).toHaveAttribute('href', '#offpeak');
  });

  it('a past period has no full-month figure; Base has no off-peak figure', async () => {
    vi.mocked(api.energyReport).mockResolvedValue(report({ option: 'base', hc_lens: { hc_share: 0.384, slot_share: 0.3333, avg_price: 0.2437, delta_price: 0.0632 } }));
    render(Page);
    await screen.findByRole('link', { name: /^Mois complet/ });
    expect(screen.queryByRole('link', { name: /^Heures creuses,/ })).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Période précédente' }));
    await screen.findByRole('heading', { level: 2, name: 'Septembre 2026' });
    expect(screen.queryByRole('link', { name: /^Mois complet/ })).toBeNull();
    expect(screen.getByRole('link', { name: /^Chauffage,/ })).toBeInTheDocument();
  });

  it('no tariff: the figure is the kWh, a line asks for the tariff, and no euro anywhere in the Résumé', async () => {
    vi.mocked(api.energyReport).mockResolvedValue(report({ tariff: false, ...periodWith({ kwh: 412.64, eur: null, energy_eur: null, subscription_eur: null }) }));
    const { container } = render(Page);
    expect(await screen.findByRole('link', { name: 'Renseigner le tarif' })).toHaveAttribute('href', '/home/tariff');
    expect(screen.getByText(/^Ajoutez votre tarif pour voir les coûts\./)).toBeInTheDocument();
    expect(container.querySelector('.hero .big')).toHaveTextContent('412,6 kWh');
    expect(container.querySelector('.hero .answer')!.textContent).not.toContain('€');
    expect(container.querySelector('.hero .tag')).toBeNull();
  });

  it('a period before the history says where it starts and goes there', async () => {
    const r = report({ ...periodWith({ ...NONE, missing_days: 0 }) });
    r.period = { ...r.period, from: '2025-09-01', to: '2025-10-01' };
    r.linky_since = '2025-11-01';
    vi.mocked(api.energyReport).mockResolvedValueOnce(r).mockResolvedValueOnce(r);
    render(Page);
    expect(await screen.findByText('Pas de données pour Septembre 2025 : l’historique commence le 1er novembre 2025.')).toBeInTheDocument();
    vi.mocked(api.energyReport).mockResolvedValue(report());
    await fireEvent.click(screen.getByRole('button', { name: 'Aller au 1/11' }));
    await waitFor(() => expect(vi.mocked(api.energyReport).mock.calls.at(-1)![0]).toBe('2025-11-01'));
  });

  it('first sync: the source line waits (dashed) and the Résumé says the history is on its way', async () => {
    vi.mocked(api.linkyStatus).mockResolvedValue({ ...linkyOk, state: 'never', last_day: null });
    vi.mocked(api.energyReport).mockResolvedValue(report({ last_day: null, ...periodWith({ ...NONE }) }));
    const { container } = render(Page);
    expect(await screen.findByText('Première synchronisation : l’historique Linky arrive dans quelques minutes.')).toBeInTheDocument();
    const line = container.querySelector('.context .source-line')!;
    expect(line).toHaveTextContent('Linky · première synchronisation en attente');
    expect(line.querySelector('[data-fresh="late"]')).not.toBeNull();
    expect(container.querySelector('.callout')).toBeNull();
  });

  it('loads Mois first (its day bars and the month itself), and switches views with the keyboard', async () => {
    render(Page);
    await waitFor(() => expect(api.energyReport).toHaveBeenCalledTimes(2));
    const p = { from: '2026-10-01', to: '2026-11-01' };
    expect(api.energyReport).toHaveBeenCalledWith('2026-10-01', '2026-11-01', 'day', p);
    expect(api.energyReport).toHaveBeenCalledWith('2026-10-01', '2026-11-01', 'month', p);
    await fireEvent.keyDown(screen.getByRole('radio', { name: 'Mois' }), { key: 'ArrowLeft' });
    await waitFor(() => expect(vi.mocked(api.energyReport).mock.calls.at(-1)![2]).toBe('week'));
    expect(await screen.findByRole('heading', { level: 2, name: 'Semaine 42 · 12–18 oct. 2026' })).toBeInTheDocument();
  });

  it('the navigator steps back, offers « Dernier jour », and announces the period', async () => {
    render(Page);
    await screen.findByRole('heading', { level: 2, name: 'Octobre 2026' });
    expect(screen.getByRole('button', { name: 'Période suivante' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByRole('button', { name: 'Dernier jour' })).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Période précédente' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Septembre 2026' })).toBeInTheDocument();
    expect(announcer.polite).toBe('Septembre 2026');
    expect(api.energyReport).toHaveBeenCalledWith('2026-09-01', '2026-10-01', 'day', { from: '2026-09-01', to: '2026-10-01' });
    await fireEvent.click(screen.getByRole('button', { name: 'Dernier jour' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Octobre 2026' })).toBeInTheDocument();
  });

  it('a failed period change keeps the heading on the period shown, and names the one that failed', async () => {
    const { container } = render(Page);
    await screen.findByRole('heading', { level: 2, name: 'Octobre 2026' });
    vi.mocked(api.energyReport).mockRejectedValueOnce(new Error('boom'));
    await fireEvent.click(screen.getByRole('button', { name: 'Période précédente' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Septembre 2026 : Impossible de charger la consommation.');
    expect(screen.getByRole('heading', { level: 2, name: 'Octobre 2026' })).toBeInTheDocument();
    expect(container.querySelector('.hero .big')).toHaveTextContent('98,40 €');
    expect(container.querySelector('.panels')).not.toHaveClass('busy');
    announcer.clear();
    await fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(announcer.polite).toBe('Septembre 2026'); // the period it asks for again is said
    expect(await screen.findByRole('heading', { level: 2, name: 'Septembre 2026' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('every period change is announced once: a view, a bar drill, ‹ ›, « Dernier jour »', async () => {
    const say = vi.spyOn(announcer, 'say');
    render(Page);
    await screen.findByRole('img', { name: 'Consommation de la maison par jour' });
    await fireEvent.click(screen.getByRole('radio', { name: 'Jour' }));
    expect(say.mock.calls).toEqual([['Lundi 12 octobre 2026']]);
    expect(await screen.findByRole('heading', { level: 2, name: 'Lundi 12 octobre 2026' })).toBeInTheDocument();
    // Jour: a bar for another day opens that day.
    await fireEvent.keyDown(await screen.findByRole('button', { name: /^11 octobre, / }), { key: 'Enter' });
    expect(say.mock.calls.at(-1)).toEqual(['Dimanche 11 octobre 2026']);
    await fireEvent.click(screen.getByRole('button', { name: 'Dernier jour' }));
    expect(say.mock.calls.at(-1)).toEqual(['Lundi 12 octobre 2026']);
    await fireEvent.click(screen.getByRole('button', { name: 'Période précédente' }));
    expect(say.mock.calls.at(-1)).toEqual(['Dimanche 11 octobre 2026']);
    expect(say).toHaveBeenCalledTimes(4);
    say.mockRestore();
  });

  it('stacks HC (light blue, hatched) and HP (dark blue), radiators as series-3 marks; Enter on a day opens its Courbe', async () => {
    const { container } = render(Page);
    await screen.findByRole('img', { name: 'Consommation de la maison par jour' });
    const fills = [...container.querySelectorAll('rect.part:not(.hatch)')].map((r) => r.getAttribute('style'));
    expect(fills.filter((f) => f?.includes('var(--hc)'))).toHaveLength(12);
    expect(fills.filter((f) => f?.includes('var(--hp)'))).toHaveLength(12);
    expect(container.querySelectorAll('rect.part.hatch')).toHaveLength(12);
    expect(fills.some((f) => f?.includes('var(--series-1)') || f?.includes('var(--series-2)'))).toBe(false);
    expect(container.querySelector('line.mark')!.getAttribute('style')).toContain('var(--series-3)');
    const bar = screen.getByRole('button', { name: /^11 octobre, 10,00 kilowattheures, 3,00 euros$/ });
    await fireEvent.keyDown(bar, { key: 'Enter' });
    await waitFor(() => expect(api.energyDay).toHaveBeenLastCalledWith('2026-10-11', 'salon'));
    // Mois: the drill opens the Courbe sheet on that day.
    await waitFor(() => expect(document.getElementById('curve')).not.toBeNull());
    expect(await within(document.getElementById('curve')!).findByRole('heading', { name: /^Courbe du 11 octobre 2026/ })).toBeInTheDocument();
    expect(document.getElementById('curve')!.closest('dialog')).toHaveAttribute('open');
    expect(announcer.polite).toBe('Courbe du 11 octobre 2026');
  });

  it('without Linky: an invitation to connect it, and the radiators alone', async () => {
    vi.mocked(api.linkyStatus).mockResolvedValue({ ...linkyOk, configured: false, state: 'off', last_day: null });
    vi.mocked(api.energyReport).mockResolvedValue(report({ linky: false, last_day: null, projection: null, heating_share: null, ...periodWith({ kwh: null, eur: null }) }));
    const { container } = render(Page);
    expect(await screen.findByRole('heading', { name: 'Reliez votre compteur Linky' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Relier le Linky' })).toHaveAttribute('href', '/home/linky');
    expect(await screen.findByRole('img', { name: 'Consommation des radiateurs par jour' })).toBeInTheDocument();
    expect(container.querySelector('.hero .big')).toHaveTextContent('140,0 kWh');
    expect(container.querySelector('.hero .range')).toHaveTextContent(/^des radiateurs, /);
    expect(container.querySelector('.context .source-line')).toBeNull();
    expect(container.querySelector('.hero .keys')).toBeNull();
    expect(api.energyDay).not.toHaveBeenCalled();
  });

  it('the Courbe gives the daily-scaled HC/HP and the curve against the daily reading (M7)', async () => {
    const { container } = render(Page);
    await openCurve();
    expect(await within(document.getElementById('curve')!).findByRole('heading', { name: /^Courbe du 12 octobre 2026/ })).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: 'Consommation par demi-heure le 12 octobre 2026' })).toBeInTheDocument();
    const notes = [...container.querySelectorAll('#curve .note')].map((n) => n.textContent);
    expect(notes).toContain('Courbe 21,60\u00a0kWh · relevé journalier 22,03\u00a0kWh (écart 2,0\u00a0%)');
    expect(notes).toContain('HC 8,98\u00a0kWh · HP 13,05\u00a0kWh, d’après le relevé journalier');
    expect(screen.getByRole('button', { name: 'Jour suivant' })).toHaveAttribute('aria-disabled', 'true');
    await fireEvent.click(screen.getByRole('button', { name: 'Jour précédent' }));
    await waitFor(() => expect(api.energyDay).toHaveBeenLastCalledWith('2026-10-11', 'salon'));
  });

  it('the Courbe’s HC/HP add up to its daily reading and read as the bar inspector’s for that day (final review I-2)', async () => {
    const r = report();
    r.buckets = r.buckets.map((b) => (b.key === '2026-10-12' ? { ...b, kwh: 12.23, hc_kwh: 4.115, hp_kwh: 8.115 } : b));
    vi.mocked(api.energyReport).mockResolvedValue(r);
    vi.mocked(api.energyDay).mockImplementation(async (d: string) =>
      energyDay(d, { totals: { curve_kwh: 12.2, daily_kwh: 12.23, hc_kwh: 4.115, hp_kwh: 8.115, split_method: 'curve', hc_kwh_curve: 4.1, hp_kwh_curve: 8.1 } })
    );
    const { container } = render(Page);
    await openCurve();
    await screen.findByRole('img', { name: 'Consommation par demi-heure le 12 octobre 2026' });
    const notes = [...container.querySelectorAll('#curve .note')].map((n) => n.textContent);
    const caption = 'Consommation de la maison par jour';
    const row = bucketLabel('2026-10-12', 'day');
    const hc = cell(container, caption, row, 'Heures creuses');
    const hp = cell(container, caption, row, 'Heures pleines');
    expect([hc, hp]).toEqual(['4,12\u00a0kWh', '8,11\u00a0kWh']);
    expect(notes).toContain(`HC ${hc} · HP ${hp}, d’après le relevé journalier`);
  });

  it('the Courbe readout prices each half-hour from /api/energy/day: with a tariff, Prix and Coût are figures', async () => {
    const { container } = render(Page);
    await openCurve();
    const caption = 'Consommation par demi-heure le 12 octobre 2026';
    await screen.findByRole('img', { name: caption });
    expect(cell(container, caption, '00:00–00:30', 'Prix')).toBe('0,2000\u00a0€/kWh');
    expect(cell(container, caption, '00:30–01:00', 'Coût')).toBe('0,090\u00a0€');
    expect(cell(container, caption, '00:00–00:30', 'Radiateurs')).toBe('200\u00a0Wh');
    expect(cell(container, caption, '00:00–00:30', 'Reste')).toBe('200\u00a0Wh');
  });

  it('explains an empty or incomplete curve', async () => {
    vi.mocked(api.energyDay).mockImplementation(async (d: string) => energyDay(d, { complete: false, points: 41, available: [] }));
    const { unmount } = render(Page);
    await openCurve();
    expect(await screen.findByText('Courbe incomplète (41/48 demi-heures)')).toBeInTheDocument();
    unmount();
    vi.mocked(api.energyDay).mockImplementation(async (d: string) => energyDay(d, { complete: false, points: 0, intervals: [], available: [] }));
    const r = report();
    r.quality = { ...r.quality, curve_since: '2026-10-20' };
    vi.mocked(api.energyReport).mockResolvedValue(r);
    render(Page);
    // The board's widget says there is no curve; its sheet says why.
    expect(await screen.findByText('Pas de courbe pour ce jour.')).toBeInTheDocument();
    await openCurve();
    expect(await screen.findByText('Pas de courbe pour ce jour : antérieure à l’historique de courbe (depuis le 20 octobre 2026).')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /^Consommation par demi-heure/ })).toBeNull();
  });

  it('a day with no curve and no known cause still says why', async () => {
    vi.mocked(api.energyDay).mockImplementation(async (d: string) => energyDay(d, { complete: false, points: 0, intervals: [], available: [] }));
    render(Page);
    await openCurve();
    expect(await screen.findByText('Pas de courbe pour ce jour : pas de données Linky pour ce jour.')).toBeInTheDocument();
  });

  it('a day before the first counted day says so, with no figure', async () => {
    vi.mocked(api.energyDay).mockImplementation(async (d: string) =>
      energyDay(d, {
        complete: false, points: 0, intervals: [], available: [], counted_from: '2026-10-13', not_counted: 'before_first_day',
        totals: { curve_kwh: null, daily_kwh: null, hc_kwh: null, hp_kwh: null, split_method: null, hc_kwh_curve: null, hp_kwh_curve: null },
        power: { peak_w: null, peak_ts: null, base_w_p10: null, night_min_w: null, kva: null }
      })
    );
    render(Page);
    await openCurve();
    expect(await screen.findByText('Pas de courbe pour ce jour : antérieure au premier jour compté (depuis le 13 octobre 2026).')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /^Consommation par demi-heure/ })).toBeNull();
  });

  it('radiators read « — » with a reason, never 0: today counts once it is over, a past day without a reading says so', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-14T10:00:00Z'));
    today.check(); // the page's today reads the faked clock
    try {
      const { container } = render(Page);
      const caption = 'Consommation de la maison par jour';
      await screen.findByRole('img', { name: caption });
      expect(cell(container, caption, '12/10', 'Radiateurs')).toBe('5,00\u00a0kWh');
      expect(cell(container, caption, '13/10', 'Radiateurs')).toBe('— (aucun relevé de radiateur)');
      expect(cell(container, caption, '14/10', 'Radiateurs')).toBe('— (jour en cours, compté une fois terminé)');
      expect(cell(container, caption, '15/10', 'Radiateurs')).toBe('—'); // still to come: nothing to explain
    } finally {
      vi.useRealTimers();
      today.check();
    }
  });

  it('at midnight the page follows the new day without a reload: today’s bar says so, and the period is asked again', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-12T23:59:30+02:00'));
    today.check();
    try {
      const { container } = render(Page);
      const caption = 'Consommation de la maison par jour';
      await screen.findByRole('img', { name: caption });
      expect(cell(container, caption, '13/10', 'Radiateurs')).toBe('—'); // tomorrow: nothing to explain yet
      expect(api.energyReport).toHaveBeenCalledTimes(2);
      vi.setSystemTime(new Date('2026-10-13T00:00:30+02:00'));
      today.check(); // what the midnight timer runs (Today's own test covers the timer)
      await waitFor(() => expect(api.energyReport).toHaveBeenCalledTimes(4));
      await waitFor(() => expect(cell(container, caption, '13/10', 'Radiateurs')).toBe('— (jour en cours, compté une fois terminé)'));
    } finally {
      vi.useRealTimers();
      today.check();
    }
  });

  it('an interior gap reads « — » and draws a baseline tick, unlike a zero', async () => {
    const days = october();
    days[5] = { ...days[5], ...NONE, missing_days: 1 };
    vi.mocked(api.energyReport).mockResolvedValue(report({ buckets: days }));
    const { container } = render(Page);
    await screen.findByRole('img', { name: 'Consommation de la maison par jour' });
    expect(cell(container, 'Consommation de la maison par jour', '6/10', 'Heures creuses')).toBe('—');
    expect(container.querySelectorAll('line.gap')).toHaveLength(1);
  });

  it('under Base the bars carry the whole consumption in one series, and the legend has no HC/HP', async () => {
    const days = october().map((b, i) => (i < 12 ? { ...b, hc_kwh: null, hp_kwh: null } : b));
    vi.mocked(api.energyReport).mockResolvedValue(report({ option: 'base', buckets: days, total: summary({ hc_kwh: null, hp_kwh: null }) }));
    const { container } = render(Page);
    await screen.findByRole('img', { name: 'Consommation de la maison par jour' });
    expect(cell(container, 'Consommation de la maison par jour', '3/10', 'Maison')).toMatch(/^10/);
    expect(container.querySelectorAll('rect.part').length).toBeGreaterThan(0);
    const legend = container.querySelector('ul.legend')!;
    expect(legend).toHaveTextContent('Consommation');
    expect(legend).not.toHaveTextContent('Heures creuses');
    expect(legend).not.toHaveTextContent('Heures pleines');
  });

  it('Mois: the Courbe widget reads the day’s kWh, € and peak; « par demi-heure › » opens the full Courbe in a sheet', async () => {
    const { container } = render(Page);
    const line = await waitFor(() => {
      const x = container.querySelector('.w-curve .line');
      if (!x || x.textContent === '—') throw new Error('no line yet');
      return x;
    });
    // The day bar's own figures: 10,00 kWh and 3,00 € for the 12th; the peak from the curve.
    expect(line).toHaveTextContent(`10,00 kWh · 3,00 € · pointe 6,84 kW à ${fmtTime(parisDayStart('2026-10-12') + 19 * 3600_000)}`);
    // No second Courbe on the page until it is asked for.
    expect(document.getElementById('curve')).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: /^par demi-heure, courbe du / }));
    expect(await screen.findByRole('img', { name: 'Consommation par demi-heure le 12 octobre 2026' })).toBeInTheDocument();
    expect(document.getElementById('curve')!.closest('dialog')).toHaveAttribute('open');
  });

  it('the Courbe sheet does not follow to another view; Année has no Courbe, its months drill into Mois', async () => {
    render(Page);
    await openCurve();
    await fireEvent.click(screen.getByRole('radio', { name: 'Année' }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: '2026' })).toBeInTheDocument());
    await waitFor(() => expect(document.getElementById('curve')).toBeNull());
    expect(screen.queryByRole('button', { name: /^par demi-heure, courbe du / })).toBeNull();
  });

  it('the Courbe readout at rest is the whole day, the bar’s figures, under « Journée »; scrubbing shows the half-hour', async () => {
    const { container } = render(Page);
    await fireEvent.click(await screen.findByRole('radio', { name: 'Jour' }));
    await screen.findByRole('img', { name: 'Consommation par demi-heure le 12 octobre 2026' });
    const readout = container.querySelector('#curve .readout')!;
    const cur = (label: string) =>
      [...readout.querySelectorAll('.field')].find((f) => f.querySelector('dt')?.textContent === label)?.querySelector('.v.cur .val')?.textContent ?? null;
    expect(readout.querySelector('.when dd')).toHaveTextContent('Journée');
    expect(cur('Énergie')).toBe('10,00\u00a0kWh');
    expect(cur('Coût')).toBe('3,00\u00a0€');
    expect(cur('Radiateurs')).toBe('5,00\u00a0kWh');
    // Tarif and Prix have no whole-day value: their place is kept, unseen.
    const rate = [...readout.querySelectorAll('.field')].find((f) => f.querySelector('dt')?.textContent === 'Tarif')!;
    expect(rate).toHaveClass('off');
    expect(screen.getByText('Survolez, touchez ou utilisez ← → pour lire chaque demi-heure')).toBeInTheDocument();
    await fireEvent.keyDown(screen.getByRole('slider', { name: 'Parcourir la courbe, demi-heure par demi-heure' }), { key: 'ArrowRight' });
    expect(readout.querySelector('.when dd')).toHaveTextContent('00:00–00:30');
    expect(cur('Énergie')).toBe('400\u00a0Wh');
    expect(rate).not.toHaveClass('off');
  });

  it('a day with no off-peak split beside split days reads « Non réparti » (violet), never « Heures creuses »', async () => {
    const days = october();
    days[3] = { ...days[3], hc_kwh: null, hp_kwh: null };
    vi.mocked(api.energyReport).mockResolvedValue(report({ buckets: days }));
    const { container } = render(Page);
    await screen.findByRole('img', { name: 'Consommation de la maison par jour' });
    const legend = [...container.querySelectorAll('.bars-w ul.legend li')].map((l) => l.textContent);
    expect(legend).toEqual(['Heures creuses', 'Heures pleines', 'Non réparti', 'Radiateurs']);
    expect(cell(container, 'Consommation de la maison par jour', '4/10', 'Maison')).toMatch(/^10/);
  });

  it('the legend names only what is drawn: no « Non réparti » for days still to come', async () => {
    const { container } = render(Page);
    await screen.findByRole('img', { name: 'Consommation de la maison par jour' });
    expect([...container.querySelectorAll('.bars-w ul.legend li')].map((l) => l.textContent)).toEqual(['Heures creuses', 'Heures pleines', 'Radiateurs']);
  });

  it('a failed curve says so, and Réessayer reads it again', async () => {
    vi.mocked(api.energyDay).mockRejectedValueOnce(new Error('boom'));
    render(Page);
    await openCurve();
    expect(await screen.findByText('Impossible de charger la courbe.')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /^Consommation par demi-heure/ })).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByRole('img', { name: 'Consommation par demi-heure le 12 octobre 2026' })).toBeInTheDocument();
  });

  it('missing days and prices applied after the fact stay on screen (ⓘ); the estimated split and interpolation go to the Fiche', async () => {
    const r = report(
      periodWith({
        kwh: 300, missing_days: 2, estimated_split: true, retro_priced: true,
        prices: [{ valid_from: '2026-10-05', subscription_eur_month: 15, rates: { hc: 0.2, hp: 0.3 } }],
        radiators: { kwh: 140, hc_kwh: 60, hp_kwh: 80, eur: 35, interpolated: true, apportioned: true, coverage: 1 }
      })
    );
    r.quality = { ...r.quality, estimated_days: 5 };
    r.period.quality = { ...r.period.quality, estimated_days: 3 };
    vi.mocked(api.energyReport).mockResolvedValue(r);
    desktop.matches = true;
    try {
      const { container } = render(Page);
      expect(await screen.findByText('Données partielles : 2 jours manquants. L’énergie de ces jours n’est pas comptée dans le coût.')).toBeInTheDocument();
      expect(screen.getByText('Prix du 5/10 appliqué aux jours antérieurs.')).toBeInTheDocument();
      expect(container.querySelectorAll('.hero .note svg')).toHaveLength(2);
      expect(screen.queryByText('Répartition heures creuses / pleines estimée pour 3 jours sans courbe complète.')).toBeNull();
      await fireEvent.click(container.querySelector<HTMLButtonElement>('.hero .fig')!);
      const card = document.querySelector('.fiche')!;
      expect(card).toHaveTextContent('Répartition heures creuses / pleines estimée pour 3 jours sans courbe complète.');
      expect(card).toHaveTextContent('Radiateurs : énergie répartie sur une interruption de l’enregistrement (est.).');
      expect(card).toHaveTextContent('Données partielles : 2 jours manquants.');
    } finally {
      desktop.matches = false;
      clearFiches();
    }
  });

  it('names the days whose energy has no Tempo colour (hero)', async () => {
    vi.mocked(api.energyReport).mockResolvedValue(report(periodWith({ kwh: 300, missing_colour_days: 2 })));
    render(Page);
    expect(await screen.findByText(/énergie de 2 jours sans couleur Tempo non comptée/)).toBeInTheDocument();
  });

  it('Jour: the hero and Qualité describe the selected day, not the 7 days of bars (final review I-1)', async () => {
    const r = report(periodWith({ estimated_split: true, split_method: 'fallback_window', days: 1, present_days: 1 }));
    r.quality = { ...r.quality, estimated_days: 4, fallback_method: 'fallback_window', fallback_share: 0.4, retro_priced_days: 3 };
    r.period.quality = { ...r.period.quality, estimated_days: 1, fallback_method: 'fallback_window', fallback_share: 0.4 };
    vi.mocked(api.energyReport).mockResolvedValue(r);
    desktop.matches = true;
    const { container } = render(Page);
    await screen.findByRole('heading', { level: 2, name: 'Octobre 2026' });
    await fireEvent.click(screen.getByRole('radio', { name: 'Jour' }));
    await screen.findByRole('heading', { level: 2, name: 'Lundi 12 octobre 2026' });
    await fireEvent.click(container.querySelector<HTMLButtonElement>('.hero .fig')!);
    const card = document.querySelector('.fiche')!;
    expect(card).toHaveTextContent('Répartition heures creuses / pleines estimée pour 1 jour sans courbe complète.');
    expect(card).not.toHaveTextContent(/estimée pour 4 jours/);
    desktop.matches = false;
    clearFiches();
    const q = container.querySelector('#quality')!;
    expect(q).toHaveTextContent('Jours HC/HP estimés : 1 (');
    expect(q).not.toHaveTextContent('Prix du premier tarif');
    // The strip has the selected day's cell only.
    expect(q.querySelectorAll('.strip .row')[0].querySelectorAll('.cell')).toHaveLength(1);
    expect(q.querySelectorAll('tbody tr')).toHaveLength(1);
  });

  it('without Linky, a partial radiator sum says « jusqu’à hier » only for a running period (final review minor 3)', async () => {
    vi.mocked(api.linkyStatus).mockResolvedValue({ ...linkyOk, configured: false, state: 'off', last_day: null });
    const rad = { kwh: 140, hc_kwh: 60, hp_kwh: 80, eur: 35, interpolated: false, apportioned: false, coverage: 0.5 };
    const closed = { period: { from: '2026-09-01', to: '2026-10-01', ...summary({ ...NONE, radiators: rad }), quality: QUALITY } };
    vi.mocked(api.energyReport).mockResolvedValue(report({ linky: false, last_day: null, projection: null, ...closed }));
    const { unmount } = render(Page);
    expect(await screen.findByText('Radiateurs : couverture 50,0 %, somme partielle.')).toBeInTheDocument();
    unmount();
    const running = { period: { from: '2026-10-01', to: '2099-11-01', ...summary({ ...NONE, radiators: rad }), quality: QUALITY } };
    vi.mocked(api.energyReport).mockResolvedValue(report({ linky: false, last_day: null, projection: null, ...running }));
    render(Page);
    expect(await screen.findByText('Radiateurs : couverture 50,0 %, somme partielle (jusqu’à hier).')).toBeInTheDocument();
  });

  it('never invents euros for a period with no Linky day: shows the missing-data state', async () => {
    vi.mocked(api.energyReport).mockResolvedValue(report(periodWith({ ...NONE, subscription_eur: 15, missing_days: 13 })));
    const { container } = render(Page);
    await screen.findByRole('heading', { level: 2, name: 'Octobre 2026' });
    expect(container.querySelector('.hero .big')).toHaveTextContent('—');
    expect(container.querySelector('.hero .big')).not.toHaveTextContent('15');
    expect(screen.queryByText('estimation')).toBeNull();
    expect(screen.getByText('Aucune donnée pour cette période.')).toBeInTheDocument();
  });

  it('first load shows the navigator and panel skeletons, then everything at once', async () => {
    let resolve!: (r: EnergyReport) => void;
    vi.mocked(api.energyReport).mockReturnValue(new Promise((r) => (resolve = r)));
    const { container } = render(Page);
    // The board's shape: bars and Résumé, then a row of three.
    expect(container.querySelectorAll('.panel-sk')).toHaveLength(5);
    expect(screen.queryByText('Chargement…')).toBeNull();
    expect(container.querySelector('.hero-sk')).not.toBeNull();
    expect(screen.queryByRole('heading', { name: 'Consommation de la maison' })).toBeNull();
    resolve(report());
    expect(await screen.findByRole('heading', { name: 'Consommation de la maison' })).toBeInTheDocument();
    expect(container.querySelectorAll('.panel-sk, .nav-sk')).toHaveLength(0);
  });

  it('switching period keeps the previous report on screen, busy, until the new one arrives', async () => {
    const { container } = render(Page);
    await screen.findByRole('img', { name: 'Consommation de la maison par jour' });
    vi.mocked(api.energyReport).mockReturnValue(new Promise(() => {}));
    await fireEvent.click(screen.getByRole('radio', { name: 'Année' }));
    expect(container.querySelector('.panels')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('img', { name: 'Consommation de la maison par jour' })).toBeInTheDocument();
  });

  it('shows the backend’s French detail when the report fails, else a generic message; Réessayer fetches again', async () => {
    vi.mocked(api.energyReport).mockRejectedValueOnce(new ApiError(422, 'Période invalide.'));
    render(Page);
    expect(await screen.findByRole('alert')).toHaveTextContent('Période invalide.');
    vi.mocked(api.energyReport).mockRejectedValueOnce(new Error('boom'));
    await fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Impossible de charger la consommation.'));
    await fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByRole('img', { name: 'Consommation de la maison par jour' })).toBeInTheDocument();
  });

  it('Linky quota is the source line’s words and dashed ring: no callout, nothing to fix in the settings', async () => {
    vi.mocked(api.linkyStatus).mockResolvedValue({ ...linkyOk, state: 'quota', message: 'Quota Linky du jour atteint : reprise demain.' });
    const { container } = render(Page);
    await screen.findByRole('heading', { level: 2, name: 'Octobre 2026' });
    const line = await waitFor(() => container.querySelector('.context .source-line')!);
    expect(line).toHaveTextContent('Linky · historique en cours, la suite demain');
    expect(line.querySelector('[data-fresh="late"]')).not.toBeNull();
    expect(screen.queryByRole('link', { name: 'Réglages' })).toBeNull();
    expect(container.querySelector('.callout')).toBeNull();
  });

  it('the Linky source line’s Fiche holds the last day, the sync, the calls and the history', async () => {
    desktop.matches = true;
    vi.mocked(api.linkyStatus).mockResolvedValue({ ...linkyOk, last_ok_at: Date.UTC(2026, 9, 13, 5, 0) / 1000 });
    try {
      render(Page);
      await fireEvent.click(await screen.findByRole('button', { name: 'Linky · données jusqu’au 12/10, détails' }));
      const card = document.querySelector('.fiche')!;
      expect(card.querySelector('.title')).toHaveTextContent('Compteur Linky');
      expect(ficheRow(card, 'Dernier relevé journalier')).toBe('12 octobre 2026');
      expect(ficheRow(card, 'Appels MyElectricalData')).toBe('2 sur 10 aujourd’hui');
      expect(ficheRow(card, 'Historique depuis le')).toBe('1er novembre 2025');
      expect(ficheRow(card, 'Dernière synchronisation')).not.toBeNull();
    } finally {
      desktop.matches = false;
      clearFiches();
    }
  });

  it('Linky throttled is neutral and gives the retry time', async () => {
    const retry = Date.UTC(2026, 9, 14, 12, 30) / 1000;
    vi.mocked(api.linkyStatus).mockResolvedValue({ ...linkyOk, state: 'throttled', retry_at: retry, message: null });
    const { container } = render(Page);
    expect(await screen.findByText(new RegExp(`nouvel essai à ${fmtTime(retry * 1000)}`))).toBeInTheDocument();
    expect(container.querySelector('.callout.bad')).toBeNull();
  });

  it('Linky auth is an error with a way to renew the token', async () => {
    vi.mocked(api.linkyStatus).mockResolvedValue({ ...linkyOk, state: 'auth', message: null });
    const { container } = render(Page);
    expect(await screen.findByRole('link', { name: 'Renouveler le jeton' })).toHaveAttribute('href', '/home/linky');
    expect(container.querySelector('.callout.bad')).toHaveTextContent('MyElectricalData refuse le jeton Linky.');
  });

  it('a failed Linky status is not hidden, and the page still loads', async () => {
    vi.mocked(api.linkyStatus).mockRejectedValue(new Error('boom'));
    const { container } = render(Page);
    expect(await screen.findByText(/État du Linky indisponible\./)).toBeInTheDocument();
    expect(container.querySelector('.callout.bad a')).toHaveAttribute('href', '/home/linky');
    expect(api.energyReport).toHaveBeenCalled(); // from yesterday's period, without a Linky day to anchor it
  });

  it('no « Compteurs des radiateurs » or « Exporter » panel: the files are in the header menu', async () => {
    render(Page);
    await screen.findByRole('img', { name: 'Consommation de la maison par jour' });
    expect(screen.queryByRole('heading', { name: 'Compteurs des radiateurs' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Exporter' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Exporter' }).length).toBeGreaterThan(0);
    // One way to export: the header menu (no second button at the end of the page).
    expect(screen.queryByRole('button', { name: 'Exporter (CSV)' })).toBeNull();
  });

  it('shows the report as soon as it arrives, even before the live stream; house parts wait in their own slots', async () => {
    house.reset();
    const { container } = render(Page);
    expect(await screen.findByRole('img', { name: 'Consommation de la maison par jour' })).toBeInTheDocument();
    expect(container.querySelector('.hero .big')).toHaveTextContent('€');
    expect(document.getElementById('energy-where')).toHaveAttribute('aria-busy', 'true');
    // The board's Où part widget waits too.
    expect(container.querySelector('.w-where')).toHaveAttribute('aria-busy', 'true');
  });

  it('the board: Mois puts the split, the Courbe’s day and the rooms beside each other; Jour and Semaine add Puissance', async () => {
    vi.mocked(api.energyReport).mockResolvedValue(report({ hc_lens: { hc_share: 0.384, slot_share: 0.3333, avg_price: 0.2437, delta_price: 0.0632 } }));
    const { container } = render(Page);
    // Order: bars, Résumé, the row of three (labels are h3), Analyse, Qualité; the full Où part is collapsed (not a section
    // of the board until « Tout voir »), the Courbe a sheet.
    const analysis = (await screen.findByRole('heading', { level: 2, name: 'Analyse' })).closest('section')!;
    const cards = (a: Element) => [...a.querySelectorAll('.cards > section h3')].map((h) => h.textContent);
    expect(cards(analysis)).toEqual(['Comparaisons', 'Projection']);
    expect(analysis.querySelector('.cards')).toHaveClass('n2');
    const cell = (x: Element) => x.querySelector('h2, h3')?.textContent?.trim();
    const order = () => [...container.querySelectorAll('.panels > section')].map((x) => (x.classList.contains('hero') ? 'Résumé' : cell(x)?.split(/\s{2,}|\n/)[0]));
    expect(order()).toEqual([
      expect.stringMatching(/^Consommation de la maison/), 'Résumé', 'Heures creuses / pleines', 'Courbe du 12 octobre 2026', 'Où part l’énergie',
      'Analyse', expect.stringMatching(/^Qualité des données/)
    ]);
    expect(document.querySelectorAll('#curve')).toHaveLength(0);
    // « Tout voir › » opens the full section (collapsed and findable until then) and lands on it.
    const wrap = container.querySelector('.where-wrap')!;
    expect(wrap).toHaveAttribute('hidden', 'until-found');
    const more = within(container.querySelector('.w-where')!).getByRole('link', { name: 'Tout voir' });
    expect(more).toHaveAttribute('href', '#energy-where');
    await fireEvent.click(more);
    expect(wrap).not.toHaveAttribute('hidden');
    await fireEvent.click(within(wrap as HTMLElement).getByRole('button', { name: 'Replier la liste' }));
    expect(wrap).toHaveAttribute('hidden', 'until-found');
    // The Chauffage key figure opens it each time, even after « Replier » (never the browser's same-hash jump).
    expect(wrap).toHaveAttribute('hidden', 'until-found');
    const heating = screen.getByRole('link', { name: /^Chauffage,/ });
    await fireEvent.click(heating);
    expect(wrap).not.toHaveAttribute('hidden');
    await fireEvent.click(within(wrap as HTMLElement).getByRole('button', { name: 'Replier la liste' }));
    await fireEvent.click(heating);
    expect(wrap).not.toHaveAttribute('hidden');
    await fireEvent.click(within(wrap as HTMLElement).getByRole('button', { name: 'Replier la liste' }));
    // A find-in-page reveals it too.
    wrap.dispatchEvent(new Event('beforematch'));
    await tick();
    expect(wrap).not.toHaveAttribute('hidden');
    await fireEvent.click(screen.getByRole('radio', { name: 'Jour' }));
    await screen.findByRole('heading', { level: 2, name: 'Lundi 12 octobre 2026' });
    // Jour: the Courbe leads, the Résumé and the 7 days beside it, then Puissance, the split and the rooms.
    expect(order().slice(0, 7)).toEqual([
      expect.stringMatching(/^Courbe du 12 octobre/), 'Résumé', 'Les 7 jours jusqu’au 12/10', 'Puissance', 'Heures creuses / pleines', 'Où part l’énergie',
      'Température et chauffe'
    ]);
    const day = screen.getByRole('heading', { level: 2, name: 'Analyse' }).closest('section')!;
    expect(cards(day)).toEqual(['Comparaisons', 'Projection']);
    // Every card's detail is closed by default.
    for (const b of container.querySelectorAll('.panels .dbtn')) if (!b.closest('#curve, #quality')) expect(b).toHaveAttribute('aria-expanded', 'false');
  });

  it('Tempo in force: the six Tempo rows take the split’s place (adding up to the energy €), dots under the day bars', async () => {
    const tempo_lens = {
      rows: [
        { key: 'blue_hc', kwh: 50, eur: 6.62 }, { key: 'blue_hp', kwh: 260, eur: 41.91 }, { key: 'white_hc', kwh: 10, eur: 1.5 },
        { key: 'white_hp', kwh: 30, eur: 5.61 }, { key: 'red_hc', kwh: 0, eur: 0 }, { key: 'red_hp', kwh: 0, eur: 0 }
      ],
      days: { blue: 10, white: 1, red: 0, unknown: 1 },
      unknown_kwh: null
    };
    const days = october().map((b, i) => (i < 12 ? { ...b, tempo: i === 3 ? { blue: 0, white: 1, red: 0, unknown: 0 } : i === 5 ? { blue: 0, white: 0, red: 0, unknown: 1 } : { blue: 1, white: 0, red: 0, unknown: 0 } } : b));
    vi.mocked(api.energyReport).mockResolvedValue(report({ option: 'tempo', tempo_lens, buckets: days }));
    const { container } = render(Page);
    const card = (await screen.findByRole('heading', { name: 'Jours Tempo' })).closest('section')!;
    expect(card.querySelectorAll('tbody tr')).toHaveLength(6);
    expect(card).toHaveTextContent('Un jour Tempo va de 06:00 à 06:00.');
    // The split card moves to Analyse.
    const analysis = screen.getByRole('heading', { level: 2, name: 'Analyse' }).closest('section')!;
    expect([...analysis.querySelectorAll('.cards > section h3')].map((h) => h.textContent)).toEqual(['Heures creuses / pleines', 'Comparaisons', 'Projection']);
    const dots = [...container.querySelectorAll('.bars-w .dots .dot')].map((d) => d.className.replace(/\s*svelte-\S+/g, '').trim());
    expect(dots).toHaveLength(12);
    expect(dots[3]).toBe('dot white');
    expect(dots[5]).toBe('dot unknown');
    expect(dots[0]).toBe('dot blue');
  });

  it('HC/HP or Base: no Tempo card and no dots, even when buckets carry colours from an old Tempo row', async () => {
    const days = october().map((b, i) => (i < 12 ? { ...b, tempo: { blue: 1, white: 0, red: 0, unknown: 0 } } : b));
    vi.mocked(api.energyReport).mockResolvedValue(report({ option: 'hchp', buckets: days }));
    const { container } = render(Page);
    await screen.findByRole('img', { name: 'Consommation de la maison par jour' });
    expect(screen.queryByRole('heading', { name: 'Jours Tempo' })).toBeNull();
    expect(container.querySelector('.bars-w .dots')).toBeNull();
  });

  it('Année: the month by month table reads each bar’s own kWh and €, the running month says to which day; a row opens it', async () => {
    const months = Array.from({ length: 12 }, (_, i) => ({
      key: `2026-${String(i + 1).padStart(2, '0')}`,
      ...summary(i > 9 ? { ...NONE, radiators: null, radiators_kwh: null, subscription_eur: null } : { kwh: 100 + i, eur: 30.5 + i, energy_eur: 25 + i, subscription_eur: 5.5 })
    }));
    vi.mocked(api.energyReport).mockResolvedValue(report({ group: 'month', buckets: months }));
    render(Page);
    await fireEvent.click(await screen.findByRole('radio', { name: 'Année' }));
    const table = (await screen.findByRole('heading', { name: 'Mois par mois' })).closest('section')!;
    const rows = [...table.querySelectorAll('li')];
    expect(rows).toHaveLength(12);
    expect(rows[0]).toHaveTextContent(/^Janvier 2026\s*100,00\skWh\s*30,50\s€$/);
    expect(rows[9]).toHaveTextContent('Octobre 2026 au 12/10');
    expect(rows[11]).toHaveTextContent(/^Décembre 2026\s*—$/);
    // The running month dashed to its projection, said under the chart.
    expect(screen.getByText(/^Octobre 2026 en pointillés\s:\sle mois complet estimé \(≈\s120,50\s€\)\.$/)).toBeInTheDocument();
    expect(document.querySelectorAll('.bars-w rect.ghost')).toHaveLength(1);
    await fireEvent.click(within(rows[2]).getByRole('button'));
    await screen.findByRole('heading', { level: 2, name: 'Mars 2026' });
  });

  it('Jour shows Température et chauffe under the Courbe for a room, and another room re-reads the day', async () => {
    house.applySnapshot({
      house: {
        rooms: [{ id: 'salon', name: 'Salon', radiator_ids: ['a'] }, { id: 'chambre', name: 'Chambre', radiator_ids: ['b'] }] as never,
        radiators: [{ id: 'a', room_id: 'salon', energy_wh: null, model: 'HEKLA', name: 'R' }] as never
      },
      pending: [], overrides: [], status: { connected: true, last_ok_at: null, last_error: null }
    });
    vi.mocked(api.energyDay).mockImplementation(async (d: string, room?: string | null) =>
      energyDay(d, { room: room ? { id: room, name: room === 'salon' ? 'Salon' : 'Chambre', samples: [], overrides: [] } : null })
    );
    const { container } = render(Page);
    await screen.findByRole('heading', { level: 2, name: 'Octobre 2026' });
    // Mois: the Courbe, but one day at a time is Jour's and Semaine's.
    expect(screen.queryByRole('heading', { name: 'Température et chauffe' })).toBeNull();
    await fireEvent.click(screen.getByRole('radio', { name: 'Jour' }));
    const h = await screen.findByRole('heading', { name: 'Température et chauffe' });
    // Its own widget on the board, under the row of three, sharing the Courbe's scrubber.
    expect(h.tagName).toBe('H2');
    expect(h.closest('#energy-where')).toBeNull();
    expect(h.closest('.panels > section')).not.toBeNull();
    // The first room in the Pièces order.
    await waitFor(() => expect(api.energyDay).toHaveBeenLastCalledWith('2026-10-12', 'salon'));
    // The half-hour scrubbed on one chart is the other's.
    await fireEvent.keyDown(await screen.findByRole('slider', { name: 'Parcourir la journée de la pièce, demi-heure par demi-heure' }), { key: 'ArrowRight' });
    expect(container.querySelector('#curve .readout .when')).toHaveTextContent('00:00–00:30');
    await fireEvent.change(screen.getByRole('combobox', { name: 'Pièce' }), { target: { value: 'chambre' } });
    await waitFor(() => expect(api.energyDay).toHaveBeenLastCalledWith('2026-10-12', 'chambre'));
    // Chambre's radiator has no figure that day: said, never a flat zero.
    expect(await screen.findByText('Pas de relevé pour cette pièce ce jour-là.')).toBeInTheDocument();
  });
  it('Comparaisons and Projection are Analyse cards in every view; the Projection says how, one disclosure away', async () => {
    render(Page);
    for (const view of ['Mois', 'Jour', 'Semaine', 'Année']) {
      if (view !== 'Mois') await fireEvent.click(screen.getByRole('radio', { name: view }));
      const cmp = (await screen.findByRole('heading', { name: 'Comparaisons' })).closest('section')!;
      expect(cmp.parentElement).toHaveClass('cards');
      expect(screen.getByRole('heading', { name: 'Projection' }).closest('section')).toHaveAttribute('id', 'projection');
    }
    expect(screen.getByRole('button', { name: /^Comment c’est calculé/ })).toHaveAttribute('aria-expanded', 'false');
  });

  it('expanding a room in Jour selects it in Température et chauffe', async () => {
    house.applySnapshot({
      house: {
        rooms: [{ id: 'salon', name: 'Salon', radiator_ids: ['a'] }, { id: 'chambre', name: 'Chambre', radiator_ids: ['b'] }] as never,
        radiators: [{ id: 'a', room_id: 'salon', energy_wh: null, model: 'HEKLA', name: 'R' }, { id: 'b', room_id: 'chambre', energy_wh: null, model: 'HEKLA', name: 'S' }] as never
      },
      pending: [], overrides: [], status: { connected: true, last_ok_at: null, last_error: null }
    });
    const r = report();
    r.by_radiator = [
      { radiator_id: 'a', room_id: 'salon', kwh: 5, hc_kwh: 2, hp_kwh: 3, eur: 1.2, coverage: 1, interpolated: false, apportioned: false, from: null, temp_avg: 19, setpoint_avg: 20, heating_hours: 2 },
      { radiator_id: 'b', room_id: 'chambre', kwh: 3, hc_kwh: 1, hp_kwh: 2, eur: 0.8, coverage: 1, interpolated: false, apportioned: false, from: null, temp_avg: 18, setpoint_avg: 19, heating_hours: 1 }
    ];
    vi.mocked(api.energyReport).mockResolvedValue(r);
    const { container } = render(Page);
    await screen.findByRole('heading', { level: 2, name: 'Octobre 2026' });
    await fireEvent.click(screen.getByRole('radio', { name: 'Jour' }));
    await screen.findByRole('heading', { name: 'Température et chauffe' });
    await waitFor(() => expect(api.energyDay).toHaveBeenLastCalledWith('2026-10-12', 'salon'));
    await fireEvent.click(container.querySelector<HTMLButtonElement>('#energy-where button.name[data-room="chambre"]')!);
    await waitFor(() => expect(api.energyDay).toHaveBeenLastCalledWith('2026-10-12', 'chambre'));
  });

  it('the default room is the first, in the Pièces order, that has a radiator', async () => {
    house.applySnapshot({
      house: {
        rooms: [{ id: 'hall', name: 'Entrée', radiator_ids: [] }, { id: 'salon', name: 'Salon', radiator_ids: ['a'] }] as never,
        radiators: [{ id: 'a', room_id: 'salon', energy_wh: null, model: 'HEKLA', name: 'R' }] as never
      },
      pending: [], overrides: [], status: { connected: true, last_ok_at: null, last_error: null }
    });
    render(Page);
    await screen.findByRole('heading', { level: 2, name: 'Octobre 2026' });
    await waitFor(() => expect(api.energyDay).toHaveBeenLastCalledWith(expect.any(String), 'salon'));
    expect(api.energyDay).not.toHaveBeenCalledWith(expect.any(String), 'hall');
  });

  it('the Projection says it is late when Linky is', async () => {
    vi.mocked(api.energyReport).mockResolvedValue(report({ projection: null, last_day: '2026-10-01' }));
    render(Page);
    expect(await screen.findByText(/^Relevés Linky en retard \(dernier jour le 1er octobre 2026\)/)).toBeInTheDocument();
  });

  it('Qualité des données is collapsed, last; the header menu exports the period shown, the Courbe’s day and the rooms', async () => {
    desktop.matches = true;
    try {
      const { container } = render(Page);
      const quality = (await screen.findByRole('heading', { name: /^Qualité des données/ })).closest('section')!;
      expect(quality).toHaveAttribute('id', 'quality');
      expect(within(quality).getByRole('button', { name: /^Qualité des données/ })).toHaveAttribute('aria-expanded', 'false');
      expect([...container.querySelectorAll('.panels > *')].at(-1)).toBe(quality);
      const trigger = container.querySelector<HTMLButtonElement>('.export .desk button')!;
      expect(trigger).toHaveTextContent('Exporter');
      await fireEvent.click(trigger);
      const items = await screen.findAllByRole('menuitem');
      expect(items.map((i) => i.textContent!.trim())).toEqual(['Exporter la période (CSV)', 'Exporter la courbe du 12/10 (CSV)']);
      expect(document.querySelector('.pop .foot')).toHaveTextContent('CSV : « ; » entre les colonnes, virgule décimale, dates ISO.');
      await fireEvent.click(items[0]);
      const file = vi.mocked(download).mock.calls[0][0];
      expect(file.name).toBe('energie_2026-10-01_2026-11-01_day.csv');
      const rows = file.text.slice(1).split('\r\n');
      expect(rows).toHaveLength(31 + 2 + 1); // header, 31 days, total, the final CRLF
      // The total row is the hero's period: 412,6 kWh, 98,40 €.
      expect(rows[32].split(';').slice(0, 4).join(';')).toBe('total;2026-10-01T00:00:00+02:00;2026-11-01T00:00:00+01:00;412,640');
      expect(rows[32].split(';')[12]).toBe('98,40');
      // The same header menu gives the Courbe's day.
      await fireEvent.click(trigger);
      await fireEvent.click((await screen.findAllByRole('menuitem', { name: 'Exporter la courbe du 12/10 (CSV)' }))[0]);
      expect(vi.mocked(download).mock.calls[1][0].name).toBe('courbe_2026-10-12.csv');
    } finally {
      desktop.matches = false;
      clearFiches();
    }
  });

});

describe('Energy in English', () => {
  it('title, views, hero, comparison, freshness and the chart in en-GB', async () => {
    applyLocale('en');
    const { container } = render(Page);
    expect(await screen.findByRole('heading', { level: 2, name: 'October 2026' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Energy' })).toBeInTheDocument();
    expect(document.title).toBe('Energy · Kelvin');
    expect(screen.getByRole('radio', { name: 'Month' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radiogroup', { name: 'Period' })).toBeInTheDocument();
    expect(container.querySelector('.hero .big')).toHaveTextContent('€98.40');
    expect(screen.getByRole('button', { name: '€98.40, estimate, details' })).toBeInTheDocument();
    expect(container.querySelector('.hero .range')).toHaveTextContent('1/10 – 12/10 · 412.6 kWh');
    expect(container.querySelector('.hero .words')).toHaveTextContent('Off-peak 158.3 kWh Peak 254.3 kWh');
    expect(screen.getByText('−4% consumption compared with September 2026, over 12 comparable days')).toBeInTheDocument();
    expect(container.querySelector('.context .source-line')).toHaveTextContent('Linky · data up to 12/10');
    expect(screen.getByRole('img', { name: 'Home consumption by day' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Export' }).length).toBeGreaterThan(0);
  });
  it('a failed report shows the code’s English text, a code-less failure the page’s own message', async () => {
    applyLocale('en');
    vi.mocked(api.energyReport).mockRejectedValueOnce(Object.assign(new ApiError(422, 'Période invalide.'), { code: 'period_invalid', params: {} }));
    render(Page);
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid period.');
    vi.mocked(api.energyReport).mockRejectedValueOnce(new Error('boom'));
    await fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t load the consumption.'));
  });
  it('an error on screen re-renders in the new language', async () => {
    vi.mocked(api.energyReport).mockRejectedValueOnce(new Error('boom'));
    render(Page);
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger la consommation.');
    applyLocale('en');
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t load the consumption.'));
  });
  it('a failed period change names the period in English', async () => {
    applyLocale('en');
    render(Page);
    await screen.findByRole('heading', { level: 2, name: 'October 2026' });
    vi.mocked(api.energyReport).mockRejectedValueOnce(new Error('boom'));
    await fireEvent.click(screen.getByRole('button', { name: 'Previous period' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('September 2026: Couldn’t load the consumption.');
  });
  it('a Linky sync error reads its state’s text, the server’s French message only as a fallback', async () => {
    applyLocale('en');
    vi.mocked(api.linkyStatus).mockResolvedValue({ ...linkyOk, state: 'error', message: 'Erreur MED 500.' });
    render(Page);
    expect(await screen.findByText(/^Linky sync failed\./)).toBeInTheDocument();
  });
});
