const NB = ' ';
const one = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const clock = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
const dateTime = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit'
});

const bad = (v: number | null | undefined): v is null | undefined => v == null || Number.isNaN(v);

export function fmtTemp(v: number | null | undefined, unit = true): string {
  if (bad(v)) return '—';
  const s = one.format(v);
  return unit ? `${s}${NB}°C` : s;
}

export function fmtDelta(v: number | null | undefined): string {
  if (bad(v)) return '—';
  const a = Math.abs(v);
  return `${a === 0 ? '' : '−'}${one.format(a)}${NB}°C`;
}

/** "2 050 kWh", "12,5 kWh"; `unit: false` for a column whose header carries the unit. */
export function fmtKwh(v: number | null | undefined, unit = true): string {
  if (bad(v)) return '—';
  const s = v >= 100 ? whole.format(v) : one.format(v);
  return unit ? `${s}${NB}kWh` : s;
}

export function fmtWh(v: number | null | undefined): string {
  if (bad(v)) return '—';
  return `${whole.format(v)}${NB}Wh`;
}

export function fmtTime(ms: number): string {
  return clock.format(new Date(ms));
}

export function fmtDateTime(ms: number): string {
  return dateTime.format(new Date(ms));
}

export function fmtAgo(ms: number, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - ms) / 1000));
  if (s < 60) return 'à l’instant';
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86_400) return `il y a ${Math.floor(s / 3600)} h`;
  return `le ${fmtDateTime(ms)}`;
}

export const MODE_LABEL: Record<string, string> = {
  off: 'Arrêt',
  manual: 'Manuel',
  program: 'Programme',
  other: 'Autre',
  mixed: 'Mixte'
};

export const LEVEL_LABEL: Record<string, string> = {
  comfort: 'Confort',
  eco: 'Éco',
  frostprotection: 'Hors-gel',
  off: 'Repos',
  mixed: 'Mixte'
};
const two = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const four = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const dayLong = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' });
const monthYear = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', month: 'long', year: 'numeric' });
const parisDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' });

export function fmtEur(v: number | null | undefined): string {
  if (bad(v)) return '—';
  return `${Math.abs(v) >= 100 ? whole.format(v) : two.format(v)}${NB}€`;
}

export function fmtPrice(v: number | null | undefined): string {
  if (bad(v)) return '—';
  return `${four.format(v)}${NB}€/kWh`;
}

/** A bare figure for a column whose header carries the unit: "0,2068", "16,20". */
export function fmtAmount(v: number | null | undefined, digits: 2 | 4): string {
  if (bad(v)) return '—';
  return (digits === 4 ? four : two).format(v);
}

export function fmtPct(share: number | null | undefined): string {
  if (bad(share)) return '—';
  return `${whole.format(share * 100)}${NB}%`;
}

/** "+12 %", "−8 %" (true minus), "0 %"; null when there is nothing to compare with. */
export function fmtChange(cur: number | null | undefined, prev: number | null | undefined): string | null {
  if (bad(cur) || bad(prev) || prev <= 0) return null;
  const p = Math.round(((cur - prev) / prev) * 100);
  if (p === 0) return `0${NB}%`;
  return `${p > 0 ? '+' : '−'}${whole.format(Math.abs(p))}${NB}%`;
}

/** "0,2068", "19.5", "1 234,5" → number; null for anything else (negative included). */
export function parseDecimal(s: string): number | null {
  const t = s.trim().replace(/[\s  ]/g, '').replace(',', '.');
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : null;
}

const isoNoon = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`);

export function fmtDay(iso: string): string {
  const d = isoNoon(iso);
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
}

export function fmtDateLong(iso: string): string {
  return dayLong.format(isoNoon(iso));
}

export function monthName(iso: string): string {
  const s = monthYear.format(isoNoon(iso));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Today's date in Paris as YYYY-MM-DD. */
export function parisTodayIso(now = Date.now()): string {
  return parisDay.format(new Date(now));
}

// ---- Énergie precision (spec §3.2.1): one place for every Énergie figure. ----

const three = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
/** Number formats by decimals (0 to 4), fr-FR grouping. */
const FIXED = [whole, one, two, three, four] as const;

/** Decimals of a hero or sentence kWh figure: 1 below 1 000 kWh, else 0. */
export function kwhDigits(v: number): 0 | 1 {
  return Math.abs(v) < 1000 ? 1 : 0;
}

/** Hero and sentence kWh: « 412,6 kWh », « 2 050 kWh ». */
export function fmtKwhHero(v: number | null | undefined, unit = true): string {
  if (bad(v)) return '—';
  const s = FIXED[kwhDigits(v)].format(v);
  return unit ? `${s}${NB}kWh` : s;
}

/** Tooltip and table kWh, 2 decimals: « 22,04 kWh ». */
export function fmtKwhExact(v: number | null | undefined, unit = true): string {
  if (bad(v)) return '—';
  return unit ? `${two.format(v)}${NB}kWh` : two.format(v);
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

/** Percentages of a set that must total 100 (« 33,3 % · 66,7 % »), largest remainder. */
export function fmtShares(values: (number | null | undefined)[], digits: 0 | 1 = 0): string[] {
  const k = 10 ** digits;
  return largestRemainder(values, 100 * k).map((u) => (u == null ? '—' : `${FIXED[digits].format(u / k)}${NB}%`));
}

/**
 * A kWh total and its parts at the total's decimals (L1). When the parts sum to the total, they
 * are allocated by largest remainder so the shown parts add up to the shown total.
 */
export function fmtKwhParts(
  total: number | null | undefined,
  parts: (number | null | undefined)[]
): { total: string; parts: string[] } {
  if (bad(total)) return { total: '—', parts: parts.map(() => '—') };
  const d = kwhDigits(total);
  const k = 10 ** d;
  const f = (u: number) => `${FIXED[d].format(u / k)}${NB}kWh`;
  const T = Math.round(total * k);
  const known = parts.length > 0 && parts.every((p) => !bad(p) && p >= 0);
  const sum = known ? parts.reduce<number>((a, p) => a + (p as number), 0) : NaN;
  if (known && T >= 0 && Math.abs(sum - total) * k < 0.5) {
    // Hamilton's method on the parts' own values: floor each, then hand the units the total
    // still needs to the largest remainders.
    const scaled = parts.map((p) => (p as number) * k);
    const out = scaled.map((v) => Math.floor(v));
    let left = T - out.reduce((a, b) => a + b, 0);
    const order = scaled.map((v, i) => ({ i, f: v - Math.floor(v) })).sort((a, b) => b.f - a.f || a.i - b.i);
    for (const { i } of order) {
      if (left <= 0) break;
      out[i] += 1;
      left--;
    }
    return { total: f(T), parts: out.map(f) };
  }
  return { total: f(T), parts: parts.map((p) => (bad(p) ? '—' : f(Math.round(p * k)))) };
}

/** Mean power: « 734 W » below 1 kW, then « 3,42 kW ». */
export function fmtW(v: number | null | undefined): string {
  if (bad(v)) return '—';
  const w = Math.round(v);
  return Math.abs(w) < 1000 ? `${whole.format(w)}${NB}W` : `${two.format(v / 1000)}${NB}kW`;
}

/** Hero and sentence euros: 2 decimals below 1 000 €, then whole euros (the inspector has the exact value). */
export function fmtEurHero(v: number | null | undefined): string {
  if (bad(v)) return '—';
  return `${(Math.abs(v) < 1000 ? two : whole).format(v)}${NB}€`;
}

/** Tooltip and table euros, always 2 decimals: « 1 234,56 € ». */
export function fmtEurExact(v: number | null | undefined, unit = true): string {
  if (bad(v)) return '—';
  return unit ? `${two.format(v)}${NB}€` : two.format(v);
}

/** A half-hour's cost, 3 decimals: « 0,152 € ». */
export function fmtEurHalfHour(v: number | null | undefined): string {
  if (bad(v)) return '—';
  return `${three.format(v)}${NB}€`;
}

/** A share with one decimal: 0.384 → « 38,4 % ». */
export function fmtPct1(share: number | null | undefined): string {
  if (bad(share)) return '—';
  return `${one.format(share * 100)}${NB}%`;
}

/** A relative change as a whole percentage with its sign: 0.12 → « +12 % »; null stays null (omitted). */
export function fmtChangeShare(change: number | null | undefined): string | null {
  if (bad(change)) return null;
  const p = Math.round(change * 100);
  if (p === 0) return `0${NB}%`;
  return `${p > 0 ? '+' : '−'}${whole.format(Math.abs(p))}${NB}%`;
}

/** An absolute difference with its sign, 2 decimals: « −14,20 kWh », « +3,61 € ». */
export function fmtSigned(v: number | null | undefined, unit: 'kWh' | '€'): string {
  if (bad(v)) return '—';
  const r = Math.round(v * 100) / 100;
  if (r === 0) return `${two.format(0)}${NB}${unit}`;
  return `${r > 0 ? '+' : '−'}${two.format(Math.abs(r))}${NB}${unit}`;
}

/** A price difference with its sign, 4 decimals: « −0,0632 €/kWh ». */
export function fmtSignedPrice(v: number | null | undefined): string {
  if (bad(v)) return '—';
  const r = Math.round(v * 10_000) / 10_000;
  if (r === 0) return `${four.format(0)}${NB}€/kWh`;
  return `${r > 0 ? '+' : '−'}${four.format(Math.abs(r))}${NB}€/kWh`;
}

/** Hours with one decimal: « 2,8 h »; `unit: false` under a header that carries it. */
export function fmtHours(v: number | null | undefined, unit = true): string {
  if (bad(v)) return '—';
  return unit ? `${one.format(v)}${NB}h` : one.format(v);
}
