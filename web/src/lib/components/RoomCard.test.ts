import { flushSync } from 'svelte';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '$lib/api/client';
import { house } from '$lib/stores/house.svelte';
import RoomCard from './RoomCard.svelte';
import { applyLocale } from '$lib/i18n';

vi.mock('$lib/api/client', () => ({
  api: { roomMode: vi.fn().mockResolvedValue({ pending: null }), roomSetpoint: vi.fn().mockResolvedValue({ pending: null }) },
  ApiError: class extends Error {}
}));

const now = Date.parse('2026-10-13T11:48:00Z');
const radiator = {
  id: 'a', room_id: 'salon', name: 'Radiateur', model: 'HEKLA P', power_w: 1500, temperature: 19.5, mode: 'program' as const,
  target: 20, comfort: 20, eco_delta: 3, eco: 17, effective_setpoint: 17, heating_level: 'eco', max_temperature: 28,
  window_open: false, occupied: false, window_detection: true, presence_detection: false, light: null, energy_wh: null,
  working_rate: 0, rssi: 100,
  program: { tuesday: [{ start: '06:15', end: '08:00' }, { start: '17:30', end: '22:30' }] }
};
const room = {
  id: 'salon', name: 'Salon', radiator_ids: ['a'], temperature: 20.1, mode: 'program' as const, target: 20, comfort: 20,
  eco: 17, effective_setpoint: 17, heating_level: 'eco', window_open: false, occupied: false
};

beforeEach(() => {
  house.applySnapshot({
    house: { rooms: [room], radiators: [radiator] }, pending: [], overrides: [],
    status: { connected: true, last_ok_at: 1, last_error: null }
  });
});

describe('RoomCard', () => {
  it('shows the essentials collapsed', () => {
    render(RoomCard, { room, now, expanded: false, points: [], onselect: vi.fn() });
    expect(screen.getByText('Salon')).toBeInTheDocument();
    expect(screen.getByText('20,1 °C')).toBeInTheDocument();
    expect(screen.getByText('Éco')).toBeInTheDocument();
    expect(screen.getByText('17:30 → Confort')).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });

  it('expanded shows the mode switch and the comfort stepper in program mode', async () => {
    render(RoomCard, { room, now, expanded: true, points: [], onselect: vi.fn() });
    expect(screen.getByRole('radiogroup', { name: 'Mode' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Confort' })).toBeInTheDocument();
  });

  it('collapses the empty footer of an off room', () => {
    const off = { ...room, mode: 'off' as const };
    const { container } = render(RoomCard, { room: off, now, expanded: false, points: [], onselect: vi.fn() });
    expect(container.querySelector('.foot')).toBeNull();
  });

  it('expanded: the footer carries Détails at its right and the card ends on a labelled stepper row', () => {
    const { container } = render(RoomCard, { room, now, expanded: true, points: [], onselect: vi.fn() });
    const link = screen.getByRole('link', { name: 'Détails' });
    expect(link.closest('.foot')).not.toBeNull();
    expect(link.closest('.controls')).toBeNull();
    expect(container.querySelector('.foot')!.lastElementChild).toBe(link);
    const row = container.querySelector('.controls')!.lastElementChild!;
    expect(row).toHaveClass('row');
    expect(row.querySelector('.label')).toHaveTextContent('Confort');
    expect(row.querySelector('[role="group"]')).toHaveAttribute('aria-label', 'Confort');
  });

  it('an expanded off room still shows the footer with Détails', () => {
    const off = { ...room, mode: 'off' as const };
    const { container } = render(RoomCard, { room: off, now, expanded: true, points: [], onselect: vi.fn() });
    expect(container.querySelector('.foot a.details')).not.toBeNull();
  });

  it('selecting calls onselect', async () => {
    const onselect = vi.fn();
    render(RoomCard, { room, now, expanded: false, points: [], onselect });
    await fireEvent.click(screen.getByRole('button', { name: /Salon/ }));
    expect(onselect).toHaveBeenCalled();
  });

  it('a pending mode shows dashed and "Envoi…"', () => {
    house.applyPending({
      id: 'p1', label: 'Salon : Manuel', radiator_ids: ['a'], status: 'pending', error: null, created_at: 2,
      expected: { a: { mode: 'manual' } }
    });
    render(RoomCard, { room, now, expanded: true, points: [], onselect: vi.fn() });
    expect(screen.getByRole('radio', { name: 'Manuel (en attente)' })).toHaveClass('pending');
    expect(screen.getByText('Envoi…')).toBeInTheDocument();
  });

  it('is an expanding button on the phone, wired to its controls', () => {
    render(RoomCard, { room, now, expanded: true, points: [], onselect: vi.fn() });
    const head = screen.getByRole('button', { name: /Salon/ });
    expect(head).toHaveAttribute('aria-expanded', 'true');
    const controls = document.getElementById(head.getAttribute('aria-controls')!);
    expect(controls).toHaveClass('controls');
  });

  it('is a link to the room on desktop, marked current when it is the room shown', () => {
    render(RoomCard, { room, now, expanded: false, points: [], onselect: vi.fn(), navigates: true, selected: true, current: true });
    const link = screen.getByRole('link', { name: /Salon/ });
    expect(link).toHaveAttribute('href', '/rooms/salon');
    expect(link).toHaveAttribute('aria-current', 'page');
    expect(link).not.toHaveAttribute('aria-expanded');
    // Focus stays on the card across the navigation (the list is not re-rendered).
    expect(link).toHaveAttribute('data-sveltekit-keepfocus');
    expect(screen.queryByRole('button', { name: /Salon/ })).toBeNull();
  });

  it('on "/" the chosen room is selected but not the current page', () => {
    const { container } = render(RoomCard, { room, now, expanded: false, points: [], onselect: vi.fn(), navigates: true, selected: true });
    expect(screen.getByRole('link', { name: /Salon/ })).not.toHaveAttribute('aria-current');
    expect(container.querySelector('.card')).toHaveClass('selected');
  });

  it('a requested comfort the radiators did not take disappears at once (no false « → value »)', () => {
    house.applyPending({
      id: 'p8', label: 'Salon : Confort', radiator_ids: ['a'], status: 'pending', error: null, created_at: 2,
      expected: { a: { comfort: 23 } }
    });
    const { container } = render(RoomCard, { room, now, expanded: false, points: [], onselect: vi.fn() });
    expect(container.querySelector('.pending-sp')).toHaveTextContent('→ 23,0 °C');
    house.applyPending({
      id: 'p8', label: 'Salon : Confort', radiator_ids: ['a'], status: 'failed', error: 'x', created_at: 2,
      expected: { a: { comfort: 23 } }
    });
    flushSync();
    expect(container.querySelector('.pending-sp')).toBeNull();
  });

  it('underlines a pending comfort dashed, then closes it solid when the radiators report it', async () => {
    vi.useFakeTimers();
    try {
      house.applyPending({
        id: 'p9', label: 'Salon : Confort', radiator_ids: ['a'], status: 'pending', error: null, created_at: 2,
        expected: { a: { comfort: 21 } }
      });
      const { container } = render(RoomCard, { room, now, expanded: false, points: [], onselect: vi.fn() });
      const edge = () => container.querySelector('.pending-sp svg.edge');
      expect(edge()).toHaveClass('pending');
      house.applyHouse({ rooms: [], radiators: [{ ...radiator, comfort: 21 }] } as never);
      house.applyPending({
        id: 'p9', label: 'Salon : Confort', radiator_ids: ['a'], status: 'confirmed', error: null, created_at: 2,
        expected: { a: { comfort: 21 } }
      });
      flushSync();
      expect(edge()).toHaveClass('confirmed');
      expect(container.querySelector('.pending-sp')).toHaveTextContent('→ 21,0 °C');
      await vi.advanceTimersByTimeAsync(300);
      expect(container.querySelector('.pending-sp')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a pending comfort shows in the setpoint line', () => {
    house.applyPending({
      id: 'p2', label: 'Salon : Confort', radiator_ids: ['a'], status: 'pending', error: null, created_at: 2,
      expected: { a: { comfort: 21 } }
    });
    render(RoomCard, { room, now, expanded: false, points: [], onselect: vi.fn() });
    expect(screen.getByText('→ 21,0 °C')).toHaveClass('pending-sp');
  });

  it('a pending comfort is drawn dashed on the strip', () => {
    house.applyPending({
      id: 'p3', label: 'Salon : Confort', radiator_ids: ['a'], status: 'pending', error: null, created_at: 2,
      expected: { a: { comfort: 21 } }
    });
    const { container } = render(RoomCard, { room, now, expanded: false, points: [], onselect: vi.fn() });
    expect(container.querySelector('path.pending-comfort')).not.toBeNull();
  });

  it('the strip gets its time axis only when expanded', () => {
    const { container, unmount } = render(RoomCard, { room, now, expanded: false, points: [], onselect: vi.fn() });
    expect(container.querySelector('.axis')).toBeNull();
    unmount();
    const open = render(RoomCard, { room, now, expanded: true, points: [], onselect: vi.fn() });
    expect(open.container.querySelector('.axis')).not.toBeNull();
  });

  it('radiators that disagree: the stepper starts from their mean, never from a bound', async () => {
    vi.useFakeTimers();
    try {
      const b = { ...radiator, id: 'b', mode: 'manual' as const, target: 21 };
      const mixed = { ...room, radiator_ids: ['a', 'b'], mode: 'manual' as const, target: null, comfort: 20 };
      house.applySnapshot({
        house: { rooms: [mixed], radiators: [{ ...radiator, mode: 'manual' as const, target: 20 }, b] }, pending: [], overrides: [],
        status: { connected: true, last_ok_at: 1, last_error: null }
      });
      render(RoomCard, { room: mixed, now, expanded: true, points: [], onselect: vi.fn() });
      expect(screen.getByText('Mixte (moyenne)')).toBeInTheDocument();
      const group = screen.getByRole('group', { name: 'Consigne' });
      expect(group).toHaveTextContent('20,5');
      const minus = screen.getByRole('button', { name: 'Diminuer Consigne' });
      await fireEvent.pointerDown(minus);
      await fireEvent.pointerUp(minus);
      await vi.advanceTimersByTimeAsync(600);
      expect(api.roomSetpoint).toHaveBeenCalledWith('salon', 'manual', 20);
    } finally {
      vi.useRealTimers();
    }
  });
});

it('in English: mode and level chips, the comfort row and the details link', () => {
  applyLocale('en');
  render(RoomCard, { room, now, expanded: true, points: [], onselect: vi.fn() });
  expect(screen.getByText('Schedule', { selector: '.chip' })).toBeInTheDocument();
  expect(screen.getByText('Eco', { selector: '.chip' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Details' })).toHaveAttribute('href', '/rooms/salon');
  expect(screen.getByRole('group', { name: 'Comfort' })).toBeInTheDocument();
});

describe('reachability on the card', () => {
  it('says « Injoignable » when a radiator is unreachable', () => {
    house.applySnapshot({
      house: { rooms: [room], radiators: [{ ...radiator, reachable: false, unreachable_since: null }] },
      pending: [], overrides: [], status: { connected: true, last_ok_at: 1, last_error: null }
    });
    render(RoomCard, { room, now, expanded: false, points: [], onselect: vi.fn() });
    expect(screen.getByText('Injoignable')).toBeInTheDocument();
  });
});
