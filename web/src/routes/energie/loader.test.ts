import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '$lib/api/client';
import type { EnergyDay, EnergyReport } from '$lib/api/types';
import { EnergieData } from './energie.svelte';

vi.mock('$lib/api/client', () => ({
  api: { energyReport: vi.fn(), energyDay: vi.fn() },
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
}));

const NOW = () => Date.parse('2026-10-14T10:00:00Z');
const flush = () => new Promise((r) => setTimeout(r, 0));
/** Only the fields the loader reads; the panels' fields are the page tests' business. */
const rep = (o: Partial<EnergyReport> = {}) =>
  ({
    group: 'day', last_day: '2026-10-12', linky: true, linky_since: '2026-08-05',
    quality: { radiators_since: '2026-09-01' }, ...o
  }) as unknown as EnergyReport;
const dayOf = (date: string, complete = true, available = ['2026-10-10', '2026-10-11', '2026-10-12']) =>
  ({ date, complete, points: complete ? 48 : 30, intervals: [], available, room: null }) as unknown as EnergyDay;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.energyReport).mockResolvedValue(rep());
  vi.mocked(api.energyDay).mockImplementation(async (d: string) => dayOf(d));
});

describe('EnergieData', () => {
  it('Mois asks for its day bars and for the month itself, both with the selected period', async () => {
    const d = new EnergieData(NOW);
    d.start('2026-10-12');
    await flush();
    const p = { from: '2026-10-01', to: '2026-11-01' };
    expect(api.energyReport).toHaveBeenCalledWith('2026-10-01', '2026-11-01', 'day', p);
    expect(api.energyReport).toHaveBeenCalledWith('2026-10-01', '2026-11-01', 'month', p);
    expect(d.data?.view).toBe('month');
    expect(d.first).toBe('2026-08-05');
    expect(d.loading).toBe(false);
  });

  it('Jour asks once; Semaine and Année pair their days by week and by year', async () => {
    const d = new EnergieData(NOW);
    d.start('2026-10-12');
    await flush();
    vi.mocked(api.energyReport).mockClear();
    d.setView('day');
    await flush();
    expect(api.energyReport).toHaveBeenCalledTimes(1);
    expect(api.energyReport).toHaveBeenCalledWith('2026-10-06', '2026-10-13', 'day', { from: '2026-10-12', to: '2026-10-13' });
    vi.mocked(api.energyReport).mockClear();
    d.setView('week');
    await flush();
    const w = { from: '2026-10-12', to: '2026-10-19' };
    expect(api.energyReport).toHaveBeenCalledWith('2026-10-12', '2026-10-19', 'day', w);
    expect(api.energyReport).toHaveBeenCalledWith('2026-10-12', '2026-10-19', 'week', w);
    vi.mocked(api.energyReport).mockClear();
    d.setView('year');
    await flush();
    const y = { from: '2026-01-01', to: '2027-01-01' };
    expect(api.energyReport).toHaveBeenCalledWith('2026-01-01', '2027-01-01', 'month', y);
    expect(api.energyReport).toHaveBeenCalledWith('2026-01-01', '2027-01-01', 'year', y);
  });

  it('defaults to yesterday without a Linky day, and follows the report’s last day', async () => {
    vi.mocked(api.energyReport).mockResolvedValue(rep({ last_day: null, linky: false }));
    const d = new EnergieData(NOW);
    d.start(null);
    expect(d.period).toEqual({ from: '2026-10-01', to: '2026-11-01' });
    expect(d.last).toBe('2026-10-13');
    await flush();
    expect(api.energyDay).not.toHaveBeenCalled(); // no Linky, no Courbe
  });

  it('steps between the first period with data and the last day’s period', async () => {
    const d = new EnergieData(NOW);
    expect(d.canPrev).toBe(false);
    d.start('2026-10-12');
    expect(d.canPrev).toBe(false); // bounds unknown until the first answer
    await flush();
    expect([d.canPrev, d.canNext, d.latest]).toEqual([true, false, true]);
    d.step(1);
    expect(d.period?.from).toBe('2026-10-01');
    d.step(-1);
    d.step(-1);
    await flush();
    expect(d.period).toEqual({ from: '2026-08-01', to: '2026-09-01' });
    expect([d.canPrev, d.canNext, d.latest]).toEqual([false, true, false]);
    d.step(-1);
    expect(d.period?.from).toBe('2026-08-01');
    d.toLatest();
    expect(d.period?.from).toBe('2026-10-01');
  });

  it('opens the Courbe on the newest complete day of the period (L9)', async () => {
    vi.mocked(api.energyDay)
      .mockResolvedValueOnce(dayOf('2026-10-12', false, ['2026-10-09', '2026-10-10']))
      .mockImplementation(async (date: string) => dayOf(date, true, ['2026-10-09', '2026-10-10']));
    const d = new EnergieData(NOW);
    d.start('2026-10-12');
    await flush();
    await flush();
    expect(vi.mocked(api.energyDay).mock.calls.map((c) => c[0])).toEqual(['2026-10-12', '2026-10-10']);
    expect(d.dayIso).toBe('2026-10-10');
    expect(d.day?.date).toBe('2026-10-10');
  });

  it('Jour keeps its own day, even when its curve is incomplete', async () => {
    vi.mocked(api.energyDay).mockImplementation(async (date: string) => dayOf(date, false, ['2026-10-10']));
    const d = new EnergieData(NOW);
    d.view = 'day';
    d.start('2026-10-12');
    await flush();
    await flush();
    expect(vi.mocked(api.energyDay).mock.calls.map((c) => c[0])).toEqual(['2026-10-12']);
    expect(d.day?.complete).toBe(false);
  });

  it('drops a late report and a late day', async () => {
    const d = new EnergieData(NOW);
    d.start('2026-10-12');
    await flush(); // October loaded: the bounds are known
    let late!: (r: EnergyReport) => void;
    vi.mocked(api.energyReport).mockImplementationOnce(() => new Promise((r) => (late = r)));
    d.step(-1); // September: its chart request hangs
    d.step(-1); // August answers at once
    await flush();
    late(rep());
    await flush();
    expect(d.data?.period.from).toBe('2026-08-01');
    expect(d.loading).toBe(false);
    let lateDay!: (x: EnergyDay) => void;
    vi.mocked(api.energyDay).mockImplementationOnce(() => new Promise((r) => (lateDay = r)));
    d.showDay('2026-09-20');
    d.showDay('2026-09-21');
    await flush();
    lateDay(dayOf('2026-09-20'));
    await flush();
    expect(d.dayIso).toBe('2026-09-21');
    expect(d.day?.date).toBe('2026-09-21');
  });

  it('a failed report says so in French, and retry fetches again', async () => {
    vi.mocked(api.energyReport).mockRejectedValueOnce(new ApiError(422, 'Période invalide.'));
    const d = new EnergieData(NOW);
    d.start('2026-10-12');
    await flush();
    expect(d.error).toBe('Période invalide.');
    vi.mocked(api.energyReport).mockRejectedValueOnce(new Error('boom'));
    d.retry();
    await flush();
    expect(d.error).toBe('Impossible de charger la consommation.');
    d.retry();
    await flush();
    expect(d.error).toBeNull();
    expect(d.data).not.toBeNull();
  });

  it('drills: a month bar opens Mois, a day bar its Courbe (or its Jour in Jour)', async () => {
    const d = new EnergieData(NOW);
    d.view = 'year';
    // Each report answers with the group it was asked for (the request is sent as soon as the period changes).
    vi.mocked(api.energyReport).mockImplementation(async (_from, _to, group) => rep({ group }));
    d.start('2026-10-12');
    await flush();
    d.drill('2026-03');
    expect([d.view, d.period?.from]).toEqual(['month', '2026-03-01']);
    await flush();
    d.drill('2026-03-14');
    expect(d.dayIso).toBe('2026-03-14');
    expect(d.view).toBe('month');
    d.setView('day');
    await flush();
    d.drill('2026-03-12');
    expect(d.period).toEqual({ from: '2026-03-12', to: '2026-03-13' });
  });

  it('a room change re-reads the same day and keeps it on screen meanwhile; day steps stay in the period', async () => {
    const d = new EnergieData(NOW);
    d.start('2026-10-12');
    await flush();
    await flush();
    expect(d.dayIso).toBe('2026-10-12');
    let pending!: (x: EnergyDay) => void;
    vi.mocked(api.energyDay).mockImplementationOnce(() => new Promise((r) => (pending = r)));
    d.setRoom('p-salon');
    expect(api.energyDay).toHaveBeenLastCalledWith('2026-10-12', 'p-salon');
    expect(d.day?.date).toBe('2026-10-12'); // still shown
    pending(dayOf('2026-10-12'));
    await flush();
    expect([d.canPrevDay, d.canNextDay]).toEqual([true, false]);
    d.stepDay(-1);
    expect(d.dayIso).toBe('2026-10-11');
    d.stepDay(1);
    expect(d.dayIso).toBe('2026-10-12');
  });
});
