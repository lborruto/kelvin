import { render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { house } from '$lib/stores/house.svelte';
import PiecesView from './PiecesView.svelte';
import { applyLocale } from '$lib/i18n';

const media = vi.hoisted(() => ({ desktop: { matches: true } }));
vi.mock('$lib/media.svelte', () => media);
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/api/client', () => ({
  // The room figures stay a skeleton here: RoomFigures has its own tests.
  api: {
    history: vi.fn().mockResolvedValue([]),
    roomEnergy: vi.fn(() => new Promise(() => {})),
    roomActivity: vi.fn(() => new Promise(() => {})),
    roomsDuty: vi.fn(() => new Promise(() => {}))
  },
  ApiError: class extends Error {}
}));
vi.mock('$lib/stores/history.svelte', () => ({ history: { data: {}, load: vi.fn() } }));

const rad = {
  id: 'a', room_id: 'salon', name: 'Radiateur', model: 'HEKLA P', power_w: 1500, temperature: 19.5, mode: 'program' as const,
  target: 20, comfort: 20, eco_delta: 3, eco: 17, effective_setpoint: 17, heating_level: 'eco', max_temperature: 28,
  window_open: false, occupied: false, window_detection: true, presence_detection: false, light: null, energy_wh: null,
  working_rate: 0, rssi: 100, program: {}
};

beforeEach(() => {
  house.applySnapshot({
    house: {
      rooms: [{ id: 'salon', name: 'Salon', radiator_ids: ['a'], temperature: 20, mode: 'program', target: 20, comfort: 20, eco: 17,
        effective_setpoint: 17, heating_level: 'eco', window_open: false, occupied: false }],
      radiators: [rad]
    },
    pending: [], overrides: [], status: { connected: true, last_ok_at: 1, last_error: null }
  } as never);
});

describe('PiecesView on desktop', () => {
  it('"/" shows the list and the inspector of the given room, with no placeholder', () => {
    media.desktop.matches = true;
    const { container } = render(PiecesView, { roomId: 'salon', home: true });
    expect(screen.getByRole('heading', { name: 'Pièces', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Salon', level: 2 })).toBeInTheDocument();
    expect(container.querySelector('.hint')).toBeNull();
  });

  it('a room page keeps the same header block as "/"', () => {
    media.desktop.matches = true;
    render(PiecesView, { roomId: 'salon' });
    expect(screen.getByRole('heading', { name: 'Pièces', level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Pièces' })).toBeNull();
  });
});

describe('PiecesView on the phone', () => {
  it('"/" shows no inspector; a room page shows a back link and the inspector only', () => {
    media.desktop.matches = false;
    const home = render(PiecesView, { roomId: 'salon', home: true });
    expect(screen.queryByRole('heading', { name: 'Salon', level: 2 })).toBeNull();
    home.unmount();
    render(PiecesView, { roomId: 'salon' });
    expect(screen.getByRole('link', { name: 'Pièces' })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('heading', { name: 'Pièces', level: 1 })).toBeNull();
    // The room is the phone page's title.
    expect(screen.getByRole('heading', { name: 'Salon', level: 1 })).toBeInTheDocument();
  });
});

describe('PiecesView before the house is known', () => {
  it('shows skeletons, never « 0 pièce » or « Pièce introuvable »', () => {
    house.reset();
    for (const d of [true, false]) {
      media.desktop.matches = d;
      const v = render(PiecesView, d ? { roomId: null, home: true } : { roomId: 'salon' });
      expect(document.body.textContent).not.toMatch(/0 pièce|Pièce introuvable|en chauffe/);
      expect(v.container.querySelectorAll('.skeleton').length).toBeGreaterThan(d ? 3 : 2);
      v.unmount();
    }
  });

  it('says « Pièce introuvable » only once the house is loaded', () => {
    media.desktop.matches = false;
    render(PiecesView, { roomId: 'nope' });
    expect(screen.getByText('Pièce introuvable.')).toBeInTheDocument();
  });
});

describe('PiecesView in English', () => {
  it('the title, the counted summary and the back link', () => {
    applyLocale('en');
    media.desktop.matches = true;
    const a = render(PiecesView, { roomId: 'salon', home: true });
    expect(screen.getByRole('heading', { name: 'Rooms', level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/^1 room · (none|\d+) heating$/)).toBeInTheDocument();
    a.unmount();
    media.desktop.matches = false;
    render(PiecesView, { roomId: 'salon' });
    expect(screen.getByRole('link', { name: 'Rooms' })).toHaveAttribute('href', '/');
  });
});
