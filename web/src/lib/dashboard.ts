/**
 * Maison, the dashboard at « / » (Tableau spec §4): the words and figures its chips, tiles and widgets show,
 * as pure functions of the house, so the screen only lays them out. Messages are read when called (i18n).
 */
import type { GridView, Override, Radiator, TempoColour, WeekProgram } from './api/types';
import { addDays } from './energy';
import { fmtTemp, fmtTempShort, fmtTime } from './format';
import { stripLines } from './grid';
import { m } from './i18n';
import { daySegs, fromMin, nextChange, type Seg } from './program';
import type { RoomStatus, Tone } from './status';
import { radiatorTitle } from './setup';
import { parisParts } from './time';

/** One room as the summaries count it. */
export interface RoomFacts {
  reading: number | null;
  offline: boolean;
  heating: boolean;
  /** Kelvin drives at least one radiator of the room. */
  controllable: boolean;
  /** Its status (`roomStatus`) is « Arrêt ». */
  off: boolean;
}

export interface Climate {
  /** The lowest and highest reading of the rooms that answer; null when none has one. */
  lo: number | null;
  hi: number | null;
  heating: number;
  offline: number;
  allOff: boolean;
}

/** Every room Kelvin drives and that answers is off (at least one): the « Tout est éteint » state. */
export function isAllOff(rooms: RoomFacts[]): boolean {
  const driven = rooms.filter((r) => r.controllable && !r.offline);
  return driven.length > 0 && driven.every((r) => r.off);
}

export function climate(rooms: RoomFacts[]): Climate {
  const temps = rooms.filter((r) => !r.offline && r.reading != null).map((r) => r.reading as number);
  return {
    lo: temps.length ? Math.min(...temps) : null,
    hi: temps.length ? Math.max(...temps) : null,
    heating: rooms.filter((r) => r.heating && !r.offline).length,
    offline: rooms.filter((r) => r.offline).length,
    allOff: isAllOff(rooms)
  };
}

/** « 19,1–19,6° · 1 en chauffe », « 19,0–19,4° · tout éteint », « — » with no reading. */
export function climateText(c: Climate, compact = false): string {
  const range =
    c.lo == null || c.hi == null ? '—' : c.lo === c.hi ? fmtTempShort(c.hi) : m.maison.climateRange(fmtTemp(c.lo, false), fmtTempShort(c.hi));
  if (c.allOff) return m.maison.climateAllOff(range);
  return compact ? range : m.maison.climateHeating(range, c.heating);
}

/** The status line of a tile: `lead` (in its tone) then `rest`, short on the phone tile. */
export interface TileLine {
  lead: string;
  tone: Tone;
  rest: string;
}

/** What a tile says (Tableau §4 mockups): desktop « En chauffe · Confort jusqu’à 23:00 » or « Confort jusqu’à 23:30 »;
 * phone « En chauffe · → 23:00 » or « Confort → 23:30 ». Absence is cool with its temperature, a boost warm. */
export function tileLine(status: RoomStatus, heating: boolean, override: Override | undefined, program: WeekProgram | null, now: number, compact: boolean): TileLine {
  const prog = status.kind === 'comfort' || status.kind === 'eco';
  const change = prog && program ? nextChange(program, now) : null;
  if (status.kind === 'away' && override?.kind === 'away' && !override.restoring)
    return { lead: status.lead, tone: 'cool', rest: fmtTemp(override.temperature) };
  if (status.kind === 'boost' && override?.kind === 'boost' && !override.restoring)
    return compact
      ? { lead: m.kit.boostShort, tone: 'warm', rest: m.maison.arrowAt(fmtTime(override.ends_at * 1000)) }
      : { lead: status.lead, tone: 'warm', rest: status.rest };
  if (prog) {
    const level = status.kind === 'comfort' ? m.level.comfort : m.level.eco;
    if (heating) return { lead: m.room.heatingNow, tone: 'warm', rest: compact && change ? m.maison.arrowAt(fmtTime(change.atMs)) : status.rest };
    return { lead: compact && change ? m.maison.nextAt(level, fmtTime(change.atMs)) : status.rest, tone: 'tx', rest: '' };
  }
  if (heating && status.kind !== 'off' && status.kind !== 'window') return { lead: m.room.heatingNow, tone: 'warm', rest: status.text };
  return { lead: status.lead, tone: status.tone, rest: status.rest };
}

/** The next programme change as « → Éco 23:00 » (null without a programme or a change). */
export function nextLevelText(program: WeekProgram | null, now: number): string | null {
  const c = program ? nextChange(program, now) : null;
  if (!c) return null;
  return m.maison.arrowLevel(c.to === 'comfort' ? m.level.comfort : m.level.eco, fmtTime(c.atMs));
}

/** A radiator's name without the room's name in front (« Salon baie » in Salon → « baie »). */
export function shortName(name: string, room: string): string {
  const n = name.trim();
  return n.toLowerCase().startsWith(`${room.toLowerCase()} `) && n.length > room.length + 1 ? n.slice(room.length + 1) : n;
}

/** The Radiateurs tile: « 2 en chauffe · baie 19,7° · entrée 19,5° », « 2 à l’arrêt ». */
export function radiatorsText(rads: Radiator[], room: string, off: boolean): string {
  const live = rads.filter((r) => r.reachable !== false);
  if (off) return m.maison.radiatorsOff(live.length);
  const heating = live.filter((r) => (r.working_rate ?? 0) > 0).length;
  const head = heating ? m.maison.radiatorsHeating(heating) : m.maison.radiatorsIdle;
  const down = rads.length - live.length;
  // A radiator still under its device default (« Radiateur », its model) is said by its reading alone.
  return [
    head,
    ...live.map((r) => (radiatorTitle(r) === r.name ? `${shortName(r.name, room)} ${fmtTempShort(r.temperature)}` : fmtTempShort(r.temperature))),
    down ? m.status.someOffline(down, rads.length) : null
  ]
    .filter(Boolean)
    .join(' · ');
}

/** The Réseau chip's value: the next grid signal worth saying (EcoWatt orange/red today or tomorrow, else
 * tomorrow's Tempo colour when Tempo is in force), or null (« Rien à signaler »). */
export type GridNext = { kind: 'ecowatt'; level: 2 | 3; tomorrow: boolean; hours: string | null } | { kind: 'tempo'; colour: TempoColour } | null;

export function gridNext(view: GridView | null, todayIso: string): GridNext {
  const lines = stripLines(view, todayIso);
  if (!lines) return null;
  const e = lines.ecowatt[0];
  if (e) return { kind: 'ecowatt', level: e.level, tomorrow: e.when === 'tomorrow', hours: e.hours };
  const c = lines.tempo?.tomorrow;
  return c ? { kind: 'tempo', colour: c } : null;
}

export function gridNextText(g: GridNext): string {
  if (!g) return m.maison.gridCalm;
  // Today's signal says its hours (it is happening now); tomorrow's are in « Demain ».
  if (g.kind === 'ecowatt' && !g.tomorrow && g.hours) return m.maison.gridEcowattHours(g.level, g.hours);
  return g.kind === 'ecowatt' ? m.maison.gridEcowatt(g.level, g.tomorrow) : m.maison.gridTempo(m.grid.colour[g.colour]);
}

/** Tomorrow's EcoWatt day (any level) from the grid view; null when it is not published. */
export function ecowattTomorrow(view: GridView | null, todayIso: string): { level: number; hours: string | null } | null {
  const d = view?.ecowatt.days.find((x) => x.date === addDays(todayIso, 1));
  if (!d) return null;
  const hours = d.hours?.length ? d.hours.map((r) => `${r.start}–${r.end}`).join(', ') : null;
  return { level: d.level, hours };
}

/** The month the bill widget describes: the previous month's start, this month's span, today's day and the month's length. */
export function monthSpan(todayIso: string): { prevFrom: string; from: string; to: string; day: number; days: number } {
  const from = `${todayIso.slice(0, 7)}-01`;
  const next = addDays(from, 32).slice(0, 7) + '-01';
  const prevFrom = addDays(from, -1).slice(0, 7) + '-01';
  const days = Math.round((Date.parse(next) - Date.parse(from)) / 86_400_000);
  return { prevFrom, from, to: next, day: Number(todayIso.slice(8, 10)), days };
}

/** Today's comfort periods of a programme (minutes of the day). */
export function todaySegs(program: WeekProgram | null, now: number): Seg[] {
  return program ? daySegs(program, parisParts(now).weekday) : [];
}

/** « 06:30–08:00, 17:00–23:00 ». */
export function segsText(segs: Seg[]): string {
  return segs.map((s) => `${fromMin(s.start)}–${fromMin(s.end)}`).join(', ');
}
