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
});
