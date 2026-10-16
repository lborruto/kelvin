/**
 * One sentence of state per room (direction §3), used by the card, the room panel and the
 * screen-reader name: the first row that applies wins.
 *
 *  1 offline (every radiator unreachable)  « Hors ligne depuis 14:32 » + hint
 *  2 away override                          « Absence · 16,0 °C jusqu’à dimanche 18:00 »
 *  3 boost override                         « Chauffe temporaire · 22,0 °C jusqu’à 21:45 »
 *  4 window open                            « Fenêtre ouverte » (« chauffe suspendue » is not verified on a device)
 *  5 mode off                               « Arrêt »
 *  6 manual                                 « Manuel · 19,0 °C »
 *  7/8 programme                            « Programme · Confort jusqu’à 23:00 », « … Éco jusqu’à demain 06:30 »
 *  9 mixed modes                            « Modes différents selon les radiateurs »
 *
 * A pending mode or setpoint (`expected`) wins over what the radiators report: the sentence shows
 * the request, dashed, until it is confirmed.
 */
import type { Day, Expected, Override, Radiator, Room, WeekProgram } from './api/types';
import { capsOf } from './capabilities';
import { fmtDayShort, fmtTemp, fmtTime } from './format';
import { levelLabel, m, modeLabel } from './i18n';
import { isComfortAt, nextChange } from './program';
import { agg } from './room';
import { parisMidnight, parisMinuteOfDay, parisParts } from './time';

export type StatusKind = 'offline' | 'away' | 'boost' | 'window' | 'off' | 'manual' | 'comfort' | 'eco' | 'program' | 'other' | 'mixed' | 'none';
/** The hue of the lead words: ink, muted, warm (heating), cool (away), bad (to fix). */
export type Tone = 'tx' | 'muted' | 'warm' | 'cool' | 'bad';

export interface RoomStatus {
  kind: StatusKind;
  /** The first words (« Programme », « Chauffe temporaire »…), in `tone`. */
  lead: string;
  /** What follows « · » (may be empty), in ink. */
  rest: string;
  /** lead · rest, the whole sentence. */
  text: string;
  tone: Tone;
  /** Offline: « Radiateur hors tension ou hors de portée ». */
  hint?: string;
  /** What the room is asked to reach now (« consigne 21,0 °C »); null when Off, offline or unknown. */
  target: number | null;
  /** Offline since (ms); null when Kelvin does not know since when. */
  since?: number | null;
  /** Some (not all) radiators offline. */
  someOffline?: { k: number; n: number };
  /** The sentence shows a request the radiators have not confirmed yet. */
  pending: boolean;
}

const SEP = ' · ';
const join = (lead: string, rest: string) => (rest ? `${lead}${SEP}${rest}` : lead);

/** « 14:32 » today, « demain 06:30 », « jeudi 06:30 » further on. */
export function whenAhead(atMs: number, now: number): string {
  const time = fmtTime(atMs);
  const days = Math.round((parisMidnight(atMs) - parisMidnight(now)) / 86_400_000);
  if (days <= 0) return time;
  if (days === 1) return m.program.whenTomorrow(time);
  return m.program.whenOn(parisParts(atMs).weekday, time);
}

/** A future instant as a day word and a time, for sentences that put the day before « vers »
 * (« Puis retour au programme demain vers 00:19 »): null today, 'tomorrow', else the weekday. */
export function whenParts(atMs: number, now: number): { on: Day | 'tomorrow' | null; time: string } {
  const time = fmtTime(atMs);
  const days = Math.round((parisMidnight(atMs) - parisMidnight(now)) / 86_400_000);
  return { on: days <= 0 ? null : days === 1 ? 'tomorrow' : parisParts(atMs).weekday, time };
}

export const isOffline = (rads: Radiator[]): boolean => rads.length > 0 && rads.every((r) => r.reachable === false);

/** The room's reading: the mean of the radiators that answer when some do not (the backend's mean counts them all). */
export function roomReading(room: Room, rads: Radiator[]): number | null {
  if (!rads.some((r) => r.reachable === false) || isOffline(rads)) return room.temperature;
  const temps = rads.filter((r) => r.reachable !== false && r.temperature != null).map((r) => r.temperature as number);
  return temps.length ? Math.round((temps.reduce((a, b) => a + b, 0) / temps.length) * 10) / 10 : null;
}

const stable = (o: unknown): string =>
  JSON.stringify(o ?? {}, (_k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort()) : v));

/** The programme every programmable radiator of the room shares; null when they differ or none has one. */
export function sharedProgram(rads: Radiator[]): WeekProgram | null {
  const p = rads.filter((r) => capsOf(r).program);
  if (!p.length) return null;
  const first = stable(p[0].program);
  return p.every((r) => stable(r.program) === first) ? (p[0].program ?? {}) : null;
}

export function roomStatus(room: Room, rads: Radiator[], override: Override | undefined, expected: Expected, now: number): RoomStatus {
  const down = rads.filter((r) => r.reachable === false).length;
  const someOffline = down > 0 && down < rads.length ? { k: down, n: rads.length } : undefined;
  const pending = expected.mode !== undefined || expected.target !== undefined || expected.comfort !== undefined || expected.eco_delta !== undefined;
  const make = (kind: StatusKind, lead: string, rest: string, tone: Tone, target: number | null, extra: Partial<RoomStatus> = {}): RoomStatus => ({
    kind, lead, rest, text: join(lead, rest), tone, target, someOffline, pending: false, ...extra
  });

  if (isOffline(rads)) {
    const known = rads.map((r) => r.unreachable_since);
    const since = known.every((s) => s != null) ? Math.max(...(known as number[])) * 1000 : null;
    const lead =
      since == null
        ? m.status.offline
        : m.status.offlineSince(parisMidnight(since) === parisMidnight(now) ? fmtTime(since) : m.status.onDate(fmtDayShort(since)));
    return make('offline', lead, '', 'muted', null, { hint: m.status.offlineHint(rads.length), since, someOffline: undefined });
  }
  if (override?.restoring) return make(override.kind === 'away' ? 'away' : 'boost', m.status.restoring, '', 'muted', null);
  if (override?.kind === 'away')
    return make('away', m.status.away, m.status.until(fmtTemp(override.temperature), whenAhead(override.ends_at * 1000, now)), 'cool', override.temperature);
  if (override?.kind === 'boost')
    return make('boost', m.status.boost, m.status.until(fmtTemp(override.temperature), whenAhead(override.ends_at * 1000, now)), 'warm', override.temperature);
  if (room.window_open) return make('window', m.room.windowOpen, '', 'bad', null);

  const mode = expected.mode ?? room.mode;
  const flag = { pending };
  if (mode === 'off') return make('off', m.mode.off, '', 'muted', null, flag);
  if (mode === 'mixed') return make('mixed', m.status.mixed, '', 'muted', null, flag);
  if (mode == null) return make('none', '—', '', 'muted', null);

  if (mode === 'manual') {
    const t = expected.target ?? agg(rads.map((r) => r.target)).value ?? room.target;
    return make('manual', m.mode.manual, t == null ? '' : fmtTemp(t), 'tx', t, flag);
  }
  if (mode === 'program') {
    const program = sharedProgram(rads);
    const comfort = expected.comfort ?? agg(rads.map((r) => r.comfort)).value ?? room.comfort;
    const delta = expected.eco_delta ?? agg(rads.map((r) => r.eco_delta)).value;
    const eco = comfort != null && delta != null ? comfort - delta : room.eco;
    if (program) {
      const comfortNow = isComfortAt(program, parisParts(now).weekday, parisMinuteOfDay(now));
      const c = nextChange(program, now);
      const level = comfortNow ? m.level.comfort : m.level.eco;
      const rest = !c ? m.status.steady(level) : comfortNow ? m.status.comfortUntil(whenAhead(c.atMs, now)) : m.status.ecoUntil(whenAhead(c.atMs, now));
      return make(comfortNow ? 'comfort' : 'eco', m.mode.program, rest, 'tx', comfortNow ? comfort : eco, flag);
    }
    if (rads.some((r) => capsOf(r).program))
      return make('program', m.mode.program, m.status.programsDiffer, 'tx', room.effective_setpoint, flag);
  }
  // A mode without a programme Kelvin reads (pilot wire, towel dryer, another brand's own mode): its level, if known.
  const level = room.heating_level && room.heating_level !== 'off' && room.heating_level !== 'mixed' ? levelLabel(room.heating_level) : null;
  return make('other', modeLabel(mode), level ?? '', 'tx', room.effective_setpoint, flag);
}

const REQ_KEYS = ['mode', 'target', 'comfort', 'eco_delta'] as const;

/** What a pending room command asks for, as a stable key (null when nothing is pending): the
 * status sentence's dashed mark closes solid only when the radiators report exactly these values,
 * never because the sentence's text happens to read the same (a comfort change leaves it as it was). */
export function requestKey(e: Expected): string | null {
  const o: Record<string, unknown> = {};
  for (const k of REQ_KEYS) if (e[k] !== undefined) o[k] = e[k];
  return Object.keys(o).length ? JSON.stringify(o) : null;
}

/** The radiators' reported values for the keys of `request`, in the same form (a key they disagree on is null). */
export function reportedKey(rads: Radiator[], request: string | null): string | null {
  if (!request) return null;
  const o: Record<string, unknown> = {};
  for (const k of Object.keys(JSON.parse(request)) as (typeof REQ_KEYS)[number][]) {
    const vs = rads.map((r) => r[k]).filter((v) => v != null);
    o[k] = vs.length && vs.every((v) => v === vs[0]) ? vs[0] : null;
  }
  return JSON.stringify(o);
}
