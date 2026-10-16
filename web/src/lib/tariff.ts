import type { HcSchedule, Slot, Tariff, TariffDoc, TariffOption, TariffRow } from '$lib/api/types';
import { parseDecimal } from '$lib/format';

export const OPTIONS: TariffOption[] = ['base', 'hchp', 'tempo'];
export const RATE_KEYS: Record<TariffOption, string[]> = {
  base: ['base'],
  hchp: ['hc', 'hp'],
  tempo: ['blue_hc', 'blue_hp', 'white_hc', 'white_hp', 'red_hc', 'red_hp']
};
export const ALL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
export const WINTER = [11, 12, 1, 2, 3];
export const SUMMER = [4, 5, 6, 7, 8, 9, 10];
export const DEFAULT_TEMPO_HOURS = { hc_start: '22:00', hc_end: '06:00' };

type Dated = { valid_from: string };
const byDate = <T extends Dated>(a: T, b: T) => (a.valid_from < b.valid_from ? -1 : a.valid_from > b.valid_from ? 1 : 0);

/** The item in force on a day (the backend's rule: days before the first use the first). */
export function inForce<T extends Dated>(items: T[], day: string): T | null {
  const sorted = [...items].sort(byDate);
  let chosen: T | null = sorted[0] ?? null;
  for (const x of sorted) {
    if (x.valid_from > day) break;
    chosen = x;
  }
  return chosen;
}

/** Replace the item of the same date, keep the list sorted. */
export function upsertByDate<T extends Dated>(items: T[], item: T): T[] {
  return [...items.filter((x) => x.valid_from !== item.valid_from), item].sort(byDate);
}

export function monthsProblem(variants: { months: number[] }[]): { kind: 'missing' | 'overlap'; months: number[] } | null {
  const count = new Map<number, number>();
  for (const v of variants) for (const mo of v.months) count.set(mo, (count.get(mo) ?? 0) + 1);
  const overlap = ALL_MONTHS.filter((mo) => (count.get(mo) ?? 0) > 1);
  if (overlap.length) return { kind: 'overlap', months: overlap };
  const missing = ALL_MONTHS.filter((mo) => !count.has(mo));
  return missing.length ? { kind: 'missing', months: missing } : null;
}

type Row = TariffDoc['prices'][number];
const bare = (p: TariffRow): Row => ({ valid_from: p.valid_from, option: p.option, subscription_eur_month: p.subscription_eur_month, rates: { ...p.rates } });

export function sameRow(a: Row | null, b: Row): boolean {
  if (!a || a.option !== b.option || a.subscription_eur_month !== b.subscription_eur_month) return false;
  return RATE_KEYS[b.option].every((k) => a.rates[k] === b.rates[k]);
}

const slotsKey = (s: Slot[]) => s.map((x) => `${x.start}-${x.end}`).join(',');
export function sameSchedule(a: HcSchedule | null, b: HcSchedule): boolean {
  if (!a || a.variants.length !== b.variants.length) return false;
  return a.variants.every((v, i) => {
    const w = b.variants[i];
    return [...v.months].sort((x, y) => x - y).join() === [...w.months].sort((x, y) => x - y).join() && slotsKey(v.slots) === slotsKey(w.slots);
  });
}

export interface Draft {
  option: TariffOption;
  kva: number;
  validFrom: string;
  subscription: number;
  rates: Record<string, number>;
  /** HC/HP only: the off-peak hours being edited, from their own date. */
  schedule: HcSchedule | null;
  tempoHours: { hc_start: string; hc_end: string };
}

/** The whole document to save: the history plus what changed. A row or a schedule equal to the
 * one already in force at its date adds nothing (no duplicate after a power or hours change). */
export function buildDocument(current: Tariff | null, d: Draft): TariffDoc {
  const rows = (current?.prices ?? []).map(bare);
  const row: Row = { valid_from: d.validFrom, option: d.option, subscription_eur_month: d.subscription, rates: d.rates };
  const prices = sameRow(inForce(rows, d.validFrom), row) ? rows : upsertByDate(rows, row);
  let schedules = current?.hc_schedules ?? [];
  if (d.schedule && !sameSchedule(inForce(schedules, d.schedule.valid_from), d.schedule)) {
    schedules = upsertByDate(schedules, d.schedule);
  }
  return { kva: d.kva, prices, hc_schedules: schedules, tempo_hours: { ...d.tempoHours } };
}

/** « Ajouter ces heures creuses à partir du … »: only a new schedule. */
export function withSchedule(current: Tariff, s: HcSchedule): TariffDoc {
  return {
    kva: current.kva,
    prices: current.prices.map(bare),
    hc_schedules: upsertByDate(current.hc_schedules, s),
    tempo_hours: { hc_start: current.tempo_hours.hc_start, hc_end: current.tempo_hours.hc_end }
  };
}

/** « 22:00–06:00, 12:00–14:00 » */
export const slotsText = (slots: Slot[]): string => slots.map((x) => `${x.start}–${x.end}`).join(', ');

/** The summary rows a save changed (TariffSummary pulses them): option, kva, sub, each rate, hours. */
export function tariffDiff(before: Tariff | null, after: Tariff, today: string): Set<string> {
  const out = new Set<string>();
  const a = before ? inForce(before.prices, today) : null;
  const b = inForce(after.prices, today);
  if (!b) return out;
  if (a?.option !== b.option) out.add('option');
  if (before?.kva !== after.kva) out.add('kva');
  if (a?.subscription_eur_month !== b.subscription_eur_month) out.add('sub');
  for (const k of RATE_KEYS[b.option]) if (a?.rates[k] !== b.rates[k]) out.add(k);
  const hours = (t: Tariff | null) => {
    if (!t) return '';
    const s = inForce(t.hc_schedules, today);
    return `${s ? s.variants.map((v) => `${v.months.join()}:${slotsText(v.slots)}`).join(';') : ''}|${t.tempo_hours.hc_start}-${t.tempo_hours.hc_end}`;
  };
  if (hours(before) !== hours(after)) out.add('hours');
  return out;
}

/** A typed price per kWh that cannot be right, flagged before saving (Tableau « Tarif »): not a number, more
 * than 4 decimals, zero, or above 5 €/kWh. Empty is not flagged here (the save says what is missing). */
export function priceProblem(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  const v = parseDecimal(t);
  if (v === null) return true;
  const decimals = (t.replace(/[\s  ]/g, '').split(/[.,]/).pop() ?? '').length;
  const hasDecimals = /[.,]/.test(t);
  return (hasDecimals && decimals > 4) || v <= 0 || v > 5;
}
