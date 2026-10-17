import { api } from '$lib/api/client';
import type { WeatherHourly, WeatherView } from '$lib/api/types';

export type HourlyEntry = { status: 'loading' | 'ok' | 'error'; points: { t: number; v: number }[] };

/** The outdoor temperature (Plan 14, spec §7): the snapshot and the SSE `weather` event keep `view` current;
 * `undefined` until the first snapshot, `null` when no place is set (every weather UI is then absent). */
export class WeatherStore {
  view = $state<WeatherView | null | undefined>(undefined);
  entries = $state<Record<string, HourlyEntry>>({});

  get on(): boolean {
    return this.view != null;
  }

  apply(v: WeatherView | null | undefined): void {
    if (v === undefined) return;
    const was = this.on;
    this.view = v;
    if (was && v == null) this.entries = {}; // the place was removed: its hours are gone
  }

  /** Past hours for a chart window (epoch ms in, points in ms), one request per key. */
  hourly(
    key: string,
    start: number,
    end: number,
    fetcher: (s: number, e: number) => Promise<WeatherHourly> = api.weatherHourly
  ): HourlyEntry | undefined {
    if (!this.on) return undefined;
    if (!this.entries[key]) {
      this.entries[key] = { status: 'loading', points: [] };
      fetcher(Math.floor(start / 1000), Math.ceil(end / 1000)).then(
        (r) => (this.entries[key] = { status: 'ok', points: r.points.map((p) => ({ t: p.ts * 1000, v: p.t })) }),
        () => (this.entries[key] = { status: 'error', points: [] })
      );
    }
    return this.entries[key];
  }

  reset(): void {
    this.view = undefined;
    this.entries = {};
  }
}

export const weather = new WeatherStore();
