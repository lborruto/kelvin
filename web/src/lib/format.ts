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
