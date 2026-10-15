import { render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '$lib/api/client';
import type { RoomEnergy as RE } from '$lib/api/types';
import { forEachLocale } from '$lib/i18n/testing';
import { resetRoomData } from '$lib/stores/roomdata.svelte';
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

describe('RoomFigures', () => {
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
    expect(screen.getByRole('link', { name: 'Renseignez le tarif' })).toHaveAttribute('href', '/home#tariff');
    expect(screen.getByText(/relevé sur 50/)).toBeInTheDocument();
  });
  it('every value unknown: one sentence with its reason, never a row of — or a 0', async () => {
    vi.mocked(api.roomEnergy).mockResolvedValue({ ...full, kwh: null, eur: null, heating_hours: null, coverage: null });
    render(RoomFigures, props);
    expect(await screen.findByText(/^Pas encore assez de relevés sur 24.h \(il faut au moins la moitié de la période\)\.$/)).toBeInTheDocument();
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
    expect(screen.getByText('équiv. pleine puissance')).toBeInTheDocument();
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
    expect(await screen.findByText(l === 'fr' ? 'Énergie sur 24 h' : 'Energy over 24 h', { normalizer: (t) => t })).toBeInTheDocument();
    expect(screen.getByText(l === 'fr' ? 'Heures de chauffe' : 'Heating hours')).toBeInTheDocument();
  });
});
