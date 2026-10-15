import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import RoomBlock from './RoomBlock.svelte';
import { setupFixture } from './fixture';

describe('RoomBlock', () => {
  it('lists its radiators, each opening onto its six devices', () => {
    const s = setupFixture();
    render(RoomBlock, { room: s.rooms[1], radiators: s.radiators, now: 0 });
    expect(screen.getByRole('heading', { name: 'Salon' })).toBeInTheDocument();
    expect(screen.getByText('1 radiateur')).toBeInTheDocument();
    expect(screen.getByText('6 appareils')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem', { hidden: true })).toHaveLength(7); // the radiator + 6 devices
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
});
