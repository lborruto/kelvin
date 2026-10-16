import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '$lib/api/client';
import { house } from '$lib/stores/house.svelte';
import Page from './+page.svelte';
import { applyLocale } from '$lib/i18n';
import { goto } from '$app/navigation';
import { announcer } from '$lib/stores/announcer.svelte';

const nav = vi.hoisted(() => ({
  guard: null as null | ((n: { willUnload: boolean; cancel: () => void; from?: { url: URL }; to?: { url: URL } }) => void)
}));
vi.mock('$app/navigation', () => ({ beforeNavigate: (fn: never) => (nav.guard = fn), goto: vi.fn() }));
const state = vi.hoisted(() => ({ page: { url: new URL('http://kelvin.test/schedule') } }));
vi.mock('$app/state', () => state);
const media = vi.hoisted(() => ({ desktop: { matches: true } }));
vi.mock('$lib/media.svelte', () => media);
vi.mock('$lib/stores/history.svelte', () => ({ history: { data: {}, load: vi.fn() } }));
vi.mock('$lib/api/client', () => ({
  api: { roomProgram: vi.fn() },
  ApiError: class extends Error {
    constructor(
      public status: number,
      message: string,
      public code: string | null = null,
      public params: Record<string, unknown> = {}
    ) {
      super(message);
    }
  }
}));

beforeAll(() => {
  // jsdom has no modal dialogs: open and close by the attribute, as a browser would.
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
});

const rad = {
  id: 'a', room_id: 'salon', name: 'Gauche', model: null, power_w: 1500, temperature: 19.5, mode: 'program' as const, target: 20,
  comfort: 19, eco_delta: 3, eco: 17, effective_setpoint: 17, heating_level: 'eco', max_temperature: 28, window_open: false,
  occupied: false, window_detection: true, presence_detection: false, light: null, energy_wh: null, working_rate: 0, rssi: 100, program: {}
};
const salonRoom = {
  id: 'salon', name: 'Salon', radiator_ids: ['a'], temperature: 19.5, mode: 'program', target: 20, comfort: 19, eco: 17,
  effective_setpoint: 17, heating_level: 'eco', window_open: false, occupied: false
};
const pending = (status: string, error: string | null = null) => ({
  id: 'p1', label: 'Programme', radiator_ids: ['a'], status, error, created_at: 1, expected: {}
});
const snapshot = (rooms: object[], radiators: object[]) =>
  house.applySnapshot({
    house: { rooms, radiators },
    pending: [], overrides: [], status: { connected: true, last_ok_at: 1, last_error: null }
  } as never);

beforeEach(() => {
  vi.mocked(api.roomProgram).mockReset();
  vi.mocked(goto).mockReset();
  vi.restoreAllMocks();
  nav.guard = null;
  media.desktop.matches = true;
  state.page.url = new URL('http://kelvin.test/schedule');
  house.pending = {};
  snapshot([salonRoom], [rad]);
});

const row = (day: string) => screen.getByRole('button', { name: new RegExp(`^${day},`) });
const sendBar = () => document.querySelector('.sendbar');

/** Desktop: pick Monday in the week, then add a period to it in the editor. */
async function editMonday() {
  await fireEvent.click(await screen.findByRole('button', { name: /^Lundi,/ }));
  await fireEvent.click(screen.getByRole('button', { name: 'Ajouter une plage le Lundi' }));
}
async function editAndSend() {
  render(Page);
  await editMonday();
  expect(sendBar()).toHaveTextContent('1 jour modifié');
  await fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
}

describe('/schedule', () => {
  it('keeps the edits when the send fails', async () => {
    vi.mocked(api.roomProgram).mockRejectedValue(new ApiError(502, 'Radiateur injoignable.'));
    await editAndSend();
    await waitFor(() => expect(api.roomProgram).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(sendBar()).toHaveTextContent('1 jour modifié');
    expect(screen.getByLabelText('Lundi, plage 1, début')).toHaveAttribute('aria-disabled', 'false');
  });

  it('shows the sent week as pending until the radiator confirms', async () => {
    vi.mocked(api.roomProgram).mockResolvedValue({ pending: pending('pending') as never });
    await editAndSend();
    expect(await screen.findByText('Envoi en cours…')).toBeInTheDocument();
    expect(screen.getByLabelText('Lundi, plage 1, début')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Salon', { selector: 'li span' })).toBeInTheDocument();
    // The radiator reports the new programme, then the command is confirmed.
    house.applyHouse({ rooms: [], radiators: [{ ...rad, program: { monday: [{ start: '07:00', end: '09:00' }] } }] } as never);
    house.applyPending(pending('confirmed') as never);
    await waitFor(() => expect(screen.queryByText('Envoi en cours…')).toBeNull());
    expect(screen.getByLabelText('Lundi, plage 1, début')).toHaveAttribute('aria-disabled', 'false');
  });

  it('restores the edits as unsent when the radiator reports a failure', async () => {
    vi.mocked(api.roomProgram).mockResolvedValue({ pending: pending('pending') as never });
    await editAndSend();
    await screen.findByText('Envoi en cours…');
    house.applyPending(pending('failed', 'Échec radiateur') as never);
    await waitFor(() => expect(screen.queryByText('Envoi en cours…')).toBeNull());
    expect(sendBar()).toHaveTextContent('1 jour modifié');
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });

  it('keeps another room editable while a send for a different room is pending', async () => {
    const chambre = { ...rad, id: 'b', room_id: 'chambre', name: 'Lit', program: { monday: [{ start: '10:00', end: '11:00' }] } };
    const salon = { ...rad, program: { monday: [{ start: '07:00', end: '09:00' }] } };
    snapshot([salonRoom, { ...salonRoom, id: 'chambre', name: 'Chambre 2', radiator_ids: ['b'] }], [salon, chambre]);
    vi.mocked(api.roomProgram).mockResolvedValue({ pending: { ...pending('pending'), radiator_ids: ['b'] } as never });
    render(Page);
    await fireEvent.click(await screen.findByRole('radio', { name: 'Chambre 2' }));
    await editMonday();
    await fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
    await screen.findByText('Envoi en cours…');
    await fireEvent.click(screen.getByRole('radio', { name: 'Salon' }));
    expect(await screen.findByLabelText('Lundi, plage 1, début')).toHaveValue('07:00');
    expect(screen.getByLabelText('Lundi, plage 1, début')).toHaveAttribute('aria-disabled', 'false');
    expect(screen.queryByLabelText('Lundi, plage 2, début')).toBeNull();
    await fireEvent.click(screen.getByRole('radio', { name: 'Chambre 2' }));
    expect(screen.getByLabelText('Lundi, plage 2, début')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Envoi en cours…')).toBeInTheDocument();
  });

  it('keeps the sent week visible when the confirmation arrives before the radiator update', async () => {
    vi.mocked(api.roomProgram).mockResolvedValue({ pending: pending('pending') as never });
    await editAndSend();
    await screen.findByText('Envoi en cours…');
    house.applyPending(pending('confirmed') as never);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByLabelText('Lundi, plage 1, début')).toHaveAttribute('aria-disabled', 'true');
    house.applyHouse({ rooms: [], radiators: [{ ...rad, program: { monday: [{ start: '07:00', end: '09:00' }] } }] } as never);
    await waitFor(() => expect(screen.getByLabelText('Lundi, plage 1, début')).toHaveAttribute('aria-disabled', 'false'));
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
    snapshot([{ ...salonRoom, radiator_ids: [] }], []);
    render(Page);
    expect(await screen.findByText(/Aucun radiateur de cette maison/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Envoyer' })).toBeNull();
  });

  it('asks before leaving the page with unsent edits, and stays when refused; moving within the page never asks', async () => {
    render(Page);
    const ask = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const cancel = vi.fn();
    await screen.findByRole('button', { name: /^Lundi,/ });
    nav.guard!({ willUnload: false, cancel });
    expect(ask).not.toHaveBeenCalled(); // clean draft: leave freely
    await editMonday();
    // The week ↔ day views are the same page: the edits stay, nothing to ask.
    const here = { url: new URL('http://kelvin.test/schedule') };
    nav.guard!({ willUnload: false, cancel, from: here, to: { url: new URL('http://kelvin.test/schedule?day=monday') } });
    expect(ask).not.toHaveBeenCalled();
    nav.guard!({ willUnload: false, cancel, from: here, to: { url: new URL('http://kelvin.test/energy') } });
    expect(ask).toHaveBeenCalledWith('Abandonner les modifications non envoyées\u00a0?');
    expect(cancel).toHaveBeenCalledTimes(1);
    ask.mockReturnValue(true);
    nav.guard!({ willUnload: false, cancel });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('asks before switching room with unsent edits, and keeps them when refused', async () => {
    snapshot([salonRoom, { ...salonRoom, id: 'chambre', name: 'Chambre 2', radiator_ids: ['b'] }], [rad, { ...rad, id: 'b', room_id: 'chambre' }]);
    render(Page);
    const ask = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await editMonday();
    await fireEvent.click(screen.getByRole('radio', { name: 'Chambre 2' }));
    expect(ask).toHaveBeenCalledWith('Abandonner les modifications non envoyées\u00a0?');
    expect(screen.getByRole('radio', { name: 'Salon' })).toHaveAttribute('aria-checked', 'true');
    expect(sendBar()).toHaveTextContent('1 jour modifié');
    ask.mockReturnValue(true);
    await fireEvent.click(screen.getByRole('radio', { name: 'Chambre 2' }));
    expect(screen.getByRole('radio', { name: 'Chambre 2' })).toHaveAttribute('aria-checked', 'true');
    expect(sendBar()).toBeNull();
  });

  it('Envoyer is paused while the sends are in flight (no double send)', async () => {
    let resolve!: (v: unknown) => void;
    vi.mocked(api.roomProgram).mockReturnValue(new Promise((r) => (resolve = r)) as never);
    await editAndSend();
    expect(screen.getByRole('button', { name: 'Envoyer' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByLabelText('Lundi, plage 1, début')).toHaveAttribute('aria-disabled', 'true');
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
    snapshot(house.rooms, [rad]);
    await waitFor(() => expect(screen.queryByText('Envoi en cours…')).toBeNull());
    await new Promise((r) => setTimeout(r, 20));
    expect(sendBar()).toHaveTextContent('1 jour modifié');
    expect(screen.getByText(/résultat inconnu/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Lundi, plage 1, début')).toHaveAttribute('aria-disabled', 'false');
  });

  it('shows the page’s skeleton, not an empty page, before the house is known', () => {
    house.reset();
    const { container } = render(Page);
    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThanOrEqual(8);
    expect(screen.queryByRole('radiogroup', { name: 'Pièce' })).toBeNull();
  });

  it('keeps Annuler and Envoyer in a bar that counts the modified days; « Voir les modifications » lists them', async () => {
    render(Page);
    await screen.findByRole('button', { name: /^Lundi,/ });
    expect(sendBar()).toBeNull();
    await editMonday();
    const bar = sendBar()!;
    expect(bar).toHaveTextContent('1 jour modifié');
    expect(bar.querySelector('.btn-primary')).toHaveTextContent('Envoyer');
    const see = screen.getByRole('button', { name: 'Voir les modifications' });
    expect(see).toHaveAttribute('aria-expanded', 'false');
    await fireEvent.click(see);
    expect(see).toHaveAttribute('aria-expanded', 'true');
    expect(within(bar as HTMLElement).getByText(/07:00–09:00/)).toBeInTheDocument();
    expect(within(bar as HTMLElement).getByText(/\(avant\s:\saucune plage \(éco\)\)/)).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(sendBar()).toBeNull();
  });
});

describe('/schedule: what the page says', () => {
  it('the temperatures with swatches and a link to the room, « Maintenant », one line of help and « Comment modifier ? »', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-15T19:42:00Z')); // Thursday 21:42 in Paris
    try {
      snapshot([salonRoom], [{ ...rad, program: { thursday: [{ start: '17:00', end: '23:00' }] } }]);
      const { container } = render(Page);
      await screen.findByRole('button', { name: /^Jeudi,/ });
      expect(container.querySelector('.temps')).toHaveTextContent(/Confort\s19,0\s°C\s*Éco\s17,0\s°C/);
      expect(screen.getByRole('link', { name: 'Modifier les températures' })).toHaveAttribute('href', '/rooms/salon');
      expect(screen.getByText(/^Maintenant\s:\sConfort · 23:00 → Éco$/)).toBeInTheDocument();
      expect(screen.getByText('Hors des plages confort, la pièce est en éco.')).toBeInTheDocument();
      const how = screen.getByRole('button', { name: 'Comment modifier\u00a0?' });
      expect(how).toHaveAttribute('aria-expanded', 'false');
      await fireEvent.click(how);
      expect(how).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByText(/glissez une plage pour la déplacer/)).toBeInTheDocument();
      // Gone: the flat « Aujourd’hui » chart, the long paragraph and the midnight note.
      expect(container.querySelector('.today, svg[aria-label^="Salon"]')).toBeNull();
      expect(screen.queryByText(/Une fin à minuit/)).toBeNull();
      // Today is in the editor by default, with the now marker on its bar and its week row.
      expect(screen.getByRole('heading', { level: 2, name: /^Jeudi aujourd’hui/ })).toBeInTheDocument();
      expect(row('Jeudi')).toHaveAttribute('aria-pressed', 'true');
      expect(container.querySelectorAll('.now')).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a room not in programme mode says the programme applies in Programme mode', async () => {
    snapshot([{ ...salonRoom, mode: 'manual' }], [rad]);
    render(Page);
    expect(await screen.findByText(/^La pièce est en mode Manuel\s:\sce programme s’applique en mode Programme\.$/)).toBeInTheDocument();
  });

  it('a week row opens its day in the editor; previous and next day step through the week', async () => {
    render(Page);
    await fireEvent.click(await screen.findByRole('button', { name: /^Mardi,/ }));
    expect(screen.getByRole('heading', { level: 2, name: /^Mardi/ })).toBeInTheDocument();
    expect(row('Mardi')).toHaveAttribute('aria-pressed', 'true');
    await fireEvent.click(screen.getByRole('button', { name: 'Jour suivant' }));
    expect(screen.getByRole('heading', { level: 2, name: /^Mercredi/ })).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Jour précédent' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Jour précédent' }));
    expect(screen.getByRole('heading', { level: 2, name: /^Lundi/ })).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Jour précédent' }));
    expect(screen.getByRole('heading', { level: 2, name: /^Dimanche/ })).toBeInTheDocument();
    expect(goto).not.toHaveBeenCalled(); // desktop: the week and the editor share the page
  });

  it('an edited day says « modifié » in the week and in the editor', async () => {
    render(Page);
    await editMonday();
    expect(row('Lundi')).toHaveAccessibleName(/, modifié$/);
    expect(screen.getByRole('heading', { level: 2, name: 'Lundi modifié' })).toBeInTheDocument();
  });

  it('« Copier vers… » copies the day onto the chosen days of the draft only; the copies pulse and are announced', async () => {
    // A Thursday: Friday's row is not « aujourd’hui » (its name would then carry the today tag).
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-15T10:00:00Z')); // Thursday 12:00 in Paris
    try {
      const say = vi.spyOn(announcer, 'say');
      const { container } = render(Page);
      await editMonday();
      await fireEvent.click(screen.getByRole('button', { name: 'Copier vers…' }));
      expect(screen.getByRole('dialog', { name: 'Copier lundi vers…' })).toBeInTheDocument();
      expect(screen.queryByRole('checkbox', { name: 'Lundi' })).toBeNull(); // the source day
      await fireEvent.click(screen.getByRole('button', { name: 'Jours de semaine' }));
      await fireEvent.click(screen.getByRole('button', { name: 'Copier sur 4 jours' }));
      expect(sendBar()).toHaveTextContent('5 jours modifiés');
      expect(row('Vendredi')).toHaveAccessibleName(/^Vendredi, 07:00–09:00, 2\sh confort, modifié$/);
      expect(container.querySelector<HTMLElement>('[data-day="friday"] .bar')!.style.animationName).toMatch(/^kv-pulse/);
      expect(container.querySelector<HTMLElement>('[data-day="saturday"] .bar')!.style.animationName).toBe('none');
      expect(say).toHaveBeenCalledWith(expect.stringMatching(/^Copié sur 4 jours\./));
      expect(api.roomProgram).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a locked day can be viewed in the editor but never edited, and copies skip it', async () => {
    snapshot([salonRoom], [{ ...rad, program: { sunday: [{ start: '20:00', end: '24:00' }] }, program_locked: { sunday: 'midnight' } }]);
    render(Page);
    await fireEvent.click(await screen.findByRole('button', { name: /^Dimanche,/ }));
    expect(screen.getByRole('heading', { level: 2, name: /^Dimanche/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ajouter une plage le Dimanche' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Copier vers…' })).toBeNull();
    expect(screen.getAllByText(/^Fin à minuit\s:\smodifiez ce jour dans l’app Cozytouch$/)).toHaveLength(2); // week row + editor
    await fireEvent.click(screen.getByRole('button', { name: /^Lundi,/ }));
    await fireEvent.click(screen.getByRole('button', { name: 'Copier vers…' }));
    expect(screen.queryByRole('checkbox', { name: 'Dimanche' })).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Tous les jours' }));
    expect(screen.getByRole('button', { name: 'Copier sur 5 jours' })).toBeInTheDocument();
  });
});

describe('/schedule: offline rooms', () => {
  const offlineRad = { ...rad, id: 'b', room_id: 'ch2', name: 'Lit', reachable: false, program: { monday: [{ start: '06:15', end: '08:00' }] } };
  const two = () =>
    snapshot([{ ...salonRoom, id: 'ch2', name: 'Chambre 2', radiator_ids: ['b'] }, salonRoom], [offlineRad, rad]);

  it('the picker marks them « hors ligne » and starts on a room that is online', async () => {
    two();
    render(Page);
    expect(await screen.findByRole('radio', { name: 'Chambre 2 hors ligne' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('radio', { name: 'Salon' })).toHaveAttribute('aria-checked', 'true');
  });

  it('an offline room shows its last known week read-only, with a calm notice and nothing to send', async () => {
    two();
    render(Page);
    await fireEvent.click(await screen.findByRole('radio', { name: 'Chambre 2 hors ligne' }));
    const notice = screen.getByRole('status');
    expect(notice).toHaveTextContent('Chambre 2 est hors ligne');
    expect(notice).toHaveTextContent('Le programme affiché est le dernier connu.');
    expect(screen.queryByRole('button', { name: /^Lundi,/ })).toBeNull(); // rows are not buttons
    expect(screen.getByText(/^Lundi, 06:15–08:00, 1\sh\s45 confort$/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull(); // no editor
    expect(screen.queryByRole('button', { name: /Ajouter une plage/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Envoyer' })).toBeNull();
    expect(screen.getByText('derniers connus')).toBeInTheDocument();
    expect(screen.queryByText(/^Maintenant/)).toBeNull();
  });

  it('is never offered under « Aussi pour… »', async () => {
    snapshot(
      [salonRoom, { ...salonRoom, id: 'ch2', name: 'Chambre 2', radiator_ids: ['b'] }, { ...salonRoom, id: 'ch1', name: 'Chambre 1', radiator_ids: ['c'] }],
      [rad, offlineRad, { ...rad, id: 'c', room_id: 'ch1' }]
    );
    render(Page);
    await editMonday();
    await fireEvent.click(screen.getByRole('button', { name: 'Aussi pour…' }));
    expect(screen.getByRole('checkbox', { name: 'Chambre 1' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Chambre 2/ })).toBeNull();
  });
});

describe('/schedule: links and the phone', () => {
  const twoRooms = () => snapshot([salonRoom, { ...salonRoom, id: 'ch', name: 'Chambre', radiator_ids: ['b'] }], [rad, { ...rad, id: 'b', room_id: 'ch' }]);

  it('?room= opens that room (the room panel’s « Modifier les horaires »), ?day= that day', async () => {
    twoRooms();
    state.page.url = new URL('http://kelvin.test/schedule?room=ch&day=friday');
    render(Page);
    expect(await screen.findByRole('radio', { name: 'Chambre' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('heading', { level: 2, name: /^Vendredi/ })).toBeInTheDocument();
  });

  it('on a phone the week is a list of days; a day opens its own view, with the week one tap back', async () => {
    media.desktop.matches = false;
    render(Page);
    const monday = await screen.findByRole('button', { name: /^Lundi,/ });
    expect(monday).not.toHaveAttribute('aria-pressed');
    expect(screen.queryByRole('button', { name: /Ajouter une plage/ })).toBeNull(); // no editor beside the week
    await fireEvent.click(monday);
    expect(goto).toHaveBeenCalledWith('/schedule?room=salon&day=monday');
    expect(screen.getByRole('heading', { level: 1, name: /^Lundi/ })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Programme' })).toBeNull();
    // The temperatures sit right under the day header, above the bar.
    const temps = document.querySelector('.dayview .temps')!;
    expect(temps).toHaveTextContent(/Confort\s19,0\s°C/);
    expect(temps.compareDocumentPosition(screen.getByTestId('bar-monday')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: /^Lundi/ }).compareDocumentPosition(temps) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Mardi,/ })).toBeNull(); // the week is hidden
    await fireEvent.click(screen.getByRole('button', { name: 'Ajouter une plage le Lundi' }));
    expect(sendBar()).toHaveTextContent('1 jour modifié');
    await fireEvent.click(screen.getByRole('button', { name: 'Jour suivant' }));
    expect(goto).toHaveBeenLastCalledWith('/schedule?room=salon&day=tuesday', { replaceState: true, keepFocus: true, noScroll: true });
    expect(screen.getByRole('heading', { level: 1, name: /^Mardi/ })).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('link', { name: 'Semaine · Salon' }));
    expect(goto).toHaveBeenLastCalledWith('/schedule?room=salon');
    expect(screen.getByRole('heading', { level: 1, name: 'Programme' })).toBeInTheDocument();
    expect(row('Lundi')).toHaveAccessibleName(/, modifié$/); // the edits stay
  });

  it('on a phone « Aussi pour… » opens from the day view, and « ← Semaine » never reopens it', async () => {
    media.desktop.matches = false;
    twoRooms();
    render(Page);
    await fireEvent.click(await screen.findByRole('button', { name: /^Lundi,/ }));
    await fireEvent.click(screen.getByRole('button', { name: 'Ajouter une plage le Lundi' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Aussi pour…' }));
    expect(screen.getByRole('dialog', { name: 'Envoyer aussi à' })).toHaveAttribute('open');
    await fireEvent.click(screen.getByRole('checkbox', { name: 'Chambre' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.getByRole('button', { name: 'Aussi pour\u00a0: Chambre' })).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('link', { name: 'Semaine · Salon' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Programme' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).toBeNull(); // the sheet stays closed
  });

  it('on a phone ?day= opens that day directly', async () => {
    media.desktop.matches = false;
    state.page.url = new URL('http://kelvin.test/schedule?day=wednesday');
    render(Page);
    expect(await screen.findByRole('heading', { level: 1, name: /^Mercredi/ })).toBeInTheDocument();
  });
});

describe('/schedule in English', () => {
  it('title, help line, the send bar and the change list', async () => {
    applyLocale('en');
    render(Page);
    expect(screen.getByRole('heading', { name: 'Schedule', level: 1 })).toBeInTheDocument();
    expect(await screen.findByText('Outside comfort periods, the room is on eco.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'How to edit' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit temperatures' })).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: /^Monday,/ }));
    await fireEvent.click(screen.getByRole('button', { name: 'Add a period on Monday' }));
    expect(screen.getByText('1 day changed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo changes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'See changes' }));
    expect(screen.getByText(/\(before: no periods \(eco\)\)/)).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Copy to…' }));
    expect(screen.getByRole('button', { name: 'Weekdays' })).toBeInTheDocument();
  });
});

it('a Programme draft survives the switch', async () => {
  render(Page);
  await editMonday();
  expect(screen.getByText('1 jour modifié')).toBeInTheDocument();
  applyLocale('en');
  expect(await screen.findByText('1 day changed')).toBeInTheDocument();
  expect(screen.getByLabelText('Monday, period 1, start')).toHaveValue('07:00');
});

describe('changed elsewhere', () => {
  it('sends the base it started from', async () => {
    vi.mocked(api.roomProgram).mockResolvedValue({ pending: pending('pending') as never });
    await editAndSend();
    await waitFor(() => expect(api.roomProgram).toHaveBeenCalled());
    expect(vi.mocked(api.roomProgram).mock.calls[0][2]).toEqual({ base: { a: {} } });
  });

  it('an SSE change on an edited day shows the notice; Recharger drops the edits', async () => {
    render(Page);
    await editMonday();
    house.applyHouse({ rooms: [], radiators: [{ ...rad, program: { monday: [{ start: '05:00', end: '06:00' }] } }] } as never);
    expect(await screen.findByText('Programme modifié ailleurs')).toBeInTheDocument();
    expect(screen.getByText(/lundi/i, { selector: '.conflict p' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Envoyer' })).toHaveAttribute('aria-disabled', 'true');
    await fireEvent.click(screen.getByRole('button', { name: 'Recharger' }));
    expect(screen.queryByText('Programme modifié ailleurs')).toBeNull();
    expect(screen.getByLabelText('Lundi, plage 1, début')).toHaveValue('05:00');
  });

  it('an untouched day follows silently', async () => {
    render(Page);
    await editMonday();
    house.applyHouse({ rooms: [], radiators: [{ ...rad, program: { tuesday: [{ start: '18:00', end: '20:00' }] } }] } as never);
    await waitFor(() => expect(row('Mardi')).toHaveAccessibleName(/^Mardi, 18:00–20:00,/));
    expect(screen.queryByText('Programme modifié ailleurs')).toBeNull();
    expect(sendBar()).toHaveTextContent('1 jour modifié');
  });

  it('a 409 shows the notice; Remplacer quand même resends with force', async () => {
    vi.mocked(api.roomProgram)
      .mockRejectedValueOnce(new (ApiError as never as new (...a: unknown[]) => Error)(409, 'x', 'program_changed_elsewhere', { days: ['monday'] }))
      .mockResolvedValueOnce({ pending: pending('pending') as never });
    await editAndSend();
    expect(await screen.findByText('Programme modifié ailleurs')).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Remplacer quand même' }));
    await waitFor(() => expect(api.roomProgram).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.roomProgram).mock.calls[1][2]).toMatchObject({ force: true });
  });

  it('a locked day is read-only and never in the payload', async () => {
    house.applyHouse({
      rooms: [],
      radiators: [{ ...rad, program: { sunday: [{ start: '20:00', end: '24:00' }] }, program_locked: { sunday: 'midnight', saturday: 'unrecognised' } }]
    } as never);
    vi.mocked(api.roomProgram).mockResolvedValue({ pending: pending('pending') as never });
    await editAndSend();
    await waitFor(() => expect(api.roomProgram).toHaveBeenCalled());
    const payload = vi.mocked(api.roomProgram).mock.calls[0][1];
    expect(Object.keys(payload)).not.toContain('sunday');
    expect(Object.keys(payload)).not.toContain('saturday');
    expect(screen.getByText(/Fin à minuit/)).toBeInTheDocument();
  });
});

describe('sending to other rooms (final review C1, I2)', () => {
  const conflict = () =>
    new (ApiError as never as new (...a: unknown[]) => Error)(409, 'x', 'program_changed_elsewhere', { days: ['monday'] });
  const twoRooms = (locked: Record<string, string> = {}) =>
    snapshot(
      [salonRoom, { ...salonRoom, id: 'ch', name: 'Chambre', radiator_ids: ['b'] }],
      [
        { ...rad, program: { sunday: [{ start: '20:00', end: '24:00' }] }, program_locked: locked },
        { ...rad, id: 'b', room_id: 'ch', name: 'Droit', program: { sunday: [{ start: '08:30', end: '22:45' }] } }
      ]
    );
  async function editAlsoAndSend() {
    render(Page);
    await editMonday();
    await fireEvent.click(screen.getByRole('button', { name: 'Aussi pour…' }));
    await fireEvent.click(screen.getByRole('checkbox', { name: 'Chambre' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(screen.getByRole('button', { name: 'Aussi pour\u00a0: Chambre' })).toHaveFocus();
    await fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
  }

  it('a room chosen there that goes offline before Envoyer is dropped from the send', async () => {
    twoRooms();
    vi.mocked(api.roomProgram).mockResolvedValue({ pending: pending('pending') as never });
    render(Page);
    await editMonday();
    await fireEvent.click(screen.getByRole('button', { name: 'Aussi pour…' }));
    await fireEvent.click(screen.getByRole('checkbox', { name: 'Chambre' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    house.applyHouse({ rooms: [], radiators: [{ ...house.radiators['b'], reachable: false }] } as never);
    // No other room can take it now: the choice is gone from the bar, and from the send.
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Aussi pour/ })).toBeNull());
    expect(sendBar()).toHaveTextContent('1 jour modifié');
    await fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
    await waitFor(() => expect(api.roomProgram).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(vi.mocked(api.roomProgram).mock.calls.map((c) => c[0])).toEqual(['salon']);
  });

  it('days locked in the source room are kept, never emptied, on every room sent to', async () => {
    twoRooms({ sunday: 'midnight' });
    vi.mocked(api.roomProgram).mockResolvedValue({ pending: pending('pending') as never });
    await editAlsoAndSend();
    await waitFor(() => expect(api.roomProgram).toHaveBeenCalledTimes(2));
    for (const [id, payload, opts] of vi.mocked(api.roomProgram).mock.calls) {
      expect(Object.keys(payload), id).not.toContain('sunday');
      expect(opts, id).toMatchObject({ keep: ['sunday'] });
    }
  });

  it('a 409 on the first room stops the send: nothing more is written', async () => {
    twoRooms();
    vi.mocked(api.roomProgram).mockRejectedValueOnce(conflict()).mockResolvedValue({ pending: pending('pending') as never });
    await editAlsoAndSend();
    expect(await screen.findByText('Programme modifié ailleurs')).toBeInTheDocument();
    expect(api.roomProgram).toHaveBeenCalledTimes(1);
    await fireEvent.click(screen.getByRole('button', { name: 'Remplacer quand même' }));
    await waitFor(() => expect(api.roomProgram).toHaveBeenCalledTimes(3));
    const again = vi.mocked(api.roomProgram).mock.calls.slice(1);
    expect(again.map((c) => c[0])).toEqual(['salon', 'ch']); // once per room
    for (const c of again) expect(c[2]).toMatchObject({ force: true });
  });

  it('a 409 on a later room: Remplacer quand même sends only the rooms not written yet', async () => {
    twoRooms();
    vi.mocked(api.roomProgram)
      .mockResolvedValueOnce({ pending: pending('pending') as never })
      .mockRejectedValueOnce(conflict())
      .mockResolvedValue({ pending: { ...pending('pending'), id: 'p2' } as never });
    await editAlsoAndSend();
    expect(await screen.findByText('Programme modifié ailleurs')).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Remplacer quand même' }));
    await waitFor(() => expect(api.roomProgram).toHaveBeenCalledTimes(3));
    expect(vi.mocked(api.roomProgram).mock.calls[2][0]).toBe('ch');
    expect(vi.mocked(api.roomProgram).mock.calls[2][2]).toMatchObject({ force: true });
  });
});

describe('Schedule across kinds', () => {
  const pilot = {
    ...rad, id: 'p', room_id: 'bureau', name: 'Bureau', support: 'expected',
    capabilities: {
      modes: [], manual: null, comfort: null, eco: null, levels: ['eco', 'off'], program: false, dryer: [],
      window_detection: false, presence_detection: false, night_light: false, night_light_intensity: false,
      identify: false, energy: false, boost: false, read_only: false
    }
  };
  const roomOf = (id: string, name: string, ids: string[]) => ({
    id, name, radiator_ids: ids, temperature: 19.5, mode: 'manual', target: 20, comfort: 19, eco: 17,
    effective_setpoint: 17, heating_level: 'eco', window_open: false, occupied: false
  });

  it('offers only rooms whose programme Kelvin can edit', async () => {
    snapshot([roomOf('salon', 'Salon', ['a']), roomOf('bureau', 'Bureau', ['p'])], [rad, pilot]);
    render(Page);
    expect(await screen.findByRole('button', { name: /^Lundi,/ })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Bureau' })).toBeNull();
    expect(screen.queryByText('Bureau')).toBeNull();
  });

  it('says so when no programme is editable', async () => {
    snapshot([roomOf('bureau', 'Bureau', ['p'])], [pilot]);
    render(Page);
    expect(await screen.findByText(/Aucun radiateur de cette maison n’a de programme/)).toBeInTheDocument();
  });
});
