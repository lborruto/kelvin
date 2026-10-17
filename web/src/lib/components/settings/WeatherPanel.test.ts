import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '$lib/api/client';
import type { WeatherSettings } from '$lib/api/types';
import { applyLocale } from '$lib/i18n';
import { weather } from '$lib/stores/weather.svelte';
import { VIEW } from '$lib/weather.fixture';
import WeatherPanel from './WeatherPanel.svelte';

vi.mock('$lib/api/client', async (orig) => {
  const real = await orig<typeof import('$lib/api/client')>();
  return {
    ...real,
    api: {
      weatherSettings: vi.fn(),
      putWeather: vi.fn(),
      deleteWeather: vi.fn(),
      weatherSearch: vi.fn()
    }
  };
});

const NB = ' ';
const OFF: WeatherSettings = { location: null, coverage: null, calls_today: 0, budget: 400, attribution: { url: 'https://open-meteo.com/', licence: 'CC BY 4.0' } };
const LYON: WeatherSettings = {
  location: {
    name: 'Lyon', admin1: 'Auvergne-Rhône-Alpes', admin2: 'Rhône', country_code: 'FR', lat: 45.76, lon: 4.84, elevation_m: 173,
    elevation_source: 'geocoder', origin: 'search', mode: 'meteofrance'
  },
  coverage: { first_day: '2025-11-03', last_day: '2026-11-19', complete_days: 382, from: '2025-11-03' },
  calls_today: 31,
  budget: 400,
  attribution: { url: 'https://open-meteo.com/', licence: 'CC BY 4.0' }
};

beforeEach(() => {
  vi.mocked(api.weatherSettings).mockReset();
  vi.mocked(api.putWeather).mockReset();
  vi.mocked(api.deleteWeather).mockReset().mockResolvedValue(undefined);
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false;
  };
  weather.reset();
});
afterEach(() => applyLocale('fr'));

const row = (label: string) => screen.getByText(label, { selector: 'dt' }).closest('.li')!.querySelector('dd')!.textContent!.trim();

describe('WeatherPanel', () => {
  it('skeleton rows first, then the off state: lead, privacy, search, coordinates, attribution', async () => {
    vi.mocked(api.weatherSettings).mockResolvedValue(OFF);
    const onstate = vi.fn();
    const { container } = render(WeatherPanel, { onstate });
    expect(container.querySelector('.skeleton')).not.toBeNull();
    expect(await screen.findByText(/Kelvin peut afficher la température extérieure/)).toBeTruthy();
    expect(screen.getByText(/Seules les coordonnées et l’altitude/)).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Rechercher une commune' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Utiliser des coordonnées' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open-Meteo.com' })).toHaveAttribute('href', 'https://open-meteo.com/');
    expect(screen.getByRole('link', { name: 'GeoNames' })).toHaveAttribute('href', 'https://www.geonames.org/');
    expect(onstate).toHaveBeenLastCalledWith('Désactivée');
  });

  it('coordinates: an out-of-range latitude gets the API’s words under the fields, never the typed figure', async () => {
    vi.mocked(api.weatherSettings).mockResolvedValue(OFF);
    vi.mocked(api.putWeather).mockRejectedValue(new ApiError(422, 'Lieu invalide', 'weather_location_invalid', {}));
    render(WeatherPanel);
    await fireEvent.click(await screen.findByRole('button', { name: 'Utiliser des coordonnées' }));
    await fireEvent.input(screen.getByLabelText('Latitude'), { target: { value: '91,5' } });
    await fireEvent.input(screen.getByLabelText('Longitude'), { target: { value: '-4,8123' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(api.putWeather).toHaveBeenCalledWith({ lat: 91.5, lon: -4.8123, elevation_m: null, origin: 'manual' });
    const err = await screen.findByText(/latitude de −90 à 90/);
    expect(err.textContent).not.toMatch(/91/);
    expect(screen.getByLabelText('Latitude').getAttribute('aria-describedby')).toContain(err.id);
  });

  it('coordinates that are not numbers are refused before any call', async () => {
    vi.mocked(api.weatherSettings).mockResolvedValue(OFF);
    render(WeatherPanel);
    await fireEvent.click(await screen.findByRole('button', { name: 'Utiliser des coordonnées' }));
    await fireEvent.input(screen.getByLabelText('Latitude'), { target: { value: 'abc' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(api.putWeather).not.toHaveBeenCalled();
    expect(screen.getByText(/degrés décimaux/)).toBeTruthy();
  });

  it('on: the place, its coordinates, altitude, model, history and calls; the attribution link', async () => {
    vi.mocked(api.weatherSettings).mockResolvedValue(LYON);
    weather.apply(VIEW);
    const onstate = vi.fn();
    render(WeatherPanel, { onstate });
    await screen.findByText('Lieu', { selector: 'dt' });
    expect(row('Lieu')).toBe(`Lyon · Rhône · 173${NB}m`);
    expect(row('Coordonnées')).toBe('45,76 · 4,84');
    expect(row('Altitude')).toBe(`173${NB}m · commune`);
    expect(row('Modèle')).toBe(`Météo-France AROME HD, 1,5${NB}km`);
    expect(row('Historique')).toBe('depuis le 3 novembre 2025');
    expect(row('Appels aujourd’hui')).toBe('31 sur 400');
    expect(row('Dernier relevé')).toMatch(/14:17/);
    expect(screen.getByRole('link', { name: 'Open-Meteo.com' })).toHaveAttribute('href', 'https://open-meteo.com/');
    expect(onstate).toHaveBeenLastCalledWith(expect.stringMatching(/^Lyon · Rhône · 173.m · relevé 14:17$/));
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('history still being fetched; a hand-typed place is named by its coordinates', async () => {
    vi.mocked(api.weatherSettings).mockResolvedValue({
      ...LYON,
      location: { ...LYON.location!, name: null, admin1: null, admin2: null, country_code: null, elevation_m: null, elevation_source: 'none', origin: 'manual', mode: 'best_match' },
      coverage: { from: '2025-11-03' }
    });
    render(WeatherPanel);
    await screen.findByText('Lieu', { selector: 'dt' });
    expect(row('Lieu')).toBe('Coordonnées 45,76 · 4,84');
    expect(row('Altitude')).toBe('— · non fournie');
    expect(row('Modèle')).toBe('Open-Meteo, meilleur modèle (hors France)');
    expect(row('Historique')).toBe('en cours de récupération');
  });

  it('the history ends: once every source was asked, it says where it starts and why', async () => {
    vi.mocked(api.weatherSettings).mockResolvedValue({ ...LYON, coverage: { first_day: '2025-12-01', complete_days: 350, from: '2025-11-03', pending: false } });
    const { unmount } = render(WeatherPanel);
    await screen.findByText('Lieu', { selector: 'dt' });
    expect(row('Historique')).toBe('depuis le 1er décembre 2025 (plus ancien non publié par Open-Meteo)');
    unmount();
    vi.mocked(api.weatherSettings).mockResolvedValue({ ...LYON, coverage: { from: '2025-11-03', pending: false } });
    render(WeatherPanel);
    await screen.findByText('Lieu', { selector: 'dt' });
    expect(row('Historique')).toBe('aucun jour publié par Open-Meteo');
  });

  it('« Changer de lieu » shows the search; a pick saves the place', async () => {
    vi.mocked(api.weatherSettings).mockResolvedValue(LYON);
    vi.mocked(api.putWeather).mockResolvedValue(LYON);
    render(WeatherPanel);
    await fireEvent.click(await screen.findByRole('button', { name: 'Changer de lieu' }));
    expect(screen.getByRole('combobox', { name: 'Rechercher une commune' })).toBeTruthy();
  });

  it('a new place forgets the cached outdoor hours (the room charts ask again)', async () => {
    vi.mocked(api.weatherSettings).mockResolvedValue(OFF);
    vi.mocked(api.putWeather).mockResolvedValue(LYON);
    weather.apply(VIEW);
    weather.entries = { k: { status: 'ok', points: [{ t: 0, v: 3 }], at: Date.now() } };
    const spy = vi.spyOn(weather, 'placeChanged');
    render(WeatherPanel);
    await fireEvent.click(await screen.findByRole('button', { name: 'Utiliser des coordonnées' }));
    await fireEvent.input(screen.getByLabelText('Latitude'), { target: { value: '45,76' } });
    await fireEvent.input(screen.getByLabelText('Longitude'), { target: { value: '4,84' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(weather.entries).toEqual({});
    spy.mockRestore();
  });

  it('« Supprimer » asks in a sheet, Annuler focused; confirming removes once and shows the off state', async () => {
    vi.mocked(api.weatherSettings).mockResolvedValue(LYON);
    render(WeatherPanel);
    await fireEvent.click(await screen.findByRole('button', { name: 'Supprimer' }));
    const dialog = screen.getByRole('dialog', { hidden: true });
    expect(dialog).toHaveAttribute('open');
    expect(within(dialog).getByText('Les températures extérieures enregistrées seront effacées.')).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toHaveTextContent('Annuler'));
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Supprimer', hidden: true }));
    expect(api.deleteWeather).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('combobox', { name: 'Rechercher une commune' })).toBeTruthy();
    expect(weather.view).toBeNull();
  });

  it('reads in English', async () => {
    applyLocale('en');
    vi.mocked(api.weatherSettings).mockResolvedValue(LYON);
    render(WeatherPanel);
    await screen.findByText('Place', { selector: 'dt' });
    expect(row('Coordinates')).toBe('45.76, 4.84');
    expect(row('Calls today')).toBe('31 of 400');
    expect(row('History')).toBe('since 3 November 2025');
  });
});
