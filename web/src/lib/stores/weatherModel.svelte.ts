import { api } from '$lib/api/client';
import type { WeatherCost } from '$lib/api/types';

/** Spec §8.5: the web refetches on a new forecast at most every 10 minutes. */
export const REFRESH_MS = 600_000;

export interface Period {
  from: string;
  to: string;
}
/** « Météo et coût » answers on Énergie (Plan 15, spec §8): one per selected period. `undefined` while loading, `null`
 * when the call failed (the panel says so). Refreshed when the `weather` SSE payload's `fetched_at` changes, at most
 * every 10 minutes (spec §8.5). Maison's forecast is `dashboardEnergy.forecast`. */
export class WeatherModelStore {
  byPeriod = $state<Record<string, WeatherCost | null | undefined>>({});
  #fetched: number | null = null;
  #at = 0;
  #generation = 0;
  #now: () => number;
  #fetch: (p: Period) => Promise<WeatherCost>;
  constructor(now: () => number = () => Date.now(), fetch: (p: Period) => Promise<WeatherCost> = (p) => api.weatherCost(p)) {
    this.#now = now;
    this.#fetch = fetch;
  }
  key(p: Period): string {
    return `${p.from}|${p.to}`;
  }
  /** The answer for a period (undefined while loading or never asked). */
  get(p: Period | null | undefined): WeatherCost | null | undefined {
    return p ? this.byPeriod[this.key(p)] : undefined;
  }
  /** Asks a period once (again with `force`); a failed refresh keeps the answer already on screen. */
  load(p: Period, force = false): void {
    const k = this.key(p);
    if (!force && k in this.byPeriod) return;
    if (!(k in this.byPeriod)) this.byPeriod[k] = undefined;
    const gen = this.#generation;
    this.#fetch(p).then(
      (v) => {
        if (gen === this.#generation) this.byPeriod[k] = v;
      },
      () => {
        if (gen === this.#generation) this.byPeriod[k] = this.byPeriod[k] ?? null;
      }
    );
  }
  /** The `weather` SSE payload changed: refetch what is on screen when its fetch time moved (throttled). The first
   *  value seen only sets the reference (the answers on screen were asked after it). */
  onWeather(fetchedAt: number | null, onScreen: Period | null): void {
    if (fetchedAt == null || fetchedAt === this.#fetched) return;
    const first = this.#fetched == null;
    this.#fetched = fetchedAt;
    if (first || this.#now() - this.#at < REFRESH_MS) return;
    this.#at = this.#now();
    if (onScreen) this.load(onScreen, true);
  }
  /** The place changed or went: every answer belongs to the old one. */
  reset(): void {
    this.#generation++;
    this.byPeriod = {};
    this.#fetched = null;
    this.#at = 0;
  }
}
export const weatherModel = new WeatherModelStore();
