import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '$lib/api/client';
import type { RoomEnergy as RE } from '$lib/api/types';
import { applyLocale } from '$lib/i18n';
import { forEachLocale } from '$lib/i18n/testing';
import { resetRoomData } from '$lib/stores/roomdata.svelte';
import { weather } from '$lib/stores/weather.svelte';
import { VIEW } from '$lib/weather.fixture';
import { ROOM } from '$lib/weatherModel.fixture';
import RoomFigures from './RoomFigures.svelte';

vi.mock('$lib/api/client', () => ({ api: { roomEnergy: vi.fn() }, ApiError: class extends Error {} }));

const full: RE = {
  from: '2026-10-14', to: '2026-10-14', days: 1, kwh: 4.567, hc_kwh: 1.5, hp_kwh: 3.067, eur: 1.23, heating_hours: 3.04,
  coverage: 1, interpolated: false, apportioned: false, priced: true
};
const props = { roomId: 'salon', days: 1, now: Date.parse('2026-10-14T12:00:00Z'), rangeLabel: '24 h' };

beforeEach(() => {
  resetRoomData();
  vi.mocked(api.roomEnergy).mockReset();
});

const media = vi.hoisted(() => ({ desktop: { matches: true } }));
vi.mock('$lib/media.svelte', () => media);

describe('RoomFigures', () => {
  it('data on demand: each figure is a Fig whose Fiche gives the exact value, its parts and its source', async () => {
    vi.mocked(api.roomEnergy).mockResolvedValue({ ...full, apportioned: true });
    render(RoomFigures, props);
    const kwh = await screen.findByRole('button', { name: /^4,57\skWh est\., détails$/ });
    await fireEvent.click(kwh);
    const card = document.querySelector('.fiche')!;
    expect(card.querySelector('.title')).toHaveTextContent('Énergie aujourd’hui');
    const cell = (r: Element, t: string) => r.querySelector(t)!.textContent!.replace(/\s/g, ' ');
    const rows = [...card.querySelectorAll('dl:not(.prov) .row')].map((r) => `${cell(r, 'dt')}|${cell(r, 'dd')}`);
    expect(rows).toEqual(['Consommation|4,57 kWhest.', 'dont heures creuses|1,50 kWh', 'dont heures pleines|3,07 kWh', 'Période relevée|100,0 %']);
    const prov = [...card.querySelectorAll('.prov .row')].map((r) => `${cell(r, 'dt')}|${cell(r, 'dd')}`);
    expect(prov[0]).toBe('Source|Compteurs des radiateurs');
    expect(prov.at(-1)).toBe('Nature|estimé · réparti entre deux relevés du compteur');
    await fireEvent.keyDown(card, { key: 'Escape' });
    expect(document.querySelector('.fiche')).toBeNull();
    // The cost is calculated from your tariff; heating hours by Kelvin.
    await fireEvent.click(screen.getByRole('button', { name: /^1,23\s€, détails$/ }));
    expect([...document.querySelectorAll('.fiche .prov .row')].map((r) => `${cell(r, 'dt')}|${cell(r, 'dd')}`)).toEqual([
      'Source|Votre tarif',
      'Nature|calculé · kWh × vos prix, hors abonnement'
    ]);
    document.querySelectorAll('.fiche').forEach((n) => n.remove());
  });

  it('a skeleton, then kWh, € and heating hours in seconds', async () => {
    vi.mocked(api.roomEnergy).mockResolvedValue(full);
    const { container } = render(RoomFigures, props);
    expect(container.querySelector('.skeleton')).not.toBeNull();
    expect(await screen.findByText(/4,57/)).toBeInTheDocument();
    expect(screen.getByText(/1,23/)).toBeInTheDocument();
    expect(screen.getByText(/3,0\s?h/)).toBeInTheDocument();
    expect(api.roomEnergy).toHaveBeenCalledWith('salon', 1);
    expect(screen.queryByText('est.')).toBeNull();
  });
  it('est. when interpolated, the partial note, and a tariff link without prices', async () => {
    vi.mocked(api.roomEnergy).mockResolvedValue({ ...full, interpolated: true, coverage: 0.5, priced: false, eur: null });
    render(RoomFigures, props);
    expect(await screen.findByText('est.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Renseigner le tarif' })).toHaveAttribute('href', '/home/tariff');
    expect(screen.getByText(/relevé sur 50/)).toBeInTheDocument();
  });
  it('days without a Tempo colour: the priced days\' € with the reason, as the radiator block', async () => {
    vi.mocked(api.roomEnergy).mockResolvedValue({ ...full, missing_colour_days: 2 });
    render(RoomFigures, props);
    expect(await screen.findByText(/1,23/)).toBeInTheDocument();
    expect(screen.getByText(/énergie de 2 jours sans couleur Tempo non comptée/)).toBeInTheDocument();
  });
  it('no priced day at all: — with the same reason', async () => {
    vi.mocked(api.roomEnergy).mockResolvedValue({ ...full, eur: null, missing_colour_days: 1 });
    render(RoomFigures, props);
    expect(await screen.findByText(/énergie de 1 jour sans couleur Tempo non comptée/)).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });
  it('every value unknown: one sentence with its reason, never a row of — or a 0', async () => {
    vi.mocked(api.roomEnergy).mockResolvedValue({ ...full, kwh: null, eur: null, heating_hours: null, coverage: null });
    render(RoomFigures, props);
    expect(await screen.findByText('Pas encore assez de relevés depuis minuit.')).toBeInTheDocument();
    expect(screen.queryByText('—')).toBeNull();
  });
  it('some values unknown read —, never 0', async () => {
    vi.mocked(api.roomEnergy).mockResolvedValue({ ...full, eur: null, heating_hours: null });
    render(RoomFigures, props);
    expect(await screen.findAllByText('—')).toHaveLength(2);
  });
  it('24 h: the share of time heating, after its skeleton; full-power hours say so', async () => {
    vi.mocked(api.roomEnergy).mockResolvedValue(full);
    const { container, rerender } = render(RoomFigures, { ...props, duty: 'loading' });
    await Promise.resolve();
    expect(container.querySelector('.skeleton')).not.toBeNull();
    await rerender({ ...props, duty: 0.17 });
    expect(await screen.findByText('Part du temps en chauffe')).toBeInTheDocument();
    expect(screen.getByText(/^17\s%$/)).toBeInTheDocument();
    expect(screen.getByText('à pleine puissance')).toBeInTheDocument();
  });
  it('a failed load reads — as well', async () => {
    vi.mocked(api.roomEnergy).mockRejectedValue(new Error('x'));
    render(RoomFigures, props);
    expect(await screen.findAllByText('—')).toHaveLength(3);
  });
});

forEachLocale((l) => {
  it('titles', async () => {
    vi.mocked(api.roomEnergy).mockResolvedValue(full);
    render(RoomFigures, props);
    expect(await screen.findByText(l === 'fr' ? 'Énergie aujourd’hui' : 'Energy today')).toBeInTheDocument();
    expect(screen.getByText(l === 'fr' ? 'Heures de chauffe' : 'Heating hours')).toBeInTheDocument();
  });
});

describe('RoomFigures today (one window: since midnight)', () => {
  // 04:54 in Paris: the radiators' meters have not moved since midnight, the heating rate has.
  const early = { ...props, now: Date.parse('2026-10-14T02:54:00Z') };
  const blank: RE = { ...full, kwh: null, hc_kwh: null, hp_kwh: null, eur: null, heating_hours: 0, coverage: null };
  it('is titled « Énergie aujourd’hui », shows no measured-looking 0,0 h, and says why kWh and hours are unknown', async () => {
    vi.mocked(api.roomEnergy).mockResolvedValue(blank);
    render(RoomFigures, { ...early, duty: 0.15 });
    expect(await screen.findByText('Énergie aujourd’hui')).toBeInTheDocument();
    expect(screen.queryByText(/0,0\sh/)).toBeNull();
    expect(screen.getByText(/^Consommation et heures de chauffe\s: pas encore de relevé de compteur aujourd’hui\.$/)).toBeInTheDocument();
    const duty = screen.getByRole('button', { name: /^15\s%, détails$/ });
    await fireEvent.click(duty);
    expect(screen.getByText(/depuis minuit/)).toBeInTheDocument();
  });
  it('in English', async () => {
    applyLocale('en');
    try {
      vi.mocked(api.roomEnergy).mockResolvedValue(blank);
      render(RoomFigures, { ...early, duty: 0.15 });
      expect(await screen.findByText('Energy today')).toBeInTheDocument();
      expect(screen.getByText('Consumption and heating hours: no meter reading today yet.')).toBeInTheDocument();
    } finally {
      applyLocale('fr');
    }
  });
});

describe('RoomFigures: « Froid » (Plan 15)', () => {
  const nb = (t: string | null | undefined) => (t ?? '').replace(/[\u00a0\u202f]/g, ' ');
  beforeEach(() => weather.apply(VIEW));
  afterEach(() => weather.reset());
  it('a row « Froid » whose Fiche gives the coverage, R² and the balance point', async () => {
    vi.mocked(api.roomEnergy).mockResolvedValue({ ...full, weather: ROOM });
    render(RoomFigures, props);
    const fig = await screen.findByRole('button', { name: /par °C plus froid estimation, détails$/ }); // thin: « estimation »
    expect(nb(fig.textContent)).toBe('+0,8 kWh par °C plus froid');
    expect(fig.nextElementSibling).toHaveTextContent('estimation');
    await fireEvent.click(fig);
    const card = nb(document.querySelector('.fiche')!.textContent);
    expect(card).toContain('mesuré sur 41 jours sur 60');
    expect(card).toContain('Qualité de l’ajustement (R²)');
    expect(card).toContain('Point d’équilibre');
    expect(card).toContain('calculé');
    expect(card).toContain('ajusté sur 41 jours seulement');
    document.querySelectorAll('.fiche').forEach((n) => n.remove());
  });
  it('a hidden model reads « — » and says why with the room’s own days', async () => {
    const hidden = { ...ROOM, state: 'hidden' as const, why: 'few_days' as const, kwh_per_c: null, kwh_per_c_range: null, eur_per_c: null, coverage: { days: 12, of: 60, share: 0.2 } };
    vi.mocked(api.roomEnergy).mockResolvedValue({ ...full, weather: hidden });
    render(RoomFigures, props);
    await fireEvent.click(await screen.findByRole('button', { name: '—, détails' }));
    expect(nb(document.querySelector('.fiche')!.textContent)).toContain('pas encore assez de jours mesurés avec la météo : 12 sur 28');
    document.querySelectorAll('.fiche').forEach((n) => n.remove());
  });
  it('without a place: no row', async () => {
    weather.apply(null);
    vi.mocked(api.roomEnergy).mockResolvedValue({ ...full, weather: null });
    const { container } = render(RoomFigures, props);
    await screen.findByRole('button', { name: /^4,57\skWh, détails$/ });
    expect(container.querySelector('.cold')).toBeNull();
  });
  it('with a place the skeleton is taller by the row it holds', () => {
    vi.mocked(api.roomEnergy).mockReturnValue(new Promise(() => {}));
    const { container } = render(RoomFigures, props);
    expect((container.querySelector('.skeleton') as HTMLElement).style.height).toBe('136px');
  });
});
