// The freshness of a data source (direction-2 §1.2, DESIGN « Freshness »): one of four states that
// the Freshness mark draws (solid ring, dashed ring, bad dot, nothing) beside a source's words.
import { addDays } from './energy';
import { parisTodayIso } from './format';
import { parisParts } from './time';

/** `fresh`: within its cadence · `late`: waiting or behind (first sync, quota, next read pending,
 * stale) · `bad`: failed (only what DESIGN already makes red) · `none`: nothing to say. */
export type Fresh = 'fresh' | 'late' | 'bad' | 'none';
export type FreshSource = 'cozytouch' | 'linky-day' | 'linky-curve' | 'rte-ecowatt' | 'tempo' | 'weather';

/** Expected cadences of the time-based sources (the Linky ones go by day, see `freshness`). */
export const CADENCE_MS = {
  cozytouch: 15 * 60_000,
  'rte-ecowatt': 6 * 3_600_000,
  tempo: 24 * 3_600_000,
  /** Plan 14: the forecast job runs every hour at :17; two hours without a fetch is late. */
  weather: 2 * 3_600_000
} as const;
/** Linky's daily reading of day D is expected by 12:00 (Paris) on D + 1. */
export const LINKY_READY_HOUR = 12;
/** Tempo publishes tomorrow's colour around 11:00 (Paris); after that, an unknown tomorrow is late. */
export const TEMPO_TOMORROW_HOUR = 11;

export interface FreshInput {
  /** Epoch ms of the source's last success (Cozytouch, RTE, Tempo fetch). */
  at?: number | null;
  /** Linky: the last day with data (ISO YYYY-MM-DD). */
  day?: string | null;
  /** The last attempt failed in a way the user must fix (token refused, sync error, Cozytouch down). */
  failed?: boolean;
  /** Progress the user cannot speed up: first sync, quota, throttled. */
  waiting?: boolean;
  /** Tempo: whether tomorrow's colour is known (null: not asked). */
  tomorrowKnown?: boolean | null;
}

/** The state of `source` at `now`. Failed wins, then waiting; with nothing known there is nothing to say. */
export function freshness(source: FreshSource, input: FreshInput, now: number): Fresh {
  if (input.failed) return 'bad';
  if (input.waiting) return 'late';
  if (source === 'linky-day' || source === 'linky-curve') {
    if (!input.day) return 'none';
    const today = parisTodayIso(now);
    const expected = addDays(today, parisParts(now).hour >= LINKY_READY_HOUR ? -1 : -2);
    return input.day >= expected ? 'fresh' : 'late';
  }
  if (input.at == null) return 'none';
  if (now - input.at > CADENCE_MS[source]) return 'late';
  if (source === 'tempo' && input.tomorrowKnown === false && parisParts(now).hour >= TEMPO_TOMORROW_HOUR) return 'late';
  return 'fresh';
}
