import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '$lib/api/client';
import { setupFixture } from '$lib/components/devices/fixture';
import type { Pending } from '$lib/api/types';
import { auth } from '$lib/stores/auth.svelte';
import { house } from '$lib/stores/house.svelte';
import { toasts } from '$lib/stores/toasts.svelte';
import Page from './+page.svelte';

vi.mock('$lib/api/client', () => ({
  api: {
    setupDevices: vi.fn(),
    syncSetup: vi.fn(),
    tidyDevice: vi.fn(),
    createRoom: vi.fn().mockResolvedValue({ pending: null }),
    deleteRoom: vi.fn(),
    renameRadiator: vi.fn().mockResolvedValue({ pending: null })
  },
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

  it('shows the sync line and the stray notice from the tree', async () => {
    const s = setupFixture();
    s.radiators[0].devices[2] = { ...s.radiators[0].devices[2], misplaced: true, room_id: 'p-bureau' };
    vi.mocked(api.setupDevices).mockResolvedValue(s);
    render(Page);
    expect(await screen.findByRole('button', { name: 'Synchroniser' })).toBeInTheDocument();
    expect(screen.getByText('Pas dans la même pièce que son radiateur')).toBeInTheDocument();
  });

  it('« Nouvelle pièce » creates a room through Cozytouch', async () => {
    vi.mocked(api.setupDevices).mockResolvedValue(setupFixture());
    render(Page);
    await fireEvent.click(await screen.findByRole('button', { name: 'Nouvelle pièce' }));
    await fireEvent.input(screen.getByLabelText('Nom de la nouvelle pièce'), { target: { value: 'Bureau 2' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Créer' }));
    expect(api.createRoom).toHaveBeenCalledWith('Bureau 2');
  });

  it('a radiator rename sends the new label; its undo would restore the exact Cozytouch label', async () => {
    const s = setupFixture();
    s.radiators[0].devices[0] = { ...s.radiators[0].devices[0], label: 'IO (r1#1)' };
    vi.mocked(api.setupDevices).mockResolvedValue(s);
    const p = {
      id: 's9', kind: 'setup', label: 'x', label_code: 'setup_rename_device', label_params: { name: 'Radiateur', label: 'Hekla' },
      radiator_ids: ['r1'], room_id: null, status: 'pending', error: null, created_at: 1, expected: {}, progress: { done: 0, total: 1 }
    } as Pending;
    vi.mocked(api.renameRadiator).mockResolvedValueOnce({ pending: p }).mockResolvedValueOnce({ pending: null });
    render(Page);
    const row = (await screen.findByText('Radiateur', { selector: '.name' })).closest('li')!;
    await fireEvent.click(within(row).getAllByRole('button', { name: 'Renommer' })[0]);
    await fireEvent.input(screen.getByLabelText('Nom du radiateur'), { target: { value: 'Hekla' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(api.renameRadiator).toHaveBeenCalledWith('r1', 'Hekla');
    house.applyPending({ ...p, status: 'confirmed' });
    toasts.items.at(-1)!.action!.run();
    await vi.waitFor(() => expect(api.renameRadiator).toHaveBeenLastCalledWith('r1', 'IO (r1#1)'));
  });

  it('a slow server: Enter, click and Enter on « Créer » send one create (review T11-1)', async () => {
    vi.mocked(api.setupDevices).mockResolvedValue(setupFixture());
    vi.mocked(api.createRoom).mockClear();
    vi.mocked(api.createRoom).mockImplementation(
      () => new Promise((r) => setTimeout(() => r({ pending: null }), 1500)) as never
    );
    render(Page);
    await fireEvent.click(await screen.findByRole('button', { name: 'Nouvelle pièce' }));
    const input = screen.getByLabelText('Nom de la nouvelle pièce');
    await fireEvent.input(input, { target: { value: 'Bureau 2' } });
    await fireEvent.submit(input.closest('form')!);
    await fireEvent.click(screen.getByRole('button', { name: 'Créer' }));
    await fireEvent.submit(input.closest('form')!);
    await new Promise((r) => setTimeout(r, 1600));
    expect(api.createRoom).toHaveBeenCalledOnce();
  });
});

describe('Rooms and devices page across brands', () => {
  it('lists the other devices under « Autres appareils »', async () => {
    vi.mocked(api.setupDevices).mockResolvedValue({
      ...setupFixture(),
      appliances: [
        {
          id: 'bridge-4',
          role: 'heat_pump',
          label: 'Pompe à chaleur',
          widget: 'AtlanticPassAPCHeatPump',
          room_id: null,
          misplaced: false,
          reachable: true,
          last_event_at: null,
          details: {},
          support: 'readonly'
        }
      ]
    });
    render(Page);
    expect(await screen.findByRole('heading', { name: 'Autres appareils' })).toBeInTheDocument();
    expect(screen.getByText('Pompe à chaleur', { selector: '.label' })).toBeInTheDocument();
  });

  it('the device screen hides setup actions on an experimental server', async () => {
    auth.server = { id: 'flexom', name: 'Flexom', tier: 'experimental', default: false };
    const s = setupFixture();
    s.radiators[0].devices[2] = { ...s.radiators[0].devices[2], misplaced: true, room_id: 'p-bureau' };
    vi.mocked(api.setupDevices).mockResolvedValue(s);
    render(Page);
    try {
      expect(await screen.findByText(/Lu dans votre installation Flexom/)).toBeInTheDocument();
      expect(screen.getByText('Pas dans la même pièce que son radiateur')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Nouvelle pièce/ })).toBeNull();
      expect(
        screen.queryByRole('button', { name: /Renommer|Supprimer la pièce|Déplacer vers|Ranger avec le radiateur/ })
      ).toBeNull();
      expect(screen.getByRole('button', { name: 'Synchroniser' })).toBeInTheDocument(); // a read
    } finally {
      auth.server = null;
    }
  });

  it('keeps the setup actions on a Cozytouch server', async () => {
    auth.server = { id: 'atlantic_cozytouch', name: 'Atlantic Cozytouch', tier: 'cozytouch', default: false };
    vi.mocked(api.setupDevices).mockResolvedValue(setupFixture());
    render(Page);
    try {
      expect(await screen.findByRole('button', { name: /Nouvelle pièce/ })).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: /Renommer/ }).length).toBeGreaterThan(0);
    } finally {
      auth.server = null;
    }
  });
});
