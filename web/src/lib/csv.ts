/**
 * The Énergie CSV export (spec §3.2.9): built in the browser from the same JSON the page shows,
 * never a second computation and no server endpoint. A machine contract documented in
 * web/README.md: French headers in every locale, UTF-8 with BOM, « ; », CRLF, dot decimals, ISO
 * local times with their offset, an empty cell for a missing value. No PDL, token, email or id.
 *
 * Every figure is the API's own (kWh to 3 decimals, € to 2, as the backend rounds them), so a
 * bucket exports what the page shows for it, and a day's € are the same in whatever period they
 * are exported (the backend anchors them on 1 January).
 */
import type { EnergyDay, EnergyReport, EnergySummary, PriceRow } from './api/types';
import { bucketSpan, type Span } from './energy';
import type { RoomRow } from './roomEnergy';
import { isoParis, parisDayStart } from './time';

export const BOM = '﻿';
export const ENERGY_HEADER = [
  'periode', 'debut', 'fin', 'maison_kwh', 'hc_kwh', 'hp_kwh', 'split_estime', 'radiateurs_kwh', 'radiateurs_interp',
  'reste_kwh', 'energie_eur', 'abonnement_eur', 'total_eur', 'prix', 'jours_manquants',
  // R1: a partial radiator sum (coverage < 1, or a running period counted up to yesterday) never reads as whole.
  'radiateurs_couverture'
];
export const CURVE_HEADER = ['debut', 'fin', 'minutes', 'wh', 'w_moyen', 'part_hc', 'couleur_tempo', 'prix', 'eur', 'radiateurs_wh'];
export const ROOMS_HEADER = [
  'piece', 'radiateur', 'kwh', 'part', 'hc_kwh', 'hp_kwh', 'eur', 'temp_moy', 'consigne_moy', 'heures_chauffe', 'couverture', 'depuis'
];

export interface CsvFile {
  name: string;
  text: string;
}

const plain = new Map<number, Intl.NumberFormat>();
/** A number with fixed decimals and a dot; an empty cell for a missing value (never 0). It rounds as the page's
 * formatters do (Intl: a decimal tie such as 32.535 rounds up, where binary `toFixed` gives 32.53), and a value
 * that rounds to zero has no minus sign. */
export function csvNum(v: number | null | undefined, digits: number): string {
  if (v == null || !Number.isFinite(v)) return '';
  let f = plain.get(digits);
  if (!f) {
    f = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
      useGrouping: false,
      signDisplay: 'negative'
    });
    plain.set(digits, f);
  }
  return f.format(v);
}

/** A text cell: quoted when it holds « ; », a quote or a line break; a leading =, +, -, @, tab or CR
 * is prefixed with « ' » so a spreadsheet never runs it as a formula. */
export function csvText(v: string | null | undefined): string {
  if (v == null) return '';
  const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[;"\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

const bool = (b: boolean) => (b ? '1' : '0');
const file = (name: string, header: string[], rows: string[][]): CsvFile => ({
  name,
  text: BOM + [header, ...rows].map((r) => r.join(';')).join('\r\n') + '\r\n'
});
const dayStart = (iso: string) => isoParis(parisDayStart(iso));

/** « hc=0.2068|hp=0.2700 »; several rows: « 2026-01-01:hc=…|hp=… 2026-09-16:hc=…|hp=… ». */
export function pricesCsv(prices: PriceRow[]): string {
  const one = (p: PriceRow) =>
    Object.keys(p.rates)
      .sort()
      .map((k) => `${k}=${csvNum(p.rates[k], 4)}`)
      .join('|');
  if (prices.length <= 1) return prices.map(one).join('');
  return prices.map((p) => `${p.valid_from}:${one(p)}`).join(' ');
}

function summaryRow(label: string, s: EnergySummary, span: Span): string[] {
  const rad = s.radiators;
  return [
    csvText(label),
    dayStart(span.from),
    dayStart(span.to),
    csvNum(s.kwh, 3),
    csvNum(s.hc_kwh, 3),
    csvNum(s.hp_kwh, 3),
    s.kwh == null ? '' : bool(s.estimated_split),
    csvNum(rad?.kwh, 3),
    rad ? bool(rad.interpolated || rad.apportioned) : '',
    csvNum(s.rest_kwh, 3),
    csvNum(s.energy_eur, 2),
    csvNum(s.subscription_eur, 2),
    csvNum(s.eur, 2),
    csvText(pricesCsv(s.prices)),
    String(s.missing_days),
    csvNum(rad?.coverage, 4)
  ];
}

/** The selected period's bars, then its total (the hero's figures). */
export function energyCsv(chart: EnergyReport, main: EnergyReport, period: Span): CsvFile {
  const rows = chart.buckets
    .map((b) => ({ b, span: bucketSpan(b.key, chart.group) }))
    .filter(({ span }) => span.from >= period.from && span.to <= period.to)
    .map(({ b, span }) => summaryRow(b.key, b, span));
  rows.push(summaryRow('total', main.period, period));
  return file(`energie_${period.from}_${period.to}_${chart.group}.csv`, ENERGY_HEADER, rows);
}

/** The Courbe's day, one row per interval (46, 48 or 50). `couleur_tempo` stays empty until Plan 9. */
export function curveCsv(day: EnergyDay): CsvFile {
  const rows = day.intervals.map((iv) => [
    isoParis(iv.ts * 1000),
    isoParis((iv.ts + iv.minutes * 60) * 1000),
    String(iv.minutes),
    csvNum(iv.wh, 0),
    csvNum(iv.w, 0),
    csvNum(iv.offpeak, 4),
    '',
    csvNum(iv.price, 4),
    csvNum(iv.eur, 4),
    csvNum(iv.radiators_wh, 0)
  ]);
  return file(`courbe_${day.date}.csv`, CURVE_HEADER, rows);
}

/** Par pièce et par radiateur: each room, then its radiators (names only). A room's kWh sums its radiators
 * with a figure; their own rows carry `couverture`, so a partial room sum can be told from a whole one. */
export function roomsCsv(rows: RoomRow[], span: Span): CsvFile {
  const out: string[][] = [];
  for (const r of rows) {
    out.push([
      csvText(r.name), '', csvNum(r.kwh, 3), r.kwh != null ? csvNum(r.fraction, 4) : '', csvNum(r.hc, 3), csvNum(r.hp, 3),
      csvNum(r.eur, 2), csvNum(r.temp, 1), csvNum(r.setpoint, 1), csvNum(r.hours, 1), '', ''
    ]);
    for (const x of r.radiators) {
      out.push([
        csvText(r.name), csvText(x.name), csvNum(x.kwh, 3), '', csvNum(x.hc, 3), csvNum(x.hp, 3), csvNum(x.eur, 2),
        csvNum(x.temp, 1), csvNum(x.setpoint, 1), csvNum(x.hours, 1), csvNum(x.coverage, 4), x.from ?? ''
      ]);
    }
  }
  return file(`pieces_${span.from}_${span.to}.csv`, ROOMS_HEADER, out);
}

/** Hands the file to the browser as a download (a Blob URL, revoked right after). */
export function download({ name, text }: CsvFile): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
