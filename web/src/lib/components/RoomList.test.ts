import { render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { house } from '$lib/stores/house.svelte';
import RoomList from './RoomList.svelte';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/api/client', () => ({
  // Activity and duty stay unloaded here: RoomCard has their tests.
  api: { history: vi.fn().mockResolvedValue([]), roomActivity: vi.fn(() => new Promise(() => {})), roomsDuty: vi.fn(() => new Promise(() => {})) },
  ApiError: class extends Error {}
}));
vi.mock('$lib/stores/history.svelte', () => ({ history: { data: {}, load: vi.fn() } }));

const rad = (id: string, room_id: string) => ({
  id, room_id, name: 'Radiateur', model: 'HEKLA P', power_w: 1500, temperature: 19.5, mode: 'program' as const, target: 20,
  comfort: 20, eco_delta: 3, eco: 17, effective_setpoint: 17, heating_level: 'eco', max_temperature: 28, window_open: false,
  occupied: false, window_detection: true, presence_detection: false, light: null, energy_wh: null, working_rate: 0, rssi: 100,
  program: {}
});
const room = (id: string, name: string, ids: string[], window_open = false) => ({
  id, name, radiator_ids: ids, temperature: 20, mode: 'program' as const, target: 20, comfort: 20, eco: 17,
  effective_setpoint: 17, heating_level: 'eco', window_open, occupied: false
});

beforeEach(() => {
  house.pending = {};
  house.applySnapshot({
    house: { rooms: [room('salon', 'Salon', ['a']), room('ch1', 'Chambre 1', ['b'], true)], radiators: [rad('a', 'salon'), rad('b', 'ch1')] },
    pending: [], overrides: [], status: { connected: true, last_ok_at: 1, last_error: null }
  } as never);
});

describe('RoomList', () => {
  it('every card is a link to its room: no expansion in place', () => {
    render(RoomList);
    expect(screen.getByRole('link', { name: /^Salon,/ })).toHaveAttribute('href', '/rooms/salon');
    expect(screen.getByRole('link', { name: /^Chambre 1,/ })).toHaveAttribute('href', '/rooms/ch1');
    expect(screen.queryByRole('button', { expanded: true })).toBeNull();
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });

  it('offline rooms move to the end under « Hors ligne · n », the others keep their order', () => {
    house.applySnapshot({
      house: {
        rooms: [room('ch2', 'Chambre 2', ['c']), room('salon', 'Salon', ['a']), room('ch1', 'Chambre 1', ['b'])],
        radiators: [{ ...rad('c', 'ch2'), reachable: false }, rad('a', 'salon'), rad('b', 'ch1')]
      },
      pending: [], overrides: [], status: { connected: true, last_ok_at: 1, last_error: null }
    } as never);
    const { container } = render(RoomList);
    const names = [...container.querySelectorAll('.list > *')].map((el) => el.querySelector('.name')?.textContent ?? el.textContent);
    expect(names).toEqual(['Salon', 'Chambre 1', 'Hors ligne · 1', 'Chambre 2']);
    expect(screen.getByRole('heading', { name: 'Hors ligne · 1' })).toBeInTheDocument();
  });

  it('no group label when every room answers', () => {
    render(RoomList);
    expect(screen.queryByRole('heading')).toBeNull();
  });
});
