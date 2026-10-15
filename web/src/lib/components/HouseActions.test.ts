import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, expect, it, vi } from 'vitest';
import { api } from '$lib/api/client';
import { house } from '$lib/stores/house.svelte';
import HouseActions from './HouseActions.svelte';

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
    'Les radiateurs passent à l’arrêt. Vous pourrez les remettre en programme depuis Maison.'
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

it('offers « Absence… » except where the Absence panel already is', () => {
  const a = render(HouseActions);
  expect(screen.getByRole('link', { name: 'Absence…' })).toHaveAttribute('href', '/home#away');
  a.unmount();
  render(HouseActions, { away: false });
  expect(screen.queryByRole('link', { name: 'Absence…' })).toBeNull();
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
  vi.mocked(api.houseProgram).mockResolvedValue({ pending: { ...pending('pending'), label: 'Tout en programme' } } as never);
  render(HouseActions, { program: true });
  await fireEvent.click(screen.getByRole('button', { name: 'Tout remettre en programme' }));
  await screen.findByText('Envoi…');
  expect(screen.getByRole('button', { name: 'Tout remettre en programme' })).toHaveAttribute('aria-disabled', 'true');
  house.applyPending({ ...pending('failed', 'Pas de confirmation du radiateur.'), label: 'Tout en programme' } as never);
  await waitFor(() => expect(screen.getByText('Pas de confirmation du radiateur.')).toBeInTheDocument());
  expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
});

it('a double tap during the round trip sends one house command', async () => {
  let resolve!: (v: unknown) => void;
  vi.mocked(api.houseProgram).mockReturnValue(new Promise((r) => (resolve = r)) as never);
  render(HouseActions, { program: true });
  const button = screen.getByRole('button', { name: 'Tout remettre en programme' });
  await fireEvent.click(button);
  await fireEvent.click(button);
  resolve({ pending: { ...pending('pending'), label: 'Tout en programme' } });
  await screen.findByText('Envoi…');
  expect(api.houseProgram).toHaveBeenCalledTimes(1);
});

it('keeps keyboard focus on « Tout remettre en programme » while its command runs', async () => {
  vi.mocked(api.houseProgram).mockResolvedValue({ pending: { ...pending('pending'), label: 'Tout en programme' } } as never);
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
