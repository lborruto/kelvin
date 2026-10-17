/**
 * The room sheet's « Aujourd’hui » chart in numbers (pure): the moments it can be read at, the bucket at a
 * moment, the temperature scale fitted to what it draws, and what a moment reads. The inspection is a
 * `$lib/inspector` Inspection, so the card, the phone sheet, the slider's text, the hidden table and the
 * announcement come from the same rows and cannot disagree (DESIGN « ChartInspector »).
 */
import type { Override, RoomMode, Run, WeekProgram } from './api/types';
import { fmtDayShort, fmtPct, fmtTemp, fmtTime } from './format';
import { levelLabel, m } from './i18n';
import type { Inspection, Row } from './inspector';
import { fmtDuration, isComfortAt } from './program';
import { provenance, type Provenance } from './provenance';
import type { StripPoint } from './stores/history.svelte';
import { parisMinuteOfDay, parisParts } from './time';

export type RangeKind = 'day' | 'week' | 'month';

/** The moments a range is read at: the start of every `stepMs` bucket (epoch-aligned, like `/api/history`'s) that
 *  overlaps [start, end). */
export function slots(start: number, end: number, stepMs: number): number[] {
  const out: number[] = [];
  if (!(stepMs > 0) || end <= start) return out;
  for (let t = Math.floor(start / stepMs) * stepMs; t < end; t += stepMs) out.push(t);
  return out;
}

/** The recorded bucket nearest to `t`, or null when none lies within half a step (a gap: nothing was recorded then).
 *  `points` are in time order. */
export function pointAt(points: StripPoint[], t: number, stepMs: number): StripPoint | null {
  if (!points.length) return null;
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  const near = lo > 0 && Math.abs(points[lo - 1].t - t) <= Math.abs(points[lo].t - t) ? points[lo - 1] : points[lo];
  return Math.abs(near.t - t) < stepMs / 2 ? near : null;
}

export interface YScale {
  lo: number;
  hi: number;
  /** The tick step, 1 or 2 °C (5 or 10 only for a range no room should have). */
  step: number;
  ticks: number[];
}

/**
 * The temperature scale: the drawn values padded by `pad` °C, widened to whole multiples of the tick step,
 * never forced to 0 or to a fixed band. The step is the smallest of 1, 2, 5, 10 °C that keeps at most
 * `maxIntervals` intervals. Without values: 16–22 °C.
 */
export function yRange(values: (number | null | undefined)[], pad = 1, maxIntervals = 5): YScale {
  const vs = values.filter((v): v is number => v != null && Number.isFinite(v));
  const a = vs.length ? Math.min(...vs) - pad : 16;
  const b = vs.length ? Math.max(...vs) + pad : 22;
  const steps = [1, 2, 5, 10];
  for (const step of steps) {
    const lo = Math.floor(a / step + 1e-9) * step;
    const hi = Math.ceil(b / step - 1e-9) * step;
    if ((hi - lo) / step <= maxIntervals || step === steps[steps.length - 1]) {
      const ticks: number[] = [];
      for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(v);
      return { lo, hi, step, ticks };
    }
  }
  /* c8 ignore next */
  return { lo: 16, hi: 22, step: 2, ticks: [16, 18, 20, 22] };
}

/** The share of [a, b) (ms) covered by runs given in epoch seconds. */
export function runShare(runs: Run[], a: number, b: number): number {
  if (b <= a) return 0;
  let covered = 0;
  for (const r of runs) covered += Math.max(0, Math.min(b, r.end * 1000) - Math.max(a, r.start * 1000));
  return Math.min(1, covered / (b - a));
}

/** The levels a bucket ran at, in words: « Confort », « Confort, Éco », « Manuel », « Arrêt », « Hors-gel ». */
export function levelWords(p: { modes?: string[]; levels?: string[] } | null | undefined): string | null {
  if (!p) return null;
  const out: string[] = [];
  const add = (w: string | null) => w && !out.includes(w) && out.push(w);
  for (const mode of p.modes ?? []) {
    if (mode === 'off') add(m.mode.off);
    else if (mode === 'manual') add(m.mode.manual);
    else if (mode === 'program') {
      const ls = (p.levels ?? []).filter((l) => l !== 'off');
      if (!ls.length) add(m.mode.program);
      for (const l of ls) add(levelLabel(l) ?? m.mode.program);
    } else add(m.mode.other);
  }
  // Frost protection is a level whatever the mode says; without a mode, the levels alone (a pilot-wire heater).
  if (p.levels?.includes('frostprotection')) add(m.level.frostprotection);
  if (!p.modes?.length) for (const l of p.levels ?? []) add(levelLabel(l));
  return out.length ? out.join(', ') : null;
}

/** What the room was planned to do at `t` (the future of the day): its setpoint and level. */
export interface Plan {
  mode: RoomMode | null;
  program: WeekProgram;
  comfort: number | null;
  eco: number | null;
  target: number | null;
}
export function planAt(plan: Plan, t: number): { s: number | null; level: string | null } {
  if (plan.mode === 'off') return { s: null, level: m.mode.off };
  if (plan.mode === 'manual') return { s: plan.target, level: m.mode.manual };
  if (plan.mode === 'program') {
    const comfort = isComfortAt(plan.program, parisParts(t).weekday, parisMinuteOfDay(t));
    return comfort ? { s: plan.comfort, level: m.level.comfort } : { s: plan.eco, level: m.level.eco };
  }
  return { s: null, level: null };
}

/** The running override's name when it covers part of [t, t + step): « Chauffe temporaire », « Absence ». */
export function overrideAt(o: Override | null | undefined, t: number, stepMs: number): string | null {
  if (!o || o.created_at == null) return null;
  if (t >= o.ends_at * 1000 || t + stepMs <= o.created_at * 1000) return null;
  return o.kind === 'boost' ? m.status.boost : m.status.away;
}

export interface MomentCtx {
  kind: RangeKind;
  stepMs: number;
  now: number;
  /** Radiator id → its name; each radiator gets its own row only when the room has several. */
  names: Record<string, string>;
  several: boolean;
  plan: Plan;
  override?: Override | null;
  /** The window and presence runs over the range; null while unknown. */
  activity?: { window: Run[]; presence: Run[] } | null;
  /** The rows apply (a radiator detects it, or a run was reported). */
  presence?: boolean;
  window?: boolean;
  /** Plan 14: past hourly outdoor temperatures (epoch ms, °C) over the range; null or absent without a weather place. */
  outdoor?: OutdoorPoint[] | null;
}

/** An outdoor hour as the room chart draws it: the hour's start (epoch ms) and its °C. */
export interface OutdoorPoint {
  t: number;
  v: number;
}

const HOUR_MS = 3_600_000;

/** The outdoor °C at the moment starting at `t`: the hour that holds it (a day's 15-minute moment), or the mean of
 *  the hours inside [t, t + stepMs) (7 j, 30 j). Null when none was published for it. */
export function outdoorAt(points: OutdoorPoint[], t: number, stepMs: number): number | null {
  if (stepMs <= HOUR_MS) {
    const p = points.find((x) => x.t <= t && t < x.t + HOUR_MS);
    return p ? p.v : null;
  }
  const vs = points.filter((x) => x.t >= t && x.t < t + stepMs).map((x) => x.v);
  return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null;
}

/** How far the scale may reach beyond the room's own values to take in the outdoor line (°C). */
export const OUTDOOR_REACH = 5;

/**
 * The outdoor values the temperature scale takes in (Plan 14): the outdoor line shares the room's °C scale (one
 * axis, an honest gap between inside and outside), but only within `OUTDOOR_REACH` °C of the room's own values, so
 * a cold day never squeezes the room's line flat on a 96 px chart. Beyond, the value is clamped to that bound (the
 * line runs off the plot, clipped; the words and the inspector keep the real values).
 */
export function outdoorDomain(indoor: number[], outdoor: number[]): number[] {
  if (!outdoor.length) return [];
  if (!indoor.length) return [Math.min(...outdoor), Math.max(...outdoor)];
  const lo = Math.min(...indoor) - OUTDOOR_REACH;
  const hi = Math.max(...indoor) + OUTDOOR_REACH;
  const clamp = (v: number) => Math.min(hi, Math.max(lo, v));
  return [clamp(Math.min(...outdoor)), clamp(Math.max(...outdoor))];
}

/** « 14:00–14:15 » on the day, « 14 oct., 13:00–19:00 » over 7 or 30 days. */
export function momentTitle(t: number, ctx: Pick<MomentCtx, 'kind' | 'stepMs'>): string {
  const span = m.roomChart.span(fmtTime(t), fmtTime(t + ctx.stepMs));
  return ctx.kind === 'day' ? span : m.roomChart.dated(fmtDayShort(t), span);
}

/** The base row order of the inspector and of the hidden table's columns (each radiator after `max`). */
export const MOMENT_ORDER = ['temp', 'min', 'max', 'outdoor', 'setpoint', 'level', 'heating', 'presence', 'window'] as const;

/** What the chart reads at the moment starting at `t`, given its recorded bucket (null: nothing recorded then). */
export function inspectMoment(t: number, point: StripPoint | null, ctx: MomentCtx): Inspection {
  const title = momentTitle(t, ctx);
  const ahead = ctx.kind === 'day' && t > ctx.now;
  const bucket = ctx.kind !== 'day';
  const rows: Row[] = [];
  const notes: string[] = [];
  const dash = (key: string, label: string, note: string): Row => ({ key, label, value: '—', note });
  const why = ahead ? m.roomChart.ahead : m.roomChart.noReading;

  // Temperature: the mean of the radiators that read one; over 7 or 30 days, the bucket's min and max too.
  const tempLabel = bucket ? m.roomChart.tempMean : m.roomChart.temp;
  if (point?.v != null) rows.push({ key: 'temp', label: tempLabel, value: fmtTemp(point.v) });
  else rows.push(dash('temp', tempLabel, point ? m.roomChart.notRecorded : why));
  if (bucket) {
    for (const [key, label, v] of [['min', m.roomChart.min, point?.lo], ['max', m.roomChart.max, point?.hi]] as const) {
      rows.push(v != null ? { key, label, value: fmtTemp(v) } : dash(key, label, point ? m.roomChart.notRecorded : why));
    }
  }
  if (ctx.several && !ahead) {
    const ids = Object.keys(ctx.names);
    for (const id of ids) {
      const r = point?.rads?.find((x) => x.id === id);
      const label = ctx.names[id];
      rows.push(r?.v != null ? { key: `rad:${id}`, label, value: fmtTemp(r.v), sub: true } : { ...dash(`rad:${id}`, label, point ? m.roomChart.notRecorded : why), sub: true });
    }
  }

  // Plan 14: the outdoor temperature (published hours only: never a forecast on a history chart).
  if (ctx.outdoor) {
    const label = ctx.kind === 'month' ? m.weather.meanOutside : m.weather.chip;
    const v = ahead ? null : outdoorAt(ctx.outdoor, t, ctx.stepMs);
    rows.push(v != null ? { key: 'outdoor', label, value: fmtTemp(v) } : dash('outdoor', label, ahead ? m.roomChart.ahead : m.roomChart.noOutdoor));
    notes.push(m.roomChart.outdoorNote);
  }

  // The setpoint in force and its level: recorded, or planned for the rest of the day.
  const over = overrideAt(ctx.override, t, ctx.stepMs);
  if (ahead) {
    const plan = planAt(ctx.plan, t);
    rows.push(plan.s != null ? { key: 'setpoint', label: m.roomChart.setpointPlanned, value: fmtTemp(plan.s) }
      : dash('setpoint', m.roomChart.setpointPlanned, ctx.plan.mode === 'off' ? m.roomChart.offNoSetpoint : m.roomChart.notRecorded));
    const level = over ?? plan.level;
    rows.push(level ? { key: 'level', label: m.roomChart.level, value: level } : dash('level', m.roomChart.level, m.roomChart.notRecorded));
    notes.push(m.roomChart.planned);
  } else {
    const off = !!point?.modes?.length && point.modes.every((x) => x === 'off');
    if (point?.s != null) rows.push({ key: 'setpoint', label: m.roomChart.setpoint, value: fmtTemp(point.s) });
    else rows.push(dash('setpoint', m.roomChart.setpoint, !point ? why : off ? m.roomChart.offNoSetpoint : m.roomChart.notRecorded));
    const level = over ?? levelWords(point);
    rows.push(level ? { key: 'level', label: m.roomChart.level, value: level } : dash('level', m.roomChart.level, point ? m.roomChart.notRecorded : why));
  }

  // Heating: the working rate at that time (its mean over a bucket).
  if (!ahead && point?.rate != null) {
    const value = bucket ? m.roomChart.heatingMean(fmtPct(point.rate / 100)) : Math.round(point.rate) > 0 ? m.roomChart.heatingYes(fmtPct(point.rate / 100)) : m.roomChart.heatingNo;
    rows.push({ key: 'heating', label: m.roomChart.heating, value });
  } else rows.push(dash('heating', m.roomChart.heating, point && !ahead ? m.roomChart.notRecorded : why));

  // Presence and an open window, as the radiators reported them (sampled every 5 min).
  const runs = (key: 'presence' | 'window', label: string, words: readonly [string, string, string]) => {
    if (!ctx[key]) return;
    if (ahead || !point) return rows.push(dash(key, label, why));
    if (!ctx.activity) return rows.push(dash(key, label, m.roomChart.notRecorded));
    const share = runShare(ctx.activity[key], t, Math.min(t + ctx.stepMs, ctx.now));
    rows.push({ key, label, value: share >= 0.999 ? words[0] : share > 0 ? words[1] : words[2] });
  };
  runs('presence', m.roomChart.presence, [m.roomChart.presenceYes, m.roomChart.presenceSome, m.roomChart.presenceNo]);
  runs('window', m.roomChart.window, [m.roomChart.windowOpen, m.roomChart.windowSome, m.roomChart.windowClosed]);

  const parts = rows.map((r) => m.roomChart.part(r.label, r.note ? m.roomChart.partWhy(r.value, r.note) : r.value));
  return { title, rows, notes, empty: null, spoken: m.roomChart.spoken(title, parts) };
}

/** Where a moment's values come from: the radiators' readings (« mesuré », the bucket's end), or the programme. */
export function momentProvenance(t: number, point: StripPoint | null, ctx: Pick<MomentCtx, 'kind' | 'stepMs' | 'now' | 'several'>): Provenance | null {
  if (ctx.kind === 'day' && t > ctx.now) return provenance('cozytouch', { nature: 'projected', method: m.roomChart.fromProgram }, ctx.now);
  if (!point) return null;
  const span = fmtDuration(ctx.stepMs / 60_000);
  return provenance(
    'cozytouch',
    { at: Math.min(t + ctx.stepMs, ctx.now), method: ctx.several ? m.roomChart.methodRooms(span) : m.roomChart.method(span) },
    ctx.now
  );
}
