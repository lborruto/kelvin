/** The « Météo et coût » scatter's geometry (Plan 15, spec §7.1): scales, ticks, dots, the model line and its band,
 *  the nearest dot and the keyboard order. Pure; the component draws it. */
import { scaleLinear, type ScaleLinear } from 'd3-scale';
import type { LineSample, ModelPoint } from './api/types';

export type ScatterMode = 'kwh' | 'eur';
export type DotKind = 'period' | 'used' | 'excluded';
export interface Dot {
  p: ModelPoint;
  cx: number;
  cy: number;
  kind: DotKind;
}
export interface Tick {
  v: number;
  at: number;
}
export interface ScatterLayout {
  x: ScaleLinear<number, number>;
  y: ScaleLinear<number, number>;
  ticksX: Tick[];
  ticksY: Tick[];
  /** In keyboard order (`order`): colder first, then by date. */
  dots: Dot[];
  path: string;
  band: string;
}

export const MARGIN = { left: 40, right: 8, top: 8, bottom: 28 } as const;

/** The dot's value in the mode shown; null when it has none (a day without € in € mode). */
export function dotValue(p: ModelPoint, mode: ScatterMode): number | null {
  return mode === 'kwh' ? p.kwh : p.energy_eur;
}

function lineValues(s: LineSample, mode: ScatterMode): [number, number, number] | null {
  if (mode === 'kwh') return [s.kwh, s.kwh_lo, s.kwh_hi];
  return s.eur != null && s.eur_lo != null && s.eur_hi != null ? [s.eur, s.eur_lo, s.eur_hi] : null;
}

/** Keyboard order: by outdoor temperature, then by date. */
export function order(points: readonly ModelPoint[]): ModelPoint[] {
  return [...points].sort((a, b) => a.t_c - b.t_c || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function dotKind(p: ModelPoint): DotKind {
  return p.excluded ? 'excluded' : p.in_period ? 'period' : 'used';
}

const f = (v: number) => Math.round(v * 100) / 100;

export function scatterLayout(
  points: readonly ModelPoint[],
  line: readonly LineSample[],
  mode: ScatterMode,
  w: number,
  h: number,
  tb: number | null = null
): ScatterLayout {
  const shown = order(points).filter((p) => dotValue(p, mode) != null);
  const samples = line.map((s) => ({ t: s.t_c, v: lineValues(s, mode) })).filter((s) => s.v != null) as { t: number; v: [number, number, number] }[];
  const ts = [...shown.map((p) => p.t_c), ...samples.map((s) => s.t), ...(tb != null ? [tb] : [])];
  const vs = [...shown.map((p) => dotValue(p, mode) as number), ...samples.map((s) => s.v[2])];
  const x = scaleLinear()
    .domain(ts.length ? [Math.min(...ts), Math.max(...ts)] : [0, 20])
    .range([MARGIN.left, Math.max(MARGIN.left + 1, w - MARGIN.right)])
    .nice(5);
  const y = scaleLinear()
    .domain([0, Math.max(1, ...vs)])
    .range([Math.max(MARGIN.top + 1, h - MARGIN.bottom), MARGIN.top])
    .nice(5);
  const dots = shown.map((p) => ({ p, cx: f(x(p.t_c)), cy: f(y(dotValue(p, mode) as number)), kind: dotKind(p) }));
  const path = samples.map((s, i) => `${i ? 'L' : 'M'}${f(x(s.t))},${f(y(s.v[0]))}`).join('');
  const band = samples.length
    ? samples.map((s, i) => `${i ? 'L' : 'M'}${f(x(s.t))},${f(y(s.v[2]))}`).join('') +
      [...samples].reverse().map((s) => `L${f(x(s.t))},${f(y(Math.max(0, s.v[1])))}`).join('') +
      'Z'
    : '';
  return {
    x,
    y,
    ticksX: x.ticks(5).map((v) => ({ v, at: f(x(v)) })),
    ticksY: y.ticks(5).map((v) => ({ v, at: f(y(v)) })),
    dots,
    path,
    band
  };
}

/** The dot nearest to a pointer (px in the plot's own units); null without dots. */
export function nearest(dots: readonly Pick<Dot, 'cx' | 'cy'>[], px: number, py: number): number | null {
  let best: number | null = null;
  let d = Infinity;
  dots.forEach((t, i) => {
    const e = (t.cx - px) ** 2 + (t.cy - py) ** 2;
    if (e < d) {
      d = e;
      best = i;
    }
  });
  return best;
}
