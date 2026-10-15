/**
 * The content of every Énergie inspector, readout, hidden table and announcement, built from the
 * API objects (spec §3.2.3, §3.2.4). Pure: the card, the phone sheet, the visually hidden table
 * and the screen-reader text all come from the same rows, so they cannot disagree.
 */
import type { EnergyGroup, EnergyInterval, EnergySummary, PriceRow, RoomSample } from './api/types';
import { periodTitle, spokenTitle, type Span } from './energy';
import {
  fmtAmount, fmtDay, fmtEurExact, fmtEurHalfHour, fmtKwhExact, fmtPct1, fmtPrice, fmtTemp, fmtW, fmtWh, matchParts
} from './format';
import { m } from './i18n';
import { parisOffsetMinutes, parisParts } from './time';

const NB = '\u00a0';

export interface Row {
  key: string;
  label: string;
  value: string;
  /** An estimate: followed by a muted « est. » (spec §3.2.1). */
  est?: boolean;
  /** A « dont … » row, indented under the one above. */
  sub?: boolean;
  /** Why the value reads « — » (spec §9.1: missing is « — », and says why). */
  note?: string;
}

export interface Inspection {
  title: string;
  rows: Row[];
  /** The « Qualité » line: missing days, estimated split, coverage, retro prices. */
  notes: string[];
  /** Set when the bucket has no Linky data. */
  empty: string | null;
  /** What `aria-live` says on keyboard selection. */
  spoken: string;
}

export interface BucketCtx {
  group: EnergyGroup;
  span: Span;
  /** The selected period, for « Part de la période ». */
  period?: { span: Span; kwh: number | null } | null;
  /** False on a home without Linky: no « Aucune donnée Linky » line. */
  linky?: boolean;
  /** The home has recorded radiators: a null radiator sum then reads « — » with its reason. */
  radiators?: boolean;
  /** Paris today: the report counts radiators up to yesterday, so a bucket holding today says so. */
  today?: string | null;
}

/** The order of the inspector's rows and of the hidden table's columns. */
export const ROW_ORDER = [
  'home', 'hc', 'hp', 'hc_share', 'radiators', 'rest', 'rad_share', 'cost', 'energy', 'subscription', 'prices', 'avg_price',
  'period_share', 'per_day'
] as const;
export const READOUT_ORDER = ['power', 'energy', 'rate', 'price', 'cost', 'radiators', 'rest', 'temperature'] as const;

/** The rate keys in display order (written out: a module-level read of `m` would freeze a language). */
const RATE_ORDER = ['base', 'hc', 'hp', 'blue_hc', 'blue_hp', 'white_hc', 'white_hp', 'red_hc', 'red_hp'];
const rateRank = (k: string) => {
  const i = RATE_ORDER.indexOf(k);
  return i < 0 ? RATE_ORDER.length : i;
};

/** « HC 0,2068 · HP 0,2700 €/kWh », “Off-peak €0.2068 · Peak €0.2700 per kWh” (option-agnostic: every key of `rates`). */
export function fmtRates(row: PriceRow): string {
  const keys = Object.keys(row.rates).sort((a, b) => rateRank(a) - rateRank(b) || a.localeCompare(b));
  return m.inspector.rates(keys.map((k) => [m.inspector.rateLabels[k] ?? k, fmtAmount(row.rates[k], 4)]));
}

/** The price rows of a bucket, one per line; a row that started inside the bucket says since when. */
export function pricesText(prices: PriceRow[]): string {
  return prices.map((p, i) => (i > 0 ? m.inspector.since(fmtDay(p.valid_from)) : '') + fmtRates(p)).join('\n');
}

const inside = (a: Span, b: Span) => a.from >= b.from && a.to <= b.to;
const same = (a: Span, b: Span) => a.from === b.from && a.to === b.to;

/** The parts as they are shown: matched to the shown total so they add up (L1), or alone without a total. */
const shownParts = (total: number | null, parts: (number | null)[], digits: number): (number | null)[] =>
  total == null ? parts : matchParts(total, parts, digits).parts;

export function inspectBucket(b: EnergySummary, ctx: BucketCtx): Inspection {
  const rows: Row[] = [];
  const add = (key: string, label: string, value: string, extra: Partial<Row> = {}) => rows.push({ key, label, value, ...extra });
  const kwh = b.kwh;
  const rad = b.radiators;
  const radEst = !!rad && (rad.interpolated || rad.apportioned);
  const split = b.estimated_split;
  if (kwh != null) add('home', m.inspector.home, fmtKwhExact(matchParts(kwh, [], 2).total));
  const [hc, hp] = shownParts(kwh, [b.hc_kwh, b.hp_kwh], 2);
  if (b.hc_kwh != null) add('hc', m.inspector.hc, fmtKwhExact(hc), { est: split });
  if (b.hp_kwh != null) add('hp', m.inspector.hp, fmtKwhExact(hp), { est: split });
  if (kwh && b.hc_kwh != null) add('hc_share', m.inspector.hcShare, fmtPct1(b.hc_kwh / kwh), { sub: true, est: split });
  // Radiator sums count elapsed days only (never today); null means nothing is known there yet.
  const running = !!ctx.today && ctx.span.from <= ctx.today && ctx.today < ctx.span.to;
  const [radShown, restShown] = shownParts(kwh, [rad?.kwh ?? null, b.rest_kwh], 2);
  if (rad) add('radiators', m.inspector.radiators, fmtKwhExact(radShown), { est: radEst });
  else if (ctx.radiators && !(ctx.today && ctx.span.from > ctx.today)) {
    add('radiators', m.inspector.radiators, '—', { note: running ? m.inspector.radToday : m.inspector.radNone });
  }
  if (b.rest_kwh != null) add('rest', m.inspector.rest, fmtKwhExact(restShown), { est: radEst });
  // Only when every radiator was measured over every day: then the common days are all the days.
  if (rad && b.rest_kwh != null && kwh) add('rad_share', m.inspector.radShare, fmtPct1(rad.kwh / kwh), { est: radEst });
  if (b.eur != null) {
    const [energy, subscription] = shownParts(b.eur, [b.energy_eur, b.subscription_eur], 2);
    // Guard: with both lines known and not adding up to the total (they should, the backend sums the rounded
    // lines), the cost is shown as the sum of the lines shown, so what is on screen always adds up.
    const lines = energy != null && subscription != null ? Math.round((energy + subscription) * 100) / 100 : null;
    const total = matchParts(b.eur, [], 2).total;
    add('cost', m.inspector.cost, fmtEurExact(lines ?? total), { est: split });
    if (b.energy_eur != null) add('energy', m.inspector.energy, fmtEurExact(energy), { sub: true, est: split });
    if (b.subscription_eur != null) add('subscription', m.inspector.subscription, fmtEurExact(subscription), { sub: true });
    if (b.prices.length) add('prices', m.inspector.prices, pricesText(b.prices));
  } else if (b.subscription_eur != null) {
    // A counted day pays its subscription even without Linky energy: the cost is unknown (never the subscription
    // alone), and the subscription stays, so the « dont abonnement » column adds up to the period's.
    add('cost', m.inspector.cost, '—', { note: m.inspector.costUnknown });
    add('subscription', m.inspector.subscription, fmtEurExact(b.subscription_eur), { sub: true });
  }
  if (kwh && b.energy_eur != null) add('avg_price', m.inspector.avgPrice, fmtPrice(b.energy_eur / kwh), { est: split });
  const per = ctx.period;
  if (per && kwh != null && per.kwh && inside(ctx.span, per.span) && !same(ctx.span, per.span)) {
    add('period_share', m.inspector.periodShare, fmtPct1(kwh / per.kwh));
  }
  if (ctx.group !== 'day' && kwh != null && b.present_days > 0) add('per_day', m.inspector.perDay, fmtKwhExact(kwh / b.present_days));

  const notes: string[] = [];
  if (b.missing_days > 0 && kwh != null) notes.push(m.inspector.missing(b.missing_days));
  if (b.missing_days > 0 && b.eur != null) notes.push(m.inspector.notCounted(b.missing_days));
  if (split) notes.push(m.inspector.estimatedSplit);
  if (rad && rad.coverage != null && rad.coverage < 1) notes.push(m.inspector.coverage(fmtPct1(rad.coverage)));
  if (rad && running) notes.push(m.inspector.radUntilYesterday);
  if (b.retro_priced && b.prices.length) notes.push(m.inspector.retro(fmtDay(b.prices[0].valid_from)));

  const empty = (ctx.linky ?? true) && kwh == null ? (ctx.group === 'day' ? m.inspector.noLinkyDay : m.inspector.noLinkyPeriod) : null;
  const said = spokenTitle(ctx.group, ctx.span);
  const spoken =
    kwh != null
      ? `${said}, ${fmtAmount(kwh, 2)} ${m.inspector.kwhWord}${b.eur != null ? `, ${fmtAmount(b.eur, 2)} ${m.inspector.eurWord}` : ''}`
      : rad
        ? `${said}, ${m.inspector.radiatorsSpoken} ${fmtAmount(rad.kwh, 2)} ${m.inspector.kwhWord}`
        : `${said}, ${m.inspector.noData}`;
  return { title: periodTitle(ctx.group, ctx.span), rows, notes, empty, spoken };
}

export interface InspectionTable {
  columns: { key: string; label: string }[];
  rows: { head: string; cells: string[] }[];
}

/** The visually hidden table behind a chart: one column per row kind, « — » where a bucket lacks it. */
export function inspectionTable(items: { head: string; ins: Inspection }[], order: readonly string[] = ROW_ORDER): InspectionTable {
  const labels = new Map<string, string>();
  for (const { ins } of items) for (const r of ins.rows) if (!labels.has(r.key)) labels.set(r.key, r.label);
  const rank = (k: string) => {
    const i = order.indexOf(k);
    return i < 0 ? order.length : i;
  };
  const columns = [...labels].map(([key, label]) => ({ key, label })).sort((a, b) => rank(a.key) - rank(b.key));
  if (items.some(({ ins }) => ins.notes.length || ins.empty)) columns.push({ key: 'quality', label: m.inspector.quality });
  return {
    columns,
    rows: items.map(({ head, ins }) => ({
      head,
      cells: columns.map((c) => {
        if (c.key === 'quality') return [ins.empty, ...ins.notes].filter(Boolean).join(' · ') || '—';
        const r = ins.rows.find((x) => x.key === c.key);
        return r ? `${r.value.replaceAll('\n', m.inspector.lineSep)}${r.est ? ` ${m.inspector.est}` : ''}${r.note ? ` (${r.note})` : ''}` : '—';
      })
    }))
  };
}

const clock = (minuteOfDay: number) => {
  const mins = ((minuteOfDay % 1440) + 1440) % 1440;
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
};
const startMinute = (ms: number) => {
  const p = parisParts(ms);
  return p.hour * 60 + p.minute;
};

/**
 * « 18:30–19:00 ». The end is the start plus `minutes` on the start's own wall clock, so a half-hour never
 * reads backwards. On the repeated autumn hour only, a suffix names the offset of that interval:
 * « 02:30–03:00 (heure d’été) » then « 02:00–02:30 (heure d’hiver) ».
 */
export function intervalLabel(iv: EnergyInterval, all: EnergyInterval[]): string {
  const from = startMinute(iv.ts * 1000);
  const label = `${clock(from)}–${clock(from + iv.minutes)}`;
  const repeated = all.some((o) => o.ts !== iv.ts && startMinute(o.ts * 1000) === from);
  if (!repeated) return label;
  return `${label} ${parisOffsetMinutes(iv.ts * 1000) === 120 ? m.inspector.summer : m.inspector.winter}`;
}

/** The room's mean temperature and setpoint over [ts, ts + minutes), or null below half the 5-min samples. */
export function roomInterval(
  samples: RoomSample[] | null | undefined,
  ts: number,
  minutes: number
): { temperature: number | null; setpoint: number | null } {
  const within = (samples ?? []).filter((s) => s.ts >= ts && s.ts < ts + minutes * 60);
  const need = Math.ceil(minutes / 10);
  const mean = (k: 'temperature' | 'setpoint') => {
    const v = within.map((s) => s[k]).filter((x): x is number => x != null);
    return v.length >= need ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100 : null;
  };
  return { temperature: mean('temperature'), setpoint: mean('setpoint') };
}

function rateText(f: number, boundary: boolean): string {
  const base = f >= 1 ? m.inspector.offpeak : f <= 0 ? m.inspector.peak : m.inspector.partial(Math.round(f * 100));
  return boundary ? `≈${NB}${base}` : base;
}

export interface ReadoutCtx {
  intervals: EnergyInterval[];
  samples?: RoomSample[] | null;
  /** The room the samples are from. */
  room?: string | null;
  tariff: boolean;
}

/** The scrubber readout for one interval. Its rows are fixed for the day, so the row never reflows. */
export function readInterval(iv: EnergyInterval | null, ctx: ReadoutCtx): Inspection {
  const any = (f: (x: EnergyInterval) => unknown) => ctx.intervals.some((x) => f(x) != null);
  const rows: Row[] = [
    { key: 'power', label: m.inspector.power, value: iv ? fmtW(iv.w) : '—' },
    { key: 'energy', label: m.inspector.energyWh, value: iv ? fmtWh(iv.wh) : '—' }
  ];
  if (ctx.tariff && any((x) => x.offpeak)) {
    // A chosen half-hour without a price says why (spec §9.1); nothing chosen is the idle « — ».
    const why = (v: number | null | undefined) => (iv && v == null ? m.inspector.noPrice : undefined);
    rows.push(
      {
        key: 'rate',
        label: m.inspector.rate,
        value: iv?.offpeak != null ? rateText(iv.offpeak, iv.boundary) : '—',
        est: iv?.offpeak != null && iv.boundary,
        note: why(iv?.offpeak)
      },
      { key: 'price', label: m.inspector.price, value: fmtPrice(iv?.price), note: why(iv?.price) },
      { key: 'cost', label: m.inspector.halfCost, value: fmtEurHalfHour(iv?.eur), note: why(iv?.eur) }
    );
  }
  // The radiator rows belong to every day that had a radiator; an unknown sum (one radiator without a figure,
  // e.g. a held increase in the latest half-hours) reads « — » with how many were measured, never a partial sum.
  if (ctx.intervals.some((x) => x.radiators_wh != null || x.radiators_total > 0)) {
    const r = iv?.radiators_wh ?? null;
    const est = !!iv && r != null && (iv.radiators_interp || iv.radiators_apportioned);
    const note = iv && r == null && iv.radiators_total > 0 ? m.inspector.radMeasured(iv.radiators_known, iv.radiators_total) : undefined;
    // The rest is what the meter shows minus the radiators; below zero it is a measurement gap, never a figure.
    const rest = iv && r != null ? Math.round(iv.wh) - Math.round(r) : null;
    rows.push(
      { key: 'radiators', label: m.inspector.radiators, value: fmtWh(r), est, note },
      {
        key: 'rest',
        label: m.inspector.restShort,
        value: rest != null && rest >= 0 ? fmtWh(rest) : '—',
        est: est && rest != null && rest >= 0,
        note: rest != null && rest < 0 ? m.inspector.restNegative : undefined
      }
    );
  }
  if (ctx.samples?.length) {
    const t = iv ? roomInterval(ctx.samples, iv.ts, iv.minutes) : { temperature: null, setpoint: null };
    rows.push({
      key: 'temperature',
      label: m.inspector.temperature(ctx.room),
      value: t.temperature != null ? `${fmtTemp(t.temperature)} · ${m.inspector.setpoint} ${fmtTemp(t.setpoint)}` : '—'
    });
  }
  const title = iv ? intervalLabel(iv, ctx.intervals) : '—';
  return { title, rows, notes: [], empty: null, spoken: iv ? `${title}, ${fmtW(iv.w)}, ${fmtWh(iv.wh)}` : '' };
}
