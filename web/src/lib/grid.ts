import type { EcowattRun, GridView, TempoColour } from '$lib/api/types';

export interface StripLines {
  tempo: { today: TempoColour | null; tomorrow: TempoColour | null; expectedAt: string | null } | null;
  ecowatt: { date: string; when: 'today' | 'tomorrow'; level: 2 | 3; hours: string | null }[];
  updatedAt: number | null;
}

const plusDay = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

/** « 18:00–20:00 », runs joined by « , »; null when there are none (hours not verified yet). */
export function hoursText(runs: EcowattRun[] | null | undefined): string | null {
  return runs?.length ? runs.map((r) => `${r.start}–${r.end}`).join(', ') : null;
}

/** What the strip says: Tempo as the backend sends it (only under a Tempo tariff), EcoWatt at
 * level 2–3 for today and tomorrow. Null when there is nothing to say. */
export function stripLines(view: GridView | null, todayIso: string): StripLines | null {
  if (!view) return null;
  const tomorrowIso = plusDay(todayIso);
  const ecowatt = view.ecowatt.days
    .filter((d) => d.level >= 2 && (d.date === todayIso || d.date === tomorrowIso))
    .map((d) => ({
      date: d.date,
      when: (d.date === todayIso ? 'today' : 'tomorrow') as 'today' | 'tomorrow',
      level: (d.level >= 3 ? 3 : 2) as 2 | 3,
      hours: hoursText(d.hours)
    }));
  const tempo = view.tempo
    ? { today: view.tempo.today.colour, tomorrow: view.tempo.tomorrow.colour, expectedAt: view.tempo.tomorrow.expected_at }
    : null;
  if (!tempo && !ecowatt.length) return null;
  const times = [view.tempo?.fetched_at, ecowatt.length ? view.ecowatt.fetched_at : null].filter((x): x is number => x != null);
  return { tempo, ecowatt, updatedAt: times.length ? Math.max(...times) : null };
}
