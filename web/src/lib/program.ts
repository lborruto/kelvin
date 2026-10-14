import { DAYS, type Day, type Slot, type WeekProgram } from './api/types';
import { fmtTime } from './format';
import { addParisDays, parisAt, parisMidnight, parisMinuteOfDay, parisParts } from './time';

export interface Seg {
  start: number;
  end: number;
}
export type Week = Record<Day, Seg[]>;

export const SNAP = 15;
export const MIN_LEN = 15;
const LAST = 1439;

export const DAY_LABEL: Record<Day, string> = {
  monday: 'Lundi',
  tuesday: 'Mardi',
  wednesday: 'Mercredi',
  thursday: 'Jeudi',
  friday: 'Vendredi',
  saturday: 'Samedi',
  sunday: 'Dimanche'
};
export const DAY_SHORT: Record<Day, string> = {
  monday: 'Lun',
  tuesday: 'Mar',
  wednesday: 'Mer',
  thursday: 'Jeu',
  friday: 'Ven',
  saturday: 'Sam',
  sunday: 'Dim'
};

export function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function fromMin(m: number): string {
  const c = Math.max(0, Math.min(LAST, Math.round(m)));
  return `${String(Math.floor(c / 60)).padStart(2, '0')}:${String(c % 60).padStart(2, '0')}`;
}

export function snap(m: number): number {
  return Math.max(0, Math.min(LAST, Math.round(m / SNAP) * SNAP));
}

export function daySegs(program: WeekProgram, day: Day): Seg[] {
  return (program[day] ?? [])
    .map((s: Slot) => ({ start: toMin(s.start), end: toMin(s.end) }))
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start);
}

export function fromWeekProgram(p: WeekProgram): Week {
  return Object.fromEntries(DAYS.map((d) => [d, daySegs(p, d)])) as Week;
}

export function toWeekProgram(week: Week): WeekProgram {
  return Object.fromEntries(
    DAYS.map((d) => [d, week[d].map((s) => ({ start: fromMin(s.start), end: fromMin(s.end) }))])
  ) as WeekProgram;
}

export function isComfortAt(program: WeekProgram, day: Day, minute: number): boolean {
  return daySegs(program, day).some((s) => minute >= s.start && minute < s.end);
}

/** Sorted segments with touching or overlapping ones merged. */
function merged(segs: Seg[]): Seg[] {
  const out: Seg[] = [];
  for (const s of segs) {
    const last = out[out.length - 1];
    if (last && s.start <= last.end) last.end = Math.max(last.end, s.end);
    else out.push({ ...s });
  }
  return out;
}

export interface Change {
  atMs: number;
  to: 'comfort' | 'eco';
}

export function nextChange(program: WeekProgram, nowMs: number): Change | null {
  const today = parisMidnight(nowMs);
  const nowMin = parisMinuteOfDay(nowMs);
  const current = isComfortAt(program, parisParts(nowMs).weekday, nowMin);
  for (let offset = 0; offset <= 7; offset++) {
    const midnight = addParisDays(today, offset);
    const day = parisParts(midnight + 3_600_000).weekday;
    const events = merged(daySegs(program, day))
      .flatMap((s) => [
        { m: s.start, to: 'comfort' as const },
        { m: s.end, to: 'eco' as const }
      ])
      .sort((a, b) => a.m - b.m);
    for (const e of events) {
      if (offset === 0 && e.m <= nowMin) continue;
      if ((e.to === 'comfort') !== current) return { atMs: parisAt(midnight, e.m), to: e.to };
    }
  }
  return null;
}

export function fmtNextChange(c: Change, nowMs: number): string {
  const label = c.to === 'comfort' ? 'Confort' : 'Éco';
  const days = Math.round((parisMidnight(c.atMs) - parisMidnight(nowMs)) / 86_400_000);
  const when = days === 0 ? '' : days === 1 ? 'demain ' : `${DAY_LABEL[parisParts(c.atMs).weekday].toLowerCase()} `;
  return `${when}${fmtTime(c.atMs)} → ${label}`;
}

export function comfortBands(program: WeekProgram, startMs: number, endMs: number): Seg[] {
  const out: Seg[] = [];
  for (let midnight = parisMidnight(startMs); midnight < endMs; midnight = addParisDays(midnight, 1)) {
    const day = parisParts(midnight + 3_600_000).weekday;
    for (const s of merged(daySegs(program, day))) {
      const a = Math.max(startMs, parisAt(midnight, s.start));
      const b = Math.min(endMs, parisAt(midnight, s.end));
      if (b > a) out.push({ start: a, end: b });
    }
  }
  return out;
}

export function validateDay(segs: Seg[]): string | null {
  if (segs.length > 3) return '3 plages confort au maximum.';
  const sorted = [...segs].sort((a, b) => a.start - b.start);
  for (const s of sorted) if (s.end <= s.start) return 'Une plage doit finir après son début.';
  for (let i = 1; i < sorted.length; i++) if (sorted[i].start < sorted[i - 1].end) return 'Des plages se chevauchent.';
  return null;
}

export function addSlot(segs: Seg[], at: number, len = 120): Seg[] | null {
  if (segs.length >= 3) return null;
  const start = snap(at);
  if (segs.some((s) => start >= s.start && start < s.end)) return null;
  const next = segs.filter((s) => s.start > start).sort((a, b) => a.start - b.start)[0];
  const end = Math.min(start + len, next ? next.start : LAST);
  if (end - start < MIN_LEN) return null;
  return [...segs, { start, end }].sort((a, b) => a.start - b.start);
}

export function moveSlot(segs: Seg[], i: number, delta: number): Seg[] {
  const s = segs[i];
  const len = s.end - s.start;
  const lo = i > 0 ? segs[i - 1].end : 0;
  const hi = i < segs.length - 1 ? segs[i + 1].start : LAST;
  const start = Math.max(lo, Math.min(hi - len, snap(s.start + delta)));
  return segs.map((x, j) => (j === i ? { start, end: start + len } : x));
}

export function resizeSlot(segs: Seg[], i: number, edge: 'start' | 'end', to: number): Seg[] {
  const s = segs[i];
  const lo = i > 0 ? segs[i - 1].end : 0;
  const hi = i < segs.length - 1 ? segs[i + 1].start : LAST;
  const v = snap(to);
  const next =
    edge === 'start'
      ? { start: Math.max(lo, Math.min(s.end - MIN_LEN, v)), end: s.end }
      : { start: s.start, end: Math.min(hi, Math.max(s.start + MIN_LEN, v)) };
  return segs.map((x, j) => (j === i ? next : x));
}

export function removeSlot(segs: Seg[], i: number): Seg[] {
  return segs.filter((_, j) => j !== i);
}

export function changedDays(a: Week, b: Week): Day[] {
  return DAYS.filter((d) => JSON.stringify(a[d]) !== JSON.stringify(b[d]));
}
