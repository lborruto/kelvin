import { render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '$lib/api/client';
import { setupFixture } from '$lib/components/devices/fixture';
import { house } from '$lib/stores/house.svelte';
import Page from './+page.svelte';

vi.mock('$lib/api/client', () => ({
  api: { setupDevices: vi.fn() },
  ApiError: class extends Error {}
}));

beforeEach(() => {
  vi.clearAllMocks();
  house.reset();
});

describe('Rooms and devices page', () => {
  it('shows skeletons, then every room, the empty one included, and the bridge', async () => {
    let resolve!: (v: unknown) => void;
    vi.mocked(api.setupDevices).mockReturnValue(new Promise((r) => (resolve = r)) as never);
    const { container } = render(Page);
    expect(screen.getByRole('heading', { level: 1, name: 'Pièces et appareils' })).toBeInTheDocument();
    expect(container.querySelector('[aria-busy="true"] .skeleton')).toBeInTheDocument();
    resolve(setupFixture());
    expect(await screen.findByRole('heading', { name: 'Salon' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Bureau' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Maison' })).toBeNull(); // root without radiators
    expect(screen.getByRole('heading', { name: 'Pont et box Cozytouch' })).toBeInTheDocument();
    expect(screen.getAllByText('Box Cozytouch')).toHaveLength(2); // the role (m.devices.role.box) and the Cozytouch label
    expect(container.querySelector('.skeleton')).toBeNull();
  });

  it('says when the devices could not be loaded', async () => {
    vi.mocked(api.setupDevices).mockRejectedValue(new Error('down'));
    render(Page);
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger les appareils.');
  });
});
