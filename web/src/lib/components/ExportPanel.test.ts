import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnergyDay, EnergyReport } from '$lib/api/types';
import { download, energyCsv } from '$lib/csv';
import { house } from '$lib/stores/house.svelte';
import ExportPanel from './ExportPanel.svelte';

vi.mock('$lib/csv', async (orig) => ({ ...(await orig<typeof import('$lib/csv')>()), download: vi.fn() }));

const chart = { group: 'day', buckets: [] } as unknown as EnergyReport;
const main = {
  period: { from: '2026-10-01', to: '2026-11-01', kwh: null, hc_kwh: null, hp_kwh: null, prices: [], radiators: null, missing_days: 0 },
  by_radiator: [{ radiator_id: 'a', room_id: 'salon', kwh: 1, hc_kwh: null, hp_kwh: null, eur: null, coverage: 1, interpolated: false, apportioned: false, from: null, temp_avg: null, setpoint_avg: null, heating_hours: null }]
} as unknown as EnergyReport;
const day = { date: '2026-10-12', points: 48, intervals: [] } as unknown as EnergyDay;

beforeEach(() => {
  vi.mocked(download).mockClear();
  house.applySnapshot({
    house: { rooms: [{ id: 'salon', name: 'Salon', radiator_ids: ['a'] }] as never, radiators: [{ id: 'a', room_id: 'salon', name: 'R' }] as never },
    pending: [], overrides: [], status: { connected: true, last_ok_at: null, last_error: null }
  });
});

describe('ExportPanel', () => {
  it('exports the period, the Courbe’s day and the rooms, each under its own name', async () => {
    render(ExportPanel, { chart, main, period: { from: '2026-10-01', to: '2026-11-01' }, roomSpan: { from: '2026-10-01', to: '2026-10-13' }, day });
    await fireEvent.click(screen.getByRole('button', { name: 'Exporter la période (CSV)' }));
    expect(vi.mocked(download).mock.calls[0][0].name).toBe('energie_2026-10-01_2026-11-01_day.csv');
    await fireEvent.click(screen.getByRole('button', { name: 'Exporter la courbe du 12/10 (CSV)' }));
    expect(vi.mocked(download).mock.calls[1][0].name).toBe('courbe_2026-10-12.csv');
    await fireEvent.click(screen.getByRole('button', { name: 'Exporter par pièce (CSV)' }));
    expect(vi.mocked(download).mock.calls[2][0].name).toBe('pieces_2026-10-01_2026-10-13.csv');
    expect(screen.getByText(/séparateur point-virgule, décimales avec une virgule/)).toBeInTheDocument();
  });

  it('offers no curve file without a curve', () => {
    render(ExportPanel, { chart, main, period: { from: '2026-10-01', to: '2026-11-01' }, roomSpan: { from: '2026-10-01', to: '2026-10-13' }, day: null });
    expect(screen.queryByRole('button', { name: /courbe/ })).toBeNull();
  });

  it('the period file is the page’s own figures, built from the reports it shows', async () => {
    const period = { from: '2026-10-01', to: '2026-11-01' };
    render(ExportPanel, { chart, main, period, roomSpan: { from: '2026-10-01', to: '2026-10-13' }, day });
    await fireEvent.click(screen.getByRole('button', { name: 'Exporter la période (CSV)' }));
    expect(vi.mocked(download).mock.calls[0][0]).toEqual(energyCsv(chart, main, period));
    const text = vi.mocked(download).mock.calls[0][0].text;
    expect(text.split('\r\n')[1]).toBe('total;2026-10-01T00:00:00+02:00;2026-11-01T00:00:00+01:00;;;;;;;;;;;;0;');
  });

  it('holds the rooms file until the house is known (aria-disabled, never disabled)', async () => {
    house.reset();
    render(ExportPanel, { chart, main, period: { from: '2026-10-01', to: '2026-11-01' }, roomSpan: { from: '2026-10-01', to: '2026-10-13' }, day });
    const b = screen.getByRole('button', { name: 'Exporter par pièce (CSV)' });
    expect(b).toHaveAttribute('aria-disabled', 'true');
    expect(b).not.toBeDisabled();
    await fireEvent.click(b);
    expect(download).not.toHaveBeenCalled();
  });
});
