import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyLocale } from '$lib/i18n';
import type { EnergyDay, EnergyReport, Radiator, Room } from '$lib/api/types';
import { download, energyCsv } from '$lib/csv';
import { exportActions, type ExportInput } from './export';
import { HIDDEN, OK } from './weatherModel.fixture';

vi.mock('$lib/csv', async (orig) => ({ ...(await orig<typeof import('$lib/csv')>()), download: vi.fn() }));

const chart = { group: 'day', buckets: [] } as unknown as EnergyReport;
const main = {
  period: { from: '2026-10-01', to: '2026-11-01', kwh: null, hc_kwh: null, hp_kwh: null, prices: [], radiators: null, missing_days: 0 },
  by_radiator: [{ radiator_id: 'a', room_id: 'salon', kwh: 1, hc_kwh: null, hp_kwh: null, eur: null, coverage: 1, interpolated: false, apportioned: false, from: null, temp_avg: null, setpoint_avg: null, heating_hours: null }]
} as unknown as EnergyReport;
const day = { date: '2026-10-12', points: 48, intervals: [] } as unknown as EnergyDay;
const house = (loaded: boolean) => ({
  loaded,
  rooms: [{ id: 'salon', name: 'Salon', radiator_ids: ['a'] }] as unknown as Room[],
  radiators: { a: { id: 'a', room_id: 'salon', name: 'R' } } as unknown as Record<string, Radiator>
});
const input = (o: Partial<ExportInput> = {}): ExportInput => ({
  chart, main, period: { from: '2026-10-01', to: '2026-11-01' }, roomSpan: { from: '2026-10-01', to: '2026-10-13' }, day, today: '2026-10-14',
  house: house(true), ...o
});

beforeEach(() => vi.mocked(download).mockClear());

describe('exportActions', () => {
  it('the period, the Courbe’s day and the rooms, each under its own file name', () => {
    const a = exportActions(input());
    expect(a.map((x) => x.label)).toEqual(['Exporter la période (CSV)', 'Exporter la courbe du 12/10 (CSV)', 'Exporter par pièce (CSV)']);
    a.forEach((x) => x.run());
    expect(vi.mocked(download).mock.calls.map((c) => c[0].name)).toEqual([
      'energie_2026-10-01_2026-11-01_day.csv', 'courbe_2026-10-12.csv', 'pieces_2026-10-01_2026-10-13.csv'
    ]);
  });

  it('the period file is the page’s own figures, built from the reports it shows', () => {
    const period = { from: '2026-10-01', to: '2026-11-01' };
    exportActions(input())[0].run();
    expect(vi.mocked(download).mock.calls[0][0]).toEqual(energyCsv(chart, main, period, '2026-10-14'));
    expect(vi.mocked(download).mock.calls[0][0].text.split('\r\n')[1]).toBe('total;2026-10-01T00:00:00+02:00;2026-11-01T00:00:00+01:00;;;;;;;;;;;;0;;;;;');
  });

  it('no curve file without a curve, no rooms file without radiators', () => {
    expect(exportActions(input({ day: null })).map((x) => x.key)).toEqual(['period', 'rooms']);
    expect(exportActions(input({ day: { ...day, points: 0 } as EnergyDay })).map((x) => x.key)).toEqual(['period', 'rooms']);
    expect(exportActions(input({ main: { ...main, by_radiator: [] } as EnergyReport })).map((x) => x.key)).toEqual(['period', 'curve']);
  });

  it('holds the rooms file until the house is known, and says why', () => {
    const rooms = exportActions(input({ house: house(false) })).find((x) => x.key === 'rooms')!;
    expect(rooms.disabled).toBe('Disponible une fois les pièces chargées');
    rooms.run();
    expect(download).not.toHaveBeenCalled();
  });

  it('in English: the labels; file names and the CSV header stay the French contract', () => {
    applyLocale('en');
    const a = exportActions(input());
    expect(a.map((x) => x.label)).toEqual(['Export the period (CSV)', 'Export the curve of 12/10 (CSV)', 'Export by room (CSV)']);
    a[0].run();
    expect(vi.mocked(download).mock.calls[0][0].name).toBe('energie_2026-10-01_2026-11-01_day.csv');
    expect(vi.mocked(download).mock.calls[0][0].text.split('\r\n')[0]).toContain('periode,debut,fin,');
  });
});

describe('exportActions: the meteo file (Plan 15)', () => {
  it('offered with a weather place: waits (focusable, with its reason) while it loads, then downloads the window', () => {
    const waiting = exportActions(input({ weatherOn: true, weather: undefined })).at(-1)!;
    expect(waiting).toMatchObject({ key: 'meteo', label: 'Exporter météo et consommation (CSV)', disabled: 'Disponible une fois la météo chargée' });
    waiting.run();
    expect(download).not.toHaveBeenCalled();
    const ready = exportActions(input({ weatherOn: true, weather: OK })).at(-1)!;
    expect(ready.disabled).toBeNull();
    ready.run();
    expect(vi.mocked(download).mock.calls[0][0].name).toBe('meteo_2025-10-18_2026-10-18.csv');
  });
  it('not offered without a place, after a failure, or without points', () => {
    expect(exportActions(input({ weather: OK })).map((a) => a.key)).not.toContain('meteo');
    expect(exportActions(input({ weatherOn: true, weather: null })).map((a) => a.key)).not.toContain('meteo');
    const none = { ...HIDDEN, house: { ...HIDDEN.house, points: [] } };
    expect(exportActions(input({ weatherOn: true, weather: none })).map((a) => a.key)).not.toContain('meteo');
  });
});
