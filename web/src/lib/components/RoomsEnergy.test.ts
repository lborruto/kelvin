import { fireEvent, render, within } from '@testing-library/svelte';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ByRadiator } from '$lib/api/types';
import { house } from '$lib/stores/house.svelte';
import RoomsEnergy from './RoomsEnergy.svelte';

const row = (id: string, room: string | null, o: Partial<ByRadiator> = {}): ByRadiator => ({
  radiator_id: id, room_id: room, kwh: 100, hc_kwh: 40, hp_kwh: 60, eur: 25, coverage: 1, interpolated: false,
  apportioned: false, from: '2026-09-01', temp_avg: 19.4, setpoint_avg: 20, heating_hours: 3, ...o
});
const rows = [row('a', 'salon'), row('b', 'salon', { kwh: 50, hc_kwh: 20, hp_kwh: 30, eur: 12.5, coverage: 0.6, from: '2026-10-07' })];
const span = { from: '2026-10-01', to: '2026-10-14' };

beforeEach(() => {
  house.applySnapshot({
    house: {
      rooms: [{ id: 'salon', name: 'Salon', radiator_ids: ['a', 'b'] }] as never,
      radiators: [{ id: 'a', room_id: 'salon', name: 'Fenêtre' }, { id: 'b', room_id: 'salon', name: 'Porte' }] as never
    },
    pending: [], overrides: [], status: { connected: true, last_ok_at: null, last_error: null }
  });
});

describe('RoomsEnergy', () => {
  it('a table of the selected period: units in the headers, bare figures in mono cells (M6)', () => {
    const { container, getByRole } = render(RoomsEnergy, { rows, span, tariff: true });
    expect(getByRole('heading', { name: 'Par pièce et par radiateur' })).toBeInTheDocument();
    expect(container.querySelector('.sub')).toHaveTextContent('du 1/10 au 13/10');
    const table = container.querySelector<HTMLElement>('.table')!;
    expect([...table.querySelectorAll('thead th')].map((t) => t.textContent)).toEqual([
      'Pièce', 'kWh', 'Part', 'HC (kWh)', 'HP (kWh)', '€', 'Moy. °C', 'Consigne moy. (°C)', 'Heures de chauffe (h)'
    ]);
    const cells = [...table.querySelectorAll('tbody tr.room td')].map((t) => t.textContent!.replace(/\s+/g, ' ').trim());
    expect(cells).toEqual(['150,00', '100,0 %', '60,00', '90,00', '37,50', '19,4', '20,0', '3,0']);
    expect(table.querySelector('tbody tr.room th')).toHaveTextContent('partiel · 1 radiateur sur 2 enregistré à partir du 7/10');
  });

  it('a room expands to its radiators', async () => {
    const { container } = render(RoomsEnergy, { rows, span, tariff: true });
    const table = within(container.querySelector<HTMLElement>('.table')!);
    const toggle = table.getByRole('button', { name: 'Salon' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(container.querySelectorAll('.table tr.rad')).toHaveLength(0);
    await fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const heads = [...container.querySelectorAll('.table tr.rad th')];
    expect(heads.map((t) => t.firstChild?.textContent?.trim())).toEqual(['Fenêtre', 'Porte']);
    expect(heads[1].querySelector('.partial')).toHaveTextContent('enregistré à partir du 7/10');
  });

  it('without a tariff there are no HC, HP or € columns; the phone list carries the same figures', () => {
    const { container } = render(RoomsEnergy, { rows, span, tariff: false });
    expect([...container.querySelectorAll('.table thead th')].map((t) => t.textContent)).not.toContain('€');
    const item = container.querySelector('.list > li')!;
    expect(item.querySelector('.head')).toHaveTextContent('Salon 150,00 kWh · 100,0 %');
    expect(item.textContent).toContain('Moy. °C');
    expect(item.textContent).not.toContain('HC');
  });

  it('holds a skeleton until the house is known, and says « le … » for a single day', () => {
    house.reset();
    const { container } = render(RoomsEnergy, { rows, span: { from: '2026-10-13', to: '2026-10-14' }, tariff: true });
    expect(container.querySelector('section')).toHaveAttribute('aria-busy', 'true');
    expect(container.querySelector('.skeleton')).not.toBeNull();
    expect(container.querySelector('.sub')).toHaveTextContent('le 13 octobre 2026');
  });

  it('°C, consigne and heures de chauffe « — » carry their reason, seen and heard', () => {
    const none = { temp_avg: null, setpoint_avg: null, heating_hours: null };
    const { container } = render(RoomsEnergy, { rows: [row('a', 'salon', none), row('b', 'salon', none)], span, tariff: true });
    const tr = container.querySelector('.table tbody tr.room')!;
    expect(tr.querySelector('th')).toHaveTextContent('°C, consigne et chauffe : moins de la moitié de la période mesurée');
    const cells = [...tr.querySelectorAll('td')].slice(-3);
    for (const td of cells) expect(td).toHaveTextContent('— (moins de la moitié de la période mesurée)');
    expect(container.querySelector('.list > li')).toHaveTextContent('°C, consigne et chauffe : moins de la moitié de la période mesurée');
  });

  it('a room none of whose radiators Kelvin recorded reads « — » and says why', () => {
    house.applySnapshot({
      house: {
        rooms: [{ id: 'salon', name: 'Salon', radiator_ids: ['a', 'b'] }, { id: 'bureau', name: 'Bureau', radiator_ids: ['d'] }] as never,
        radiators: [{ id: 'a', room_id: 'salon', name: 'Fenêtre' }, { id: 'b', room_id: 'salon', name: 'Porte' }, { id: 'd', room_id: 'bureau', name: 'Bureau' }] as never
      },
      pending: [], overrides: [], status: { connected: true, last_ok_at: null, last_error: null }
    });
    const { container } = render(RoomsEnergy, { rows, span, tariff: true });
    const bureau = [...container.querySelectorAll('.table tbody tr.room')][1];
    expect(bureau.querySelector('th')).toHaveTextContent('Bureau');
    expect(bureau.querySelector('th .partial')).toHaveTextContent('aucun radiateur enregistré');
    expect(bureau.querySelector('td')).toHaveTextContent('—');
    expect(container.querySelectorAll('.list > li')[1]).toHaveTextContent('aucun radiateur enregistré');
  });
});
