import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
    for (const h of ['Controls', /^Boost/, 'Today', 'Radiators · 2']) {
      expect(screen.getByRole('heading', { name: h, level: 3 })).toBeInTheDocument();
    }
    expect(screen.getByText('Radiators in different modes')).toBeInTheDocument();
    expect(screen.getAllByRole('radio').map((r) => r.textContent)).toEqual(
      expect.arrayContaining(['24\u00a0h', '7\u00a0d', '30\u00a0d'])
    );
    expect(screen.getByRole('button', { name: /^Boost/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('group', { name: 'Comfort' })).toBeInTheDocument();
  });
  it('a room that does not exist, once the house is known', () => {
    applyLocale('en');
    render(RoomInspector, { roomId: 'nope' });
    expect(screen.getByText('Room not found.')).toBeInTheDocument();
  });
});

describe('presence', () => {
  it('« Présence détectée » only when a radiator detects someone; never « Présence : — »', () => {
    const { unmount } = render(RoomInspector, { roomId: 'salon' });
    expect(screen.getByText('Présence détectée')).toBeInTheDocument();
    unmount();
    house.applySnapshot({
      house: {
        rooms: [{ id: 'salon', name: 'Salon', radiator_ids: ['a', 'b'], temperature: 20, mode: 'mixed', target: 20, comfort: 20,
          eco: 17, effective_setpoint: 17, heating_level: 'eco', window_open: false, occupied: false, presence: null }],
        radiators: [a, b]
      },
      pending: [], overrides: [], status: { connected: true, last_ok_at: 1, last_error: null }
    } as never);
    render(RoomInspector, { roomId: 'salon' });
    expect(screen.queryByText(/Présence/)).toBeNull();
  });
});

describe('RoomInspector alerts', () => {
  const al = (id: number, room: string) => ({
    id, kind: 'radiator_unreachable', severity: 'bad' as const, params: { radiator_id: 'a', room_id: room, since: null },
    first_seen: 0, last_seen: 0, resolved_at: null, dismissed: false
  });
  it('the unreachable alert is not repeated in the room: the status and the offline notice say it', () => {
    alerts.list = [al(1, 'salon')];
    render(RoomInspector, { roomId: 'salon' });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(/radiateur hors ligne/)).toBeNull();
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
    expect(screen.getAllByText('S’applique à 2 radiateurs sur 3')).toHaveLength(2); // mode, setpoint (boost: in its closed disclosure)
    expect(screen.getAllByText('S’applique à 1 radiateur sur 3')).toHaveLength(2); // comfort, eco setback
    expect(screen.getByText('Lecture seule')).toBeInTheDocument();
  });

  it('a pilot-wire room has no room mode, setpoint or boost, only its levels', async () => {
    const pilot = { ...base, id: 'p', name: 'Bureau', comfort: null, mode: 'manual' as const, support: 'expected',
      capabilities: caps({ levels: ['comfort', 'eco', 'frostprotection', 'off'] }) };
    house.applySnapshot(snapshotOf([pilot]));
    render(RoomInspector, { roomId: 'salon' });
    expect(screen.queryByRole('radiogroup', { name: 'Mode de la pièce' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Chauffe temporaire/ })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Consigne' })).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: /^Bureau/ }));
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

describe('the room panel, in order', () => {
  // Tuesday 13 October 2026, 13:48 in Paris.
  const now = Date.parse('2026-10-13T11:48:00Z');
  const program = { tuesday: [{ start: '17:30', end: '22:30' }] };
  const one = (over: object = {}) => ({ ...base, id: 'a', name: 'Radiateur', comfort: 20, eco_delta: 3, eco: 17, program, reachable: true, ...over });
  const roomOf = (over: object = {}) => ({ id: 'salon', name: 'Salon', radiator_ids: ['a'], temperature: 19.5, mode: 'program', target: 20,
    comfort: 20, eco: 17, effective_setpoint: 17, heating_level: 'eco', window_open: false, occupied: false, presence: false, ...over });
  const load = (rad: object, room: object = {}, overrides: object[] = []) =>
    house.applySnapshot({ house: { rooms: [roomOf(room)], radiators: [rad] }, pending: [], overrides,
      status: { connected: true, last_ok_at: 1, last_error: null } } as never);
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
    house.pending = {};
    house.connection = 'open';
    vi.mocked(api.roomSetpoint).mockReset();
    vi.mocked(api.roomBoost).mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it('header: name, status sentence, reading in ink and the target; then Réglage, Chauffe temporaire, Aujourd’hui, Énergie, Radiateurs', () => {
    load(one());
    const { container } = render(RoomInspector, { roomId: 'salon' });
    expect(container.querySelector('.st')).toHaveTextContent('Programme · Éco jusqu’à 17:30');
    expect(container.querySelector('.fig')).toHaveTextContent('19,5 °C');
    expect(container.querySelector('.fig')!.getAttribute('style') ?? '').not.toMatch(/color/);
    expect(screen.getByText('consigne 17,0 °C')).toBeInTheDocument();
    const heads = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent?.trim().replace(/\s+/g, ' '));
    expect(heads.map((h) => h?.split(' ex.')[0])).toEqual(['Réglage', 'Chauffe temporaire', 'Aujourd’hui', 'Énergie sur 24 h', 'Radiateurs · 1']);
    expect(screen.getByRole('link', { name: 'Modifier les horaires' })).toHaveAttribute('href', '/schedule?room=salon');
  });

  it('Éco is shown as a temperature with its lowering, and sent as the lowering', async () => {
    vi.useRealTimers();
    load(one());
    render(RoomInspector, { roomId: 'salon' });
    expect(screen.getByText('3,0 °C sous le confort')).toBeInTheDocument();
    const eco = screen.getByRole('group', { name: 'Éco' });
    expect(eco).toHaveTextContent('17,0');
    const minus = screen.getByRole('button', { name: 'Diminuer Éco' });
    await fireEvent.pointerDown(minus);
    await fireEvent.pointerUp(minus);
    await new Promise((r) => setTimeout(r, 700));
    expect(api.roomSetpoint).toHaveBeenCalledWith('salon', 'eco', 3.5);
  });

  it('Chauffe temporaire: a closed disclosure, then a sentence with its consequence, and Lancer', async () => {
    load(one());
    render(RoomInspector, { roomId: 'salon' });
    const disc = screen.getByRole('button', { name: /^Chauffe temporaire/ });
    expect(disc).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: 'Lancer' })).toBeNull();
    await fireEvent.click(disc);
    expect(disc).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Chauffer à')).toBeInTheDocument();
    expect(screen.getByText('Puis retour au programme vers 15:48.')).toBeInTheDocument();
    await fireEvent.change(screen.getByRole('combobox', { name: 'Durée' }), { target: { value: '4' } });
    expect(screen.getByText('Puis retour au programme vers 17:48.')).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Lancer' }));
    expect(api.roomBoost).toHaveBeenCalledWith('salon', 21, 240);
  });

  it('an active boost reads its temperature and end, with Arrêter', async () => {
    const boost = { id: 'o1', kind: 'boost', room_id: 'salon', radiator_ids: ['a'], temperature: 22, ends_at: Date.parse('2026-10-13T19:45:00Z') / 1000, restoring: false };
    load(one(), {}, [boost]);
    const { container } = render(RoomInspector, { roomId: 'salon' });
    expect(container.querySelector('.st')).toHaveTextContent('Chauffe temporaire · 22,0 °C jusqu’à 21:45');
    expect(screen.getByText('22,0 °C jusqu’à 21:45')).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Arrêter' }));
    expect(api.cancelOverride).toHaveBeenCalledWith('o1');
  });

  it('a window open is a notice to fix', () => {
    load(one({ window_open: true }), { window_open: true });
    const { container } = render(RoomInspector, { roomId: 'salon' });
    expect(container.querySelector('.callout.bad')).toHaveTextContent(/Fenêtre ouverte, signalée par le radiateur/);
  });

  it('offline: no reading, a calm notice with the last reading and its time, controls paused with the last known mode', () => {
    const since = Date.parse('2026-10-13T10:32:00Z') / 1000; // 12:32
    load(one({ reachable: false, unreachable_since: since, temperature: 23.6, last_event_at: since - 60 }), { temperature: 23.6 });
    const { container } = render(RoomInspector, { roomId: 'salon' });
    expect(container.querySelector('.st')).toHaveTextContent('Hors ligne depuis 12:32');
    expect(container.querySelector('.fig')).toBeNull();
    expect(screen.queryByText(/consigne 17/)).toBeNull();
    const notice = screen.getByRole('status');
    expect(notice).toHaveTextContent('Radiateur hors tension ou hors de portée');
    expect(notice).toHaveTextContent('Les commandes reprendront quand il sera rallumé.');
    expect(notice).toHaveTextContent('Dernière mesure : 23,6 °C à 12:31');
    expect(notice.querySelector('.bad')).toBeNull();
    for (const r of screen.getByRole('radiogroup', { name: 'Mode de la pièce' }).querySelectorAll('button')) {
      expect(r).toHaveAttribute('aria-disabled', 'true');
      expect(r).not.toHaveAttribute('disabled');
    }
    expect(screen.getByText('Dernier mode connu : Programme · confort 20,0 °C, éco 17,0 °C.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Chauffe temporaire/ })).toBeNull();
  });

  it('offline: the chart stops when the radiators went offline (no stale value drawn after)', async () => {
    const { history } = await import('$lib/stores/history.svelte');
    const { parisMidnight } = await import('$lib/time');
    const since = Date.parse('2026-10-13T10:32:00Z');
    const day = `salon|day|${parisMidnight(now)}`;
    (history.data as Record<string, unknown>)[day] = [
      { t: since - 600_000, v: 20, s: null }, { t: since + 3_600_000, v: 25, s: null }
    ];
    load(one({ reachable: false, unreachable_since: since / 1000 }));
    render(RoomInspector, { roomId: 'salon' });
    expect(document.querySelector('.strip .visually-hidden')!.textContent).toMatch(/de 20,0.*à 20,0/);
    delete (history.data as Record<string, unknown>)[day];
  });

  it('offline with no time for the last reading: the line is left out', () => {
    load(one({ reachable: false, unreachable_since: null, last_event_at: null }));
    render(RoomInspector, { roomId: 'salon' });
    expect(screen.getByRole('status')).not.toHaveTextContent('Dernière mesure');
  });

  it('the legend lists only what the chart draws, as real text', () => {
    load(one());
    const { container } = render(RoomInspector, { roomId: 'salon' });
    const legend = container.querySelector('.legend')!;
    expect(legend).not.toHaveAttribute('aria-hidden');
    expect([...legend.querySelectorAll('.key')].map((k) => k.textContent)).toEqual(['Consigne', 'Confort']);
  });

  it('in English', () => {
    applyLocale('en');
    load(one());
    const { container } = render(RoomInspector, { roomId: 'salon' });
    expect(container.querySelector('.st')).toHaveTextContent('Schedule · Eco until 17:30');
    expect(screen.getByText('target 17.0 °C')).toBeInTheDocument();
    expect(screen.getByText('3.0 °C below comfort')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit schedule' })).toBeInTheDocument();
  });
});
