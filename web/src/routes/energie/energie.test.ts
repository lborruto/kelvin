import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '$lib/api/client';
import type { EnergyDay, EnergyReport, EnergySummary, LinkyStatus } from '$lib/api/types';
import { addDays } from '$lib/energy';
import { fmtTime } from '$lib/format';
import { announcer } from '$lib/stores/announcer.svelte';
import { house } from '$lib/stores/house.svelte';
import { parisDayStart } from '$lib/time';
import Page from './+page.svelte';

vi.mock('$lib/stores/history.svelte', () => ({ history: { data: {}, load: vi.fn() } }));
vi.mock('$lib/api/client', () => ({
  api: { energyReport: vi.fn(), energyDay: vi.fn(), linkyStatus: vi.fn(), history: vi.fn().mockResolvedValue([]) },
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
}));

const summary = (o: Partial<EnergySummary> = {}): EnergySummary => ({
  kwh: 300, hc_kwh: 120, hp_kwh: 180, radiators_kwh: 140, energy_eur: 70, subscription_eur: 15, eur: 85,
  days: 30, missing_days: 0, estimated_split: false, split_method: 'curve',
  prices: [{ valid_from: '2026-01-01', subscription_eur_month: 15, rates: { hc: 0.2, hp: 0.3 } }],
  retro_priced: false, present_days: 30, curve: null,
  radiators: { kwh: 140, hc_kwh: 60, hp_kwh: 80, eur: 35, interpolated: false, apportioned: false, coverage: 1 },
  rest_kwh: 160, ...o
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

function report(o: Partial<EnergyReport> = {}): EnergyReport {
  return {
    group: 'day', from: '2026-10-01', to: '2026-11-01', last_day: '2026-10-12', linky: true, tariff: true,
    buckets: october(),
    total: summary(),
    hero: { current: { from: '2026-10-01', to: '2026-10-13', ...summary() }, previous: { from: '2026-09-01', to: '2026-09-13', ...summary() } },
    heating_share: 0.47, heating_share_since: '2026-10-01', linky_since: '2025-11-01',
    radiators: [{ radiator_id: 'a', kwh: 140 }],
    projection: {
      month: { key: '2026-10', kwh: 310, eur: 120.5, actual_kwh: 120, actual_eur: 98.4, actual_energy_eur: 92.1, filled_days: 0, method: 'linear' },
      year: { from: '2026-10', to: '2027-09', kwh: 3650, eur: 1234.4, method: 'linear', months: [] },
      rolling: { from: '2026-10-15', to: '2027-10-15', kwh: 3650, eur: 1234.4, per_day_kwh: 10, price_eur_kwh: 0.25, method: 'linear' }
    },
    period: {
      from: '2026-10-01', to: '2026-11-01',
      ...summary({ kwh: 412.64, hc_kwh: 158.3, hp_kwh: 254.34, eur: 98.4, energy_eur: 92.11, subscription_eur: 6.29, days: 31, present_days: 12 })
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
    quality: {
      fallback_share: null, fallback_method: null, estimated_days: 0, curve_vs_daily_pct: null, linky_since: '2025-11-01',
      curve_since: '2025-11-01', radiators_since: '2026-09-01', retro_priced_days: 0
    },
    ...o
  };
}
const periodWith = (o: Partial<EnergySummary>) => ({ period: { from: '2026-10-01', to: '2026-11-01', ...summary(o) } });

function energyDay(date: string, o: Partial<EnergyDay> = {}): EnergyDay {
  const a = parisDayStart(date) / 1000;
  return {
    date, complete: true, points: 2,
    intervals: [
      { ts: a, minutes: 30, wh: 400, w: 800, offpeak: 1, boundary: false, price: 0.2, eur: 0.08, radiators_wh: 200, radiators_known: 1, radiators_total: 1, radiators_interp: false, radiators_apportioned: false, by_room: { salon: 200 } },
      { ts: a + 1800, minutes: 30, wh: 300, w: 600, offpeak: 0, boundary: false, price: 0.3, eur: 0.09, radiators_wh: 100, radiators_known: 1, radiators_total: 1, radiators_interp: false, radiators_apportioned: false, by_room: { salon: 100 } }
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

const linkyOk: LinkyStatus = {
  configured: true, prm: '12345678901234', token_set: true, simulator: false, state: 'ok', message: null,
  last_day: '2026-10-12', last_ok_at: null, retry_at: null, calls_today: 2, budget: 10, consent_expires: null
};

beforeEach(() => {
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
  it('shows the period’s estimate in euros: parts that add up, the breakdown, a comparison on comparable days', async () => {
    const { container } = render(Page);
    expect(await screen.findByRole('heading', { level: 2, name: 'Octobre 2026' })).toBeInTheDocument();
    expect(container.querySelector('.hero')).toHaveAttribute('aria-labelledby', 'period-label');
    expect(container.querySelector('.hero .big')).toHaveTextContent('98,40 €');
    expect(screen.getByText('estimation')).toBeInTheDocument();
    expect(container.querySelector('.hero .sub .figs')).toHaveTextContent('412,6 kWh · HC 158,3 kWh · HP 254,3 kWh');
    // A running month is described up to its last day with data.
    expect(container.querySelector('.hero .sub .range')!.textContent).toContain('du\u00a01/10\u00a0au\u00a012/10');
    expect(container.querySelector('.hero .breakdown')).toHaveTextContent('Énergie 92,11 € + abonnement 6,29 €');
    expect(screen.getByText('−4 % de consommation par rapport à septembre 2026, sur 12 jours comparables')).toBeInTheDocument();
    expect(screen.getByText('Linky : données jusqu’au 12/10')).toBeInTheDocument();
  });

  it('omits the comparison when too few days are comparable', async () => {
    const r = report();
    r.comparison.previous = { ...r.comparison.previous!, pairs: 9, comparable: false, change: null };
    vi.mocked(api.energyReport).mockResolvedValue(r);
    const { container } = render(Page);
    await screen.findByRole('heading', { level: 2, name: 'Octobre 2026' });
    expect(container.querySelector('.hero .delta')).toBeNull();
  });

  it('the hero figure opens the period inspector', async () => {
    const { container } = render(Page);
    await fireEvent.click(await screen.findByRole('button', { name: /Détail de la période/ }));
    const sheet = container.querySelector('.hero .inspector.sheet')!;
    expect(sheet.querySelector('.title')).toHaveTextContent('Octobre 2026');
    expect(sheet).toHaveTextContent('Maison 412,64 kWh');
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

  it('stacks HC and HP in series 1 and 2, radiators as series-3 marks; Enter on a day opens its Courbe', async () => {
    const { container } = render(Page);
    await screen.findByRole('img', { name: 'Consommation de la maison par jour' });
    const fills = [...container.querySelectorAll('rect.part')].map((r) => r.getAttribute('style'));
    expect(fills.filter((f) => f?.includes('var(--series-1)'))).toHaveLength(12);
    expect(fills.filter((f) => f?.includes('var(--series-2)'))).toHaveLength(12);
    expect(container.querySelector('line.mark')!.getAttribute('style')).toContain('var(--series-3)');
    const bar = screen.getByRole('button', { name: /^11 octobre, 10,00 kilowattheures, 3,00 euros$/ });
    await fireEvent.keyDown(bar, { key: 'Enter' });
    await waitFor(() => expect(api.energyDay).toHaveBeenLastCalledWith('2026-10-11', 'salon'));
    expect(await screen.findByRole('heading', { name: 'Courbe du 11 octobre 2026' })).toBeInTheDocument();
    expect(announcer.polite).toBe('Courbe du 11 octobre 2026');
  });

  it('without Linky: a way to connect it, and the radiators alone', async () => {
    vi.mocked(api.linkyStatus).mockResolvedValue({ ...linkyOk, configured: false, state: 'off', last_day: null });
    vi.mocked(api.energyReport).mockResolvedValue(report({ linky: false, last_day: null, projection: null, heating_share: null, ...periodWith({ kwh: null, eur: null }) }));
    render(Page);
    expect(await screen.findByRole('link', { name: 'Réglages' })).toHaveAttribute('href', '/maison#linky');
    expect(await screen.findByRole('img', { name: 'Consommation des radiateurs par jour' })).toBeInTheDocument();
    expect(api.energyDay).not.toHaveBeenCalled();
  });

  it('the Courbe gives the daily-scaled HC/HP and the curve against the daily reading (M7)', async () => {
    const { container } = render(Page);
    expect(await screen.findByRole('heading', { name: 'Courbe du 12 octobre 2026' })).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: 'Consommation par demi-heure le 12 octobre 2026' })).toBeInTheDocument();
    const notes = [...container.querySelectorAll('#courbe .note')].map((n) => n.textContent);
    expect(notes).toContain('Courbe 21,60\u00a0kWh · relevé journalier 22,03\u00a0kWh (écart 2,0\u00a0%)');
    expect(notes).toContain('HC 8,98\u00a0kWh · HP 13,05\u00a0kWh, d’après le relevé journalier');
    expect(screen.getByRole('button', { name: 'Jour suivant' })).toHaveAttribute('aria-disabled', 'true');
    await fireEvent.click(screen.getByRole('button', { name: 'Jour précédent' }));
    await waitFor(() => expect(api.energyDay).toHaveBeenLastCalledWith('2026-10-11', 'salon'));
  });

  it('the Courbe readout prices each half-hour from /api/energy/day: with a tariff, Prix and Coût are figures', async () => {
    const { container } = render(Page);
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
    expect(await screen.findByText('Courbe incomplète (41/48 demi-heures)')).toBeInTheDocument();
    unmount();
    vi.mocked(api.energyDay).mockImplementation(async (d: string) => energyDay(d, { complete: false, points: 0, intervals: [], available: [] }));
    const r = report();
    r.quality = { ...r.quality, curve_since: '2026-10-20' };
    vi.mocked(api.energyReport).mockResolvedValue(r);
    render(Page);
    expect(await screen.findByText('Pas de courbe pour ce jour : antérieure à l’historique de courbe (depuis le 20 octobre 2026).')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /^Consommation par demi-heure/ })).toBeNull();
  });

  it('a day with no curve and no known cause still says why', async () => {
    vi.mocked(api.energyDay).mockImplementation(async (d: string) => energyDay(d, { complete: false, points: 0, intervals: [], available: [] }));
    render(Page);
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
    expect(await screen.findByText('Pas de courbe pour ce jour : antérieure au premier jour compté (depuis le 13 octobre 2026).')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /^Consommation par demi-heure/ })).toBeNull();
  });

  it('radiators read « — » with a reason, never 0: today counts once it is over, a past day without a reading says so', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-14T10:00:00Z'));
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

  it('a failed curve says so, and Réessayer reads it again', async () => {
    vi.mocked(api.energyDay).mockRejectedValueOnce(new Error('boom'));
    render(Page);
    expect(await screen.findByText('Impossible de charger la courbe.')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /^Consommation par demi-heure/ })).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByRole('img', { name: 'Consommation par demi-heure le 12 octobre 2026' })).toBeInTheDocument();
  });

  it('says when data is partial, the split estimated, radiators interpolated or prices retroactive', async () => {
    const r = report(
      periodWith({
        kwh: 300, missing_days: 2, estimated_split: true, retro_priced: true,
        prices: [{ valid_from: '2026-10-05', subscription_eur_month: 15, rates: { hc: 0.2, hp: 0.3 } }],
        radiators: { kwh: 140, hc_kwh: 60, hp_kwh: 80, eur: 35, interpolated: true, apportioned: true, coverage: 1 }
      })
    );
    r.quality = { ...r.quality, estimated_days: 3 };
    vi.mocked(api.energyReport).mockResolvedValue(r);
    render(Page);
    expect(await screen.findByText('Données partielles : 2 jours manquants. L’énergie de ces jours n’est pas comptée dans le coût.')).toBeInTheDocument();
    expect(screen.getByText('Répartition heures creuses / pleines estimée pour 3 jours sans courbe complète.')).toBeInTheDocument();
    expect(screen.getByText('Radiateurs : énergie répartie sur une interruption de l’enregistrement (est.).')).toBeInTheDocument();
    expect(screen.getByText('Prix du 5/10 appliqué aux jours antérieurs.')).toBeInTheDocument();
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
    expect(container.querySelectorAll('.panel-sk')).toHaveLength(4);
    expect(screen.queryByText('Chargement…')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Compteurs des radiateurs' })).toBeNull();
    resolve(report());
    expect(await screen.findByRole('heading', { name: 'Compteurs des radiateurs' })).toBeInTheDocument();
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

  it('Linky quota is a neutral progress note, with nothing to fix in the settings', async () => {
    vi.mocked(api.linkyStatus).mockResolvedValue({ ...linkyOk, state: 'quota', message: 'Quota Linky du jour atteint : reprise demain.' });
    const { container } = render(Page);
    expect(await screen.findByText(/Historique en cours de récupération : la suite arrive demain\./)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Réglages' })).toBeNull();
    expect(container.querySelector('.callout.bad')).toBeNull();
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
    expect(await screen.findByRole('link', { name: 'Renouveler le jeton' })).toHaveAttribute('href', '/maison#linky');
    expect(container.querySelector('.callout.bad')).toHaveTextContent('MyElectricalData refuse le jeton Linky.');
  });

  it('a failed Linky status is not hidden, and the page still loads', async () => {
    vi.mocked(api.linkyStatus).mockRejectedValue(new Error('boom'));
    const { container } = render(Page);
    expect(await screen.findByText(/État du Linky indisponible\./)).toBeInTheDocument();
    expect(container.querySelector('.callout.bad a')).toHaveAttribute('href', '/maison#linky');
    expect(api.energyReport).toHaveBeenCalled(); // from yesterday's period, without a Linky day to anchor it
  });

  it('meter cells are bare figures under « Registre » headers (T1/T2 are not HC/HP)', async () => {
    const { container } = render(Page);
    await screen.findByRole('columnheader', { name: 'Depuis l’installation (kWh)' });
    expect([...container.querySelectorAll('th.opt')].map((t) => t.textContent)).toEqual(['Registre 1 (kWh)', 'Registre 2 (kWh)']);
    expect([...container.querySelectorAll('.table-wrap td.mono')].map((t) => t.textContent)).toEqual(['1,0', '0,4', '0,6']);
  });

  it('an absent meter register reads « — », never 0 kWh', async () => {
    house.applySnapshot({
      house: {
        rooms: [{ id: 'salon', name: 'Salon', radiator_ids: ['a'] }] as never,
        radiators: [{ id: 'a', room_id: 'salon', energy_wh: { total: 1000, t1: null, t2: 600 }, model: 'HEKLA', name: 'R' }] as never
      },
      pending: [], overrides: [], status: { connected: true, last_ok_at: null, last_error: null }
    });
    const { container } = render(Page);
    await screen.findByRole('columnheader', { name: 'Depuis l’installation (kWh)' });
    expect([...container.querySelectorAll('td.opt')].map((t) => t.textContent)).toEqual(['—', '0,6']);
  });

  it('shows the report as soon as it arrives, even before the live stream; house parts wait in their own slots', async () => {
    house.reset();
    const { container } = render(Page);
    expect(await screen.findByRole('img', { name: 'Consommation de la maison par jour' })).toBeInTheDocument();
    expect(container.querySelector('.hero .big')).toHaveTextContent('€');
    expect(screen.getByRole('heading', { name: 'Compteurs des radiateurs' }).closest('section')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('heading', { name: 'Par pièce et par radiateur' }).closest('section')).toHaveAttribute('aria-busy', 'true');
    expect(container.querySelector('.table-wrap')).toBeNull();
  });

  it('Mois shows Heures creuses / pleines and Chauffage; Jour and Semaine add Puissance', async () => {
    vi.mocked(api.energyReport).mockResolvedValue(report({ hc_lens: { hc_share: 0.384, slot_share: 0.3333, avg_price: 0.2437, delta_price: 0.0632 } }));
    render(Page);
    expect(await screen.findByRole('heading', { name: 'Heures creuses / pleines' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Chauffage' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Puissance' })).toBeNull();
    await fireEvent.click(screen.getByRole('radio', { name: 'Jour' }));
    expect(await screen.findByRole('heading', { name: 'Puissance' })).toBeInTheDocument();
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
    // Full width, straight under the Courbe whose scrubber it shares.
    const panel = h.closest('section')!;
    expect(panel).toHaveClass('wide');
    expect(panel.previousElementSibling).toHaveAttribute('id', 'courbe');
    // The first room in the Pièces order.
    await waitFor(() => expect(api.energyDay).toHaveBeenLastCalledWith('2026-10-12', 'salon'));
    // The half-hour scrubbed on one chart is the other's.
    await fireEvent.keyDown(await screen.findByRole('slider', { name: 'Parcourir la journée de la pièce, demi-heure par demi-heure' }), { key: 'ArrowRight' });
    expect(container.querySelector('#courbe .readout .when')).toHaveTextContent('00:00–00:30');
    await fireEvent.change(screen.getByRole('combobox', { name: 'Pièce' }), { target: { value: 'chambre' } });
    await waitFor(() => expect(api.energyDay).toHaveBeenLastCalledWith('2026-10-12', 'chambre'));
    // Chambre's radiator has no figure that day: said, never a flat zero.
    expect(await screen.findByText('Pas de relevé pour cette pièce ce jour-là.')).toBeInTheDocument();
  });
});
