import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '$lib/api/client';
import { house } from '$lib/stores/house.svelte';
import Page from './+page.svelte';

const nav = vi.hoisted(() => ({ guard: null as null | ((n: { willUnload: boolean; cancel: () => void }) => void) }));
vi.mock('$app/navigation', () => ({ beforeNavigate: (fn: never) => (nav.guard = fn) }));
vi.mock('$lib/stores/history.svelte', () => ({ history: { data: {}, load: vi.fn() } }));
vi.mock('$lib/api/client', () => ({
  api: { roomProgram: vi.fn() },
  ApiError: class extends Error {
    constructor(public status: number, message: string) {
      super(message);
    }
  }
}));

const rad = {
  id: 'a', room_id: 'salon', name: 'Gauche', model: null, power_w: 1500, temperature: 19.5, mode: 'program' as const, target: 20,
  comfort: 19, eco_delta: 3, eco: 17, effective_setpoint: 17, heating_level: 'eco', max_temperature: 28, window_open: false,
  occupied: false, window_detection: true, presence_detection: false, light: null, energy_wh: null, working_rate: 0, rssi: 100, program: {}
};
const pending = (status: string, error: string | null = null) => ({
  id: 'p1', label: 'Programme', radiator_ids: ['a'], status, error, created_at: 1, expected: {}
});

beforeEach(() => {
  vi.mocked(api.roomProgram).mockReset();
  vi.restoreAllMocks();
  nav.guard = null;
  house.pending = {};
  house.applySnapshot({
    house: {
      rooms: [{ id: 'salon', name: 'Salon', radiator_ids: ['a'], temperature: 19.5, mode: 'program', target: 20, comfort: 19, eco: 17,
        effective_setpoint: 17, heating_level: 'eco', window_open: false, occupied: false }],
      radiators: [rad]
    },
    pending: [], overrides: [], status: { connected: true, last_ok_at: 1, last_error: null }
  } as never);
});

async function editAndSend() {
  render(Page);
  await fireEvent.click(await screen.findByRole('button', { name: 'Ajouter une plage le Lundi' }));
  expect(screen.getByText('Modifications')).toBeInTheDocument();
  await fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
}

describe('/programme', () => {
  it('keeps the edits when the send fails', async () => {
    vi.mocked(api.roomProgram).mockRejectedValue(new ApiError(502, 'Radiateur injoignable.'));
    await editAndSend();
    await waitFor(() => expect(api.roomProgram).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByText('Modifications')).toBeInTheDocument();
    expect(screen.getByLabelText('Lundi, plage 1, début')).not.toBeDisabled();
  });

  it('shows the sent week as pending until the radiator confirms', async () => {
    vi.mocked(api.roomProgram).mockResolvedValue({ pending: pending('pending') as never });
    await editAndSend();
    expect(await screen.findByText('Envoi en cours…')).toBeInTheDocument();
    expect(screen.getByLabelText('Lundi, plage 1, début')).toBeDisabled();
    expect(screen.getByText('Salon', { selector: 'li span' })).toBeInTheDocument();
    // The radiator reports the new programme, then the command is confirmed.
    house.applyHouse({ rooms: [], radiators: [{ ...rad, program: { monday: [{ start: '07:00', end: '09:00' }] } }] } as never);
    house.applyPending(pending('confirmed') as never);
    await waitFor(() => expect(screen.queryByText('Envoi en cours…')).toBeNull());
    expect(screen.getByLabelText('Lundi, plage 1, début')).not.toBeDisabled();
  });

  it('restores the edits as unsent when the radiator reports a failure', async () => {
    vi.mocked(api.roomProgram).mockResolvedValue({ pending: pending('pending') as never });
    await editAndSend();
    await screen.findByText('Envoi en cours…');
    house.applyPending(pending('failed', 'Échec radiateur') as never);
    await waitFor(() => expect(screen.queryByText('Envoi en cours…')).toBeNull());
    expect(screen.getByText('Modifications')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });

  it('keeps another room editable while a send for a different room is pending', async () => {
    const chambre = { ...rad, id: 'b', room_id: 'chambre', name: 'Lit', program: { monday: [{ start: '10:00', end: '11:00' }] } };
    const salon = { ...rad, program: { monday: [{ start: '07:00', end: '09:00' }] } };
    house.applySnapshot({
      house: {
        rooms: [
          { ...house.rooms[0], radiator_ids: ['a'] },
          { ...house.rooms[0], id: 'chambre', name: 'Chambre 2', radiator_ids: ['b'] }
        ],
        radiators: [salon, chambre]
      },
      pending: [], overrides: [], status: { connected: true, last_ok_at: 1, last_error: null }
    } as never);
    vi.mocked(api.roomProgram).mockResolvedValue({ pending: { ...pending('pending'), radiator_ids: ['b'] } as never });
    render(Page);
    await fireEvent.click(await screen.findByRole('button', { name: 'Chambre 2' }));
    await fireEvent.click(await screen.findByRole('button', { name: 'Ajouter une plage le Lundi' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
    await screen.findByText('Envoi en cours…');
    await fireEvent.click(screen.getByRole('button', { name: 'Salon' }));
    expect(await screen.findByLabelText('Lundi, plage 1, début')).toHaveValue('07:00');
    expect(screen.getByLabelText('Lundi, plage 1, début')).not.toBeDisabled();
    expect(screen.queryByLabelText('Lundi, plage 2, début')).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Chambre 2' }));
    expect(screen.getByLabelText('Lundi, plage 2, début')).toBeDisabled();
    expect(screen.getByText('Envoi en cours…')).toBeInTheDocument();
  });

  it('keeps the sent week visible when the confirmation arrives before the radiator update', async () => {
    vi.mocked(api.roomProgram).mockResolvedValue({ pending: pending('pending') as never });
    await editAndSend();
    await screen.findByText('Envoi en cours…');
    house.applyPending(pending('confirmed') as never);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByLabelText('Lundi, plage 1, début')).toBeDisabled();
    house.applyHouse({ rooms: [], radiators: [{ ...rad, program: { monday: [{ start: '07:00', end: '09:00' }] } }] } as never);
    await waitFor(() => expect(screen.getByLabelText('Lundi, plage 1, début')).not.toBeDisabled());
    expect(screen.getByLabelText('Lundi, plage 1, début')).toHaveValue('07:00');
  });

  it('does not offer Réessayer once the draft has diverged from the failed week', async () => {
    vi.mocked(api.roomProgram).mockResolvedValue({ pending: pending('pending') as never });
    await editAndSend();
    await screen.findByText('Envoi en cours…');
    house.applyPending(pending('failed', 'Échec radiateur') as never);
    await screen.findByRole('button', { name: 'Réessayer' });
    await fireEvent.click(screen.getByRole('button', { name: 'Ajouter une plage le Lundi' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Réessayer' })).toBeNull());
    expect(screen.getByText(/Modifiez puis Envoyer/)).toBeInTheDocument();
  });

  it('shows an empty state instead of the editor for a room without radiators', async () => {
    house.applySnapshot({
      house: { rooms: [{ ...house.rooms[0], radiator_ids: [] }], radiators: [] },
      pending: [], overrides: [], status: { connected: true, last_ok_at: 1, last_error: null }
    } as never);
    render(Page);
    expect(await screen.findByText(/aucun radiateur/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Envoyer' })).toBeNull();
  });

  it('shows today’s strip for the selected room above the week, previewing the draft', async () => {
    const { container } = render(Page);
    await screen.findByRole('button', { name: 'Ajouter une plage le Lundi' });
    const strip = container.querySelector('.today svg[aria-label^="Salon"]');
    expect(strip).not.toBeNull();
    expect(container.querySelector('.today .axis')).not.toBeNull();
    expect(strip!.compareDocumentPosition(container.querySelector('.week')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('asks before leaving the page with unsent edits, and stays when refused', async () => {
    render(Page);
    const ask = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const cancel = vi.fn();
    await screen.findByRole('button', { name: 'Ajouter une plage le Lundi' });
    nav.guard!({ willUnload: false, cancel });
    expect(ask).not.toHaveBeenCalled(); // clean draft: leave freely
    await fireEvent.click(screen.getByRole('button', { name: 'Ajouter une plage le Lundi' }));
    nav.guard!({ willUnload: false, cancel });
    expect(ask).toHaveBeenCalledWith('Abandonner les modifications non envoyées ?');
    expect(cancel).toHaveBeenCalledTimes(1);
    ask.mockReturnValue(true);
    nav.guard!({ willUnload: false, cancel });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('asks before switching room with unsent edits, and keeps them when refused', async () => {
    house.applySnapshot({
      house: {
        rooms: [house.rooms[0], { ...house.rooms[0], id: 'chambre', name: 'Chambre 2', radiator_ids: ['b'] }],
        radiators: [rad, { ...rad, id: 'b', room_id: 'chambre' }]
      },
      pending: [], overrides: [], status: { connected: true, last_ok_at: 1, last_error: null }
    } as never);
    render(Page);
    const ask = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await fireEvent.click(await screen.findByRole('button', { name: 'Ajouter une plage le Lundi' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Chambre 2' }));
    expect(ask).toHaveBeenCalledWith('Abandonner les modifications non envoyées ?');
    expect(screen.getByRole('button', { name: 'Salon' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Modifications')).toBeInTheDocument();
    ask.mockReturnValue(true);
    await fireEvent.click(screen.getByRole('button', { name: 'Chambre 2' }));
    expect(screen.getByRole('button', { name: 'Chambre 2' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText('Modifications')).toBeNull();
  });

  it('Envoyer is disabled while the sends are in flight (no double send)', async () => {
    let resolve!: (v: unknown) => void;
    vi.mocked(api.roomProgram).mockReturnValue(new Promise((r) => (resolve = r)) as never);
    await editAndSend();
    expect(screen.getByRole('button', { name: 'Envoyer' })).toBeDisabled();
    expect(screen.getByLabelText('Lundi, plage 1, début')).toBeDisabled();
    await fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
    expect(api.roomProgram).toHaveBeenCalledTimes(1);
    resolve({ pending: pending('pending') });
    await screen.findByText('Envoi en cours…');
  });

  it('an unknown outcome after a reconnect keeps the edits instead of reloading the device week', async () => {
    vi.mocked(api.roomProgram).mockResolvedValue({ pending: pending('pending') as never });
    await editAndSend();
    await screen.findByText('Envoi en cours…');
    // The phone slept: the fresh snapshot no longer lists the command, the device week is unchanged.
    house.applySnapshot({
      house: { rooms: house.rooms, radiators: [rad] },
      pending: [], overrides: [], status: { connected: true, last_ok_at: 1, last_error: null }
    } as never);
    await waitFor(() => expect(screen.queryByText('Envoi en cours…')).toBeNull());
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByText('Modifications')).toBeInTheDocument();
    expect(screen.getByText(/résultat inconnu/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Lundi, plage 1, début')).not.toBeDisabled();
  });
});
