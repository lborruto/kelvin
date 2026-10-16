import type { EnergyGroup } from './api/types';
import { fmtDay, monthName, monthYear } from './format';
import { locale, m } from './i18n';
import { parisDayStart } from './time';

/** Categorical series (DESIGN.md Series rule and « Tariff blues »): HC light blue (always hatched), HP dark
 * blue, an unsplit home violet, the radiators ochre; never heat colours. */
export const SERIES = {
  hc: 'var(--hc)',
  hp: 'var(--hp)',
  radiators: 'var(--series-3)',
  home: 'var(--series-1)'
} as const;
export type SeriesKey = keyof typeof SERIES;

/** Series drawn with the off-peak hatch over their fill, so HC never rests on colour alone. */
export const SERIES_HATCH: Readonly<Partial<Record<string, true>>> = { hc: true };

/** An HTML fill (CSS `background`) for a series: the hatch layered over the colour where it has one. */
export function seriesBackground(key: string, color: string = SERIES[key as SeriesKey] ?? 'var(--mu)'): string {
  return SERIES_HATCH[key] ? `var(--hc-hatch), ${color}` : color;
}

const pad = (n: number) => String(n).padStart(2, '0');
const isoUtc = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

export function addDays(iso: string, n: number): string {
  return isoUtc(new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)) + n)));
}

export function bucketLabel(key: string, group: EnergyGroup): string {
  if (group === 'day') return `${Number(key.slice(8, 10))}/${Number(key.slice(5, 7))}`;
  if (group === 'week') return m.energy.weekShort(Number(key.slice(6)));
  if (group === 'month') return `${key.slice(5, 7)}/${key.slice(2, 4)}`;
  return key;
}

/** « du 1/10 au 12/10 », “1/10 – 12/10”, joined by no-break spaces so it never wraps; empty for a single day. */
export function spanLabel(cur: Span): string {
  const last = addDays(cur.to, -1);
  return last === cur.from ? '' : m.energy.span(fmtDay(cur.from), fmtDay(last));
}

/** How many leading buckets have no data (before Linky history begins): a chart drops them
 * so it starts at its first real bucket. None when no bucket has data. */
export function leadingMissing(values: (number | null)[]): number {
  const i = values.findIndex((v) => v != null);
  return i < 0 ? 0 : i;
}

/** The house chart's first bucket: the first with Linky data or a counted day without it (from the contract start on, a
 * day without data is a gap that pays its subscription, not history before the report's first day). */
export function firstCounted(buckets: { kwh: number | null; missing_days: number }[]): number {
  return leadingMissing(buckets.map((b) => (b.kwh != null || b.missing_days > 0 ? 1 : null)));
}

/** The navigator's views; the same words as the bar groups (Plan 5's `group`). */
export type View = EnergyGroup;

/** The views in order; each one's label is `m.energy.views[v]`, read where it is shown. */
export const VIEWS: View[] = ['day', 'week', 'month', 'year'];

/** A span of Paris days, `to` exclusive (ISO YYYY-MM-DD). */
export interface Span {
  from: string;
  to: string;
}

const ymd = (iso: string) => [Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), Number(iso.slice(8, 10))] as const;
const utcIso = (y: number, m: number, d: number) => isoUtc(new Date(Date.UTC(y, m - 1, d)));
const noonUtc = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const DATES = {
  dayTitle: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
  dayShort: { day: 'numeric', month: 'short' },
  dayLongNoYear: { day: 'numeric', month: 'long' }
} as const satisfies Record<string, Intl.DateTimeFormatOptions>;
const dateCache = new Map<string, Intl.DateTimeFormat>();
/** A UTC date formatter in the active language (en-GB: “Tuesday, 13 October 2026”, “12 Oct”). */
function dates(kind: keyof typeof DATES): Intl.DateTimeFormat {
  const key = `${locale.intl}|${kind}`;
  let f = dateCache.get(key);
  if (!f) dateCache.set(key, (f = new Intl.DateTimeFormat(locale.intl, { timeZone: 'UTC', ...DATES[kind] })));
  return f;
}

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
  if (ya === yb && ma === mb) return `${da}–${dates('dayShort').format(noonUtc(b))} ${yb}`;
  if (ya === yb) return `${dates('dayShort').format(noonUtc(a))} – ${dates('dayShort').format(noonUtc(b))} ${yb}`;
  return `${dates('dayShort').format(noonUtc(a))} ${ya} – ${dates('dayShort').format(noonUtc(b))} ${yb}`;
}

/** « Mardi 13 octobre 2026 », « Semaine 42 · 12–18 oct. 2026 », « Octobre 2026 », « 2026 » (en-GB: “Tuesday, 13 October
 * 2026”, “Week 42 · 12–18 Oct 2026”, “October 2026”). */
export function periodTitle(view: View, p: Span): string {
  if (view === 'day') return cap(dates('dayTitle').format(noonUtc(p.from)));
  if (view === 'week') return m.energy.week(isoWeek(p.from).week, weekRange(p.from, addDays(p.to, -1)));
  if (view === 'month') return monthName(p.from);
  return p.from.slice(0, 4);
}

/** The short spoken name of a bucket: « 13 octobre », « semaine 42 », « octobre 2026 », « 2026 ». */
export function spokenTitle(group: EnergyGroup, p: Span): string {
  if (group === 'day') return dates('dayLongNoYear').format(noonUtc(p.from));
  if (group === 'week') return m.energy.weekSpoken(isoWeek(p.from).week);
  if (group === 'month') return monthYear(p.from);
  return p.from.slice(0, 4);
}

/** What « par rapport à … » names for the previous period starting on `prevFrom`. */
export function previousName(view: View, prevFrom: string): string {
  if (view === 'day') return m.energy.dayBefore;
  if (view === 'week') return m.energy.weekBefore;
  if (view === 'month') return monthYear(prevFrom);
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
