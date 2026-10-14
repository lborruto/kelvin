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
import { plural } from './plural';
import { parisOffsetMinutes, parisParts } from './time';

const NB = '\u00a0';

export const COPY = {
  home: 'Maison',
  hc: 'Heures creuses',
  hp: 'Heures pleines',
  hcShare: 'dont HC',
  radiators: 'Radiateurs',
  rest: 'Reste de la maison',
  radShare: 'Part des radiateurs',
  cost: 'Coût estimé',
  energy: 'dont énergie',
  subscription: 'dont abonnement',
  prices: 'Prix appliqués',
  avgPrice: 'Prix moyen',
  periodShare: 'Part de la période',
  perDay: 'Moyenne par jour',
  quality: 'Qualité',
  since: (day: string) => `depuis le ${day}${NB}: `,
  noLinkyDay: 'Aucune donnée Linky pour ce jour',
  noLinkyPeriod: 'Aucune donnée Linky pour cette période',
  missing: (n: number) => plural(n, 'jour manquant', 'jours manquants'),
  notCounted: (n: number) => `énergie de ${plural(n, 'jour manquant', 'jours manquants')} non comptée`,
  estimatedSplit: `courbe absente${NB}: HC/HP estimés`,
  coverage: (pct: string) => `radiateurs${NB}: couverture ${pct}`,
  retro: (day: string) => `prix du ${day} appliqué aux jours antérieurs`,
  radToday: 'jour en cours, compté une fois terminé',
  radNone: 'aucun relevé de radiateur',
  radUntilYesterday: `radiateurs${NB}: jusqu’à hier`,
  radMeasured: (k: number, n: number) => `${k} sur ${plural(n, 'radiateur')} ${n > 1 ? 'mesurés' : 'mesuré'}`,
  est: 'est.',
  kwhWord: 'kilowattheures',
  eurWord: 'euros',
  radiatorsSpoken: 'radiateurs',
  noData: 'aucune donnée Linky',
  power: 'Puissance moyenne',
  energyWh: 'Énergie',
  rate: 'Tarif',
  price: 'Prix',
  halfCost: 'Coût',
  restShort: 'Reste',
  restNegative: `Radiateurs au-dessus du compteur${NB}: écart de mesure`,
  temperature: 'Température',
  setpoint: 'consigne',
  offpeak: 'Heures creuses',
  peak: 'Heures pleines',
  partial: (pct: number) => `HC ${pct}${NB}%`,
  summer: '(heure d’été)',
  winter: '(heure d’hiver)',
  rateLabels: {
    base: 'Base', hc: 'HC', hp: 'HP', blue_hc: 'Bleu HC', blue_hp: 'Bleu HP', white_hc: 'Blanc HC', white_hp: 'Blanc HP',
    red_hc: 'Rouge HC', red_hp: 'Rouge HP'
  } as Record<string, string>
} as const;

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
  'maison', 'hc', 'hp', 'hc_share', 'radiateurs', 'reste', 'part_rad', 'cout', 'energie', 'abonnement', 'prix',
  'prix_moyen', 'part_periode', 'moyenne'
] as const;
export const READOUT_ORDER = ['puissance', 'energie', 'tarif', 'prix', 'cout', 'radiateurs', 'reste', 'temperature'] as const;

const RATE_ORDER = Object.keys(COPY.rateLabels);
const rateRank = (k: string) => {
  const i = RATE_ORDER.indexOf(k);
  return i < 0 ? RATE_ORDER.length : i;
};

/** « HC 0,2068 · HP 0,2700 €/kWh » (option-agnostic: every key of `rates`). */
export function fmtRates(row: PriceRow): string {
  const keys = Object.keys(row.rates).sort((a, b) => rateRank(a) - rateRank(b) || a.localeCompare(b));
  return `${keys.map((k) => `${COPY.rateLabels[k] ?? k} ${fmtAmount(row.rates[k], 4)}`).join(' · ')}${NB}€/kWh`;
}

/** The price rows of a bucket, one per line; a row that started inside the bucket says since when. */
export function pricesText(prices: PriceRow[]): string {
  return prices.map((p, i) => (i > 0 ? COPY.since(fmtDay(p.valid_from)) : '') + fmtRates(p)).join('\n');
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
  if (kwh != null) add('maison', COPY.home, fmtKwhExact(matchParts(kwh, [], 2).total));
  const [hc, hp] = shownParts(kwh, [b.hc_kwh, b.hp_kwh], 2);
  if (b.hc_kwh != null) add('hc', COPY.hc, fmtKwhExact(hc), { est: split });
  if (b.hp_kwh != null) add('hp', COPY.hp, fmtKwhExact(hp), { est: split });
  if (kwh && b.hc_kwh != null) add('hc_share', COPY.hcShare, fmtPct1(b.hc_kwh / kwh), { sub: true, est: split });
  // Radiator sums count elapsed days only (never today); null means nothing is known there yet.
  const running = !!ctx.today && ctx.span.from <= ctx.today && ctx.today < ctx.span.to;
  const [radShown, restShown] = shownParts(kwh, [rad?.kwh ?? null, b.rest_kwh], 2);
  if (rad) add('radiateurs', COPY.radiators, fmtKwhExact(radShown), { est: radEst });
  else if (ctx.radiators && !(ctx.today && ctx.span.from > ctx.today)) {
    add('radiateurs', COPY.radiators, '—', { note: running ? COPY.radToday : COPY.radNone });
  }
  if (b.rest_kwh != null) add('reste', COPY.rest, fmtKwhExact(restShown), { est: radEst });
  // Only when every radiator was measured over every day: then the common days are all the days.
  if (rad && b.rest_kwh != null && kwh) add('part_rad', COPY.radShare, fmtPct1(rad.kwh / kwh), { est: radEst });
  if (b.eur != null) {
    const [energy, subscription] = shownParts(b.eur, [b.energy_eur, b.subscription_eur], 2);
    // Guard: with both lines known and not adding up to the total (they should, the backend sums the rounded
    // lines), the cost is shown as the sum of the lines shown, so what is on screen always adds up.
    const lines = energy != null && subscription != null ? Math.round((energy + subscription) * 100) / 100 : null;
    const total = matchParts(b.eur, [], 2).total;
    add('cout', COPY.cost, fmtEurExact(lines ?? total), { est: split });
    if (b.energy_eur != null) add('energie', COPY.energy, fmtEurExact(energy), { sub: true, est: split });
    if (b.subscription_eur != null) add('abonnement', COPY.subscription, fmtEurExact(subscription), { sub: true });
    if (b.prices.length) add('prix', COPY.prices, pricesText(b.prices));
  }
  if (kwh && b.energy_eur != null) add('prix_moyen', COPY.avgPrice, fmtPrice(b.energy_eur / kwh), { est: split });
  const per = ctx.period;
  if (per && kwh != null && per.kwh && inside(ctx.span, per.span) && !same(ctx.span, per.span)) {
    add('part_periode', COPY.periodShare, fmtPct1(kwh / per.kwh));
  }
  if (ctx.group !== 'day' && kwh != null && b.present_days > 0) add('moyenne', COPY.perDay, fmtKwhExact(kwh / b.present_days));

  const notes: string[] = [];
  if (b.missing_days > 0 && kwh != null) notes.push(COPY.missing(b.missing_days));
  if (b.missing_days > 0 && b.eur != null) notes.push(COPY.notCounted(b.missing_days));
  if (split) notes.push(COPY.estimatedSplit);
  if (rad && rad.coverage != null && rad.coverage < 1) notes.push(COPY.coverage(fmtPct1(rad.coverage)));
  if (rad && running) notes.push(COPY.radUntilYesterday);
  if (b.retro_priced && b.prices.length) notes.push(COPY.retro(fmtDay(b.prices[0].valid_from)));

  const empty = (ctx.linky ?? true) && kwh == null ? (ctx.group === 'day' ? COPY.noLinkyDay : COPY.noLinkyPeriod) : null;
  const said = spokenTitle(ctx.group, ctx.span);
  const spoken =
    kwh != null
      ? `${said}, ${fmtAmount(kwh, 2)} ${COPY.kwhWord}${b.eur != null ? `, ${fmtAmount(b.eur, 2)} ${COPY.eurWord}` : ''}`
      : rad
        ? `${said}, ${COPY.radiatorsSpoken} ${fmtAmount(rad.kwh, 2)} ${COPY.kwhWord}`
        : `${said}, ${COPY.noData}`;
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
  if (items.some(({ ins }) => ins.notes.length || ins.empty)) columns.push({ key: 'qualite', label: COPY.quality });
  return {
    columns,
    rows: items.map(({ head, ins }) => ({
      head,
      cells: columns.map((c) => {
        if (c.key === 'qualite') return [ins.empty, ...ins.notes].filter(Boolean).join(' · ') || '—';
        const r = ins.rows.find((x) => x.key === c.key);
        return r ? `${r.value.replaceAll('\n', ' ; ')}${r.est ? ` ${COPY.est}` : ''}${r.note ? ` (${r.note})` : ''}` : '—';
      })
    }))
  };
}

const clock = (minuteOfDay: number) => {
  const m = ((minuteOfDay % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
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
  return `${label} ${parisOffsetMinutes(iv.ts * 1000) === 120 ? COPY.summer : COPY.winter}`;
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
  const base = f >= 1 ? COPY.offpeak : f <= 0 ? COPY.peak : COPY.partial(Math.round(f * 100));
  return boundary ? `≈${NB}${base}` : base;
}

export interface ReadoutCtx {
  intervals: EnergyInterval[];
  samples?: RoomSample[] | null;
  tariff: boolean;
}

/** The scrubber readout for one interval. Its rows are fixed for the day, so the row never reflows. */
export function readInterval(iv: EnergyInterval | null, ctx: ReadoutCtx): Inspection {
  const any = (f: (x: EnergyInterval) => unknown) => ctx.intervals.some((x) => f(x) != null);
  const rows: Row[] = [
    { key: 'puissance', label: COPY.power, value: iv ? fmtW(iv.w) : '—' },
    { key: 'energie', label: COPY.energyWh, value: iv ? fmtWh(iv.wh) : '—' }
  ];
  if (ctx.tariff && any((x) => x.offpeak)) {
    rows.push(
      { key: 'tarif', label: COPY.rate, value: iv?.offpeak != null ? rateText(iv.offpeak, iv.boundary) : '—', est: !!iv?.boundary },
      { key: 'prix', label: COPY.price, value: fmtPrice(iv?.price) },
      { key: 'cout', label: COPY.halfCost, value: fmtEurHalfHour(iv?.eur) }
    );
  }
  // The radiator rows belong to every day that had a radiator; an unknown sum (one radiator without a figure,
  // e.g. a held increase in the latest half-hours) reads « — » with how many were measured, never a partial sum.
  if (ctx.intervals.some((x) => x.radiators_wh != null || x.radiators_total > 0)) {
    const r = iv?.radiators_wh ?? null;
    const est = !!iv && r != null && (iv.radiators_interp || iv.radiators_apportioned);
    const note = iv && r == null && iv.radiators_total > 0 ? COPY.radMeasured(iv.radiators_known, iv.radiators_total) : undefined;
    // The rest is what the meter shows minus the radiators; below zero it is a measurement gap, never a figure.
    const rest = iv && r != null ? Math.round(iv.wh) - Math.round(r) : null;
    rows.push(
      { key: 'radiateurs', label: COPY.radiators, value: fmtWh(r), est, note },
      {
        key: 'reste',
        label: COPY.restShort,
        value: rest != null && rest >= 0 ? fmtWh(rest) : '—',
        est: est && rest != null && rest >= 0,
        note: rest != null && rest < 0 ? COPY.restNegative : undefined
      }
    );
  }
  if (ctx.samples?.length) {
    const t = iv ? roomInterval(ctx.samples, iv.ts, iv.minutes) : { temperature: null, setpoint: null };
    rows.push({
      key: 'temperature',
      label: COPY.temperature,
      value: t.temperature != null ? `${fmtTemp(t.temperature)} · ${COPY.setpoint} ${fmtTemp(t.setpoint)}` : '—'
    });
  }
  const title = iv ? intervalLabel(iv, ctx.intervals) : '—';
  return { title, rows, notes: [], empty: null, spoken: iv ? `${title}, ${fmtW(iv.w)}, ${fmtWh(iv.wh)}` : '' };
}
