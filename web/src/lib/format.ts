import { INTL, locale, m, type Locale } from '$lib/i18n';

const NB = '\u00a0';
const ZONE = 'Europe/Paris';

interface Formats {
  /** Fixed decimals 0 to 4, the locale's grouping (fr: U+202F, en: ","). */
  fixed: readonly [Intl.NumberFormat, Intl.NumberFormat, Intl.NumberFormat, Intl.NumberFormat, Intl.NumberFormat];
  clock: Intl.DateTimeFormat;
  dateTime: Intl.DateTimeFormat;
  dayLong: Intl.DateTimeFormat;
  monthYear: Intl.DateTimeFormat;
}
const cache = new Map<Locale, Formats>();
const parisDay = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });

/** The formatters of the active locale (read through locale.current, so callers re-render on a switch). */
function f(): Formats {
  const l = locale.current;
  let x = cache.get(l);
  if (!x) {
    const tag = INTL[l];
    const n = (d: number) =>
      new Intl.NumberFormat(tag, d === 0 ? { maximumFractionDigits: 0 } : { minimumFractionDigits: d, maximumFractionDigits: d });
    // h23 and Paris time in both languages: never the browser's or the locale's default.
    const t = { timeZone: ZONE, hourCycle: 'h23' } as const;
    x = {
      fixed: [n(0), n(1), n(2), n(3), n(4)],
      clock: new Intl.DateTimeFormat(tag, { ...t, hour: '2-digit', minute: '2-digit' }),
      dateTime: new Intl.DateTimeFormat(tag, { ...t, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
      dayLong: new Intl.DateTimeFormat(tag, { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }),
      monthYear: new Intl.DateTimeFormat(tag, { timeZone: 'UTC', month: 'long', year: 'numeric' })
    };
    cache.set(l, x);
  }
  return x;
}
const whole = () => f().fixed[0];
const one = () => f().fixed[1];
const two = () => f().fixed[2];
const three = () => f().fixed[3];
const four = () => f().fixed[4];
const english = () => locale.current === 'en';

const bad = (v: number | null | undefined): v is null | undefined => v == null || Number.isNaN(v);

/** Formats with the true minus (U+2212); a figure that rounds to zero carries no sign (either decimal mark). */
function signed(fmt: Intl.NumberFormat, v: number): string {
  return fmt.format(v).replace(/^-(0(?:[.,]0+)?)(?![\d.,])/, '$1').replace(/^-/, '−');
}
/** A figure (with its sign, if any) and the euro where the language puts it: « −3,50 € », “−€3.50”. */
function euro(s: string): string {
  if (!english()) return `${s}${NB}€`;
  const sign = /^[+−]/.test(s) ? s[0] : '';
  return `${sign}€${s.slice(sign.length)}`;
}
/** « 42 % » (no-break space) in French, “42%” in English. */
const pct = (s: string) => (english() ? `${s}%` : `${s}${NB}%`);

export function fmtTemp(v: number | null | undefined, unit = true): string {
  if (bad(v)) return '—';
  const s = signed(one(), v);
  return unit ? `${s}${NB}°C` : s;
}

export function fmtDelta(v: number | null | undefined): string {
  if (bad(v)) return '—';
  const a = Math.abs(v);
  return `${a === 0 ? '' : '−'}${one().format(a)}${NB}°C`;
}

/** "2 050 kWh", "12,5 kWh" (en "2,050 kWh"); `unit: false` for a column whose header carries the unit. */
export function fmtKwh(v: number | null | undefined, unit = true): string {
  if (bad(v)) return '—';
  const s = signed(Math.abs(v) >= 100 ? whole() : one(), v);
  return unit ? `${s}${NB}kWh` : s;
}

export function fmtWh(v: number | null | undefined): string {
  if (bad(v)) return '—';
  return `${signed(whole(), v)}${NB}Wh`;
}

export function fmtTime(ms: number): string {
  return f().clock.format(new Date(ms));
}

export function fmtDateTime(ms: number): string {
  return f().dateTime.format(new Date(ms));
}

export function fmtAgo(ms: number, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - ms) / 1000));
  if (s < 60) return m.ago.justNow;
  if (s < 3600) return m.ago.minutes(Math.floor(s / 60));
  if (s < 86_400) return m.ago.hours(Math.floor(s / 3600));
  return m.ago.on(fmtDateTime(ms));
}

/** fr "0,2068 €/kWh"; en "€0.2068/kWh" (a negative: « −0,1000 €/kWh », “−€0.1000/kWh”). */
export function fmtPrice(v: number | null | undefined): string {
  if (bad(v)) return '—';
  const s = signed(four(), v);
  return english() ? `${euro(s)}/kWh` : `${s}${NB}€/kWh`;
}

/** A bare figure for a column whose header carries the unit: "0,2068", "16,20" (en "0.2068", "16.20"). */
export function fmtAmount(v: number | null | undefined, digits: 2 | 4): string {
  if (bad(v)) return '—';
  return signed(digits === 4 ? four() : two(), v);
}

export function fmtPct(share: number | null | undefined): string {
  if (bad(share)) return '—';
  return pct(signed(whole(), share * 100));
}

/**
 * "0,2068", "19.5", "1 234,5", "1,234.5" → number, in either language (prices are pasted from
 * bills); null for anything else, negatives included. Spaces are ignored. The rule:
 * - a lone comma or a lone point is the decimal mark, whatever the language: "1,234" is 1.234
 *   (Kelvin's inputs, €/month and €/kWh, never reach 1 000);
 * - with both marks, the last one is the decimal mark and the other may only group thousands
 *   ("1.234,5", "1,234,567.5"); anything else, like "1,2.3" or "12,34.5", is ambiguous → null.
 */
export function parseDecimal(s: string): number | null {
  let t = s.trim().replace(/[\s\u00a0\u202f]/g, '');
  if (t.includes(',') && t.includes('.')) {
    const dec = Math.max(t.lastIndexOf(','), t.lastIndexOf('.'));
    const group = t[dec] === ',' ? '.' : ',';
    const int = t.slice(0, dec);
    if (!(group === '.' ? /^\d{1,3}(\.\d{3})+$/ : /^\d{1,3}(,\d{3})+$/).test(int)) return null;
    t = `${int.replaceAll(group, '')}.${t.slice(dec + 1)}`;
  } else t = t.replace(',', '.');
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : null;
}

const isoNoon = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`);

export function fmtDay(iso: string): string {
  const d = isoNoon(iso);
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
}

export function fmtDateLong(iso: string): string {
  return f().dayLong.format(isoNoon(iso));
}

/** Month and year inside a sentence, in the language's own case: « septembre 2026 », “September 2026”. */
export function monthYear(iso: string): string {
  return f().monthYear.format(isoNoon(iso));
}

/** Month and year as a title: « Octobre 2026 », “October 2026”. */
export function monthName(iso: string): string {
  const s = monthYear(iso);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Today's date in Paris as YYYY-MM-DD. */
export function parisTodayIso(now = Date.now()): string {
  return parisDay.format(new Date(now));
}

// ---- Énergie precision (spec §3.2.1): one place for every Énergie figure, in the active language. ----

/** Decimals of a hero or sentence kWh figure: 1 below 1 000 kWh, else 0 (judged on the rounded value). */
export function kwhDigits(v: number): 0 | 1 {
  return Math.abs(Math.round(v * 10) / 10) < 1000 ? 1 : 0;
}

/** Hero and sentence kWh: « 412,6 kWh », « 2 050 kWh » (en “412.6 kWh”, “2,050 kWh”). */
export function fmtKwhHero(v: number | null | undefined, unit = true): string {
  if (bad(v)) return '—';
  const s = signed(f().fixed[kwhDigits(v)], v);
  return unit ? `${s}${NB}kWh` : s;
}

/** Tooltip and table kWh, 2 decimals: « 22,04 kWh ». */
export function fmtKwhExact(v: number | null | undefined, unit = true): string {
  if (bad(v)) return '—';
  return unit ? `${signed(two(), v)}${NB}kWh` : signed(two(), v);
}

/**
 * Largest-remainder rounding: integers proportional to `values` that sum to `units` exactly
 * (L3). Nulls stay null; negatives count as 0; all zeros give zeros.
 */
export function largestRemainder(values: (number | null | undefined)[], units: number): (number | null)[] {
  const w = values.map((v) => (bad(v) ? null : Math.max(0, v)));
  const sum = w.reduce<number>((a, v) => a + (v ?? 0), 0);
  if (sum <= 0) return w.map((v) => (v == null ? null : 0));
  const raw = w.map((v) => (v == null ? null : (v / sum) * units));
  const out = raw.map((r) => (r == null ? null : Math.floor(r)));
  let left = units - out.reduce<number>((a, v) => a + (v ?? 0), 0);
  const order = raw
    .map((r, i) => ({ i, f: r == null ? -1 : r - Math.floor(r) }))
    .filter((x) => x.f >= 0)
    .sort((a, b) => b.f - a.f || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    out[i] = (out[i] as number) + 1;
    left--;
  }
  return out;
}

/** Percentages of a set that must total 100 (« 33,3 % · 66,7 % », “33.3% · 66.7%”), largest remainder. */
export function fmtShares(values: (number | null | undefined)[], digits: 0 | 1 = 0): string[] {
  const k = 10 ** digits;
  if (!values.some((v) => !bad(v) && v > 0)) return values.map(() => '—');
  return largestRemainder(values, 100 * k).map((u) => (u == null ? '—' : pct(signed(f().fixed[digits], u / k))));
}

/**
 * A total and its parts at `digits` decimals, as numbers (L1): when the parts add up to the total they
 * are allocated by largest remainder so the shown parts add up to the shown total. Parts that do not
 * (one is missing, or they are not a decomposition) are rounded on their own.
 */
export function matchParts(
  total: number | null | undefined,
  parts: (number | null | undefined)[],
  digits: number
): { total: number | null; parts: (number | null)[] } {
  const k = 10 ** digits;
  if (bad(total)) return { total: null, parts: parts.map(() => null) };
  // The epsilon keeps a decimal tie (32.535 × 100 = 3253.4999…) rounding up, as Intl does.
  const half = (x: number) => Math.round(Math.abs(x) * k + 1e-6) * Math.sign(x);
  const T = half(total);
  const alone = parts.map((p) => (bad(p) ? null : half(p) / k));
  const known = parts.length > 0 && parts.every((p) => !bad(p) && p >= 0);
  const sum = known ? parts.reduce<number>((a, p) => a + (p as number), 0) : NaN;
  if (!known || T < 0 || Math.abs(sum - total) * k > 0.5 + 1e-6) return { total: T / k, parts: alone };
  // Hamilton's method on the parts' own values: floor each, then hand the units the total still
  // needs to the largest remainders.
  const scaled = parts.map((p) => (p as number) * k);
  const out = scaled.map((v) => Math.floor(v + 1e-9));
  let left = T - out.reduce((a, b) => a + b, 0);
  const order = scaled.map((v, i) => ({ i, f: v - out[i] })).sort((a, b) => b.f - a.f || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    out[i] += 1;
    left--;
  }
  return { total: T / k, parts: out.map((u) => u / k) };
}

/** A kWh total and its parts at the total's decimals, formatted (see `matchParts`). */
export function fmtKwhParts(
  total: number | null | undefined,
  parts: (number | null | undefined)[]
): { total: string; parts: string[] } {
  if (bad(total)) return { total: '—', parts: parts.map(() => '—') };
  const d = kwhDigits(total);
  const fmt = (v: number | null) => (v == null ? '—' : `${signed(f().fixed[d], v)}${NB}kWh`);
  const shown = matchParts(total, parts, d);
  return { total: fmt(shown.total), parts: shown.parts.map(fmt) };
}

/** Mean power: « 734 W » below 1 kW, then « 3,42 kW » (en “3.42 kW”). */
export function fmtW(v: number | null | undefined): string {
  if (bad(v)) return '—';
  const w = Math.round(v);
  return Math.abs(w) < 1000 ? `${signed(whole(), w)}${NB}W` : `${signed(two(), v / 1000)}${NB}kW`;
}

/** Hero and sentence euros: 2 decimals below 1 000 €, then whole euros (« 98,40 € », “€98.40”, “€1,234”). */
export function fmtEurHero(v: number | null | undefined): string {
  if (bad(v)) return '—';
  return euro(signed(Math.abs(Math.round(v * 100) / 100) < 1000 ? two() : whole(), v));
}

/** Tooltip and table euros, always 2 decimals: « 1 234,56 € », “€1,234.56”; bare with `unit: false`. */
export function fmtEurExact(v: number | null | undefined, unit = true): string {
  if (bad(v)) return '—';
  return unit ? euro(signed(two(), v)) : signed(two(), v);
}

/** A half-hour's cost, 3 decimals: « 0,152 € », “€0.152”. */
export function fmtEurHalfHour(v: number | null | undefined): string {
  if (bad(v)) return '—';
  return euro(signed(three(), v));
}

/** A share with one decimal: 0.384 → « 38,4 % », “38.4%”. */
export function fmtPct1(share: number | null | undefined): string {
  if (bad(share)) return '—';
  return pct(signed(one(), share * 100));
}

/** Rounds the magnitude, then reapplies the sign: ties are symmetric (−0,125 and 0,125 round alike). */
const roundMag = (v: number, k: number) => (Math.sign(v) * Math.round(Math.abs(v) * k)) / k;

/** A relative change as a whole percentage with its sign: 0.12 → « +12 % », “+12%”; null stays null (omitted). */
export function fmtChangeShare(change: number | null | undefined): string | null {
  if (bad(change)) return null;
  const p = roundMag(change * 100, 1);
  if (p === 0) return pct('0');
  return `${p > 0 ? '+' : '−'}${pct(whole().format(Math.abs(p)))}`;
}

/** An absolute difference with its sign, 2 decimals: « −14,20 kWh », « +3,61 € » (en “+€3.61”). */
export function fmtSigned(v: number | null | undefined, unit: 'kWh' | '€'): string {
  if (bad(v)) return '—';
  const r = roundMag(v, 100);
  const s = r === 0 ? two().format(0) : `${r > 0 ? '+' : '−'}${two().format(Math.abs(r))}`;
  return unit === '€' ? euro(s) : `${s}${NB}kWh`;
}

/** A price difference with its sign, 4 decimals: « −0,0632 €/kWh », “−€0.0632/kWh”. */
export function fmtSignedPrice(v: number | null | undefined): string {
  if (bad(v)) return '—';
  const r = roundMag(v, 10_000);
  const sign = r === 0 ? '' : r > 0 ? '+' : '−';
  const s = four().format(Math.abs(r));
  return english() ? `${sign}€${s}/kWh` : `${sign}${s}${NB}€/kWh`;
}

/** Hours with one decimal: « 2,8 h »; `unit: false` under a header that carries it. */
export function fmtHours(v: number | null | undefined, unit = true): string {
  if (bad(v)) return '—';
  return unit ? `${signed(one(), v)}${NB}h` : signed(one(), v);
}
