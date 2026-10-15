import { fireEvent, render, screen } from '@testing-library/svelte';
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

const head = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}`) });

describe('RoomList on the phone', () => {
  it('expands the room that needs attention once the house is loaded', () => {
    render(RoomList);
    expect(head('Chambre 1')).toHaveAttribute('aria-expanded', 'true');
    expect(head('Salon')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getAllByRole('radiogroup', { name: 'Mode' })).toHaveLength(1);
  });

  it('keeps a card the user collapsed closed, even after navigating back', async () => {
    const first = render(RoomList);
    await fireEvent.click(head('Chambre 1'));
    expect(head('Chambre 1')).toHaveAttribute('aria-expanded', 'false');
    first.unmount();
    render(RoomList);
    expect(head('Chambre 1')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });
});
