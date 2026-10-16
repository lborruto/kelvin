import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, expect, it, vi } from 'vitest';
import { api } from '$lib/api/client';
import { awaySheet } from '$lib/stores/away.svelte';
import { house } from '$lib/stores/house.svelte';
import HouseActions from './HouseActions.svelte';
import { applyLocale } from '$lib/i18n';

vi.mock('$lib/api/client', () => ({
  api: { houseOff: vi.fn(), houseProgram: vi.fn() },
  ApiError: class extends Error {}
}));

const pending = (status: string, error: string | null = null) => ({
  id: 'h1', label: 'Tout éteindre', radiator_ids: ['a', 'b'], status, error, created_at: 1,
  expected: { a: { mode: 'off' }, b: { mode: 'off' } }
});

beforeEach(() => {
  vi.clearAllMocks();
  house.pending = {};
  house.houseCommandId = null;
  house.connection = 'open';
  // jsdom lacks the modal dialog API.
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.open = true; };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.open = false; };
});

it('names the confirmation dialog by its question and says what happens', () => {
  render(HouseActions);
  const dialog = document.querySelector('dialog')!;
  const id = dialog.getAttribute('aria-labelledby')!;
  expect(document.getElementById(id)).toHaveTextContent('Tout éteindre ?');
  expect(document.getElementById(id)!.tagName).toBe('H2');
  expect(document.getElementById(dialog.getAttribute('aria-describedby')!)).toHaveTextContent(
    'Toutes les pièces passent à l’arrêt. Pour les rallumer : Maison › Tout remettre en programme.'
  );
});

it('focuses Annuler, the safe choice, when the dialog opens', async () => {
  render(HouseActions);
  await fireEvent.click(screen.getByRole('button', { name: 'Tout éteindre' }));
  expect(document.activeElement).toHaveTextContent('Annuler');
});

it('is disabled while Kelvin is disconnected', () => {
  house.connection = 'reconnecting';
  render(HouseActions, { program: true });
  expect(screen.getByRole('button', { name: 'Tout éteindre' })).toHaveAttribute('aria-disabled', 'true');
  expect(screen.getByRole('button', { name: 'Tout remettre en programme' })).toHaveAttribute('aria-disabled', 'true');
});

it('« Partir… » opens the Absence sheet where the user is (focus returns to it); away: false hides it', async () => {
  const a = render(HouseActions);
  const btn = screen.getByRole('button', { name: 'Partir…' });
  await fireEvent.click(btn);
  expect(awaySheet.open).toBe(true);
  expect(awaySheet.trigger).toBe(btn);
  awaySheet.close();
  a.unmount();
  render(HouseActions, { away: false });
  expect(screen.queryByRole('button', { name: 'Partir…' })).toBeNull();
});

it('while an absence runs, the button says its end in cool, and a dot marks the icon form', () => {
  house.overrides = [{ id: 'o1', kind: 'away', room_id: null, radiator_ids: ['a'], temperature: 12, ends_at: Date.UTC(2026, 9, 18, 16) / 1000, restoring: false }];
  const a = render(HouseActions);
  const btn = screen.getByRole('button', { name: /^Absence · dim\. 18:00$/ });
  expect(btn).toHaveClass('on');
  a.unmount();
  render(HouseActions, { icons: true });
  const icon = screen.getByRole('button', { name: /^Absence · dim\. 18:00$/ });
  expect(icon.querySelector('.adot')).not.toBeNull();
  house.overrides = [];
});

it('gives each mounted instance its own dialog title id', () => {
  render(HouseActions);
  render(HouseActions, { stacked: true });
  const ids = [...document.querySelectorAll('dialog')].map((d) => d.getAttribute('aria-labelledby'));
  expect(new Set(ids).size).toBe(ids.length);
  for (const id of ids) expect(document.querySelectorAll(`[id="${id}"]`)).toHaveLength(1);
});

it('Tout éteindre shows Envoi… then Confirmé, and is disabled while it runs', async () => {
  vi.mocked(api.houseOff).mockResolvedValue({ pending: pending('pending') } as never);
  render(HouseActions);
  await fireEvent.click(screen.getByRole('button', { name: 'Tout éteindre' }));
  const buttons = screen.getAllByRole('button', { name: 'Tout éteindre', hidden: true });
  await fireEvent.click(buttons.at(-1)!);
  expect(api.houseOff).toHaveBeenCalledTimes(1);
  expect(await screen.findByText('Envoi…')).toBeInTheDocument();
  expect(buttons[0]).toHaveAttribute('aria-disabled', 'true');
  house.applyPending(pending('confirmed') as never);
  expect(await screen.findByText('Confirmé')).toBeInTheDocument();
  expect(buttons[0]).toHaveAttribute('aria-disabled', 'false');
});

it('a failed house command shows its error where it was taken', async () => {
  vi.mocked(api.houseProgram).mockResolvedValue({ pending: { ...pending('pending'), label: 'Tout remettre en programme' } } as never);
  render(HouseActions, { program: true });
  await fireEvent.click(screen.getByRole('button', { name: 'Tout remettre en programme' }));
  await screen.findByText('Envoi…');
  expect(screen.getByRole('button', { name: 'Tout remettre en programme' })).toHaveAttribute('aria-disabled', 'true');
  house.applyPending({ ...pending('failed', 'Le radiateur n’a pas confirmé la commande.'), label: 'Tout remettre en programme' } as never);
  await waitFor(() => expect(screen.getByText('Le radiateur n’a pas confirmé la commande.')).toBeInTheDocument());
  expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
});

it('a double tap during the round trip sends one house command', async () => {
  let resolve!: (v: unknown) => void;
  vi.mocked(api.houseProgram).mockReturnValue(new Promise((r) => (resolve = r)) as never);
  render(HouseActions, { program: true });
  const button = screen.getByRole('button', { name: 'Tout remettre en programme' });
  await fireEvent.click(button);
  await fireEvent.click(button);
  resolve({ pending: { ...pending('pending'), label: 'Tout remettre en programme' } });
  await screen.findByText('Envoi…');
  expect(api.houseProgram).toHaveBeenCalledTimes(1);
});

it('keeps keyboard focus on « Tout remettre en programme » while its command runs', async () => {
  vi.mocked(api.houseProgram).mockResolvedValue({ pending: { ...pending('pending'), label: 'Tout remettre en programme' } } as never);
  render(HouseActions, { program: true });
  const button = screen.getByRole('button', { name: 'Tout remettre en programme' });
  button.focus();
  await fireEvent.click(button);
  await screen.findByText('Envoi…');
  expect(button).toHaveAttribute('aria-disabled', 'true');
  expect(document.activeElement).toBe(button);
  await fireEvent.click(button);
  expect(api.houseProgram).toHaveBeenCalledTimes(1);
});

it('in English: the actions, the dialog and the away link', () => {
  applyLocale('en');
  render(HouseActions, { program: true });
  expect(screen.getByRole('button', { name: 'Turn everything off' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Put everything back on schedule' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Go away…' })).toBeInTheDocument();
  const dialog = document.querySelector('dialog')!;
  expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)).toHaveTextContent('Turn everything off?');
  expect(document.getElementById(dialog.getAttribute('aria-describedby')!)).toHaveTextContent(
    'Every room switches off. To turn them back on: Home › Put everything back on schedule.'
  );
});

it('the icon form (phone Rooms header) keeps the names as labels and still asks before switching off', async () => {
  render(HouseActions, { icons: true });
  const off = screen.getByRole('button', { name: 'Tout éteindre' });
  expect(off).not.toHaveTextContent('Tout éteindre');
  expect(screen.getByRole('button', { name: 'Partir…' })).not.toHaveTextContent('Partir…');
  await fireEvent.click(off);
  expect(document.querySelector('dialog')!.open).toBe(true);
});

it('Maison (desktop): Partir…, Tout éteindre, Tout remettre en programme, in that order; no Tout éteindre while all is off', async () => {
  const { unmount } = render(HouseActions, { maison: true, awayText: 'Partir…' });
  expect(screen.getAllByRole('button').filter((b) => !b.closest('dialog')).map((b) => b.textContent?.trim())).toEqual([
    'Partir…', 'Tout éteindre', 'Tout remettre en programme'
  ]);
  await fireEvent.click(screen.getByRole('button', { name: 'Tout remettre en programme' }));
  expect(api.houseProgram).toHaveBeenCalled();
  unmount();
  render(HouseActions, { maison: true, allOff: true });
  expect(screen.queryByRole('button', { name: 'Tout éteindre' })).toBeNull();
});

it('Maison (phone): the away icon and a « ⋯ » menu holding the two house commands', async () => {
  render(HouseActions, { menu: true });
  expect(screen.getByRole('button', { name: 'Partir…' })).toBeInTheDocument();
  const more = screen.getByRole('button', { name: 'Plus d’actions pour la maison' });
  expect(more).toHaveAttribute('aria-haspopup', 'menu');
  expect(screen.queryByRole('button', { name: 'Tout éteindre' })).toBeNull();
});
