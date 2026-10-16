import { api } from '$lib/api/client';
import type { EnergyDay, EnergyReport, Tariff } from '$lib/api/types';
import { addDays } from '$lib/energy';
import { monthSpan } from '$lib/dashboard';

/** What Maison's energy column reads (Tableau §5: existing endpoints only): the tariff in force (`/api/settings`,
 * the « Maintenant » card), this month's report with last month's bucket and the projection (`/api/energy`,
 * group month, the bill widget and its chip), and yesterday (its report for kWh and €, its curve for the bars).
 * `undefined` while a load has not answered, `null` when it failed: the widget says « — », never 0. Loaded
 * again when the Paris day turns, and at most every 30 min. */
export class DashboardEnergy {
  tariff = $state<Tariff | null | undefined>(undefined);
  month = $state<EnergyReport | null | undefined>(undefined);
  yesterday = $state<EnergyReport | null | undefined>(undefined);
  curve = $state<EnergyDay | null | undefined>(undefined);
  #key = '';
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

  load(todayIso: string): void {
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
  }

  reset(): void {
    this.#gen++;
    this.#key = '';
    this.#at = 0;
    this.tariff = undefined;
    this.month = undefined;
    this.yesterday = undefined;
    this.curve = undefined;
  }
}

export const dashboardEnergy = new DashboardEnergy();
