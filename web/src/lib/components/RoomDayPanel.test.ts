import { fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyLocale } from '$lib/i18n';
import type { EnergyDay } from '$lib/api/types';
import { house } from '$lib/stores/house.svelte';
import RoomDayPanel from './RoomDayPanel.svelte';

const media = vi.hoisted(() => ({ desktop: { matches: false } }));
vi.mock('$lib/media.svelte', () => media);

const t0 = Date.UTC(2026, 9, 12, 22) / 1000;
const day = (room: string | null, date = '2026-10-13'): EnergyDay => ({
  date, complete: true, points: 1,
  intervals: [{ ts: t0, minutes: 30, wh: 500, w: 1000, offpeak: null, boundary: false, price: null, eur: null, radiators_wh: 120, radiators_known: 1, radiators_total: 1, radiators_interp: false, radiators_apportioned: false, by_room: { salon: 120 } }],
  totals: { curve_kwh: 0.5, daily_kwh: null, hc_kwh: null, hp_kwh: null, split_method: null, hc_kwh_curve: null, hp_kwh_curve: null },
  power: { peak_w: null, peak_ts: null, base_w_p10: null, night_min_w: null, kva: null },
  available: [],
  counted_from: null,
  not_counted: null,
  room: room ? { id: room, name: room === 'salon' ? 'Salon' : 'Chambre', samples: [], overrides: [] } : null
});
const base = { dayIso: '2026-10-13', error: null, onretry: vi.fn() };

beforeEach(() => {
  media.desktop.matches = false;
  house.applySnapshot({
    house: {
      rooms: [{ id: 'salon', name: 'Salon', radiator_ids: ['a'] }, { id: 'chambre', name: 'Chambre', radiator_ids: ['b'] }] as never,
      radiators: [] as never
    },
    pending: [], overrides: [], status: { connected: true, last_ok_at: null, last_error: null }
  });
});

describe('RoomDayPanel', () => {
  it('a phone picks the room with a select, and the chart shows the chosen room’s day', async () => {
    const onroom = vi.fn();
    render(RoomDayPanel, { ...base, day: day('salon'), room: 'salon', onroom });
    expect(screen.getByRole('heading', { name: 'Température et chauffe' })).toBeInTheDocument();
    expect(screen.getByText('le 13 octobre 2026')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Radiateurs, température et consigne · Salon · 13 octobre 2026' })).toBeInTheDocument();
    const select = screen.getByRole('combobox', { name: 'Pièce' });
    expect([...select.querySelectorAll('option')].map((o) => o.textContent)).toEqual(['Salon', 'Chambre']);
    await fireEvent.change(select, { target: { value: 'chambre' } });
    expect(onroom).toHaveBeenCalledWith('chambre');
  });

  it('a desktop picks the room with a Segmented', async () => {
    media.desktop.matches = true;
    const onroom = vi.fn();
    render(RoomDayPanel, { ...base, day: day('salon'), room: 'salon', onroom });
    await fireEvent.click(screen.getByRole('radio', { name: 'Chambre' }));
    expect(onroom).toHaveBeenCalledWith('chambre');
  });

  it('another room keeps the previous chart, dimmed and busy, until its day arrives (nothing moves)', () => {
    const { container } = render(RoomDayPanel, { ...base, day: day('salon'), room: 'chambre', onroom: vi.fn() });
    expect(container.querySelector('section')).toHaveAttribute('aria-busy', 'true');
    expect(container.querySelector('.body.stale')).not.toBeNull();
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('holds a skeleton while the day is on its way, and before the house is known', () => {
    const { container, unmount } = render(RoomDayPanel, { ...base, day: day('salon', '2026-10-12'), room: 'salon', onroom: vi.fn() });
    expect(container.querySelector('section')).toHaveAttribute('aria-busy', 'true');
    expect(container.querySelector('.body .skeleton')).not.toBeNull();
    unmount();
    house.reset();
    const r = render(RoomDayPanel, { ...base, day: day(null), room: null, onroom: vi.fn() });
    expect(r.container.querySelector('section')).toHaveAttribute('aria-busy', 'true');
    expect(r.container.querySelector('.pick .skeleton')).not.toBeNull();
    expect(r.container.querySelector('.body .skeleton')).not.toBeNull();
  });

  it('a house without rooms says so instead of a chart', () => {
    house.applySnapshot({ house: { rooms: [], radiators: [] as never }, pending: [], overrides: [], status: { connected: true, last_ok_at: null, last_error: null } });
    const { container } = render(RoomDayPanel, { ...base, day: day(null), room: null, onroom: vi.fn() });
    expect(screen.getByText('Aucune pièce avec un radiateur.')).toBeInTheDocument();
    expect(container.querySelector('section')).toHaveAttribute('aria-busy', 'false');
  });

  it('a chosen room that loses its radiators gives way to the first room, in the picker and in the day asked for', async () => {
    const onroom = vi.fn();
    const r = render(RoomDayPanel, { ...base, day: day('chambre'), room: 'chambre', onroom });
    expect((screen.getByRole('combobox', { name: 'Pièce' }) as HTMLSelectElement).value).toBe('chambre');
    expect(onroom).not.toHaveBeenCalled();
    // A live house update: Chambre has no radiator any more.
    house.applySnapshot({
      house: { rooms: [{ id: 'salon', name: 'Salon', radiator_ids: ['a'] }, { id: 'chambre', name: 'Chambre', radiator_ids: [] }] as never, radiators: [] as never },
      pending: [], overrides: [], status: { connected: true, last_ok_at: null, last_error: null }
    });
    await tick();
    expect(onroom).toHaveBeenCalledExactlyOnceWith('salon');
    const select = screen.getByRole('combobox', { name: 'Pièce' }) as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual(['Salon']);
    expect(select.value).toBe('salon');
    r.unmount();
    // Desktop: the Segmented checks the first room as well.
    media.desktop.matches = true;
    render(RoomDayPanel, { ...base, day: day('salon'), room: 'chambre', onroom: vi.fn() });
    expect(screen.getByRole('radio', { name: 'Salon' })).toBeChecked();
  });

  it('lists only rooms with a radiator', () => {
    house.applySnapshot({
      house: { rooms: [{ id: 'hall', name: 'Entrée', radiator_ids: [] }, { id: 'salon', name: 'Salon', radiator_ids: ['a'] }] as never, radiators: [] as never },
      pending: [], overrides: [], status: { connected: true, last_ok_at: null, last_error: null }
    });
    render(RoomDayPanel, { ...base, day: day('salon'), room: 'salon', onroom: vi.fn() });
    expect([...screen.getByRole('combobox', { name: 'Pièce' }).querySelectorAll('option')].map((o) => o.textContent)).toEqual(['Salon']);
  });

  it('a day before the first counted day, or without a curve, says why there is no chart', () => {
    const before = { ...day('salon'), intervals: [], points: 0, counted_from: '2026-10-20', not_counted: 'before_first_day' as const };
    const { unmount, container } = render(RoomDayPanel, { ...base, day: before, room: 'salon', onroom: vi.fn() });
    expect(container.querySelector('.body .note')).toHaveTextContent('Pas de données pour ce jour : antérieur au premier jour compté (depuis le 20 octobre 2026).');
    unmount();
    const r = render(RoomDayPanel, { ...base, day: { ...day('salon'), intervals: [], points: 0 }, room: 'salon', onroom: vi.fn() });
    expect(r.container.querySelector('.body .note')).toHaveTextContent('Pas de courbe Linky pour ce jour : les demi-heures de la pièce sont celles de la courbe.');
  });

  it('a failed day says so, with Réessayer', async () => {
    const onretry = vi.fn();
    render(RoomDayPanel, { ...base, day: null, room: 'salon', onroom: vi.fn(), error: 'Impossible de charger la courbe.', onretry });
    await fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(onretry).toHaveBeenCalled();
  });
});

it('in English: the heading, the day and the chart’s name', () => {
  applyLocale('en');
  render(RoomDayPanel, { ...base, day: day('salon'), room: 'salon', onroom: vi.fn() });
  expect(screen.getByRole('heading', { name: 'Temperature and heating' })).toBeInTheDocument();
  expect(screen.getByText('on 13 October 2026')).toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'Radiators, temperature and setpoint · Salon · 13 October 2026' })).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Room' })).toBeInTheDocument();
});
