import type { EnergyGroup, PeriodSummary } from './api/types';
import { fmtDateLong, fmtDay, monthName, parisTodayIso } from './format';
import { parisDayStart } from './time';

export type Period = EnergyGroup;

export const PERIODS: { value: Period; label: string }[] = [
  { value: 'day', label: 'Jour' },
  { value: 'month', label: 'Mois' },
  { value: 'year', label: 'Année' }
];

/** Categorical series (DESIGN.md Series rule): never heat colours. */
export const SERIES = {
  hc: 'var(--series-1)',
  hp: 'var(--series-2)',
  radiators: 'var(--series-3)',
  home: 'var(--series-1)'
} as const;

const pad = (n: number) => String(n).padStart(2, '0');
const isoUtc = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

export function addDays(iso: string, n: number): string {
  return isoUtc(new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)) + n)));
}

/** The chart window of a period, in Paris days, `to` exclusive. */
export function periodWindow(period: Period, now = Date.now()): { from: string; to: string; group: EnergyGroup } {
  const today = parisTodayIso(now);
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  if (period === 'day') return { from: addDays(today, -30), to: addDays(today, 1), group: 'day' };
  if (period === 'month') {
    return { from: isoUtc(new Date(Date.UTC(y, m - 12, 1))), to: isoUtc(new Date(Date.UTC(y, m, 1))), group: 'month' };
  }
  return { from: `${y - 2}-01-01`, to: `${y + 1}-01-01`, group: 'year' };
}

export function bucketLabel(key: string, group: EnergyGroup): string {
  if (group === 'day') return `${Number(key.slice(8, 10))}/${Number(key.slice(5, 7))}`;
  if (group === 'week') return `S${Number(key.slice(6))}`;
  if (group === 'month') return `${key.slice(5, 7)}/${key.slice(2, 4)}`;
  return key;
}

export function heroTitle(period: Period, cur: PeriodSummary): string {
  if (period === 'day') return fmtDateLong(cur.from);
  if (period === 'month') return monthName(cur.from);
  return cur.from.slice(0, 4);
}

export function compareLabel(period: Period, prev: PeriodSummary): string {
  if (period === 'day') return 'par rapport à la veille';
  if (period === 'month') return `par rapport à ${monthName(prev.from).toLowerCase()}, mêmes jours`;
  return `par rapport à ${prev.from.slice(0, 4)}, même période`;
}

const NB = '\u00a0';

/** "du 1/10 au 12/10" joined by no-break spaces, so it never wraps; empty for a single day. */
export function spanLabel(cur: Span): string {
  const last = addDays(cur.to, -1);
  return last === cur.from ? '' : ['du', fmtDay(cur.from), 'au', fmtDay(last)].join(NB);
}

/** How many leading buckets have no data (before Linky history begins): a chart drops them
 * so it starts at its first real bucket. None when no bucket has data. */
export function leadingMissing(values: (number | null)[]): number {
  const i = values.findIndex((v) => v != null);
  return i < 0 ? 0 : i;
}

/** The navigator's views; the same words as the bar groups (Plan 5's `group`). */
export type View = EnergyGroup;

export const VIEWS: { value: View; label: string }[] = [
  { value: 'day', label: 'Jour' },
  { value: 'week', label: 'Semaine' },
  { value: 'month', label: 'Mois' },
  { value: 'year', label: 'Année' }
];

/** A span of Paris days, `to` exclusive (ISO YYYY-MM-DD). */
export interface Span {
  from: string;
  to: string;
}

const COPY = {
  week: (n: number, range: string) => `Semaine ${n} · ${range}`,
  weekSpoken: (n: number) => `semaine ${n}`,
  dayBefore: 'la veille',
  weekBefore: 'la semaine précédente'
} as const;

const ymd = (iso: string) => [Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), Number(iso.slice(8, 10))] as const;
const utcIso = (y: number, m: number, d: number) => isoUtc(new Date(Date.UTC(y, m - 1, d)));
const noonUtc = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const dayTitle = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const dayShort = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'short' });
const dayLongNoYear = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'long' });

/** Monday of the ISO week holding `day`. */
export function weekStart(day: string): string {
  const [y, m, d] = ymd(day);
  return addDays(day, -((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7));
}

/** ISO 8601 week number and week-year (the year of the week's Thursday). */
export function isoWeek(day: string): { year: number; week: number } {
  const thursday = addDays(weekStart(day), 3);
  const year = Number(thursday.slice(0, 4));
  const days = (Date.parse(`${thursday}T00:00:00Z`) - Date.parse(`${year}-01-01T00:00:00Z`)) / 86_400_000;
  return { year, week: Math.floor(days / 7) + 1 };
}

/** The period of `view` holding `day`. */
export function periodOf(view: View, day: string): Span {
  const [y, m] = ymd(day);
  if (view === 'day') return { from: day, to: addDays(day, 1) };
  if (view === 'week') {
    const from = weekStart(day);
    return { from, to: addDays(from, 7) };
  }
  if (view === 'month') return { from: utcIso(y, m, 1), to: utcIso(y, m + 1, 1) };
  return { from: `${y}-01-01`, to: `${y + 1}-01-01` };
}

export function stepPeriod(view: View, p: Span, delta: -1 | 1): Span {
  return periodOf(view, delta > 0 ? p.to : addDays(p.from, -1));
}

/** The bars drawn for a period: Jour → the 7 days ending on it; Semaine, Mois → its days; Année → its months. */
export function chartWindow(view: View, p: Span): Span & { group: EnergyGroup } {
  if (view === 'day') return { from: addDays(p.from, -6), to: p.to, group: 'day' };
  if (view === 'year') return { ...p, group: 'month' };
  return { ...p, group: 'day' };
}

/** `‹` while the previous period holds a day on or after `first`; `›` while the next starts on or before `last`. */
export function canStep(view: View, p: Span, delta: -1 | 1, first: string | null, last: string | null): boolean {
  if (delta < 0) return first != null && first < p.from;
  return last != null && stepPeriod(view, p, 1).from <= last;
}

/** True when `last` (the last day with data) is inside the period: « Dernier jour » is then hidden. */
export function isLatest(p: Span, last: string | null): boolean {
  return last != null && p.from <= last && last < p.to;
}

/** The days of a period that can have data: a running period ends after `last`. */
export function dataSpan(p: Span, last: string | null): Span {
  if (last == null || last < p.from) return p;
  const end = addDays(last, 1);
  return end < p.to ? { from: p.from, to: end } : p;
}

function weekRange(a: string, b: string): string {
  const [ya, ma, da] = ymd(a);
  const [yb, mb] = ymd(b);
  if (ya === yb && ma === mb) return `${da}–${dayShort.format(noonUtc(b))} ${yb}`;
  if (ya === yb) return `${dayShort.format(noonUtc(a))} – ${dayShort.format(noonUtc(b))} ${yb}`;
  return `${dayShort.format(noonUtc(a))} ${ya} – ${dayShort.format(noonUtc(b))} ${yb}`;
}

/** « Mardi 13 octobre 2026 », « Semaine 42 · 12–18 oct. 2026 », « Octobre 2026 », « 2026 ». */
export function periodTitle(view: View, p: Span): string {
  if (view === 'day') return cap(dayTitle.format(noonUtc(p.from)));
  if (view === 'week') return COPY.week(isoWeek(p.from).week, weekRange(p.from, addDays(p.to, -1)));
  if (view === 'month') return monthName(p.from);
  return p.from.slice(0, 4);
}

/** The short spoken name of a bucket: « 13 octobre », « semaine 42 », « octobre 2026 », « 2026 ». */
export function spokenTitle(group: EnergyGroup, p: Span): string {
  if (group === 'day') return dayLongNoYear.format(noonUtc(p.from));
  if (group === 'week') return COPY.weekSpoken(isoWeek(p.from).week);
  if (group === 'month') return monthName(p.from).toLowerCase();
  return p.from.slice(0, 4);
}

/** What « par rapport à … » names for the previous period starting on `prevFrom`. */
export function previousName(view: View, prevFrom: string): string {
  if (view === 'day') return COPY.dayBefore;
  if (view === 'week') return COPY.weekBefore;
  if (view === 'month') return monthName(prevFrom).toLowerCase();
  return prevFrom.slice(0, 4);
}

/** The days of a report bucket from its key (`2026-10-13`, `2026-W42`, `2026-10`, `2026`). */
export function bucketSpan(key: string, group: EnergyGroup): Span {
  if (group === 'day') return periodOf('day', key);
  if (group === 'week') {
    const year = Number(key.slice(0, 4));
    const week = Number(key.slice(6));
    return periodOf('week', addDays(weekStart(`${year}-01-04`), (week - 1) * 7));
  }
  if (group === 'month') return periodOf('month', `${key}-01`);
  return periodOf('year', `${key}-01-01`);
}

/** Half-hours in the Paris day `day`: 48, or 46 / 50 on DST days. */
export function halfHoursIn(day: string): number {
  return Math.round((parisDayStart(addDays(day, 1)) - parisDayStart(day)) / 1_800_000);
}
