import { api } from '$lib/api/client';
import type { EnergyDay, EnergyReport, Tariff, WeatherCostForecastView } from '$lib/api/types';
import { addDays } from '$lib/energy';
import { monthSpan } from '$lib/dashboard';

/** What Maison's energy column reads (Tableau §5: existing endpoints only): the tariff in force (`/api/settings`,
 * the « Maintenant » card), this month's report with last month's bucket and the projection (`/api/energy`,
 * group month, the bill widget and its chip), and yesterday (its report for kWh and €, its curve for the bars).
 * `undefined` while a load has not answered, `null` when it failed: the widget says « — », never 0. Loaded
 * again when the Paris day turns, and at most every 30 min. With a weather place, tomorrow's heating cost
 * (`/api/energy/weather/forecast`, Plan 15) too, and again on a new forecast at most every 10 min (spec §8.5). */
export class DashboardEnergy {
  tariff = $state<Tariff | null | undefined>(undefined);
  month = $state<EnergyReport | null | undefined>(undefined);
  yesterday = $state<EnergyReport | null | undefined>(undefined);
  curve = $state<EnergyDay | null | undefined>(undefined);
  /** Plan 15: tomorrow's forecast with the house model; `undefined` while loading or without a weather place. */
  forecast = $state<WeatherCostForecastView | null | undefined>(undefined);
  #key = '';
  #forecastGen = 0;
  #forecastBusy = false;
  #fetched: number | null = null;
  #forecastAt = 0;
  #at = 0;
  #gen = 0;
  #now: () => number;

  constructor(now: () => number = () => Date.now()) {
    this.#now = now;
  }

  /** Both answers the tableau waits for before it draws (one frame for all). */
  get answered(): boolean {
    return this.tariff !== undefined && this.month !== undefined;
  }

  load(todayIso: string, weatherOn = false): void {
    const t = this.#now();
    if (this.#key === todayIso && t - this.#at < 1_800_000) return;
    const fresh = this.#key !== todayIso;
    this.#key = todayIso;
    this.#at = t;
    const gen = ++this.#gen;
    const s = monthSpan(todayIso);
    const y = addDays(todayIso, -1);
    const self: DashboardEnergy = this;
    const set = <K extends 'tariff' | 'month' | 'yesterday' | 'curve'>(k: K, v: DashboardEnergy[K]) => {
      if (gen === this.#gen) self[k] = v;
    };
    // A refresh keeps the figures on screen; a new day starts from « loading » for the day-bound ones.
    if (fresh) {
      this.yesterday = undefined;
      this.curve = undefined;
    }
    api.settings().then((v) => set('tariff', v.tariff), () => set('tariff', this.tariff ?? null));
    api.energyReport(s.prevFrom, s.to, 'month', { from: s.from, to: s.to }).then((v) => set('month', v), () => set('month', this.month ?? null));
    api.energyReport(y, todayIso, 'day').then((v) => set('yesterday', v), () => set('yesterday', this.yesterday ?? null));
    api.energyDay(y).then((v) => set('curve', v), () => set('curve', this.curve ?? null));
    if (weatherOn) this.loadForecast(true);
  }

  /** Tomorrow's forecast: once (again with `force`); a failed refresh keeps the answer on screen. */
  loadForecast(force = false): void {
    if (this.#forecastBusy || (!force && this.forecast !== undefined)) return;
    this.#forecastBusy = true;
    this.#forecastAt = this.#now();
    const gen = this.#forecastGen;
    const done = (v: WeatherCostForecastView | null | undefined) => {
      if (gen !== this.#forecastGen) return;
      this.#forecastBusy = false;
      this.forecast = v;
    };
    api.weatherCostForecast().then(done, () => done(this.forecast ?? null));
  }

  /** The `weather` SSE payload's `fetched_at` moved: a new forecast, asked again at most every 10 minutes. The first
   *  value only sets the reference. */
  refreshForecast(fetchedAt: number | null): void {
    if (fetchedAt == null || fetchedAt === this.#fetched) return;
    const first = this.#fetched == null;
    this.#fetched = fetchedAt;
    if (first || this.forecast === undefined || this.#now() - this.#forecastAt < 600_000) return;
    this.loadForecast(true);
  }

  /** The weather place went: no forecast line any more. */
  clearForecast(): void {
    this.#forecastGen++;
    this.#forecastBusy = false;
    this.#fetched = null;
    this.forecast = undefined;
  }

  reset(): void {
    this.#gen++;
    this.#key = '';
    this.#at = 0;
    this.tariff = undefined;
    this.month = undefined;
    this.yesterday = undefined;
    this.curve = undefined;
    this.clearForecast();
  }
}

export const dashboardEnergy = new DashboardEnergy();
