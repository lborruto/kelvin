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
  // jsdom lacks the modal dialog API.
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.open = true; };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.open = false; };
});

it('names the confirmation dialog by its question', () => {
  render(HouseActions);
  const dialog = document.querySelector('dialog')!;
  const id = dialog.getAttribute('aria-labelledby')!;
  expect(document.getElementById(id)).toHaveTextContent('Mettre tous les radiateurs à l’arrêt ?');
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
  expect(buttons[0]).toBeDisabled();
  house.applyPending(pending('confirmed') as never);
  expect(await screen.findByText('Confirmé')).toBeInTheDocument();
  expect(buttons[0]).not.toBeDisabled();
});

it('a failed house command shows its error where it was taken', async () => {
  vi.mocked(api.houseProgram).mockResolvedValue({ pending: { ...pending('pending'), label: 'Tout en programme' } } as never);
  render(HouseActions, { program: true });
  await fireEvent.click(screen.getByRole('button', { name: 'Tout remettre en programme' }));
  await screen.findByText('Envoi…');
  expect(screen.getByRole('button', { name: 'Tout remettre en programme' })).toBeDisabled();
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
