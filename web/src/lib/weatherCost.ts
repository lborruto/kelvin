/** « Météo et coût » in words (Plan 15, spec 2026-10-18 §7): the three figures, reasons, the inspector of a day, the
 * forecast cells and their Fiches, the Maison line, the room line, the projection's weather sentence. Pure; every
 * number comes from the API and is formatted by `$lib/format`. Messages are read inside the functions. */
import type { FicheRow } from './components/FicheBody.svelte';
import type { ForecastDay, HouseModel, HouseSummary, ModelPoint, MonthWeather, RoomModel, WeatherCost, WeatherForecast } from './api/types';
import { fmtDay, fmtEurExact, fmtFixed, fmtKwh, fmtKwhExact, fmtPct, fmtPrice, fmtTemp, fmtWeekdayDay, matchParts } from './format';
import { m } from './i18n';
import { modelName } from './weather';

/** Spec §5.3: the fewest days a model needs (the API returns no threshold; shown in « 12 sur 28 »). */
export const MIN_FIT_DAYS = 28;
/** Spec §7.4: below this, tomorrow reads « pas de chauffage prévu ». */
export const NO_HEATING_KWH = 0.05;

/** Why the house model is hidden, with its counts; null when it is shown. */
export function houseWhy(h: HouseSummary | Pick<HouseModel, 'why' | 'points'>): string | null {
  if (!h.why) return null;
  if (h.why === 'few_days') {
    const n = 'points' in h ? h.points.filter((p) => p.excluded !== 'away').length : 0;
    return m.weatherCost.why.few_days(n, MIN_FIT_DAYS);
  }
  return m.weatherCost.why[h.why];
}

/** Why a room's model is hidden (its own measured days in « 12 sur 28 »); null when it is shown. */
export function roomWhy(r: RoomModel): string | null {
  if (!r.why) return null;
  return r.why === 'few_days' ? m.weatherCost.why.few_days(r.coverage?.days ?? 0, MIN_FIT_DAYS) : m.weatherCost.why[r.why];
}

/** The « estimation » badge's reason (the first one); null when the model is not thin. */
export function thinText(thin: readonly string[], fitDays: number | null, heatingDays: number | null): string | null {
  const t = thin[0];
  if (!t) return null;
  if (t === 'short_history') return m.weatherCost.thin.short_history(fitDays ?? 0);
  if (t === 'few_cold_days') return m.weatherCost.thin.few_cold_days(heatingDays ?? 0);
  return m.weatherCost.thin.no_mild_days;
}

export interface Figure {
  key: 'baseload' | 'perDegree' | 'share';
  label: string;
  value: string;
  sub: string;
  rows: FicheRow[];
}

const range = (r: readonly [number, number] | null | undefined, f: (v: number) => string) =>
  r ? m.weatherCost.range(f(r[0]), f(r[1])) : '—';

/** The three L0 figures (baseload, per °C colder, share due to the cold); null while the model is hidden. */
export function figures(v: WeatherCost, periodName: string): Figure[] | null {
  const h = v.house;
  if (h.state !== 'ok' || h.baseload_kwh_day == null || h.kwh_per_c == null) return null;
  const base: Figure = {
    key: 'baseload',
    label: m.weatherCost.baseload,
    value: m.weatherCost.baseloadValue(fmtKwh(h.baseload_kwh_day)),
    sub: m.weatherCost.baseloadSub(h.baseload_eur_day != null ? fmtEurExact(h.baseload_eur_day) : null),
    rows: [
      { key: 'kwh', label: m.weatherCost.baseload, value: fmtKwhExact(h.baseload_kwh_day) },
      { key: 'range', label: m.weatherCost.dayRange, value: range(h.baseload_kwh_day_range, fmtKwhExact), sub: true },
      ...(h.baseload_eur_day != null ? [{ key: 'eur', label: m.weatherCost.rowEur, value: fmtEurExact(h.baseload_eur_day) }] : [])
    ]
  };
  const per: Figure = {
    key: 'perDegree',
    label: m.weatherCost.perDegree,
    value: m.weatherCost.perDegreeValue(fmtKwh(h.kwh_per_c)),
    sub: m.weatherCost.perDegreeSub(h.eur_per_c != null ? fmtEurExact(h.eur_per_c) : null),
    rows: [
      { key: 'kwh', label: m.weatherCost.perDegree, value: fmtKwhExact(h.kwh_per_c) },
      { key: 'range', label: m.weatherCost.dayRange, value: range(h.kwh_per_c_range, fmtKwhExact), sub: true },
      ...(h.eur_per_c != null ? [{ key: 'eur', label: m.weatherCost.rowPerDegreeEur, value: fmtEurExact(h.eur_per_c) }] : []),
      {
        key: 'balance',
        label: m.weatherCost.balance,
        value: m.weatherCost.balanceValue(fmtTemp(h.balance_point_c), h.balance_point_source === 'estimated')
      }
    ]
  };
  const s = h.period_share;
  const share: Figure = {
    key: 'share',
    label: m.weatherCost.share,
    value: !s || s.mild || s.share == null ? '—' : fmtPct(s.share),
    sub: !s ? m.weatherCost.why.outside : s.mild ? m.weatherCost.shareMild : m.weatherCost.shareSub(periodName, s.days),
    rows: s
      ? [
          { key: 'share', label: m.weatherCost.share, value: s.share == null ? '—' : fmtPct(s.share) },
          { key: 'kwh', label: m.weatherCost.rowKwh, value: fmtKwhExact(s.kwh) },
          { key: 'heat', label: m.weatherCost.dayHeat, value: fmtKwhExact(s.weather_kwh), sub: true }
        ]
      : []
  };
  return [base, per, share];
}

/** « Comment c’est calculé » (L2): the model, the days, the fit, what the ranges leave out, the rules. */
export function methodLines(v: WeatherCost): string[] {
  const h = v.house;
  const x = h.excluded;
  const out = [m.weatherCost.method];
  if (h.balance_point_c != null) out.push(`${m.weatherCost.balance} ${m.weatherCost.balanceValue(fmtTemp(h.balance_point_c), h.balance_point_source === 'estimated')}`);
  if (h.fit_days != null) out.push(m.weatherCost.fitDays(h.fit_days, x.away, x.outlier, x.no_energy + x.no_weather));
  if (h.r2 != null) out.push(`${m.weatherCost.r2} ${fmtFixed(h.r2, 2)} · ${m.weatherCost.residual} ${fmtKwhExact(h.residual_sd_kwh)}`);
  out.push(m.weatherCost.leftOut);
  if (v.price) out.push(m.weatherCost.priceRule(fmtPrice(v.price.eur_kwh)));
  out.push(m.weatherCost.forecastRule);
  if (v.normals) out.push(m.weatherCost.normalsRule(v.normals.years));
  out.push(m.weatherCost.otherModel);
  return out;
}

/** « hc » → « HC », « blue_hp » → « Bleu HP » (the inspector's own rate labels); an unknown colour's key reads as
 *  « couleur Tempo inconnue ». */
export function partLabel(key: string): string {
  if (key.startsWith('unknown_')) return m.weatherCost.eurWhy.tempo_colour_unknown;
  return m.inspector.rateLabels[key] ?? key;
}

/** A dot's inspector (date as title): Dehors, Consommation, Coût, the split, Attendu, Écarté; `spoken` for the
 *  live region. */
export function pointRows(p: ModelPoint): { title: string; rows: FicheRow[]; spoken: string } {
  const rows: FicheRow[] = [
    { key: 'outside', label: m.weatherCost.rowOutside, value: fmtTemp(p.t_c) },
    { key: 'kwh', label: m.weatherCost.rowKwh, value: fmtKwhExact(p.kwh) },
    { key: 'eur', label: m.weatherCost.rowEur, value: fmtEurExact(p.energy_eur), est: p.split_estimated && p.energy_eur != null }
  ];
  if (p.parts && p.parts.length > 1) {
    const shown = matchParts(p.kwh, p.parts.map((x) => x.kwh), 2).parts;
    p.parts.forEach((x, i) =>
      rows.push({ key: `part-${x.key}`, label: partLabel(x.key), value: fmtKwhExact(shown[i]), sub: true, est: p.split_estimated })
    );
  }
  if (p.expected_kwh != null) rows.push({ key: 'expected', label: m.weatherCost.rowExpected, value: fmtKwhExact(p.expected_kwh) });
  if (p.excluded) rows.push({ key: 'excluded', label: m.weatherCost.rowExcluded, value: m.weatherCost.excluded[p.excluded] });
  const title = fmtDay(p.date);
  return { title, rows, spoken: `${title}, ${rows.map((r) => `${r.label} ${r.value}`).join(', ')}` };
}

/** A strip cell: « lun. 19 », « 2,0 °C », « ~6,28 € » (heating), or kWh without a price, or « — » with its reason. */
export function forecastCell(d: ForecastDay): { day: string; temp: string; value: string; why: string | null } {
  const day = fmtWeekdayDay(d.date);
  if (!d.complete || d.t_c == null) return { day, temp: '—', value: '—', why: m.weatherCost.why.no_forecast };
  const temp = fmtTemp(d.t_c);
  if (d.heating_eur != null) return { day, temp, value: m.weatherCost.cell(fmtEurExact(d.heating_eur)), why: null };
  if (d.heating_kwh != null)
    return { day, temp, value: m.weatherCost.cell(fmtKwh(d.heating_kwh)), why: d.eur_why ? m.weatherCost.eurWhy[d.eur_why] : null };
  return { day, temp, value: '—', why: m.weatherCost.why.model_hidden };
}

/** A forecast day's Fiche rows: min · max, the model and its assumed error, kWh and € with their ranges. */
export function forecastRows(d: ForecastDay): FicheRow[] {
  const rows: FicheRow[] = [
    { key: 'minmax', label: m.weatherCost.dayMinMax, value: `${fmtTemp(d.tmin_c)} · ${fmtTemp(d.tmax_c)}` },
    { key: 'model', label: m.weatherCost.dayModel, value: `${modelName(d.model)} · ${m.weatherCost.daySigma(fmtTemp(d.sigma_c))}` }
  ];
  if (d.kwh != null) {
    rows.push({ key: 'kwh', label: m.weatherCost.dayKwh, value: fmtKwhExact(d.kwh) });
    if (d.kwh_lo != null && d.kwh_hi != null)
      rows.push({ key: 'kwh-range', label: m.weatherCost.dayRange, value: range([d.kwh_lo, d.kwh_hi], fmtKwhExact), sub: true });
    rows.push({ key: 'heat', label: m.weatherCost.dayHeat, value: fmtKwhExact(d.heating_kwh), sub: true });
  }
  if (d.eur != null) {
    rows.push({ key: 'eur', label: m.weatherCost.dayEur, value: fmtEurExact(d.eur) });
    if (d.eur_lo != null && d.eur_hi != null)
      rows.push({ key: 'eur-range', label: m.weatherCost.dayRange, value: range([d.eur_lo, d.eur_hi], fmtEurExact), sub: true });
    if (d.heating_eur != null) rows.push({ key: 'heat-eur', label: m.weatherCost.dayHeat, value: fmtEurExact(d.heating_eur), sub: true });
  } else if (d.eur_why) rows.push({ key: 'eur', label: m.weatherCost.dayEur, value: '—', note: m.weatherCost.eurWhy[d.eur_why] });
  if (d.colour == null && d.parts && d.parts.length > 1) {
    const shown = matchParts(d.kwh, d.parts.map((x) => x.kwh), 2).parts;
    d.parts.forEach((x, i) => rows.push({ key: `part-${x.key}`, label: partLabel(x.key), value: fmtKwhExact(shown[i]), sub: true }));
  }
  return rows;
}

/** « ≈ 57,60 € sur 7 jours, dont 44,01 € de chauffage » (heating matched to the total); null without the week's €. */
export function weekLine(f: WeatherForecast): string | null {
  const w = f.week;
  if (!w || w.eur == null || w.heating_eur == null) return null;
  const [heat] = matchParts(w.eur, [w.heating_eur], 2).parts;
  return m.weatherCost.week(fmtEurExact(w.eur), fmtEurExact(heat), w.days);
}

/** Tomorrow's forecast day (lead 1), when listed. */
export function tomorrowDay(f: WeatherForecast | null | undefined): ForecastDay | null {
  return f?.days.find((x) => x.lead === 1) ?? null;
}

/** Maison: « 2,0 °C → ~6,28 € de chauffage », « 22,0 °C, pas de chauffage prévu », kWh with the reason when no €;
 *  null when there is nothing to say (the caller shows « — » and the reason). */
export function tomorrowLine(f: WeatherForecast | null | undefined): string | null {
  const d = tomorrowDay(f);
  if (!d || !d.complete || d.t_c == null || d.heating_kwh == null) return null;
  const t = fmtTemp(d.t_c);
  if (d.heating_kwh < NO_HEATING_KWH) return m.weatherCost.tomorrowNone(t);
  if (d.heating_eur != null) return m.weatherCost.tomorrow(t, fmtEurExact(d.heating_eur));
  return m.weatherCost.tomorrowKwh(t, fmtKwh(d.heating_kwh), m.weatherCost.eurWhy[d.eur_why ?? 'price_unknown']);
}

/** Why tomorrow has no line: the house model's reason, else the forecast's. */
export function tomorrowWhy(v: { house: HouseSummary; forecast: WeatherForecast } | null | undefined): string | null {
  if (!v) return null;
  if (v.house.why) return houseWhy(v.house);
  const d = tomorrowDay(v.forecast);
  if (!d || !d.complete) return m.weatherCost.why.no_forecast;
  return v.forecast.state === 'hidden' ? m.weatherCost.why.model_hidden : null;
}

/** The room sheet's « Froid » value: « +0,8 kWh par °C plus froid », or « — ». */
export function roomValue(r: RoomModel): string {
  return r.state === 'ok' && r.kwh_per_c != null ? m.weatherCost.roomValue(fmtKwh(r.kwh_per_c)) : '—';
}

/** The « Froid » Fiche rows: per degree with its range, its € at today's prices, coverage, R², balance point. */
export function roomRows(r: RoomModel & { balance_point_c?: number | null; balance_point_source?: string | null }): FicheRow[] {
  const rows: FicheRow[] = [];
  if (r.kwh_per_c != null) {
    rows.push({ key: 'kwh', label: m.weatherCost.perDegree, value: fmtKwhExact(r.kwh_per_c) });
    rows.push({ key: 'range', label: m.weatherCost.dayRange, value: range(r.kwh_per_c_range, fmtKwhExact), sub: true });
  }
  if (r.eur_per_c != null) rows.push({ key: 'eur', label: m.weatherCost.rowPerDegreeEur, value: fmtEurExact(r.eur_per_c) });
  if (r.coverage)
    rows.push({ key: 'coverage', label: m.weatherCost.coverage(r.coverage.days, r.coverage.of), value: r.coverage.share != null ? fmtPct(r.coverage.share) : '—' });
  if (r.r2 != null) rows.push({ key: 'r2', label: m.weatherCost.r2, value: fmtFixed(r.r2, 2) });
  if (r.balance_point_c != null)
    rows.push({
      key: 'balance',
      label: m.weatherCost.balance,
      value: m.weatherCost.balanceValue(fmtTemp(r.balance_point_c), r.balance_point_source !== 'convention')
    });
  return rows;
}

/** « Par °C plus froid : Salon +0,8 kWh · Chambre +0,5 kWh » over the rooms with a valid model, ranked. */
export function whereLine(items: readonly RoomModel[] | null | undefined, name: (id: string) => string): string | null {
  const ok = (items ?? [])
    .filter((r) => r.state === 'ok' && r.kwh_per_c != null)
    .sort((a, b) => (b.kwh_per_c as number) - (a.kwh_per_c as number));
  return ok.length ? m.weatherCost.whereLine(ok.map((r) => m.weatherCost.whereItem(name(r.room_id), fmtKwh(r.kwh_per_c))).join(' · ')) : null;
}

/** A room's detail line in « Où part l’énergie »; null without a valid model. */
export function whereDetail(r: RoomModel | null | undefined): string | null {
  if (!r || r.state !== 'ok' || r.kwh_per_c == null) return null;
  return m.weatherCost.whereDetail(
    fmtKwh(r.kwh_per_c),
    r.eur_per_c != null ? fmtEurExact(r.eur_per_c) : null,
    r.coverage?.days ?? r.fit_days ?? 0,
    r.coverage?.of ?? r.fit_days ?? 0
  );
}

/** The month-end weather sentence (Projection Détails): the range and the days behind it, or why not. */
export function projectionLines(w: MonthWeather | null | undefined, eur: boolean): string[] {
  if (!w) return [];
  if (w.why) return [m.weatherCost.projWhy[w.why]];
  const lo = eur && w.eur_lo != null ? fmtEurExact(w.eur_lo) : fmtKwh(w.kwh_lo);
  const hi = eur && w.eur_hi != null ? fmtEurExact(w.eur_hi) : fmtKwh(w.kwh_hi);
  const out = [m.weatherCost.projDetail(lo, hi, w.observed_days + (w.today ? 1 : 0), w.forecast_days, w.normal_days)];
  if (w.spread === 'no_normals_spread') out.push(m.weatherCost.projNoSpread);
  return out;
}
