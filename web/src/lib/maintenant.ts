import type { GridView, Slot, Tariff, TariffRow, TempoColour } from './api/types';
import { inForce } from './tariff';
import { addParisDays, isoParis, parisAt, parisMidnight, parisMinuteOfDay } from './time';

/** The « Maintenant » card (Tableau spec §3, decision 3): the tariff period in force now and what comes next,
 * from the tariff in force and Paris time, the way the tariff band (TariffBand) draws the hours. Tempo colours appear only when
 * the price row in force is Tempo, and a Tempo day starts at 06:00: before it, the day in force is
 * yesterday's, whose colour `/api/grid` does not carry, so its price is unknown (`null`), never guessed. */
export type Period = 'hc' | 'hp';

export interface Block {
  /** Minutes of the civil day, 0–1440. */
  from: number;
  to: number;
  period: Period;
}

export interface Next {
  period: Period;
  /** Epoch ms the next period starts. */
  at: number;
  price: number | null;
  colour?: TempoColour | null;
}

export type NowTariff =
  | { kind: 'none' }
  | { kind: 'base'; price: number | null; kva: number }
  | {
      kind: 'hchp' | 'tempo';
      period: Period;
      price: number | null;
      next: Next;
      /** The 24 h band of the civil day: HC blocks (hatched light blue) and HP (solid dark blue). */
      blocks: Block[];
      kva: number;
      /** Tempo only: the colour of the Tempo day in force (null: unknown) and tomorrow's, with its prices. */
      tempo?: { colour: TempoColour | null; tomorrow: { colour: TempoColour | null; hp: number | null; hc: number | null } };
    };

const minutes = (hhmm: string): number => {
  const [h, mm] = hhmm.split(':').map(Number);
  return h * 60 + mm;
};
const dayIso = (ms: number): string => isoParis(ms).slice(0, 10);

/** The off-peak slots of a day: the HC/HP schedule in force on that date (its season's variant), else the
 * tariff's `hc_slots`; Tempo uses its own hours. */
export function offpeakSlots(tariff: Tariff, row: TariffRow, iso: string): Slot[] {
  if (row.option === 'tempo') return [{ start: tariff.tempo_hours.hc_start, end: tariff.tempo_hours.hc_end }];
  const schedule = inForce(tariff.hc_schedules ?? [], iso);
  const month = Number(iso.slice(5, 7));
  const variant = schedule?.variants.find((v) => v.months.includes(month));
  return variant?.slots ?? tariff.hc_slots;
}

/** HC/HP blocks over the civil day (a slot past midnight is drawn as its two halves). */
export function dayBlocks(slots: Slot[]): Block[] {
  const hc: [number, number][] = [];
  for (const s of slots) {
    const a = minutes(s.start);
    const b = minutes(s.end) || 1440;
    if (b > a) hc.push([a, b]);
    else {
      hc.push([a, 1440]);
      if (b > 0) hc.push([0, b]);
    }
  }
  hc.sort((x, y) => x[0] - y[0]);
  const out: Block[] = [];
  let at = 0;
  for (const [a, b] of hc) {
    if (a > at) out.push({ from: at, to: a, period: 'hp' });
    out.push({ from: Math.max(a, at), to: b, period: 'hc' });
    at = Math.max(at, b);
  }
  if (at < 1440) out.push({ from: at, to: 1440, period: 'hp' });
  return out.filter((x) => x.to > x.from);
}

function periodAt(slots: Slot[], minute: number): Period {
  return dayBlocks(slots).find((b) => minute >= b.from && minute < b.to)?.period ?? 'hp';
}

/** The next change of period strictly after `now` (epoch ms), today or tomorrow. */
function nextEdge(slots: Slot[], now: number): number {
  const edges = [...new Set(slots.flatMap((s) => [minutes(s.start), minutes(s.end) % 1440]))].sort((a, b) => a - b);
  const mid = parisMidnight(now);
  const nowMin = parisMinuteOfDay(now);
  const today = edges.find((e) => e > nowMin);
  if (today !== undefined) return parisAt(mid, today);
  return parisAt(addParisDays(mid, 1), edges[0] ?? 0);
}

export function maintenant(tariff: Tariff | null, grid: GridView | null, now: number): NowTariff {
  if (!tariff || !tariff.prices?.length) return { kind: 'none' };
  const iso = dayIso(now);
  const row = inForce(tariff.prices, iso);
  if (!row) return { kind: 'none' };
  const rate = (k: string): number | null => (typeof row.rates[k] === 'number' ? row.rates[k] : null);
  if (row.option === 'base') return { kind: 'base', price: rate('base'), kva: tariff.kva };

  const slots = offpeakSlots(tariff, row, iso);
  const period = periodAt(slots, parisMinuteOfDay(now));
  const at = nextEdge(slots, now);
  const nextPeriod: Period = period === 'hc' ? 'hp' : 'hc';
  const blocks = dayBlocks(slots);

  if (row.option === 'hchp') {
    return { kind: 'hchp', period, price: rate(period), next: { period: nextPeriod, at, price: rate(nextPeriod) }, blocks, kva: tariff.kva };
  }

  // Tempo: the colour of the Tempo day holding an instant (a half-hour before day_start belongs to the day before).
  const dayStart = minutes(tariff.tempo_hours.day_start ?? '06:00');
  const tempoDay = (ms: number) => (parisMinuteOfDay(ms) < dayStart ? dayIso(addParisDays(parisMidnight(ms), -1)) : dayIso(ms));
  const colourOf = (ms: number): TempoColour | null => {
    const d = tempoDay(ms);
    if (grid?.tempo?.today.date === d) return grid.tempo.today.colour;
    if (grid?.tempo?.tomorrow.date === d) return grid.tempo.tomorrow.colour;
    return null;
  };
  const priceOf = (c: TempoColour | null, p: Period) => (c ? rate(`${c}_${p}`) : null);
  const colour = colourOf(now);
  const nextColour = colourOf(at);
  const tomorrow = grid?.tempo?.tomorrow.colour ?? null;
  return {
    kind: 'tempo',
    period,
    price: priceOf(colour, period),
    next: { period: nextPeriod, at, price: priceOf(nextColour, nextPeriod), colour: nextColour },
    blocks,
    kva: tariff.kva,
    tempo: { colour, tomorrow: { colour: tomorrow, hp: priceOf(tomorrow, 'hp'), hc: priceOf(tomorrow, 'hc') } }
  };
}

const hm = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** The off-peak hours in words for the band's name: « 22:00–06:00 » (a slot over midnight joined again). */
export function hcText(blocks: Block[]): string {
  const hc = blocks.filter((b) => b.period === 'hc').map((b) => [b.from, b.to] as [number, number]);
  if (hc.length > 1 && hc[0][0] === 0 && hc[hc.length - 1][1] === 1440) {
    const first = hc.shift()!;
    hc[hc.length - 1] = [hc[hc.length - 1][0], first[1]];
  }
  return hc.map(([a, b]) => `${hm(a)}–${hm(b)}`).join(', ');
}
