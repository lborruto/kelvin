import type { EnergyGroup, PeriodSummary } from './api/types';
import { fmtDateLong, fmtDay, monthName, parisTodayIso } from './format';

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
export function spanLabel(cur: PeriodSummary): string {
  const last = addDays(cur.to, -1);
  return last === cur.from ? '' : ['du', fmtDay(cur.from), 'au', fmtDay(last)].join(NB);
}

/** How many leading buckets have no data (before Linky history begins): a chart drops them
 * so it starts at its first real bucket. None when no bucket has data. */
export function leadingMissing(values: (number | null)[]): number {
  const i = values.findIndex((v) => v != null);
  return i < 0 ? 0 : i;
}
