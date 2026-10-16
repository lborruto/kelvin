import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '$lib/api/client';
import { parisLocalMs } from '$lib/away';
import { applyLocale } from '$lib/i18n';
import { awaySheet } from '$lib/stores/away.svelte';
import { house } from '$lib/stores/house.svelte';
import { toasts } from '$lib/stores/toasts.svelte';
import AwaySheet from './AwaySheet.svelte';

vi.mock('$lib/api/client', () => ({
  api: {
    houseAway: vi.fn(),
    cancelOverride: vi.fn().mockResolvedValue({ pending: null })
  },
  ApiError: class extends Error {}
}));

const at = (local: string) => parisLocalMs(local)!;
const THURSDAY = at('2026-10-15T15:00');
const MONDAY = at('2026-10-12T09:30');
const PENDING = { id: 'p1', label: 'Absence', radiator_ids: ['a', 'b', 'c'], status: 'pending', error: null, created_at: 1, expected: {} };

const rad = (id: string, reachable: boolean, boost = true) =>
  ({
    id, name: id, room_id: null, mode: 'program', target: 19, temperature: 19, heating: false, max_temperature: 28, light: null,
    energy_wh: null, reachable,
    capabilities: {
      modes: ['off', 'manual', 'program'], manual: [7, 28], comfort: null, eco: null, levels: [], program: true, dryer: [],
      window_detection: false, presence_detection: false, night_light: false, night_light_intensity: false, identify: false,
      energy: false, boost, rename: true, read_only: false
    }
  }) as never;

function snapshot(radiators = [rad('a', true), rad('b', true), rad('c', false)], overrides: unknown[] = []) {
  house.applySnapshot({
    house: {
      rooms: [
        { id: 'p-salon', name: 'Salon', radiator_ids: ['a'] },
        { id: 'p-ch1', name: 'Chambre 1', radiator_ids: ['b'] },
        { id: 'p-ch2', name: 'Chambre 2', radiator_ids: ['c'] }
      ] as never,
      radiators
    },
    pending: [],
    overrides: overrides as never,
    status: { connected: true, last_ok_at: 1, last_error: null }
  });
  house.connection = 'open';
}

async function open(clock: number, trigger: HTMLElement | null = null) {
  render(AwaySheet, { clock: () => clock });
  awaySheet.show(trigger);
  await tick();
  await tick();
}

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

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.houseAway).mockResolvedValue({ pending: PENDING } as never);
  toasts.items = [];
  house.houseCommandId = null;
  snapshot();
});
afterEach(() => {
  awaySheet.close();
  applyLocale('fr');
});

describe('AwaySheet presets', () => {
  it('Thursday afternoon: « Dimanche 18:00 » is chosen, and focused', async () => {
    await open(THURSDAY);
    const sunday = screen.getByRole('button', { name: 'Dimanche 18:00' });
    expect(sunday).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Demain 18:00' })).toHaveAttribute('aria-pressed', 'false');
    await waitFor(() => expect(document.activeElement).toBe(sunday));
  });
  it('Monday morning: « Demain 18:00 » is chosen', async () => {
    await open(MONDAY);
    expect(screen.getByRole('button', { name: 'Demain 18:00' })).toHaveAttribute('aria-pressed', 'true');
  });
  it('« Date précise… » reveals the field, its minimum now + 15 min', async () => {
    await open(MONDAY);
    expect(document.querySelector('input[type="datetime-local"]')).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Date précise…' }));
    const field = screen.getByLabelText('Date et heure du retour');
    expect(field).toHaveAttribute('min', '2026-10-12T09:45');
    expect(field).toHaveValue('2026-10-13T18:00');
  });
});

describe('AwaySheet consequence', () => {
  it('counts the rooms, says the end and the offline room', async () => {
    await open(THURSDAY);
    expect(screen.getByText(/^Les 3 pièces passeront à 12,0\s°C jusqu’à dim\. 18 oct\.,? 18:00, puis reprendront leur réglage\.$/)).toBeInTheDocument();
    expect(screen.getByText(/^Chambre 2 est hors ligne\s: elle ne recevra peut-être pas la consigne\.$/)).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Demain 18:00' }));
    expect(screen.getByText(/jusqu’à ven\. 16 oct\.,? 18:00/)).toBeInTheDocument();
  });
  it('counts only rooms whose radiators take a temperature', async () => {
    snapshot([rad('a', true), rad('b', true, false), rad('c', true, false)]);
    await open(THURSDAY);
    expect(screen.getByText(/^La pièce passera à 12,0\s°C/)).toBeInTheDocument();
  });
  it('in English', async () => {
    applyLocale('en');
    await open(THURSDAY);
    expect(screen.getByRole('button', { name: 'Sunday 18:00' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/^The 3 rooms will go to 12\.0\s°C until Sun 18 Oct,? 18:00, then back to their settings\.$/)).toBeInTheDocument();
    expect(screen.getByText('Chambre 2 is offline: it may not get the setting.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go away' })).toBeInTheDocument();
  });
});

describe('AwaySheet send', () => {
  it('« Partir » sends the Paris wall time and the temperature, closes, and offers « Annuler l’absence »', async () => {
    await open(THURSDAY);
    await fireEvent.click(screen.getByRole('button', { name: 'Partir' }));
    await waitFor(() => expect(api.houseAway).toHaveBeenCalled());
    expect(api.houseAway).toHaveBeenCalledWith('2026-10-18T18:00', 12);
    await waitFor(() => expect(awaySheet.open).toBe(false));
    const toast = toasts.items.at(-1)!;
    expect(toast.text()).toMatch(/^Absence jusqu’à dim\. 18 oct\.,? 18:00\.$/);
    expect(toast.action?.label()).toBe('Annuler l’absence');
    snapshot(undefined, [{ id: 'o9', kind: 'away', room_id: null, radiator_ids: ['a'], temperature: 12, ends_at: 2e9, restoring: false }]);
    toast.action!.run();
    await waitFor(() => expect(api.cancelOverride).toHaveBeenCalledWith('o9'));
  });
  it('« Annuler l’absence » pressed before the override arrives: carried out as soon as it does', async () => {
    await open(THURSDAY);
    await fireEvent.click(screen.getByRole('button', { name: 'Partir' }));
    await waitFor(() => expect(awaySheet.open).toBe(false));
    toasts.items.at(-1)!.action!.run();
    expect(api.cancelOverride).not.toHaveBeenCalled(); // not known yet
    snapshot(undefined, [{ id: 'o7', kind: 'away', room_id: null, radiator_ids: ['a'], temperature: 12, ends_at: 2e9, restoring: false }]);
    await waitFor(() => expect(api.cancelOverride).toHaveBeenCalledWith('o7'));
  });
  it('another house command on its way: « Partir » is paused and says why', async () => {
    house.applyPending({ id: 'h1', label: 'Tout éteindre', radiator_ids: ['a'], status: 'pending', error: null, created_at: 1, expected: {} } as never);
    house.houseCommandId = 'h1';
    await open(THURSDAY);
    const go = screen.getByRole('button', { name: 'Partir' });
    expect(go).toHaveAttribute('aria-disabled', 'true');
    expect(go).toHaveAccessibleDescription('Une commande pour toute la maison est déjà en cours.');
    await fireEvent.click(go);
    expect(api.houseAway).not.toHaveBeenCalled();
    house.houseCommandId = null;
  });
  it('the Stepper sets the temperature (7–19 °C) and the sentence follows', async () => {
    await open(THURSDAY);
    const plus = screen.getByRole('button', { name: 'Augmenter Température d’absence' });
    await fireEvent.pointerDown(plus);
    await fireEvent.pointerUp(plus);
    expect(await screen.findByText(/passeront à 12,5\s°C/)).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Partir' }));
    await waitFor(() => expect(api.houseAway).toHaveBeenCalledWith('2026-10-18T18:00', 12.5));
  });
  it('a precise date in the past is refused, nothing is sent', async () => {
    await open(MONDAY);
    await fireEvent.click(screen.getByRole('button', { name: 'Date précise…' }));
    await fireEvent.input(screen.getByLabelText('Date et heure du retour'), { target: { value: '2026-10-12T09:00' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Partir' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Choisissez une fin dans le futur.');
    expect(api.houseAway).not.toHaveBeenCalled();
    expect(awaySheet.open).toBe(true);
  });
  it('a failed send keeps the sheet open (the error is a toast)', async () => {
    vi.mocked(api.houseAway).mockRejectedValueOnce(new Error('network'));
    await open(THURSDAY);
    await fireEvent.click(screen.getByRole('button', { name: 'Partir' }));
    await waitFor(() => expect(toasts.items.length).toBe(1));
    expect(awaySheet.open).toBe(true);
  });
  it('while Kelvin is not connected, « Partir » is paused and says why', async () => {
    await open(THURSDAY);
    house.connection = 'closed' as never;
    house.loaded = false;
    await tick();
    const go = screen.getByRole('button', { name: 'Partir' });
    expect(go).toHaveAttribute('aria-disabled', 'true');
    expect(go).toHaveAccessibleDescription('En attente de la connexion à Kelvin.');
    await fireEvent.click(go);
    expect(api.houseAway).not.toHaveBeenCalled();
  });
});

describe('AwaySheet active', () => {
  beforeEach(() => {
    snapshot(undefined, [{ id: 'o1', kind: 'away', room_id: null, radiator_ids: ['a', 'b'], temperature: 14, ends_at: at('2026-10-18T18:00') / 1000, restoring: false }]);
  });
  it('shows the running absence with « Prolonger… » and « Terminer maintenant »', async () => {
    await open(THURSDAY);
    expect(screen.getByRole('heading', { name: 'Absence en cours' })).toBeInTheDocument();
    expect(screen.getByText(/^Absence jusqu’à dim\. 18 oct\.,? 18:00 · 14,0\s°C$/)).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Terminer maintenant' }));
    expect(api.cancelOverride).toHaveBeenCalledWith('o1');
    expect(awaySheet.open).toBe(false);
  });
  it('« Prolonger… » shows the presets again, with the absence’s temperature', async () => {
    await open(THURSDAY);
    await fireEvent.click(screen.getByRole('button', { name: 'Prolonger…' }));
    expect(screen.getByRole('button', { name: 'Dimanche 18:00' })).toBeInTheDocument();
    expect(screen.getByText(/passeront à 14,0\s°C/)).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Prolonger' }));
    await waitFor(() => expect(api.houseAway).toHaveBeenCalledWith('2026-10-18T18:00', 14));
  });
});

describe('AwaySheet focus', () => {
  it('Esc / close returns focus to the opener', async () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    await open(THURSDAY, opener);
    await fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(awaySheet.open).toBe(false);
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
