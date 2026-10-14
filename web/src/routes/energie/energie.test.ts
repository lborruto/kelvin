import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '$lib/api/client';
import type { CurveDay, EnergyReport, EnergySummary, LinkyStatus } from '$lib/api/types';
import { fmtTime } from '$lib/format';
import { house } from '$lib/stores/house.svelte';
import Page from './+page.svelte';

vi.mock('$lib/stores/history.svelte', () => ({ history: { data: {}, load: vi.fn() } }));
vi.mock('$lib/api/client', () => ({
  api: { energyReport: vi.fn(), linkyCurve: vi.fn(), linkyStatus: vi.fn(), history: vi.fn().mockResolvedValue([]) },
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
}));

const summary = (o: Partial<EnergySummary> = {}): EnergySummary => ({
  kwh: 300, hc_kwh: 120, hp_kwh: 180, radiators_kwh: 140, energy_eur: 70, subscription_eur: 15,
  eur: 85, days: 30, missing_days: 0, estimated_split: false, ...o
});

function report(o: Partial<EnergyReport> = {}): EnergyReport {
  return {
    group: 'month', from: '2025-11-01', to: '2026-11-01', last_day: '2026-10-12', linky: true, tariff: true,
    buckets: [{ key: '2026-09', ...summary() }, { key: '2026-10', ...summary({ kwh: 120, hc_kwh: 50, hp_kwh: 70, radiators_kwh: 60 }) }],
    total: summary(),
    hero: {
      current: { from: '2026-10-01', to: '2026-10-13', ...summary({ eur: 98.4 }) },
      previous: { from: '2026-09-01', to: '2026-09-13', ...summary({ eur: 87.2 }) }
    },
    heating_share: 0.47,
    heating_share_since: '2026-10-01',
    linky_since: '2025-11-01',
    radiators: [{ radiator_id: 'a', kwh: 140 }],
    projection: {
      month: { key: '2026-10', kwh: 310, eur: 120.5, actual_kwh: 120, actual_eur: 98.4, method: 'linear' },
      year: { from: '2026-10', to: '2027-09', kwh: 3650, eur: 1234.4, method: 'linear', months: [] }
    },
    ...o
  };
}

/** The cells of one row of a chart's visually hidden data table. */
function cells(container: HTMLElement, caption: string, row: string): string[] {
  const table = [...container.querySelectorAll('table.visually-hidden')].find((t) => t.querySelector('caption')?.textContent === caption)!;
  const tr = [...table.querySelectorAll('tbody tr')].find((r) => r.querySelector('th')?.textContent === row)!;
  return [...tr.querySelectorAll('td')].map((td) => td.textContent ?? '');
}

const curveDay = (date: string): CurveDay => ({
  date, points: [{ ts: 1_760_306_400, minutes: 30, wh: 400, offpeak: 1 }], kwh: 0.4, hc_kwh: 0.4, hp_kwh: 0,
  complete: true, available: ['2026-10-10', '2026-10-11', '2026-10-12']
});

const linkyOk: LinkyStatus = {
  configured: true, prm: '12345678901234', token_set: true, simulator: false, state: 'ok', message: null,
  last_day: '2026-10-12', last_ok_at: null, retry_at: null, calls_today: 2, budget: 10, consent_expires: null
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.linkyStatus).mockResolvedValue(linkyOk);
  vi.mocked(api.linkyCurve).mockImplementation(async (d: string) => curveDay(d));
  house.applySnapshot({
    house: {
      rooms: [{ id: 'salon', name: 'Salon', radiator_ids: ['a'] }] as never,
      radiators: [{ id: 'a', room_id: 'salon', energy_wh: { total: 1000, t1: 400, t2: 600 }, model: 'HEKLA', name: 'R' }] as never
    },
    pending: [], overrides: [], status: { connected: true, last_ok_at: null, last_error: null }
  });
});

describe('Énergie', () => {
  it('shows this month’s estimate in euros and how it compares', async () => {
    vi.mocked(api.energyReport).mockResolvedValue(report());
    const { container } = render(Page);
    expect(await screen.findByRole('heading', { name: 'Octobre 2026' })).toBeInTheDocument();
    expect(container.querySelector('.hero .big')).toHaveTextContent('98,40 €');
    expect(screen.getByText('estimation')).toBeInTheDocument();
    expect(container.querySelector('.hero .sub')).toHaveTextContent('300 kWh · HC 120 kWh · HP 180 kWh · du 1/10 au 12/10');
    expect(screen.getByText('+13 %')).toBeInTheDocument();
    expect(screen.getByText(/par rapport à septembre 2026, mêmes jours/)).toBeInTheDocument();
    expect(screen.getByText('Linky : données jusqu’au 12/10')).toBeInTheDocument();
    expect(container.querySelector('.share')).toHaveTextContent('47 %');
    expect(container.querySelector('.share-line')).toHaveTextContent(
      '47 % de la consommation de la maison depuis le 1/10 vient des radiateurs.'
    );
    expect(container.querySelector('.proj')).toHaveTextContent(/1 234 €/);
    // The projection row never shares a label with the hero.
    expect(container.querySelector('.proj dt')).toHaveTextContent('Octobre 2026, mois complet');
  });

  it('keeps the hero date range in one piece, apart from the kWh figures', async () => {
    vi.mocked(api.energyReport).mockResolvedValue(report());
    const { container } = render(Page);
    await screen.findByRole('heading', { name: 'Octobre 2026' });
    expect(container.querySelector('.hero .sub .range')!.textContent).toContain('du\u00a01/10\u00a0au\u00a012/10');
    expect(container.querySelector('.hero .sub .figs')).toHaveTextContent('300 kWh · HC 120 kWh · HP 180 kWh');
  });

  it('loads the month view first, then switches period with the keyboard', async () => {
    vi.mocked(api.energyReport).mockResolvedValue(report());
    render(Page);
    await waitFor(() => expect(api.energyReport).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.energyReport).mock.calls[0][2]).toBe('month');
    await fireEvent.keyDown(screen.getByRole('radio', { name: 'Mois' }), { key: 'ArrowRight' });
    await waitFor(() => expect(vi.mocked(api.energyReport).mock.calls.at(-1)![2]).toBe('year'));
  });

  it('ignores a stale response that resolves after a newer one', async () => {
    let late!: (v: EnergyReport) => void;
    vi.mocked(api.energyReport)
      .mockImplementationOnce(() => new Promise((r) => (late = r)))
      .mockResolvedValueOnce(report({ group: 'year', buckets: [{ key: '2026', ...summary() }] }));
    const { container } = render(Page);
    await fireEvent.click(screen.getByRole('radio', { name: 'Année' }));
    await waitFor(() => expect(container.querySelectorAll('.axis .cell')).toHaveLength(1));
    late(report());
    await new Promise((r) => setTimeout(r, 10));
    expect(container.querySelectorAll('.axis .cell')).toHaveLength(1);
    expect([...container.querySelectorAll('.axis .tick')].map((e) => e.textContent)).toEqual(['2026']);
  });

  it('stacks HC and HP in series 1 and 2, with radiators as series-3 marks', async () => {
    vi.mocked(api.energyReport).mockResolvedValue(report());
    const { container } = render(Page);
    await screen.findByRole('img', { name: 'Consommation de la maison par mois' });
    const fills = [...container.querySelectorAll('rect.part')].map((r) => r.getAttribute('style'));
    expect(fills.some((f) => f?.includes('var(--series-1)'))).toBe(true);
    expect(fills.some((f) => f?.includes('var(--series-2)'))).toBe(true);
    expect(container.querySelector('line.mark')!.getAttribute('style')).toContain('var(--series-3)');
  });

  it('room rows carry a share bar in the radiator colour, never a room swatch', async () => {
    vi.mocked(api.energyReport).mockResolvedValue(report());
    const { container } = render(Page);
    await screen.findByRole('img', { name: 'Consommation de la maison par mois' });
    expect(container.querySelector('ul.rooms .swatch')).toBeNull();
    const bar = container.querySelector<HTMLElement>('ul.rooms .meter span')!;
    expect(bar.getAttribute('style')).toContain('var(--series-3)');
    expect(bar.style.width).toBe('100%');
  });

  it('without Linky: a way to connect it, and the radiators alone', async () => {
    vi.mocked(api.linkyStatus).mockResolvedValue({ ...linkyOk, configured: false, state: 'off', last_day: null });
    vi.mocked(api.energyReport).mockResolvedValue(
      report({ linky: false, last_day: null, projection: null, heating_share: null,
        hero: { current: { from: '2026-10-01', to: '2026-10-14', ...summary({ kwh: null, eur: null }) }, previous: { from: '2026-09-01', to: '2026-09-14', ...summary({ kwh: null, eur: null }) } } })
    );
    render(Page);
    expect(await screen.findByRole('link', { name: 'Réglages' })).toHaveAttribute('href', '/maison#linky');
    expect(await screen.findByRole('img', { name: 'Consommation des radiateurs par mois' })).toBeInTheDocument();
    expect(api.linkyCurve).not.toHaveBeenCalled();
  });

  it('opens the curve on the last Linky day and steps back', async () => {
    vi.mocked(api.energyReport).mockResolvedValue(report());
    render(Page);
    await waitFor(() => expect(api.linkyCurve).toHaveBeenCalledWith('2026-10-12'));
    expect(await screen.findByRole('heading', { name: 'Courbe du 12 octobre 2026' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Jour suivant' })).toBeDisabled();
    await fireEvent.click(screen.getByRole('button', { name: 'Jour précédent' }));
    await waitFor(() => expect(api.linkyCurve).toHaveBeenLastCalledWith('2026-10-11'));
  });

  it('says when data is partial or the split estimated', async () => {
    vi.mocked(api.energyReport).mockResolvedValue(
      report({ hero: { current: { from: '2026-10-01', to: '2026-10-13', ...summary({ missing_days: 2, estimated_split: true }) }, previous: { from: '2026-09-01', to: '2026-09-13', ...summary() } } })
    );
    render(Page);
    expect(await screen.findByText('Données partielles : 2 jours manquants.')).toBeInTheDocument();
    expect(screen.getByText('Répartition heures creuses / pleines estimée pour les jours sans courbe.')).toBeInTheDocument();
  });

  it('keeps the meter table phone-sized: tariff columns are optional', async () => {
    vi.mocked(api.energyReport).mockResolvedValue(report());
    const { container } = render(Page);
    await screen.findByRole('columnheader', { name: 'Depuis l’installation' });
    expect([...container.querySelectorAll('th.opt')].map((t) => t.textContent)).toEqual(['Tarif 1', 'Tarif 2']);
  });

  it('renders this home’s real shape: young history, no projection, no heating share', async () => {
    vi.mocked(api.energyReport).mockResolvedValue(
      report({
        buckets: [
          { key: '2026-07', ...summary({ kwh: null, hc_kwh: null, hp_kwh: null, radiators_kwh: 0, energy_eur: null, subscription_eur: null, eur: null }) },
          { key: '2026-08', ...summary() }
        ],
        projection: null,
        heating_share: null,
        heating_share_since: null,
        linky_since: '2026-08-05'
      })
    );
    const { container } = render(Page);
    expect(await screen.findByRole('img', { name: 'Consommation de la maison par mois' })).toBeInTheDocument();
    expect(container.querySelector('.hero .big')).toHaveTextContent('98,40 €');
    expect(container.querySelector('.proj')).toBeNull();
    expect(container.querySelector('.share')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Projection' })).toBeNull();
    // Months before the first Linky day are trimmed: the chart starts at the first data month.
    expect(container.querySelectorAll('rect.part')).toHaveLength(2);
    expect([...container.querySelectorAll('.axis .tick')].map((e) => e.textContent)).toEqual(['08/26']);
    expect(screen.getByText('Historique Linky depuis le 5 août 2026.')).toBeInTheDocument();
  });

  it('an interior gap reads « — » and draws a baseline tick, unlike a zero', async () => {
    const none = summary({ kwh: null, hc_kwh: null, hp_kwh: null, energy_eur: null, eur: null, missing_days: 30 });
    vi.mocked(api.energyReport).mockResolvedValue(
      report({
        buckets: [{ key: '2026-08', ...summary() }, { key: '2026-09', ...none }, { key: '2026-10', ...summary() }],
        linky_since: '2026-08-01'
      })
    );
    const { container } = render(Page);
    await screen.findByRole('img', { name: 'Consommation de la maison par mois' });
    expect(cells(container, 'Consommation de la maison par mois', '09/26').slice(0, 2)).toEqual(['—', '—']);
    expect(container.querySelectorAll('line.gap')).toHaveLength(1);
    expect(screen.queryByText(/^Historique Linky depuis/)).toBeNull(); // nothing was trimmed
  });

  it('day view: today and yesterday (not yet published by Linky) read « — »', async () => {
    const none = summary({ kwh: null, hc_kwh: null, hp_kwh: null, radiators_kwh: 3, energy_eur: null, subscription_eur: null, eur: null });
    vi.mocked(api.energyReport).mockImplementation(async (_f, _t, group) =>
      group === 'day'
        ? report({
            group: 'day',
            buckets: [{ key: '2026-10-12', ...summary({ kwh: 10, hc_kwh: 4, hp_kwh: 6 }) }, { key: '2026-10-13', ...none }, { key: '2026-10-14', ...none }]
          })
        : report()
    );
    const { container } = render(Page);
    await fireEvent.click(await screen.findByRole('radio', { name: 'Jour' }));
    await screen.findByRole('img', { name: 'Consommation de la maison par jour' });
    expect(cells(container, 'Consommation de la maison par jour', '13/10').slice(0, 2)).toEqual(['—', '—']);
    expect(cells(container, 'Consommation de la maison par jour', '14/10').slice(0, 2)).toEqual(['—', '—']);
    expect(cells(container, 'Consommation de la maison par jour', '12/10')[0]).toBe('4,0\u00a0kWh');
  });

  it('shows the backend’s French detail when the report fails, else a generic message', async () => {
    vi.mocked(api.energyReport).mockRejectedValueOnce(new ApiError(422, 'Période invalide.'));
    render(Page);
    expect(await screen.findByRole('alert')).toHaveTextContent('Période invalide.');
    vi.mocked(api.energyReport).mockRejectedValueOnce(new Error('boom'));
    await fireEvent.click(screen.getByRole('radio', { name: 'Année' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Impossible de charger la consommation.'));
  });

  it('a failed curve says so, keeps the day list, and never shows another day’s bars under the heading', async () => {
    vi.mocked(api.energyReport).mockResolvedValue(report());
    let pending!: (c: CurveDay) => void;
    vi.mocked(api.linkyCurve)
      .mockImplementationOnce(async (d: string) => curveDay(d))
      .mockImplementationOnce(() => new Promise((r) => (pending = r)))
      .mockRejectedValueOnce(new Error('boom'))
      .mockRejectedValueOnce(new ApiError(422, 'Période invalide.'));
    render(Page);
    expect(await screen.findByRole('img', { name: 'Consommation par demi-heure le 12 octobre 2026' })).toBeInTheDocument();
    // 11 Oct loading: the heading moved, the 12 Oct chart is gone.
    await fireEvent.click(screen.getByRole('button', { name: 'Jour précédent' }));
    expect(await screen.findByRole('heading', { name: 'Courbe du 11 octobre 2026' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /^Consommation par demi-heure/ })).toBeNull();
    pending(curveDay('2026-10-11'));
    expect(await screen.findByRole('img', { name: 'Consommation par demi-heure le 11 octobre 2026' })).toBeInTheDocument();
    // 10 Oct fails: a message, no chart, and next still works from the remembered list.
    await fireEvent.click(screen.getByRole('button', { name: 'Jour précédent' }));
    expect(await screen.findByText('Impossible de charger la courbe.')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /^Consommation par demi-heure/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Jour précédent' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Jour suivant' })).toBeEnabled();
    await fireEvent.click(screen.getByRole('button', { name: 'Jour suivant' }));
    await waitFor(() => expect(api.linkyCurve).toHaveBeenLastCalledWith('2026-10-11'));
    expect(await screen.findByText('Période invalide.')).toBeInTheDocument();
  });

  it('Linky quota is a neutral progress note, with nothing to fix in the settings', async () => {
    vi.mocked(api.linkyStatus).mockResolvedValue({ ...linkyOk, state: 'quota', message: 'Quota Linky du jour atteint : reprise demain.' });
    vi.mocked(api.energyReport).mockResolvedValue(report());
    const { container } = render(Page);
    expect(await screen.findByText(/Historique en cours de récupération : la suite arrive demain\./)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Réglages' })).toBeNull();
    expect(container.querySelector('.callout.bad')).toBeNull();
  });

  it('Linky throttled is neutral and gives the retry time', async () => {
    const retry = Date.UTC(2026, 9, 14, 12, 30) / 1000;
    vi.mocked(api.linkyStatus).mockResolvedValue({ ...linkyOk, state: 'throttled', retry_at: retry, message: null });
    vi.mocked(api.energyReport).mockResolvedValue(report());
    const { container } = render(Page);
    const at = fmtTime(retry * 1000);
    expect(await screen.findByText(new RegExp(`nouvel essai à ${at}`))).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Réglages' })).toBeNull();
    expect(container.querySelector('.callout.bad')).toBeNull();
  });

  it('Linky auth is an error with a way to renew the token', async () => {
    vi.mocked(api.linkyStatus).mockResolvedValue({ ...linkyOk, state: 'auth', message: null });
    vi.mocked(api.energyReport).mockResolvedValue(report());
    const { container } = render(Page);
    expect(await screen.findByRole('link', { name: 'Renouveler le jeton' })).toHaveAttribute('href', '/maison#linky');
    expect(container.querySelector('.callout.bad')).toHaveTextContent('MyElectricalData refuse le jeton Linky.');
  });

  it('a failed Linky status is not hidden', async () => {
    vi.mocked(api.linkyStatus).mockRejectedValue(new Error('boom'));
    vi.mocked(api.energyReport).mockResolvedValue(report());
    const { container } = render(Page);
    expect(await screen.findByText(/État du Linky indisponible\./)).toBeInTheDocument();
    expect(container.querySelector('.callout.bad a')).toHaveAttribute('href', '/maison#linky');
  });

  it('radiators outside any room count under « Sans pièce »', async () => {
    house.applySnapshot({
      house: {
        rooms: [{ id: 'salon', name: 'Salon', radiator_ids: ['a'] }] as never,
        radiators: [
          { id: 'a', room_id: 'salon', energy_wh: null, model: 'HEKLA', name: 'R' },
          { id: 'b', room_id: null, energy_wh: null, model: 'IPALA', name: 'S' }
        ] as never
      },
      pending: [], overrides: [], status: { connected: true, last_ok_at: null, last_error: null }
    });
    vi.mocked(api.energyReport).mockResolvedValue(report({ radiators: [{ radiator_id: 'a', kwh: 140 }, { radiator_id: 'b', kwh: 60 }] }));
    const { container } = render(Page);
    await screen.findByRole('img', { name: 'Consommation de la maison par mois' });
    const rows = [...container.querySelectorAll('ul.rooms li')];
    expect(rows.map((li) => li.querySelector('.name')?.textContent)).toEqual(['Salon', 'Sans pièce']);
    expect(rows[0]).toHaveTextContent('70 %');
    expect(rows[1]).toHaveTextContent('60,0 kWh · 30 %');
  });

  it('radiator figures Kelvin never recorded read « — », never 0 kWh', async () => {
    house.applySnapshot({
      house: {
        rooms: [
          { id: 'salon', name: 'Salon', radiator_ids: ['a'] },
          { id: 'ch', name: 'Chambre', radiator_ids: ['c'] }
        ] as never,
        radiators: [
          { id: 'a', room_id: 'salon', energy_wh: null, model: 'HEKLA', name: 'R' },
          { id: 'c', room_id: 'ch', energy_wh: null, model: 'IPALA', name: 'C' }
        ] as never
      },
      pending: [], overrides: [], status: { connected: true, last_ok_at: null, last_error: null }
    });
    vi.mocked(api.energyReport).mockResolvedValue(
      report({ buckets: [{ key: '2026-09', ...summary({ radiators_kwh: null }) }, { key: '2026-10', ...summary() }] })
    );
    const { container } = render(Page);
    await screen.findByRole('img', { name: 'Consommation de la maison par mois' });
    expect(cells(container, 'Consommation de la maison par mois', '09/26')[2]).toBe('—');
    const rows = [...container.querySelectorAll('ul.rooms li')];
    expect(rows[0]).toHaveTextContent('140 kWh · 100 %');
    expect(rows[1].querySelector('.num')?.textContent).toBe('—');
  });

  it('never invents euros for a period with no Linky day: shows the missing-data state', async () => {
    const empty = summary({ kwh: null, hc_kwh: null, hp_kwh: null, energy_eur: null, subscription_eur: 15, eur: null, missing_days: 13 });
    vi.mocked(api.energyReport).mockResolvedValue(
      report({ hero: { current: { from: '2026-10-01', to: '2026-10-14', ...empty }, previous: { from: '2026-09-01', to: '2026-09-14', ...summary() } } })
    );
    const { container } = render(Page);
    await screen.findByRole('heading', { name: 'Octobre 2026' });
    expect(container.querySelector('.hero .big')).toHaveTextContent('—');
    expect(container.querySelector('.hero .big')).not.toHaveTextContent('15');
    expect(screen.queryByText('estimation')).toBeNull();
    expect(screen.getByText('Données manquantes pour cette période.')).toBeInTheDocument();
  });
});
