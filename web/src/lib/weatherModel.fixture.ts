// « Météo et coût » as the contract gives it (spec 2026-10-18 §8.1), widened to a full week and a hundred-odd points
// for the component tests; dates follow the sample (October 2026).
import sample from './fixtures/weatherModel.sample.json';
import type { ForecastDay, LineSample, ModelPoint, RoomWeather, WeatherCost, WeatherCostForecastView } from './api/types';

/** The contract's shape with literal unions as strings and tuples as arrays: what a JSON import can be checked
 *  against, so a key missing from the sample (or renamed in the types) fails `npm run check`. */
type Widen<T> = T extends string
  ? string
  : T extends readonly (infer U)[]
    ? Widen<U>[]
    : T extends object
      ? { [K in keyof T]: Widen<T[K]> }
      : T;
const checked: Widen<WeatherCost> = sample;
export const SAMPLE = checked as WeatherCost;
const day0 = SAMPLE.forecast.days[0];

/** Seven forecast days from the sample's first (the same figures, one more degree of cold each day). */
export function week(): ForecastDay[] {
  return Array.from({ length: 7 }, (_, i) => ({
    ...day0,
    date: `2026-10-${String(19 + i).padStart(2, '0')}`,
    lead: i + 1,
    t_c: 2 - i,
    sigma_c: [1.0, 1.2, 1.5, 1.8, 2.1, 2.4, 2.7][i]
  }));
}

/** `n` points from −3 to 24 °C around the sample's line (9,62 + 2,31 × degrees below 15,5 °C). */
export function points(n = 120): ModelPoint[] {
  const base = SAMPLE.house.points[0];
  return Array.from({ length: n }, (_, i) => {
    const t = -3 + ((i * 11) % 28);
    const x = Math.max(0, 15.5 - t);
    const kwh = Math.round((9.62 + 2.31 * x + ((i % 5) - 2) * 0.4) * 1000) / 1000;
    const d = new Date(Date.UTC(2026, 9, 17) - i * 86_400_000).toISOString().slice(0, 10);
    return {
      ...base,
      date: d,
      t_c: t,
      degrees_c: x,
      kwh,
      expected_kwh: Math.round((9.62 + 2.31 * x) * 1000) / 1000,
      energy_eur: Math.round(kwh * 20) / 100,
      in_period: i < 17,
      used: i % 40 !== 7,
      excluded: i % 40 === 7 ? 'away' : null
    };
  });
}

/** The model line from −4 to 24 °C every 0,5 °C with a band of ± 0,4 kWh, € at the sample's price. */
export function line(): LineSample[] {
  const r = (v: number) => Math.round(v * 100) / 100;
  return Array.from({ length: 57 }, (_, i) => {
    const t = -4 + i / 2;
    const kwh = 9.62 + 2.31 * Math.max(0, 15.5 - t);
    return { t_c: t, kwh: r(kwh), kwh_lo: r(kwh - 0.4), kwh_hi: r(kwh + 0.4), eur: r(kwh * 0.2016), eur_lo: r((kwh - 0.4) * 0.2016), eur_hi: r((kwh + 0.4) * 0.2016) };
  });
}

export const OK: WeatherCost = {
  ...SAMPLE,
  house: { ...SAMPLE.house, points: points(), line: line() },
  forecast: { ...SAMPLE.forecast, days: week(), week: { kwh: 285.7, heating_kwh: 218.3, eur: 57.6, heating_eur: 44.01, days: 7, priced_days: 7 } }
};
export const THIN: WeatherCost = { ...OK, house: { ...OK.house, thin: ['short_history'], fit_days: 41 } };
const NUMS = {
  balance_point_c: null,
  balance_point_source: null,
  baseload_kwh_day: null,
  baseload_kwh_day_range: null,
  baseload_eur_day: null,
  kwh_per_c: null,
  kwh_per_c_range: null,
  eur_per_c: null,
  r2: null,
  residual_sd_kwh: null,
  fit_days: null,
  heating_days: null
} as const;
const unpriced = (d: ForecastDay): ForecastDay => ({
  ...d,
  degrees_c: null,
  kwh: null,
  kwh_lo: null,
  kwh_hi: null,
  heating_kwh: null,
  heating_kwh_lo: null,
  heating_kwh_hi: null,
  eur: null,
  eur_lo: null,
  eur_hi: null,
  heating_eur: null,
  parts: null
});
export const HIDDEN: WeatherCost = {
  ...OK,
  house: {
    ...OK.house,
    ...NUMS,
    state: 'hidden',
    why: 'few_days',
    thin: [],
    line: [],
    period_share: null,
    points: points(12).map((p) => ({ ...p, degrees_c: null, expected_kwh: null, used: true, excluded: null }))
  },
  forecast: { ...OK.forecast, state: 'hidden', why: 'model_hidden', week: null, days: week().map(unpriced) }
};
export const OFF: WeatherCost = {
  ...HIDDEN,
  house: { ...HIDDEN.house, why: 'weather_off', points: [] },
  rooms: { ...OK.rooms, items: OK.rooms.items.map((r) => ({ ...r, state: 'hidden', why: 'weather_off' })) },
  forecast: { state: 'hidden', why: 'weather_off', fetched_at: null, days: [], week: null },
  normals: null
};
/** Maison's light answer (spec §8.2): the house without its line, points and period share. */
export function forecastView(v: WeatherCost): WeatherCostForecastView {
  const { line: _l, points: _p, period_share: _s, ...house } = v.house;
  return { computed_at: v.computed_at, level: v.level, price: v.price, house, forecast: v.forecast };
}
export const FORECAST: WeatherCostForecastView = forecastView(OK);
export const ROOM: RoomWeather = { ...SAMPLE.rooms.items[0], balance_point_c: 15.5, balance_point_source: 'house' };
