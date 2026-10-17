// A weather view as the API's contract gives it (plan 14 Task 6: `GET /api/weather`, snapshot and SSE
// `weather`): 4,2 °C at 14:00 on 20 November 2026 (Paris), today's minimum at 06:00 and an expected
// maximum at 15:00. Shared by the weather tests (words, Maison chip).
import type { WeatherView } from './api/types';

/** Epoch s of `h`:00 on 20 November 2026, Paris (UTC+1 in November). */
export const at = (h: number) => Date.UTC(2026, 10, 20, h - 1) / 1000;

export const VIEW: WeatherView = {
  now: { temperature_c: 4.2, apparent_c: 1.8, humidity_pct: 86, at: at(14), model: 'arome_hd' },
  today: { min_c: 1.9, min_at: at(6), min_ahead: false, max_c: 9.8, max_at: at(15), max_ahead: true, hours: 48 },
  fetched_at: at(14) + 1020,
  mode: 'meteofrance',
  fetch: { state: 'ok', next: at(15) + 1020, error_since: null }
};

/** 14:20 that day, epoch ms. */
export const NOW = (at(14) + 1200) * 1000;
