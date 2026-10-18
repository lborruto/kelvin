// Where a figure comes from (direction-2 §1.2 « Provenance block », §1.4 vocabulary): the Source, Relevé
// (reading) and Nature rows every Fiche ends with, built in one place so a figure's origin reads the same
// in every Fiche, hidden table and announcement. Words come from `m.prov` (never at module scope).
import { fmtAgo, fmtDateTime, fmtDay, fmtTime, parisTodayIso } from './format';
import { m } from './i18n';

/** §1.4: measured (no mark), estimated (« est. »), projected (« ≈ »), computed (« ≈ »); `published` is a
 * grid signal as its publisher gave it (Tempo colour, EcoWatt level) or a weather model's output (Plan 14:
 * neither measured at the home nor Kelvin's estimate). */
export type Nature = 'measured' | 'estimated' | 'projected' | 'computed' | 'published';
export type ProvKind =
  | 'linky-day'
  | 'linky-curve'
  | 'radiator-meter'
  | 'tariff'
  | 'rte-ecowatt'
  | 'tempo'
  | 'cozytouch'
  | 'kelvin-calc'
  | 'weather';

export interface ProvRow {
  label: string;
  value: string;
  note?: string;
}

export interface Provenance {
  kind: ProvKind;
  nature: Nature;
  /** Source, then Relevé when a time is known, then Nature. */
  rows: ProvRow[];
  /** The old footnotes, one muted line each, under the rows. */
  notes: string[];
}

export interface ProvData {
  /** Linky: the last day with data (ISO YYYY-MM-DD): « jusqu’au 14/10 ». */
  day?: string | null;
  /** The reading's own instant (epoch ms): « il y a 3 min », « 21:11 ». */
  at?: number | null;
  /** The source's last sync (epoch ms): « synchro 21:11 ». */
  syncAt?: number | null;
  /** The radiator whose meter it is (`radiator-meter`). */
  name?: string | null;
  /** The weather model behind the figure (`weather`): `arome_hd`, `era5_land`… */
  model?: string | null;
  /** Overrides the kind's own nature (an apportioned radiator kWh is `estimated`). */
  nature?: Nature;
  /** How it was estimated, projected or computed, already worded: « réparti entre deux relevés du radiateur ». */
  method?: string | null;
  notes?: string[];
}

const DEFAULT_NATURE: Record<ProvKind, Nature> = {
  'linky-day': 'measured',
  'linky-curve': 'measured',
  'radiator-meter': 'measured',
  tariff: 'computed',
  'rte-ecowatt': 'published',
  tempo: 'published',
  cozytouch: 'measured',
  'kelvin-calc': 'computed',
  weather: 'published'
};

/** The source's name in words (`name`: the radiator for `radiator-meter`, the model for `weather`). */
export function sourceName(kind: ProvKind, name?: string | null): string {
  switch (kind) {
    case 'linky-day':
    case 'linky-curve':
      return m.prov.linky;
    case 'radiator-meter':
      return name ? m.prov.radiator(name) : m.prov.radiatorAny;
    case 'tariff':
      return m.prov.tariff;
    case 'rte-ecowatt':
      return m.prov.rte;
    case 'tempo':
      return m.prov.tempo;
    case 'cozytouch':
      return m.prov.cozytouch;
    case 'kelvin-calc':
      return m.prov.kelvin;
    case 'weather':
      return name ? (m.prov.weather[name] ?? m.prov.weather.mixed) : m.prov.weather.pending;
  }
}

/** An instant as a clock: « 21:11 » today, else the date and time (« données de … »). */
export function stamp(at: number, now: number): string {
  return parisTodayIso(at) === parisTodayIso(now) ? fmtTime(at) : fmtDateTime(at);
}

/** An instant in the fewest words: « il y a 3 min » within the hour, else `stamp`. */
export function when(at: number, now: number): string {
  if (now - at < 3_600_000 && at <= now) return fmtAgo(at, now);
  return stamp(at, now);
}

/** The « Nature » value: « mesuré », « estimé · réparti entre deux relevés du radiateur ». */
export function natureText(nature: Nature, method?: string | null): string {
  return method ? m.prov.withMethod(m.prov.natures[nature], method) : m.prov.natures[nature];
}

/** The Provenance block of a figure from `kind` (direction-2 §1.2). */
export function provenance(kind: ProvKind, data: ProvData = {}, now: number = Date.now()): Provenance {
  const nature = data.nature ?? DEFAULT_NATURE[kind];
  const reading: string[] = [];
  if (data.day) reading.push(kind === 'linky-curve' ? m.prov.curveUntil(fmtDay(data.day)) : m.prov.until(fmtDay(data.day)));
  if (data.at != null) reading.push(when(data.at, now));
  if (data.syncAt != null) reading.push(m.prov.sync(when(data.syncAt, now)));
  const rows: ProvRow[] = [{ label: m.prov.source, value: sourceName(kind, kind === 'weather' ? data.model : data.name) }];
  if (reading.length) rows.push({ label: m.prov.reading, value: reading.join(' · ') });
  rows.push({ label: m.prov.nature, value: natureText(nature, data.method) });
  return { kind, nature, rows, notes: data.notes ?? [] };
}
