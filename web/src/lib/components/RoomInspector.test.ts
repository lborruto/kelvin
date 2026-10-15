import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { house } from '$lib/stores/house.svelte';
import RoomInspector from './RoomInspector.svelte';
import { applyLocale } from '$lib/i18n';

vi.mock('$lib/api/client', () => ({
  api: { roomMode: vi.fn(), roomSetpoint: vi.fn(), roomBoost: vi.fn(), cancelOverride: vi.fn(), history: vi.fn().mockResolvedValue([]) },
  ApiError: class extends Error {}
}));
vi.mock('$lib/stores/history.svelte', () => ({ history: { data: {}, load: vi.fn() } }));

const base = {
  room_id: 'salon', model: 'HEKLA P', power_w: 1500, temperature: 19.5, mode: 'program' as const, target: 20,
  eco_delta: 3, eco: 17, effective_setpoint: 17, heating_level: 'eco', max_temperature: 28, window_open: false,
  occupied: false, window_detection: true, presence_detection: false, light: null, energy_wh: null, working_rate: 0,
  rssi: 100, program: {}
};
const a = { ...base, id: 'a', name: 'Gauche', comfort: 19 };
const b = { ...base, id: 'b', name: 'Droit', comfort: 21, mode: 'manual' as const };

beforeEach(() => {
  house.applySnapshot({
    house: {
      rooms: [{ id: 'salon', name: 'Salon', radiator_ids: ['a', 'b'], temperature: 20, mode: 'mixed', target: 20, comfort: 20, eco: 17,
        effective_setpoint: 17, heating_level: 'eco', window_open: false, occupied: false }],
      radiators: [a, b]
    },
    pending: [], overrides: [], status: { connected: true, last_ok_at: 1, last_error: null }
  } as never);
});

describe('RoomInspector with disagreeing radiators', () => {
  it('shows the mean, a mixed note and a mixed-mode hint', () => {
    render(RoomInspector, { roomId: 'salon' });
    expect(screen.getByText('Mixte — les radiateurs n’ont pas le même mode')).toBeInTheDocument();
    expect(screen.getAllByText('Mixte (moyenne)')).toHaveLength(1);
    expect(screen.getByText(/^20,0/, { selector: '.row *' })).toBeInTheDocument();
  });
});

describe('RoomInspector history period', () => {
  it('is a radiogroup that follows the shared radio keyboard model', async () => {
    render(RoomInspector, { roomId: 'salon' });
    const group = screen.getByRole('radiogroup', { name: 'Période' });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '24\u00a0h' })).toHaveAttribute('aria-checked', 'true');
    await fireEvent.keyDown(screen.getByRole('radio', { name: '24\u00a0h' }), { key: 'ArrowRight' });
    expect(screen.getByRole('radio', { name: '7\u00a0j' })).toHaveAttribute('aria-checked', 'true');
  });
});

describe('RoomInspector in English', () => {
  it('sections, notes, counts and the history ranges', () => {
    applyLocale('en');
    render(RoomInspector, { roomId: 'salon' });
    expect(screen.getByText('Mixed — the radiators aren’t in the same mode')).toBeInTheDocument();
    expect(screen.getAllByText('Mixed (average)')).toHaveLength(1);
    expect(screen.getByText(/^2 radiators/)).toBeInTheDocument();
    for (const h of ['Controls', 'Temporary boost', 'History', 'Radiators']) {
      expect(screen.getByRole('heading', { name: h, level: 3 })).toBeInTheDocument();
    }
    expect(screen.getAllByRole('radio').map((r) => r.textContent)).toEqual(
      expect.arrayContaining(['24\u00a0h', '7\u00a0d', '30\u00a0d'])
    );
    expect(screen.getByRole('button', { name: 'Boost' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Comfort' })).toBeInTheDocument();
  });
  it('a room that does not exist, once the house is known', () => {
    applyLocale('en');
    render(RoomInspector, { roomId: 'nope' });
    expect(screen.getByText('Room not found.')).toBeInTheDocument();
  });
});
