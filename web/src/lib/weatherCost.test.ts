import { afterEach, describe, expect, it } from 'vitest';
import { setLocale } from './i18n';
import { FORECAST, HIDDEN, OK, ROOM, THIN, week } from './weatherModel.fixture';
import {
  figures,
  forecastCell,
  forecastRows,
  houseWhy,
  methodLines,
  pointRows,
  projectionLines,
  roomRows,
  roomValue,
  roomWhy,
  thinText,
  tomorrowLine,
  tomorrowWhy,
  weekLine,
  whereDetail,
  whereLine
} from './weatherCost';

/** Every no-break and narrow space as a plain one, so a literal reads as the screen does. */
const s = (t: string | null | undefined) => (t ?? '').replace(/[  ]/g, ' ');

afterEach(() => setLocale('fr'));

describe('weatherCost words', () => {
  it('says the three figures in plain words', () => {
    const f = figures(OK, 'octobre')!;
    expect(f.map((x) => s(x.value))).toEqual(['≈ 9,6 kWh/jour', '+2,3 kWh/jour', '52 %']);
    expect(s(f[0].sub)).toBe('hors chauffage · ≈ 1,94 €');
    expect(s(f[1].sub)).toBe('≈ +0,47 € aux prix d’aujourd’hui');
    expect(s(f[2].sub)).toBe('octobre, 17 jours');
    expect(f[1].rows.map((r) => s(r.value))).toContain('entre 2,24 kWh et 2,38 kWh (8 chances sur 10)');
  });
  it('a mild period and a period outside the window', () => {
    const mild = { ...OK, house: { ...OK.house, period_share: { ...OK.house.period_share!, mild: true } } };
    expect(figures(mild, 'octobre')![2].sub).toBe('presque pas de chauffage sur la période');
    const outside = { ...OK, house: { ...OK.house, period_share: null } };
    expect(figures(outside, 'mars')![2]).toMatchObject({ value: '—', sub: 'période hors des 12 derniers mois' });
  });
  it('hides with its reason and counts', () => {
    expect(figures(HIDDEN, 'octobre')).toBeNull();
    expect(s(houseWhy(HIDDEN.house))).toBe('pas encore assez de jours mesurés avec la météo : 12 sur 28');
    expect(houseWhy({ ...HIDDEN.house, why: 'poor_fit' })).toMatch(/ne suit pas assez/);
    expect(houseWhy(OK.house)).toBeNull();
  });
  it('gives the thin reason', () => {
    expect(s(thinText(THIN.house.thin, 41, 30))).toBe('ajusté sur 41 jours seulement : l’estimation s’affinera');
    expect(thinText([], 41, 30)).toBeNull();
    expect(s(thinText(['few_cold_days'], 90, 12))).toBe('seulement 12 jours de chauffage observés');
  });
  it('reads a dot: outside, use, cost, the split matched to the day, expected, left out', () => {
    const r = pointRows(OK.house.points[0]);
    expect(r.rows.map((x) => x.key)).toEqual(['outside', 'kwh', 'eur', 'part-hc', 'part-hp', 'expected']);
    expect(r.spoken.startsWith(r.title)).toBe(true);
    const away = pointRows(OK.house.points.find((p) => p.excluded === 'away')!);
    expect(away.rows.at(-1)).toMatchObject({ key: 'excluded', value: 'absence' });
    const sample = pointRows({ ...OK.house.points[0], kwh: 27.31, parts: [{ key: 'hc', kwh: 9.1 }, { key: 'hp', kwh: 18.21 }] });
    expect(sample.rows.filter((x) => x.key?.startsWith('part')).map((x) => s(x.value))).toEqual(['9,10 kWh', '18,21 kWh']);
  });
  it('a forecast cell, its Fiche and the week add up', () => {
    const c = forecastCell(week()[0]);
    expect(s(c.value)).toBe('~6,28 €');
    expect(s(c.day)).toBe('lun. 19');
    expect(s(c.temp)).toBe('2,0 °C');
    expect(forecastCell({ ...week()[0], complete: false })).toMatchObject({ value: '—', why: 'prévision indisponible' });
    expect(s(forecastCell(HIDDEN.forecast.days[0]).value)).toBe('—');
    expect(s(forecastCell({ ...week()[0], heating_eur: null, eur: null, eur_why: 'tempo_colour_unknown' }).value)).toBe('~31,2 kWh');
    expect(s(weekLine(OK.forecast))).toBe('≈ 57,60 € sur 7 jours, dont 44,01 € de chauffage');
    expect(weekLine(HIDDEN.forecast)).toBeNull();
    const rows = forecastRows(week()[0]).map((r) => r.label);
    expect(rows).toContain('Consommation prévue');
    expect(rows).toContain('Coût prévu (énergie)');
    expect(forecastRows(week()[0]).find((r) => r.key === 'model')!.value).toMatch(/AROME HD/);
  });
  it('says tomorrow', () => {
    expect(s(tomorrowLine(FORECAST.forecast))).toBe('2,0 °C → ~6,28 € de chauffage');
    const warm = { ...FORECAST.forecast, days: [{ ...FORECAST.forecast.days[0], heating_kwh: 0, heating_eur: 0, t_c: 22 }] };
    expect(s(tomorrowLine(warm))).toBe('22,0 °C, pas de chauffage prévu');
    const tempo = { ...FORECAST.forecast, days: [{ ...FORECAST.forecast.days[0], heating_eur: null, eur: null, eur_why: 'tempo_colour_unknown' as const }] };
    expect(tomorrowLine(tempo)).toContain('couleur Tempo inconnue');
    expect(tomorrowLine(HIDDEN.forecast)).toBeNull();
    expect(tomorrowWhy({ house: { ...HIDDEN.house, why: 'few_heating_days' }, forecast: HIDDEN.forecast })).toBe('pas assez de jours de chauffage pour l’instant');
    expect(tomorrowWhy(FORECAST)).toBeNull();
  });
  it('room and where lines', () => {
    expect(s(roomValue(ROOM))).toBe('+0,8 kWh par °C plus froid');
    expect(roomRows(ROOM).map((r) => s(r.label))).toContain('mesuré sur 41 jours sur 60');
    const hidden = { ...ROOM, state: 'hidden' as const, why: 'few_days' as const, kwh_per_c: null, coverage: { days: 12, of: 60, share: 0.2 } };
    expect(roomValue(hidden)).toBe('—');
    expect(s(roomWhy(hidden))).toBe('pas encore assez de jours mesurés avec la météo : 12 sur 28');
    expect(s(whereLine(OK.rooms.items, () => 'Salon'))).toBe('Par °C plus froid : Salon +0,8 kWh');
    expect(whereLine([], () => 'x')).toBeNull();
    expect(s(whereDetail(OK.rooms.items[0]))).toBe('Par °C plus froid +0,8 kWh/jour (≈ +0,17 €) · 41 jours sur 60');
  });
  it('projection sentence', () => {
    const w = { why: null, observed_days: 1, today: true, forecast_days: 7, normal_days: 9, kwh_lo: 398.2, kwh_hi: 426.9, eur_lo: 90.21, eur_hi: 95.99, spread: 'no_normals_spread' as const };
    const lines = projectionLines(w, true).map(s);
    expect(lines[0]).toBe(
      'entre 90,21 € et 95,99 € (8 chances sur 10) : 2 jours estimés sur la météo observée, 7 jours de prévision, 9 jours de normales de saison.'
    );
    expect(lines[1]).toContain('moins de 3 ans');
    expect(projectionLines({ ...w, why: 'no_normals' }, true)).toEqual(['normales de saison pas encore disponibles']);
    expect(projectionLines(null, true)).toEqual([]);
  });
  it('method lines name the exclusions and the price', () => {
    const l = s(methodLines(OK).join(' '));
    expect(l).toContain('301 jours retenus · 9 d’absence · 4 atypiques · 15 sans relevé');
    expect(l).toContain('0,2016 €/kWh');
    expect(l).toContain('5 dernières années');
  });
  it('reads in English', () => {
    setLocale('en');
    expect(figures(OK, 'October')!.map((x) => x.value)).toEqual(['≈ 9.6 kWh/day', '+2.3 kWh/day', '52%']);
    expect(s(tomorrowLine(FORECAST.forecast))).toBe('2.0 °C → ~€6.28 of heating');
    expect(s(whereLine(OK.rooms.items, () => 'Living room'))).toBe('Per °C colder: Living room +0.8 kWh');
  });
});
