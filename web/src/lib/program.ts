import { DAYS, type Day, type DayLock, type Radiator, type Slot, type WeekProgram } from './api/types';
import { fmtTime } from './format';
import { m } from './i18n';
import { addParisDays, parisAt, parisMidnight, parisMinuteOfDay, parisParts } from './time';

export interface Seg {
  start: number;
  end: number;
}
export type Week = Record<Day, Seg[]>;

export const SNAP = 15;
export const MIN_LEN = 15;
/** The latest end the editor makes (QW8, ruling 3): a midnight end was never verified on a device. */
export const EDIT_MAX = 23 * 60 + 45;
const DAY_END = 1440;

export function toMin(hhmm: string): number {
  const [h, min] = hhmm.split(':').map(Number);
  return h * 60 + min;
}

export function fromMin(mins: number): string {
  const c = Math.max(0, Math.min(DAY_END, Math.round(mins)));
  return `${String(Math.floor(c / 60)).padStart(2, '0')}:${String(c % 60).padStart(2, '0')}`;
}

export function snap(mins: number): number {
  return Math.max(0, Math.min(EDIT_MAX, Math.round(mins / SNAP) * SNAP));
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

export function toWeekProgram(week: Week, locked: Iterable<Day> = []): WeekProgram {
  const skip = new Set(locked);
  return Object.fromEntries(
    DAYS.filter((d) => !skip.has(d)).map((d) => [d, week[d].map((s) => ({ start: fromMin(s.start), end: fromMin(s.end) }))])
  ) as WeekProgram;
}

/** The days no radiator of the room may have edited (union; an unrecognised day wins). */
export function lockedDays(radiators: Radiator[]): Partial<Record<Day, DayLock>> {
  const out: Partial<Record<Day, DayLock>> = {};
  for (const r of radiators)
    for (const [d, why] of Object.entries(r.program_locked ?? {}) as [Day, DayLock][])
      if (out[d] !== 'unrecognised') out[d] = why;
  return out;
}

export type Base = Record<string, WeekProgram>;

/** What each radiator showed when the editor loaded: the backend refuses to overwrite a change. */
export function baseOf(radiators: Radiator[]): Base {
  return Object.fromEntries(radiators.map((r) => [r.id, JSON.parse(JSON.stringify(r.program ?? {}))]));
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

export type DayError = 'tooMany' | 'endBeforeStart' | 'overlap';

/** What is wrong with a day's periods, as a key (the text is m.program.dayError[key]). */
export function validateDay(segs: Seg[]): DayError | null {
  if (segs.length > 3) return 'tooMany';
  const sorted = [...segs].sort((a, b) => a.start - b.start);
  for (const s of sorted) if (s.end <= s.start) return 'endBeforeStart';
  for (let i = 1; i < sorted.length; i++) if (sorted[i].start < sorted[i - 1].end) return 'overlap';
  return null;
}

export function addSlot(segs: Seg[], at: number, len = 120): Seg[] | null {
  if (segs.length >= 3) return null;
  const start = snap(at);
  if (segs.some((s) => start >= s.start && start < s.end)) return null;
  const next = segs.filter((s) => s.start > start).sort((a, b) => a.start - b.start)[0];
  const end = Math.min(start + len, next ? next.start : EDIT_MAX);
  if (end - start < MIN_LEN) return null;
  return [...segs, { start, end }].sort((a, b) => a.start - b.start);
}

export function moveSlot(segs: Seg[], i: number, delta: number): Seg[] {
  const s = segs[i];
  const len = s.end - s.start;
  const lo = i > 0 ? segs[i - 1].end : 0;
  const hi = i < segs.length - 1 ? segs[i + 1].start : EDIT_MAX;
  const start = Math.max(lo, Math.min(hi - len, snap(s.start + delta)));
  return segs.map((x, j) => (j === i ? { start, end: start + len } : x));
}

export function resizeSlot(segs: Seg[], i: number, edge: 'start' | 'end', to: number): Seg[] {
  const s = segs[i];
  const lo = i > 0 ? segs[i - 1].end : 0;
  const hi = i < segs.length - 1 ? segs[i + 1].start : EDIT_MAX;
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

/** « Maintenant : Confort · 23:00 → Éco »: the level the programme gives now, and its next change. */
export function fmtNow(program: WeekProgram, nowMs: number): string {
  const level = m.level[isComfortAt(program, parisParts(nowMs).weekday, parisMinuteOfDay(nowMs)) ? 'comfort' : 'eco'];
  const c = nextChange(program, nowMs);
  if (!c) return m.program.nowSteady(level);
  const time = fmtTime(c.atMs);
  const days = Math.round((parisMidnight(c.atMs) - parisMidnight(nowMs)) / 86_400_000);
  const when = days === 0 ? time : days === 1 ? m.program.whenTomorrow(time) : m.program.whenOn(parisParts(c.atMs).weekday, time);
  return m.program.now(level, when, m.level[c.to]);
}

/** Comfort minutes in a day (its periods never overlap once valid). */
export function comfortMinutes(segs: Seg[]): number {
  return segs.reduce((sum, s) => sum + Math.max(0, s.end - s.start), 0);
}

/** « 8 h », « 7 h 30 », « 45 min ». */
export function fmtDuration(mins: number): string {
  const r = Math.round(mins);
  return m.program.duration(Math.floor(r / 60), r % 60);
}

/** Each period as « 06:30–08:00 ». */
export function slotTimes(segs: Seg[]): string[] {
  return segs.map((s) => `${fromMin(s.start)}–${fromMin(s.end)}`);
}

export type Preset = 'weekdays' | 'weekend' | 'every';
const PRESET: Record<Preset, Day[]> = {
  weekdays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
  weekend: ['saturday', 'sunday'],
  every: [...DAYS]
};

/** The days a copy shortcut picks: never the day copied from, never a locked day. */
export function presetDays(preset: Preset, source: Day, locks: Partial<Record<Day, DayLock>>): Day[] {
  return PRESET[preset].filter((d) => d !== source && !locks[d]);
}

/** `from`'s periods onto every day of `to` (fresh copies); locked days and `from` stay as they are. */
export function copyDay(week: Week, from: Day, to: Day[], locks: Partial<Record<Day, DayLock>> = {}): Week {
  const next = { ...week };
  for (const d of to) if (d !== from && !locks[d]) next[d] = week[from].map((s) => ({ ...s }));
  return next;
}

/** The day before (-1) or after (+1), wrapping around the week. */
export function shiftDay(day: Day, delta: number): Day {
  const i = DAYS.indexOf(day);
  return DAYS[(i + delta + DAYS.length * 2) % DAYS.length];
}
