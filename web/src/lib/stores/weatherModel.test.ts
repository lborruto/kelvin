import { describe, expect, it, vi } from 'vitest';
import { FORECAST, OK } from '$lib/weatherModel.fixture';
import { REFRESH_MS, WeatherModelStore } from './weatherModel.svelte';

const flush = () => new Promise((r) => setTimeout(r, 0));
const P = { from: '2026-10-01', to: '2026-10-19' };

function store(now = { t: 0 }) {
  const cost = vi.fn().mockResolvedValue(OK);
  const forecast = vi.fn().mockResolvedValue(FORECAST);
  const s = new WeatherModelStore(() => now.t, { cost, forecast });
  return { s, cost, forecast, now };
}

describe('WeatherModelStore', () => {
  it('a period loads once; undefined while loading', async () => {
    const { s, cost } = store();
    s.load(P);
    expect(s.get(P)).toBeUndefined();
    s.load(P);
    await flush();
    expect(cost).toHaveBeenCalledTimes(1);
    expect(cost).toHaveBeenCalledWith(P);
    expect(s.get(P)).toEqual(OK);
  });
  it('a failure gives null; a failed refresh keeps the answer on screen', async () => {
    const { s, cost } = store();
    cost.mockRejectedValueOnce(new Error('x'));
    s.load(P);
    await flush();
    expect(s.get(P)).toBeNull();
    s.load(P, true);
    await flush();
    expect(s.get(P)).toEqual(OK);
    cost.mockRejectedValueOnce(new Error('x'));
    s.load(P, true);
    await flush();
    expect(s.get(P)).toEqual(OK);
  });
  it('onWeather ignores the first value, then refetches once per 10 minutes', async () => {
    const { s, cost, forecast, now } = store({ t: 1_000_000 });
    s.load(P);
    s.loadForecast();
    await flush();
    s.onWeather(100, P);
    expect(cost).toHaveBeenCalledTimes(1);
    s.onWeather(200, P);
    expect(cost).toHaveBeenCalledTimes(2);
    expect(forecast).toHaveBeenCalledTimes(2);
    now.t += REFRESH_MS - 1;
    s.onWeather(300, P);
    expect(cost).toHaveBeenCalledTimes(2);
    now.t += 2;
    s.onWeather(300, P); // same value: nothing new
    expect(cost).toHaveBeenCalledTimes(2);
    s.onWeather(400, P);
    expect(cost).toHaveBeenCalledTimes(3);
    s.onWeather(null, P);
    expect(cost).toHaveBeenCalledTimes(3);
  });
  it('reset clears and drops a late answer for the old place', async () => {
    const { s, cost } = store();
    let late: (v: unknown) => void = () => {};
    cost.mockReturnValueOnce(new Promise((r) => (late = r)));
    s.load(P);
    s.reset();
    late(OK);
    await flush();
    expect(s.byPeriod).toEqual({});
    expect(s.forecast).toBeUndefined();
  });
});
