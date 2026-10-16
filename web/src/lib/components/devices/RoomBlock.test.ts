import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyLocale } from '$lib/i18n';
import RoomBlock from './RoomBlock.svelte';
import { setupFixture } from './fixture';

// Menus as desktop popovers (a phone shows the same items in a sheet).
vi.mock('$lib/media.svelte', () => ({ desktop: { matches: true } }));
afterEach(() => applyLocale('fr'));

describe('RoomBlock', () => {
  it('names each radiator by model, power and state; « Voir les appareils (6) » opens its devices', async () => {
    const s = setupFixture();
    render(RoomBlock, { room: s.rooms[1], radiators: s.radiators, now: 0 });
    expect(screen.getByRole('heading', { name: 'Salon' })).toBeInTheDocument();
    expect(screen.getByText('1 radiateur')).toBeInTheDocument();
    expect(screen.getByText(/^HEKLA P · 1\s500\sW · Joignable$/)).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(1); // the radiator; its devices one menu item away
    await fireEvent.click(screen.getByRole('button', { name: 'Actions pour Radiateur (HEKLA P)' }));
    await fireEvent.click(screen.getByRole('menuitem', { name: 'Voir les appareils (6)' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(7);
    await fireEvent.click(screen.getByRole('button', { name: 'Actions pour Radiateur (HEKLA P)' }));
    expect(screen.getByRole('menuitem', { name: 'Masquer les appareils' })).toBeInTheDocument();
  });

  it('the room’s menu holds its actions, a disabled one with its reason; no menu without items', async () => {
    const s = setupFixture();
    const rename = vi.fn();
    const a = render(RoomBlock, {
      room: s.rooms[1], radiators: s.radiators, now: 0,
      items: [{ label: 'Renommer la pièce', onselect: rename }, 'separator', { label: 'Supprimer la pièce', danger: true, disabled: 'Videz d’abord la pièce', onselect: vi.fn() }]
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Actions pour Salon' }));
    const del = screen.getByRole('menuitem', { name: /Supprimer la pièce/ });
    expect(del).toHaveAttribute('aria-disabled', 'true');
    expect(del).toHaveTextContent('Videz d’abord la pièce');
    await fireEvent.click(screen.getByRole('menuitem', { name: 'Renommer la pièce' }));
    expect(rename).toHaveBeenCalled();
    a.unmount();
    render(RoomBlock, { room: s.rooms[0], radiators: [], now: 0 });
    expect(screen.queryByRole('button', { name: /^Actions pour/ })).toBeNull();
  });

  it('two radiators with one name: a hint with « Renommer » (the first of them)', async () => {
    const s = setupFixture();
    const twin = { ...s.radiators[0], id: 'r2', devices: s.radiators[0].devices.map((d) => ({ ...d, id: d.id.replace('r1', 'r2') })) };
    const onrename = vi.fn();
    render(RoomBlock, { room: s.rooms[1], radiators: [s.radiators[0], twin], now: 0, onrename });
    expect(screen.getByText(/Deux radiateurs portent le même nom/)).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Renommer' }));
    expect(onrename).toHaveBeenCalledWith(s.radiators[0]);
  });

  it('an offline radiator says since when, from the house', () => {
    const s = setupFixture();
    const since = Date.UTC(2026, 9, 15, 12, 32) / 1000;
    render(RoomBlock, {
      room: s.rooms[1], radiators: s.radiators, now: since * 1000 + 60_000,
      live: { r1: { id: 'r1', model: 'HEKLA P', power_w: 1500, reachable: false, unreachable_since: since } as never }
    });
    expect(screen.getByText(/^HEKLA P · 1\s500\sW · Hors ligne depuis 14:32$/)).toBeInTheDocument();
  });

  it('in English', () => {
    applyLocale('en');
    const s = setupFixture();
    render(RoomBlock, { room: s.rooms[1], radiators: s.radiators, now: 0 });
    expect(screen.getByText(/^HEKLA P · 1,500\sW · Reachable$/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Actions for Radiateur (HEKLA P)' })).toBeInTheDocument();
  });

  it('an empty room says so', () => {
    const s = setupFixture();
    render(RoomBlock, { room: s.rooms[2], radiators: [], now: 0 });
    expect(screen.getByText('Pièce vide')).toBeInTheDocument();
  });

  it('a setup write in flight draws the dashed edge, closing solid when confirmed', () => {
    const s = setupFixture();
    const pending = { id: 's1', kind: 'setup', label: 'x', radiator_ids: [], room_id: 'p-bureau', status: 'pending',
      error: null, created_at: 1, expected: {} } as never;
    const { container, rerender } = render(RoomBlock, { room: s.rooms[2], radiators: [], now: 0, pending });
    expect(container.querySelector('svg.edge.pending')).toBeInTheDocument();
    rerender({ room: s.rooms[2], radiators: [], now: 0, pending: { ...(pending as object), status: 'confirmed' } as never });
    expect(container.querySelector('svg.edge.confirmed')).toBeInTheDocument();
  });

  it('a radiator title never prints a serial-like label', () => {
    const s = setupFixture();
    render(RoomBlock, { room: s.rooms[1], radiators: [{ ...s.radiators[0], name: 'IO (8370011#1)' }], now: 0 });
    expect(document.body.textContent).not.toContain('8370011');
    expect(screen.getByText('Radiateur', { selector: '.name' })).toBeInTheDocument();
  });
});
