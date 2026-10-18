import { describe, expect, it } from 'vitest';
import type { WeatherView } from './api/types';
import { setLocale } from './i18n';
import { at, NOW, VIEW } from './weather.fixture';
import { chipReason, chipValue, modelName, normalisedLine, outdoorRows, placeLine, viewModel, weatherFiche, weatherSource, whyText } from './weather';

const NB = ' ';
const view = (over: Partial<WeatherView> = {}): WeatherView => ({ ...VIEW, ...over });

describe('weather words', () => {
  it('the chip reads the current hour, one decimal, in both languages', () => {
    setLocale('fr');
    expect(chipValue(view())).toBe(`4,2${NB}°C`);
    setLocale('en');
    expect(chipValue(view())).toBe(`4.2${NB}°C`); // fmtTemp keeps the no-break space in both languages
    setLocale('fr');
  });

  it('no value yet says why', () => {
    expect(chipValue(view({ now: null }))).toBe('—');
    expect(chipReason(view(), NOW)).toBeNull();
    expect(chipReason(view({ now: null, fetch: { state: 'never', next: null, error_since: null } }), NOW)).toMatch(/premier relevé/);
    expect(chipReason(view({ now: null, fetch: null }), NOW)).toMatch(/premier relevé/);
    expect(chipReason(view({ now: null, fetch: { state: 'error', next: at(15) + 1320, error_since: at(13) } }), NOW)).toMatch(/15:22/);
    expect(chipReason(view({ now: null, fetch: { state: 'error', next: null, error_since: at(13) } }), NOW)).toBe('Open-Meteo injoignable');
    expect(chipReason(view({ now: null, fetch: { state: 'quota', next: null, error_since: null } }), NOW)).toMatch(/limite/);
  });

  it('the Fiche has the exact rows, the model and the attribution link', () => {
    const f = weatherFiche(view(), NOW);
    expect(f.title).toBe('Température extérieure');
    expect(f.rows.map((r) => r.label)).toEqual(['Maintenant', 'Ressenti', 'Humidité', 'Minimum', 'Maximum']);
    expect(f.rows[2].value).toBe(`86${NB}%`);
    expect(f.rows[3].value).toBe(`1,9${NB}°C à 06:00`);
    expect(f.rows[4].value).toMatch(/9,8.*prévu.*15:00/);
    expect(f.provenance.nature).toBe('published');
    expect(f.provenance.rows[0].value).toBe('Météo-France AROME HD via Open-Meteo');
    expect(f.provenance.rows.at(-1)!.value).toBe('publié');
    expect(f.link).toEqual({ label: expect.stringMatching(/Open-Meteo/), href: 'https://open-meteo.com/' });
  });

  it('a Fiche before the first reading: « — » and its reason, no today rows', () => {
    const f = weatherFiche(view({ now: null, today: null, fetched_at: null, fetch: { state: 'never', next: null, error_since: null } }), NOW);
    expect(f.rows).toHaveLength(1);
    expect(f.rows[0]).toMatchObject({ value: '—', note: 'premier relevé en cours' });
    expect(f.provenance.rows.map((r) => r.label)).toEqual(['Source', 'Nature']);
  });

  it('model names, unknown ones read as several models', () => {
    expect(modelName('era5_land')).toBe('ERA5-Land (réanalyse Copernicus) via Open-Meteo');
    expect(modelName(null)).toBe('source en attente');
    expect(modelName('something_new')).toBe('Plusieurs modèles via Open-Meteo');
  });

  it('a place outside France before its first reading never claims AROME HD (Genève, best match)', () => {
    const geneva = view({ mode: 'best_match', now: null, today: null, fetched_at: null, fetch: { state: 'never', next: null, error_since: null } });
    expect(viewModel(geneva)).toBe('best_match');
    const src = weatherSource(geneva, null, NOW);
    expect(src.rows[0]).toMatchObject({ label: 'Modèle', value: 'Open-Meteo (meilleur modèle disponible)' });
    expect(src.provenance.rows[0].value).toBe('Open-Meteo (meilleur modèle disponible)');
    expect(weatherFiche(geneva, NOW).provenance.rows[0].value).toBe('Open-Meteo (meilleur modèle disponible)');
    expect(JSON.stringify(src)).not.toContain('AROME');
    expect(viewModel(view({ mode: 'meteofrance', now: null }))).toBe('arome_hd'); // the model a French place asks for
    expect(viewModel(view({ now: { ...VIEW.now!, model: 'arpege' } }))).toBe('arpege'); // the hour's own model wins
    expect(viewModel(null)).toBeNull();
  });

  it('a place line and the inspector rows', () => {
    expect(placeLine({ name: 'Lyon', admin1: 'Auvergne-Rhône-Alpes', admin2: 'Rhône', country_code: 'FR', lat: 45.76, lon: 4.84, elevation_m: 173 })).toBe(
      `Lyon · Rhône · 173${NB}m`
    );
    expect(placeLine({ name: 'Genève', admin1: 'Genève', admin2: null, country_code: 'CH', lat: 46.2, lon: 6.15, elevation_m: 375 })).toBe(
      `Genève · Genève (CH) · 375${NB}m`
    );
    const rows = outdoorRows({ mean_c: 6.3, min_c: 1.2, max_c: 11.0, dju: null, days: 12, of: 14 });
    expect(rows.map((r) => r.key)).toEqual(['outdoor', 'dju']);
    expect(rows.map((r) => r.value)).toEqual([`6,3${NB}°C`, '—']);
    expect(rows[1].note).toMatch(/12 jours sur 14/);
    expect(outdoorRows({ mean_c: 6.3, min_c: 1.2, max_c: 11, dju: 11.7, days: 1, of: 1 }).map((r) => r.value)).toEqual([`6,3${NB}°C`, '11,7']);
    expect(outdoorRows({ mean_c: null, min_c: null, max_c: null, dju: null, days: 0, of: 3 })[0].note).toBe('pas de météo pour cette période');
    expect(outdoorRows(null)).toEqual([]);
  });

  it('the normalised line is never coloured and hides without a change', () => {
    expect(normalisedLine({ change: -0.08, why: null, dju_cur: 312, dju_ref: 268, expected_cur_kwh: 1, expected_ref_kwh: 1, model: null })).toBe(
      `−8${NB}% à météo égale`
    );
    expect(normalisedLine({ change: null, why: 'few_days', dju_cur: null, dju_ref: null, expected_cur_kwh: null, expected_ref_kwh: null, model: null })).toBeNull();
    expect(normalisedLine(null)).toBeNull();
    expect(whyText('few_days')).toMatch(/28 jours/);
    expect(whyText('a_new_reason')).toBeNull();
    expect(whyText(null)).toBeNull();
  });

  it('reads in English', () => {
    setLocale('en');
    expect(normalisedLine({ change: -0.08, why: null, dju_cur: 1, dju_ref: 1, expected_cur_kwh: 1, expected_ref_kwh: 1, model: null })).toBe('−8% weather-adjusted');
    expect(weatherFiche(view(), NOW).rows[4].value).toMatch(/9\.8.*expected around 15:00/);
    setLocale('fr');
  });
});

describe('the Énergie source line (Plan 14)', () => {
  it('« Météo · Open-Meteo », its freshness, a Fiche with the model, the last reading, the period’s days and the link', () => {
    const src = weatherSource(VIEW, { mean_c: 6.3, min_c: 1, max_c: 11, dju: null, days: 12, of: 14 }, NOW);
    expect([src.source, src.text, src.state]).toEqual(['Météo', 'Open-Meteo', 'fresh']);
    expect(src.title).toBe('Température extérieure');
    expect(src.rows.map((r) => [r.label, r.value])).toEqual([
      ['Modèle', 'Météo-France AROME HD via Open-Meteo'],
      ['Dernier relevé', '14:17'],
      ['Jours avec météo', '12 sur 14']
    ]);
    expect(src.provenance.nature).toBe('published');
    expect(src.link.href).toBe('https://open-meteo.com/');
    expect(weatherSource({ ...VIEW, fetched_at: null }, null, NOW).rows.map((r) => r.label)).toEqual(['Modèle', 'Dernier relevé']);
    expect(weatherSource({ ...VIEW, fetch: { state: 'error', next: null, error_since: at(13) } }, null, NOW).state).toBe('bad');
  });
});
