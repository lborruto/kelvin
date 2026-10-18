import { describe, expect, it, vi } from 'vitest';
import { FORECAST } from '$lib/weatherModel.fixture';
import { DashboardEnergy } from './dashboardEnergy.svelte';

const api = vi.hoisted(() => ({ settings: vi.fn(), energyReport: vi.fn(), energyDay: vi.fn(), weatherCostForecast: vi.fn() }));
vi.mock('$lib/api/client', () => ({ api }));
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('DashboardEnergy: tomorrow’s forecast (Plan 15)', () => {
  it('asked with a weather place only; a new forecast refetches at most every 10 minutes', async () => {
    for (const f of Object.values(api)) f.mockReset().mockResolvedValue({});
    api.weatherCostForecast.mockResolvedValue(FORECAST);
    const clock = { t: 1_000_000 };
    const e = new DashboardEnergy(() => clock.t);
    e.load('2026-10-18');
    expect(api.weatherCostForecast).not.toHaveBeenCalled();
    e.loadForecast();
    e.loadForecast(); // in flight: once
    await flush();
    expect(api.weatherCostForecast).toHaveBeenCalledTimes(1);
    expect(e.forecast).toEqual(FORECAST);
    e.refreshForecast(100); // the first value is the reference
    clock.t += 60_000;
    e.refreshForecast(200);
    expect(api.weatherCostForecast).toHaveBeenCalledTimes(1);
    clock.t += 600_000;
    e.refreshForecast(300);
    expect(api.weatherCostForecast).toHaveBeenCalledTimes(2);
    await flush();
    api.weatherCostForecast.mockRejectedValueOnce(new Error('x'));
    e.loadForecast(true);
    await flush();
    expect(e.forecast).toEqual(FORECAST); // a failed refresh keeps the line
    e.clearForecast();
    expect(e.forecast).toBeUndefined();
  });
});
