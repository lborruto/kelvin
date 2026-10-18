/**
 * The outdoor-temperature line over Énergie's consumption charts (pure): one value per bar (a day's or a month's
 * mean, a forecast day's mean) or per hour of the Courbe, its own °C scale on the right, and the paths that draw
 * it. Gaps stay gaps: a missing day or hour breaks the line, never bridged.
 */
import type { EnergyGroup, ForecastDay, Outdoor } from './api/types';
import { outdoorAt, yRange, type OutdoorPoint, type YScale } from './roomchart';

/** Measured (published past weather) or forecast (« prévision », drawn dashed and lighter). */
export type TempKind = 'obs' | 'fc';
export interface TempValue {
  v: number | null;
  kind: TempKind;
}

const HOUR_MS = 3_600_000;

/**
 * One value per bar: a day's mean while it is over (the report's `outdoor.mean_c`); today and the days to come take
 * the forecast's mean when the 7-day forecast covers them, else nothing. A month bar (Année) is its elapsed days'
 * mean, never a forecast.
 */
export function bucketTemps(
  buckets: { key: string; outdoor?: Outdoor | null }[],
  group: EnergyGroup,
  today: string,
  forecast: ForecastDay[] | null | undefined
): TempValue[] {
  const fc = new Map((forecast ?? []).filter((d) => d.t_c != null).map((d) => [d.date, d.t_c as number]));
  return buckets.map((b) => {
    const mean = b.outdoor?.mean_c ?? null;
    if (group !== 'day') return { v: mean, kind: 'obs' };
    if (b.key < today) return { v: mean, kind: 'obs' };
    const f = fc.get(b.key);
    return f != null ? { v: f, kind: 'fc' } : { v: null, kind: 'obs' };
  });
}

/** The Courbe's half-hours: each reads the hour holding its start (the readout's « Dehors »); null without one. */
export function halfHourTemps(intervals: { ts: number }[], points: OutdoorPoint[]): (number | null)[] {
  return intervals.map((iv) => outdoorAt(points, iv.ts * 1000, 30 * 60_000));
}

/**
 * The Courbe's line: one point per published hour, on the half-hour that starts it (so the crosshair on « 18:00–18:30 »
 * sits on the 18:00 point the readout reads). A half-hour starting no hour is skipped; an hour without a value is a
 * break.
 */
export function hourlyLine(intervals: { ts: number }[], points: OutdoorPoint[]): { i: number; v: number | null }[] {
  const at = new Map(points.map((p) => [p.t, p.v]));
  const out: { i: number; v: number | null }[] = [];
  intervals.forEach((iv, i) => {
    const t = iv.ts * 1000;
    if (t % HOUR_MS !== 0) return; // Paris offsets are whole hours: an hour starts on an epoch hour
    out.push({ i, v: at.get(t) ?? null });
  });
  return out;
}

/** The °C scale: the values padded by 1 °C on whole ticks of 1, 2, 5 or 10 °C, at most `maxIntervals` of them
 *  (fewer on a narrow chart); null with nothing to draw. */
export function tempScale(values: (number | null | undefined)[], maxIntervals = 4): YScale | null {
  if (!values.some((v) => v != null && Number.isFinite(v))) return null;
  return yRange(values, 1, maxIntervals);
}

export interface Pt {
  x: number;
  y: number;
  kind: TempKind;
}

/**
 * The line's paths: `solid` joins neighbouring measured points, `dashed` every pair where one is a forecast (so the
 * forecast carries on from the last measured day); a null breaks both. `dots` are the points with no neighbour to
 * join (a lone day between gaps would otherwise vanish).
 */
export function linePaths(pts: (Pt | null)[]): { solid: string; dashed: string; dots: Pt[] } {
  let solid = '';
  let dashed = '';
  const dots: Pt[] = [];
  const f = (n: number) => Math.round(n * 10) / 10;
  pts.forEach((p, i) => {
    if (!p) return;
    const prev = i > 0 ? pts[i - 1] : null;
    const next = i + 1 < pts.length ? pts[i + 1] : null;
    if (!prev && !next) dots.push(p);
    if (!next) return;
    const seg = `M${f(p.x)},${f(p.y)}L${f(next.x)},${f(next.y)}`;
    if (p.kind === 'obs' && next.kind === 'obs') solid += seg;
    else dashed += seg;
  });
  return { solid, dashed, dots };
}

/** The axis tick count for a chart width: fewer on a phone floor, so labels never crowd. */
export function maxTicks(width: number): number {
  return width > 0 && width < 420 ? 3 : 4;
}
