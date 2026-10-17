import { api } from '$lib/api/client';
import type { WeatherHourly, WeatherView } from '$lib/api/types';

/** `at`: when the answer was asked (epoch ms); a refresh keeps the old points on screen until it lands. */
export type HourlyEntry = { status: 'loading' | 'ok' | 'error'; points: { t: number; v: number }[]; at: number };

/** A chart window is asked again after this long (the forecast job publishes once an hour, at :17), and the new
 *  request ends at the new now: a window opened hours later never stops at its first answer. */
export const HOURLY_MAX_AGE_MS = 10 * 60_000;

/** The outdoor temperature (Plan 14, spec §7): the snapshot and the SSE `weather` event keep `view` current;
 * `undefined` until the first snapshot, `null` when no place is set (every weather UI is then absent). */
export class WeatherStore {
  view = $state<WeatherView | null | undefined>(undefined);
  entries = $state<Record<string, HourlyEntry>>({});
  /** Bumped when the place changes or goes: an answer for the previous place is dropped. */
  #generation = 0;

  get on(): boolean {
    return this.view != null;
  }

  apply(v: WeatherView | null | undefined): void {
    if (v === undefined) return;
    const was = this.on;
    this.view = v;
    if (was && v == null) this.placeChanged(); // the place was removed: its hours are gone
  }

  /** Another place (Réglages › Météo saved or removed one): every cached window is another place's. */
  placeChanged(): void {
    this.#generation++;
    this.entries = {};
  }

  /** Past hours for a chart window (epoch ms in, points in ms), one request per key while fresh; called again
   *  (every minute by the room sheet), an entry older than `HOURLY_MAX_AGE_MS` is asked again up to `end`. */
  hourly(
    key: string,
    start: number,
    end: number,
    fetcher: (s: number, e: number) => Promise<WeatherHourly> = api.weatherHourly,
    now: number = Date.now()
  ): HourlyEntry | undefined {
    if (!this.on) return undefined;
    const cur = this.entries[key];
    if (cur && (cur.status === 'loading' || now - cur.at <= HOURLY_MAX_AGE_MS)) return cur;
    const gen = this.#generation;
    this.entries[key] = { status: 'loading', points: cur?.points ?? [], at: now };
    fetcher(Math.floor(start / 1000), Math.ceil(end / 1000)).then(
      (r) => {
        if (gen === this.#generation) this.entries[key] = { status: 'ok', points: r.points.map((p) => ({ t: p.ts * 1000, v: p.t })), at: now };
      },
      () => {
        if (gen === this.#generation) this.entries[key] = { status: 'error', points: cur?.points ?? [], at: now };
      }
    );
    return this.entries[key];
  }

  reset(): void {
    this.view = undefined;
    this.placeChanged();
  }
}

export const weather = new WeatherStore();
