import { flushSync } from 'svelte';
import { render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { house } from '$lib/stores/house.svelte';
import RoomCard from './RoomCard.svelte';
import { applyLocale } from '$lib/i18n';

vi.mock('$lib/api/client', () => ({
  api: {
    roomMode: vi.fn().mockResolvedValue({ pending: null }),
    roomSetpoint: vi.fn().mockResolvedValue({ pending: null }),
    roomActivity: vi.fn().mockResolvedValue({ step: 300, window: [], presence: [] }),
    roomsDuty: vi.fn().mockResolvedValue({ from: 0, to: 86400, rooms: {} })
  },
  ApiError: class extends Error {}
}));

const NB = ' ';
// Tuesday 13:48 in Paris: eco until 17:30.
const now = Date.parse('2026-10-13T11:48:00Z');
const radiator = {
  id: 'a', room_id: 'salon', name: 'Radiateur', model: 'HEKLA P', power_w: 1500, temperature: 19.5, mode: 'program' as const,
  target: 20, comfort: 20, eco_delta: 3, eco: 17, effective_setpoint: 17, heating_level: 'eco', max_temperature: 28,
  window_open: false, occupied: false, window_detection: true, presence_detection: false, light: null, energy_wh: null,
  working_rate: 0, rssi: 100, reachable: true,
  program: { tuesday: [{ start: '06:15', end: '08:00' }, { start: '17:30', end: '22:30' }] }
};
const room = {
  id: 'salon', name: 'Salon', radiator_ids: ['a'], temperature: 20.1, mode: 'program' as const, target: 20, comfort: 20,
  eco: 17, effective_setpoint: 17, heating_level: 'eco', window_open: false, occupied: false
};
const snapshot = (rooms: unknown[], radiators: unknown[], overrides: unknown[] = []) =>
  house.applySnapshot({ house: { rooms, radiators }, pending: [], overrides, status: { connected: true, last_ok_at: 1, last_error: null } } as never);

beforeEach(() => {
  house.pending = {};
  snapshot([room], [radiator]);
});

describe('RoomCard: now · target · next', () => {
  it('name, reading in ink, one status sentence and the target in words', () => {
    const { container } = render(RoomCard, { room, now, points: [] });
    expect(screen.getByText('Salon')).toBeInTheDocument();
    const fig = screen.getByText(`20,1 °C`);
    expect(fig.getAttribute('style') ?? '').not.toMatch(/color/);
    expect(container.querySelector('.status')).toHaveTextContent('Programme · Éco jusqu’à 17:30');
    expect(screen.getByText(`consigne 17,0 °C`)).toBeInTheDocument();
  });

  it('no chips, no « Repos », no duty footer, no « Détails »', () => {
    const { container } = render(RoomCard, { room: { ...room, heating_level: 'off' }, now, points: [] });
    expect(container.querySelector('.chip')).toBeNull();
    expect(container.querySelector('.foot')).toBeNull();
    expect(screen.queryByText('Repos')).toBeNull();
    expect(screen.queryByText(/chauffe .* sur 24/)).toBeNull();
    expect(screen.queryByRole('link', { name: 'Détails' })).toBeNull();
  });

  it('is one link to the room, named as one sentence', () => {
    render(RoomCard, { room, now, points: [] });
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/rooms/salon');
    expect(link).toHaveAccessibleName(`Salon, 20,1${NB}°C, Programme · Éco jusqu’à 17:30, consigne 17,0${NB}°C`);
    expect(link).not.toHaveAttribute('data-sveltekit-keepfocus');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('on desktop: keeps focus and scroll, marked current when it is the room page', () => {
    const { container } = render(RoomCard, { room, now, points: [], desktop: true, selected: true, current: true });
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('aria-current', 'page');
    expect(link).toHaveAttribute('data-sveltekit-keepfocus');
    expect(link).toHaveAttribute('data-sveltekit-noscroll');
    expect(container.querySelector('.card')).toHaveClass('selected');
  });

  it('on "/" the chosen room is selected but not the current page', () => {
    render(RoomCard, { room, now, points: [], desktop: true, selected: true });
    expect(screen.getByRole('link')).not.toHaveAttribute('aria-current');
  });

  it('« En chauffe » only while a radiator draws power, and in the accessible name', () => {
    snapshot([room], [{ ...radiator, working_rate: 40 }]);
    render(RoomCard, { room, now, points: [] });
    expect(screen.getByText('En chauffe')).toBeInTheDocument();
    expect(screen.getByRole('link').getAttribute('aria-label')).toMatch(/, En chauffe$/);
  });

  it('no heating mark when nothing heats, nor when the room is off', () => {
    snapshot([{ ...room, mode: 'off' }], [{ ...radiator, mode: 'off', working_rate: 40 }]);
    const { container } = render(RoomCard, { room: { ...room, mode: 'off' }, now, points: [] });
    expect(screen.queryByText('En chauffe')).toBeNull();
    expect(container.querySelector('.status')).toHaveTextContent('Arrêt');
    expect(screen.queryByText(/consigne/)).toBeNull();
  });

  it('boost: warm « Chauffe temporaire » and its end', () => {
    const boost = { id: 'o', kind: 'boost', room_id: 'salon', radiator_ids: ['a'], temperature: 22, ends_at: Date.parse('2026-10-13T19:45:00Z') / 1000, restoring: false };
    snapshot([room], [radiator], [boost]);
    const { container } = render(RoomCard, { room, now, points: [] });
    expect(container.querySelector('.lead.warm')).toHaveTextContent('Chauffe temporaire');
    expect(container.querySelector('.status')).toHaveTextContent(`Chauffe temporaire · 22,0 °C jusqu’à 21:45`);
    expect(screen.getByText(`consigne 22,0 °C`)).toBeInTheDocument();
  });

  it('window open: red lead with its glyph, no target', () => {
    const open = { ...room, window_open: true };
    snapshot([open], [{ ...radiator, window_open: true }]);
    const { container } = render(RoomCard, { room: open, now, points: [] });
    expect(container.querySelector('.lead.bad')).toHaveTextContent('Fenêtre ouverte');
    expect(container.querySelector('.lead.bad svg')).not.toBeNull();
    expect(screen.queryByText(/consigne/)).toBeNull();
  });

  it('some radiators offline: a muted count by the name, the reading of the ones that answer', () => {
    const two = { ...room, radiator_ids: ['a', 'b'], temperature: 18 };
    snapshot([two], [{ ...radiator, temperature: 21 }, { ...radiator, id: 'b', temperature: 15, reachable: false }]);
    render(RoomCard, { room: two, now, points: [] });
    expect(screen.getByText('1 radiateur sur 2 hors ligne')).toBeInTheDocument();
    expect(screen.getByText(`21,0 °C`)).toBeInTheDocument();
  });

  it('the strip draws no window or presence runs on a card, and its setpoint is the quiet dashed step', () => {
    const { container } = render(RoomCard, { room, now, points: [] });
    expect(container.querySelector('rect.window, rect.presence')).toBeNull();
    expect(container.querySelector('path.setpoint')).toHaveClass('quiet');
    expect(container.querySelector('.axis')).toBeNull();
  });
});

describe('RoomCard offline', () => {
  const since = Date.parse('2026-10-13T10:32:00Z') / 1000; // 12:32
  beforeEach(() => snapshot([room], [{ ...radiator, reachable: false, unreachable_since: since }]));

  it('compact and calm: no temperature, no strip, no target, never red', () => {
    const { container } = render(RoomCard, { room, now, points: [] });
    expect(container.querySelector('.card')).toHaveClass('off');
    expect(screen.queryByText(/°C/)).toBeNull();
    expect(container.querySelector('svg[role="img"]')).toBeNull();
    expect(container.querySelector('.bad, .warn')).toBeNull();
    expect(container.querySelector('.why')).toHaveTextContent('Hors ligne depuis 12:32 · Radiateur hors tension ou hors de portée');
  });

  it('its link is named by the sentence', () => {
    render(RoomCard, { room, now, points: [] });
    expect(screen.getByRole('link')).toHaveAccessibleName('Salon, Hors ligne depuis 12:32, Radiateur hors tension ou hors de portée');
  });
});

describe('pending on the card', () => {
  it('a pending mode: the requested sentence dashed, « Envoi… » in place of the target', () => {
    house.applyPending({
      id: 'p1', label: 'Salon : Manuel', radiator_ids: ['a'], status: 'pending', error: null, created_at: 2,
      expected: { a: { mode: 'manual', target: 21 } }
    });
    const { container } = render(RoomCard, { room, now, points: [] });
    expect(container.querySelector('.status')).toHaveTextContent(`Manuel · 21,0 °C`);
    expect(container.querySelector('.status svg.edge')).toHaveClass('pending');
    expect(screen.getByText('Envoi…')).toBeInTheDocument();
    expect(container.querySelector('.target')).not.toHaveTextContent('consigne');
  });

  it('closes solid when the radiators report the request, then the dash goes', async () => {
    vi.useFakeTimers();
    try {
      house.applyPending({
        id: 'p9', label: 'Salon : Manuel', radiator_ids: ['a'], status: 'pending', error: null, created_at: 2,
        expected: { a: { mode: 'manual', target: 21 } }
      });
      const { container, rerender } = render(RoomCard, { room, now, points: [] });
      const edge = () => container.querySelector('.status svg.edge');
      expect(edge()).toHaveClass('pending');
      const manual = { ...room, mode: 'manual' as const, target: 21 };
      snapshot([manual], [{ ...radiator, mode: 'manual', target: 21 }]);
      await rerender({ room: manual });
      flushSync();
      expect(edge()).toHaveClass('confirmed');
      await vi.advanceTimersByTimeAsync(300);
      expect(edge()).not.toHaveClass('confirmed');
    } finally {
      vi.useRealTimers();
    }
  });

  it('a pending comfort is drawn dashed on the strip', () => {
    house.applyPending({
      id: 'p3', label: 'Salon : Confort', radiator_ids: ['a'], status: 'pending', error: null, created_at: 2,
      expected: { a: { comfort: 21 } }
    });
    const { container } = render(RoomCard, { room, now, points: [] });
    expect(container.querySelector('path.pending-comfort')).not.toBeNull();
  });

  it('a failed command keeps its Réessayer on the card, outside the link', () => {
    house.applyPending({
      id: 'p4', label: 'Salon : Manuel', radiator_ids: ['a'], status: 'failed', error: 'x', created_at: 2,
      expected: { a: { mode: 'manual' } }
    });
    render(RoomCard, { room, now, points: [] });
    const retry = screen.getByRole('button', { name: 'Réessayer' });
    expect(retry.closest('a')).toBeNull();
  });
});

it('in English: the sentence, the target and the name', () => {
  applyLocale('en');
  const { container } = render(RoomCard, { room, now, points: [] });
  expect(container.querySelector('.status')).toHaveTextContent('Schedule · Eco until 17:30');
  expect(screen.getByText(`target 17.0 °C`)).toBeInTheDocument();
  expect(screen.getByRole('link')).toHaveAccessibleName(`Salon, 20.1${NB}°C, Schedule · Eco until 17:30, target 17.0${NB}°C`);
});

it('the house root reads « Maison » in French and “Home” in English, whatever the backend calls it', () => {
  const root = { ...room, id: 'p-house', name: 'Maison', is_root: true }; // i18n-ignore: the backend's root name, a data value
  snapshot([root], [{ ...radiator, room_id: 'p-house' }]);
  applyLocale('en');
  render(RoomCard, { room: { ...root, radiator_ids: ['a'] }, now, points: [], desktop: true });
  expect(screen.getByText('Home', { selector: '.name' })).toBeInTheDocument();
  applyLocale('fr');
});
