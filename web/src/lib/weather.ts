// The words of the outdoor temperature (Plan 14, spec §7): the chip, its Fiche, a place, the Énergie rows, the
// normalised comparison. Messages are read inside the functions (never at module scope).
import type { Outdoor, WeatherLocation, WeatherModel, WeatherPlace, WeatherRow, WeatherView } from './api/types';
import type { FicheLink, FicheRow } from './components/FicheBody.svelte';
import { fmtChangeShare, fmtDju, fmtMetres, fmtPct, fmtTemp, fmtTime } from './format';
import { m } from './i18n';
import { provenance, type Provenance } from './provenance';

/** Open-Meteo's licence asks for this link next to the data it serves (CC BY 4.0). */
export const ATTRIBUTION_URL = 'https://open-meteo.com/'; // i18n-ignore: URL
export const GEONAMES_URL = 'https://www.geonames.org/'; // i18n-ignore: URL

/** The model's name with its route (« Météo-France AROME HD via Open-Meteo »); an unknown code reads as several. */
export function modelName(model: WeatherModel | string | null | undefined): string {
  return m.prov.weather[model ?? 'arome_hd'] ?? m.prov.weather.mixed;
}

/** The chip's value: the current hour, 1 decimal, or « — » (its reason in the Fiche). */
export function chipValue(v: WeatherView): string {
  return v.now ? fmtTemp(v.now.temperature_c) : '—';
}

/** Why the chip has no value (« — »'s reason); null when it has one. */
export function chipReason(v: WeatherView, _now: number): string | null {
  if (v.now) return null;
  const f = v.fetch;
  if (f?.state === 'error') return f.next ? m.weather.reasonRetry(fmtTime(f.next * 1000)) : m.weather.reasonError;
  if (f?.state === 'quota') return m.weather.reasonQuota;
  return m.weather.reasonFirst;
}

export interface WeatherFiche {
  title: string;
  rows: FicheRow[];
  notes: string[];
  provenance: Provenance;
  link: FicheLink;
}

/** The chip's Fiche (L1): now, feels like, humidity, today's min and max with their hour (« prévu » when ahead),
 * then the Provenance (Source by model, Relevé = the fetch, Nature « publié ») and the attribution link. */
export function weatherFiche(v: WeatherView, now: number): WeatherFiche {
  const rows: FicheRow[] = [];
  rows.push({ label: m.weather.now, value: v.now ? fmtTemp(v.now.temperature_c) : '—', note: chipReason(v, now) });
  if (v.now?.apparent_c != null) rows.push({ label: m.weather.feelsLike, value: fmtTemp(v.now.apparent_c) });
  if (v.now?.humidity_pct != null) rows.push({ label: m.weather.humidity, value: fmtPct(v.now.humidity_pct / 100) });
  if (v.today) {
    const t = v.today;
    rows.push({ label: m.weather.min, value: m.weather.atTime(fmtTemp(t.min_c), fmtTime(t.min_at * 1000), t.min_ahead) });
    rows.push({ label: m.weather.max, value: m.weather.atTime(fmtTemp(t.max_c), fmtTime(t.max_at * 1000), t.max_ahead) });
  }
  return {
    title: m.weather.ficheTitle,
    rows,
    notes: [m.weather.notStation],
    provenance: provenance('weather', { at: v.fetched_at ? v.fetched_at * 1000 : null, model: v.now?.model ?? null }, now),
    link: { label: m.weather.attributionShort, href: ATTRIBUTION_URL }
  };
}

/** « Lyon · Rhône · 173 m »; outside France the country code follows the region: « Genève · Genève (CH) · 375 m ». */
export function placeLine(p: WeatherPlace | WeatherLocation): string {
  const region = p.admin2 ?? p.admin1;
  const where = region ? (p.country_code && p.country_code !== 'FR' ? `${region} (${p.country_code})` : region) : null;
  return [p.name, where, p.elevation_m != null ? fmtMetres(p.elevation_m) : null].filter(Boolean).join(' · ');
}

/** Inspector rows (Énergie, every bar): « Dehors moy. » and « DJU (base 18 °C) »; none without weather. */
export function outdoorRows(o: Outdoor | null | undefined): FicheRow[] {
  if (!o) return [];
  const partial = o.days < o.of ? m.weather.partialDays(o.days, o.of) : null;
  return [
    {
      key: 'outdoor',
      label: m.weather.meanOutside,
      value: o.mean_c != null ? fmtTemp(o.mean_c) : '—',
      note: o.mean_c != null ? partial : m.weather.noData
    },
    {
      key: 'dju',
      label: m.weather.djuLabel,
      value: o.dju != null ? fmtDju(o.dju) : '—',
      note: o.dju != null ? null : o.days === 0 ? m.weather.noData : partial ?? m.weather.noData
    }
  ];
}

/** « −8 % à météo égale »: never coloured; null when there is no change to say (the reason is in Détails). */
export function normalisedLine(r: WeatherRow | null | undefined): string | null {
  if (!r || r.change == null) return null;
  return m.weather.atEqualWeather(fmtChangeShare(r.change)!);
}

/** Why there is no change at equal weather, in words; null for an unknown reason. */
export function whyText(why: string | null | undefined): string | null {
  return why ? (m.weather.why[why] ?? null) : null;
}
