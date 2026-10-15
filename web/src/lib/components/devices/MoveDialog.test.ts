import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { beforeEach, expect, it, vi } from 'vitest';
import MoveDialog from './MoveDialog.svelte';
import { setupFixture } from './fixture';

beforeEach(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.open = true; };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.open = false; };
});

it('offers every other room, never the house, and moves to the chosen one', async () => {
  const onmove = vi.fn();
  const s = setupFixture();
  render(MoveDialog, { radiator: s.radiators[0], rooms: s.rooms, onmove });
  await fireEvent.click(screen.getByRole('button', { name: 'Déplacer vers…' }));
  const dialog = document.querySelector('dialog')!;
  const radios = within(dialog).getAllByRole('radio');
  expect(radios.map((r) => r.closest('label')!.textContent!.trim())).toEqual(['Bureau']);
  expect(document.activeElement).toBe(radios[0]);
  const move = within(dialog).getByRole('button', { name: 'Déplacer' });
  await fireEvent.click(move);
  expect(onmove).not.toHaveBeenCalled(); // nothing chosen yet
  await fireEvent.click(radios[0]);
  await fireEvent.click(move);
  expect(onmove).toHaveBeenCalledWith('p-bureau');
});
