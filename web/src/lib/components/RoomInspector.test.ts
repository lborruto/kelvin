import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '$lib/api/client';
import { house } from '$lib/stores/house.svelte';
import RoomInspector from './RoomInspector.svelte';
import { applyLocale } from '$lib/i18n';
import { alerts } from '$lib/stores/alerts.svelte';

vi.mock('$lib/api/client', () => ({
  api: { roomMode: vi.fn(), roomSetpoint: vi.fn(), roomBoost: vi.fn(), cancelOverride: vi.fn(), history: vi.fn().mockResolvedValue([]),
    roomEnergy: vi.fn(() => new Promise(() => {})), alerts: vi.fn().mockResolvedValue([]), dismissAlert: vi.fn(),
    roomActivity: vi.fn().mockResolvedValue({ step: 300, window: [], presence: [] }),
    roomsDuty: vi.fn().mockResolvedValue({ from: 0, to: 86400, rooms: { salon: { duty: 0.38, coverage: 1 } } }),
    radiatorLevel: vi.fn(), radiatorDryer: vi.fn(), radiatorMode: vi.fn(), radiatorSetpoint: vi.fn(), radiatorFeatures: vi.fn(),
    radiatorLight: vi.fn(), identify: vi.fn() },
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
        effective_setpoint: 17, heating_level: 'eco', window_open: false, occupied: false, presence: true }],
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

describe('presence state and legend', () => {
  it('« Présence : détectée », « — » when not reported', async () => {
    render(RoomInspector, { roomId: 'salon' });
    expect(screen.getByText(/Présence\s:\sdétectée/)).toBeInTheDocument();
  });
  it('« — » when no radiator reports presence', () => {
    house.applySnapshot({
      house: {
        rooms: [{ id: 'salon', name: 'Salon', radiator_ids: ['a', 'b'], temperature: 20, mode: 'mixed', target: 20, comfort: 20,
          eco: 17, effective_setpoint: 17, heating_level: 'eco', window_open: false, occupied: false, presence: null }],
        radiators: [a, b]
      },
      pending: [], overrides: [], status: { connected: true, last_ok_at: 1, last_error: null }
    } as never);
    render(RoomInspector, { roomId: 'salon' });
    expect(screen.getByText(/Présence\s:\s—/)).toBeInTheDocument();
  });
});

describe('RoomInspector alerts', () => {
  const al = (id: number, room: string) => ({
    id, kind: 'radiator_unreachable', severity: 'bad' as const, params: { radiator_id: 'a', room_id: room, since: null },
    first_seen: 0, last_seen: 0, resolved_at: null, dismissed: false
  });
  it('shows this room’s unreachable alert, not another room’s', () => {
    applyLocale('fr');
    alerts.list = [al(1, 'salon'), al(2, 'cuisine')];
    render(RoomInspector, { roomId: 'salon' });
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByText(/Salon · Gauche\s:\sradiateur injoignable/)).toBeInTheDocument();
    alerts.reset();
  });
});

const caps = (extra: object) => ({
  modes: [], manual: null, comfort: null, eco: null, levels: [], program: false, dryer: [],
  window_detection: false, presence_detection: false, night_light: false, night_light_intensity: false,
  identify: false, energy: false, boost: false, rename: false, read_only: false, ...extra
});
const snapshotOf = (radiators: object[], mode = 'manual') =>
  ({
    house: {
      rooms: [{ id: 'salon', name: 'Salon', radiator_ids: radiators.map((r) => (r as { id: string }).id), temperature: 20, mode, target: 20, comfort: 20, eco: 17, effective_setpoint: 17, heating_level: 'eco', window_open: false, occupied: false }],
      radiators
    },
    pending: [], overrides: [], status: { connected: true, last_ok_at: 1, last_error: null }
  }) as never;

describe('RoomInspector across kinds', () => {
  it('shows only what some radiator supports, with the partial note', () => {
    const sauter = { ...a, mode: 'manual' as const };
    const dryer = { ...base, id: 'd', name: 'Sèche-serviettes', comfort: null, mode: 'manual' as const, support: 'expected',
      capabilities: caps({ modes: ['off', 'manual', 'program'], manual: [7, 26], boost: true }) };
    const zone = { ...base, id: 'z', name: 'Zone PAC', comfort: null, mode: 'other' as const, support: 'readonly',
      capabilities: caps({ read_only: true }) };
    house.applySnapshot(snapshotOf([sauter, dryer, zone]));
    render(RoomInspector, { roomId: 'salon' });
    expect(screen.getByRole('radiogroup', { name: 'Mode de la pièce' })).toBeInTheDocument();
    expect(screen.getAllByText('S’applique à 2 radiateurs sur 3')).toHaveLength(3); // mode, setpoint, boost
    expect(screen.getAllByText('S’applique à 1 radiateur sur 3')).toHaveLength(2); // comfort, eco setback
    expect(screen.getByText('Lecture seule')).toBeInTheDocument();
  });

  it('a pilot-wire room has no room mode, setpoint or boost, only its levels', () => {
    const pilot = { ...base, id: 'p', name: 'Bureau', comfort: null, mode: 'manual' as const, support: 'expected',
      capabilities: caps({ levels: ['comfort', 'eco', 'frostprotection', 'off'] }) };
    house.applySnapshot(snapshotOf([pilot]));
    render(RoomInspector, { roomId: 'salon' });
    expect(screen.queryByRole('radiogroup', { name: 'Mode de la pièce' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Forcer' })).toBeNull();
    expect(screen.queryByText('Consigne')).toBeNull();
    expect(screen.getByRole('radiogroup', { name: 'Allure' })).toBeInTheDocument();
  });

  it('a pilot-wire room offers « Arrêt », which switches the room off', async () => {
    const pilot = { ...base, id: 'p', name: 'Bureau', comfort: null, mode: 'manual' as const, support: 'expected',
      capabilities: caps({ levels: ['comfort', 'eco', 'frostprotection', 'off'] }) };
    house.applySnapshot(snapshotOf([pilot]));
    house.connection = 'open';
    render(RoomInspector, { roomId: 'salon' });
    await fireEvent.click(screen.getByRole('button', { name: 'Arrêt' }));
    expect(api.roomMode).toHaveBeenCalledWith('salon', 'off');
  });

  it('a room that takes a mode keeps its mode switch and no separate « Arrêt » button', () => {
    const dryer = { ...base, id: 'd', name: 'Sèche', comfort: null, mode: 'manual' as const, support: 'expected',
      capabilities: caps({ modes: ['off', 'manual', 'program'], manual: [7, 26], boost: true }) };
    house.applySnapshot(snapshotOf([dryer]));
    render(RoomInspector, { roomId: 'salon' });
    expect(screen.getByRole('radiogroup', { name: 'Mode de la pièce' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Arrêt' })).toBeNull();
  });

  it('the « Mixte » note needs a room mode control', () => {
    const pilot = { ...base, id: 'p', name: 'Bureau', comfort: null, mode: 'manual' as const, support: 'expected',
      capabilities: caps({ levels: ['comfort', 'eco', 'off'] }) };
    const zone = { ...base, id: 'z', name: 'Zone PAC', comfort: null, mode: 'other' as const, support: 'readonly',
      capabilities: caps({ read_only: true }) };
    house.applySnapshot(snapshotOf([pilot, zone], 'mixed'));
    render(RoomInspector, { roomId: 'salon' });
    expect(screen.queryByText(/Mixte — les radiateurs/)).toBeNull();
  });

  it('says so when Kelvin drives nothing in the room', () => {
    const zone = { ...base, id: 'z', name: 'Zone PAC', comfort: null, mode: 'other' as const, support: 'readonly',
      capabilities: caps({ read_only: true }) };
    house.applySnapshot(snapshotOf([zone], 'other'));
    render(RoomInspector, { roomId: 'salon' });
    expect(screen.getByText('Kelvin ne pilote aucun appareil de cette pièce.')).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: 'Mode de la pièce' })).toBeNull();
  });
});
