// The Absence sheet's choices (direction-2 §3 « Absence sheet »): two stable presets (tomorrow 18:00 and « Jusqu’à mon
// retour », no end: `until: null`) and a precise date, all in Paris wall time (the backend reads a naive `until` as the
// home's time zone).
import type { Override } from './api/types';
import { addParisDays, parisAt, parisDayStart, parisMidnight, parisParts } from './time';

export type AwayPreset = 'tomorrow' | 'return' | 'pick';

/** An absence with no end date: only « Terminer » ends it (`ends_at` null). */
export const isOpenEnded = (o: Override): boolean => o.ends_at == null;

/** A boost's end in ms: a boost always has one (only an away may be open-ended). */
export const boostEndMs = (o: Override): number => (o.ends_at ?? 0) * 1000;

/** The minimum lead of a precise date (the `datetime-local` `min`). */
export const AWAY_MIN_LEAD_MS = 15 * 60_000;
/** The presets' hour: « Demain 18:00 ». */
export const AWAY_HOUR = 18;
export const AWAY_TEMP = { min: 7, max: 19, default: 12 } as const;

const pad = (n: number) => String(n).padStart(2, '0');

/** Paris wall time « YYYY-MM-DDTHH:MM » (a `datetime-local` value) of an instant. */
export function parisLocal(ms: number): string {
  const p = parisParts(ms);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** The instant of a Paris wall time « YYYY-MM-DDTHH:MM »; null when it is not one. */
export function parisLocalMs(local: string): number | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  const h = Number(m[2]);
  const min = Number(m[3]);
  if (h > 23 || min > 59) return null;
  const day = parisDayStart(m[1]);
  return Number.isNaN(day) ? null : parisAt(day, h * 60 + min);
}

export interface AwayPresets {
  /** Tomorrow 18:00. */
  tomorrow: number;
  /** The default choice: always tomorrow 18:00. */
  preset: 'tomorrow';
  /** The earliest precise date, as a `datetime-local` value (now + 15 min, Paris). */
  min: string;
}

/** The presets at `now` (pure: tests inject the clock). */
export function awayPresets(now: number): AwayPresets {
  const today = parisMidnight(now);
  const tomorrow = parisAt(addParisDays(today, 1), AWAY_HOUR * 60);
  // Rounded up to the next minute: the field's `min` is never in the past by a few seconds.
  return { tomorrow, preset: 'tomorrow', min: parisLocal(Math.ceil((now + AWAY_MIN_LEAD_MS) / 60_000) * 60_000) };
}
