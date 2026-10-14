/** Par pièce et par radiateur (spec §3.2.7): the period's per-radiator figures grouped by current room. Pure. */
import type { ByRadiator, Radiator, Room } from './api/types';
import type { Span } from './energy';
import { fmtDay, fmtPct1, fmtShares, largestRemainder, matchParts } from './format';
import { plural } from './plural';

export const NO_ROOM = 'sans-piece';

export const COPY = {
  noRoom: 'Sans pièce',
  removed: 'Radiateur retiré',
  roomFrom: (k: number, n: number, day: string) =>
    `${plural(k, 'radiateur')} sur ${n} ${k > 1 ? 'enregistrés' : 'enregistré'} à partir du ${day}`,
  roomPartial: (k: number, n: number) => `${plural(k, 'radiateur')} sur ${n} ${k > 1 ? 'enregistrés' : 'enregistré'} en partie`,
  radFrom: (day: string) => `enregistré à partir du ${day}`,
  radPartial: (pct: string) => `couverture ${pct}`,
  none: 'aucun relevé sur la période',
  // The backend gives no mean °C, setpoint or heating hours below 50 % sample coverage.
  stats: 'moins de la moitié de la période mesurée'
} as const;

/** kWh, HC and HP as the table shows them (2 decimals), allocated so that they add up. */
export interface Shown {
  kwh: number | null;
  hc: number | null;
  hp: number | null;
}
export interface Figures {
  kwh: number | null;
  hc: number | null;
  hp: number | null;
  eur: number | null;
  temp: number | null;
  setpoint: number | null;
  /** Equivalent full-power hours: a radiator's own, a room's mean over its radiators. */
  hours: number | null;
  /** Some energy was spread between two readings (interpolated or apportioned). */
  est: boolean;
  partial: string | null;
  /** Why °C, setpoint or heating hours read « — » (null when all three are known). */
  statsWhy: string | null;
  /** The table's figures: a room's radiators add up to the room, and each row's HC + HP to its kWh. */
  shown: Shown;
}
export interface RadiatorRow extends Figures {
  id: string;
  name: string;
  /** Kept for the CSV (Task 12). */
  coverage: number | null;
  from: string | null;
}
export interface RoomRow extends Figures {
  id: string;
  name: string;
  share: string;
  fraction: number;
  radiators: RadiatorRow[];
}

const DIGITS = 2;
const UNITS = 10 ** DIGITS;
const known = (v: (number | null)[]) => v.filter((x): x is number => x != null);
const sum = (v: (number | null)[]) => {
  const k = known(v);
  return k.length ? k.reduce((a, b) => a + b, 0) : null;
};
const mean = (v: (number | null)[]) => {
  const k = known(v);
  return k.length ? k.reduce((a, b) => a + b, 0) / k.length : null;
};
/** A radiator whose figure does not cover the period: partly measured, or not at all (`kwh: null`). */
const partialOf = (r: ByRadiator) => r.kwh == null || (r.coverage != null && r.coverage < 1);
const NO_SHOWN: Shown = { kwh: null, hc: null, hp: null };
const statsWhy = (f: { temp: number | null; setpoint: number | null; hours: number | null }) =>
  f.temp == null || f.setpoint == null || f.hours == null ? COPY.stats : null;

/**
 * L1 at the table's 2 decimals: the room's HC and HP add up to its kWh, its radiators' kWh and HC
 * add up to the room's (largest remainder), and each radiator's HP is its kWh less its HC, so its
 * HP column adds up too. Radiators without a figure stay null (the room's sum is partial and says so).
 */
function shownFigures(room: Figures, rads: Figures[]): { room: Shown; rads: Shown[] } {
  if (room.kwh == null) return { room: NO_SHOWN, rads: rads.map(() => NO_SHOWN) };
  const m = matchParts(room.kwh, [room.hc, room.hp], DIGITS);
  const top: Shown = { kwh: m.total, hc: m.parts[0], hp: m.parts[1] };
  const idx = rads.flatMap((r, i) => (r.kwh != null ? [i] : []));
  const kwh = largestRemainder(idx.map((i) => rads[i].kwh), Math.round((top.kwh as number) * UNITS));
  const split = top.hc != null && top.hp != null && idx.every((i) => rads[i].hc != null && rads[i].hp != null);
  const hc = split ? largestRemainder(idx.map((i) => rads[i].hc), Math.round((top.hc as number) * UNITS)) : null;
  // A radiator whose HC rounds above its kWh (a near-zero HP) cannot take kWh − HC: its HP column is then allocated on its own.
  const hpRows = split && hc ? kwh.map((k, j) => (k as number) - (hc[j] as number)) : null;
  const hp =
    split && hpRows?.some((v) => v < 0)
      ? largestRemainder(idx.map((i) => rads[i].hp), Math.round((top.hp as number) * UNITS))
      : hpRows;
  const out = rads.map((r) => ({ kwh: null, hc: r.hc, hp: r.hp }) as Shown);
  idx.forEach((i, j) => {
    out[i] = {
      kwh: (kwh[j] as number) / UNITS,
      hc: hc ? (hc[j] as number) / UNITS : rads[i].hc,
      hp: hp ? (hp[j] as number) / UNITS : rads[i].hp
    };
  });
  return { room: top, rads: out };
}

export function roomEnergy(rows: ByRadiator[], rooms: Room[], radiators: Record<string, Radiator>, span: Span): RoomRow[] {
  const ids = new Set(rooms.map((r) => r.id));
  const groups = new Map<string, ByRadiator[]>();
  for (const r of rows) {
    const id = r.room_id && ids.has(r.room_id) ? r.room_id : NO_ROOM;
    groups.set(id, [...(groups.get(id) ?? []), r]);
  }
  const order = rooms.map((r) => ({ id: r.id, name: r.name }));
  if (groups.has(NO_ROOM)) order.push({ id: NO_ROOM, name: COPY.noRoom });

  const radRow = (r: ByRadiator): RadiatorRow => ({
    id: r.radiator_id,
    name: radiators[r.radiator_id]?.name ?? COPY.removed,
    kwh: r.kwh,
    hc: r.hc_kwh,
    hp: r.hp_kwh,
    eur: r.eur,
    temp: r.temp_avg,
    setpoint: r.setpoint_avg,
    hours: r.heating_hours,
    est: r.interpolated || r.apportioned,
    partial:
      r.kwh == null
        ? COPY.none
        : partialOf(r)
          ? r.from && r.from > span.from
            ? COPY.radFrom(fmtDay(r.from))
            : COPY.radPartial(fmtPct1(r.coverage))
          : null,
    statsWhy: statsWhy({ temp: r.temp_avg, setpoint: r.setpoint_avg, hours: r.heating_hours }),
    shown: NO_SHOWN,
    coverage: r.coverage,
    from: r.from
  });

  const list = order.map(({ id, name }) => {
    const rs = groups.get(id) ?? [];
    const parts = rs.filter(partialOf);
    const late = parts.every((r) => r.from != null && r.from > span.from);
    const latest = parts.map((r) => r.from ?? '').sort().at(-1);
    const room = {
      id,
      name,
      kwh: sum(rs.map((r) => r.kwh)),
      hc: sum(rs.map((r) => r.hc_kwh)),
      hp: sum(rs.map((r) => r.hp_kwh)),
      eur: sum(rs.map((r) => r.eur)),
      temp: mean(rs.map((r) => r.temp_avg)),
      setpoint: mean(rs.map((r) => r.setpoint_avg)),
      hours: mean(rs.map((r) => r.heating_hours)),
      est: rs.some((r) => r.interpolated || r.apportioned),
      partial: !parts.length
        ? null
        : rs.every((r) => r.kwh == null)
          ? COPY.none
          : late && latest
            ? COPY.roomFrom(parts.length, rs.length, fmtDay(latest))
            : COPY.roomPartial(parts.length, rs.length),
      statsWhy: null as string | null,
      shown: NO_SHOWN,
      radiators: rs.map(radRow).sort((a, b) => a.name.localeCompare(b.name, 'fr'))
    };
    // A room without any recorded radiator says so instead (« aucun radiateur enregistré »).
    room.statsWhy = rs.length ? statsWhy(room) : null;
    const s = shownFigures(room, room.radiators);
    return { ...room, shown: s.room, radiators: room.radiators.map((r, i) => ({ ...r, shown: s.rads[i] })) };
  });
  const shares = fmtShares(list.map((r) => r.kwh), 1);
  const total = list.reduce((a, r) => a + (r.kwh ?? 0), 0);
  return list.map((r, i) => ({ ...r, share: shares[i], fraction: total > 0 && r.kwh != null ? r.kwh / total : 0 }));
}
