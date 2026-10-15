import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { beforeEach, expect, it, vi } from 'vitest';
import DeleteRoomDialog from './DeleteRoomDialog.svelte';
import { setupFixture } from './fixture';

beforeEach(() => {
  // jsdom lacks the modal dialog API.
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.open = true; };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.open = false; };
});

it('delete asks first, focuses Annuler and refuses a non-empty room', async () => {
  const ondelete = vi.fn();
  const s = setupFixture();
  const first = render(DeleteRoomDialog, { room: s.rooms[2], ondelete });
  await fireEvent.click(screen.getByRole('button', { name: 'Supprimer la pièce' }));
  const dialog = document.querySelector('dialog')!;
  expect(dialog.open).toBe(true);
  expect(document.activeElement).toHaveTextContent('Annuler');
  expect(within(dialog).getByRole('heading')).toHaveTextContent(/Supprimer Bureau/);
  await fireEvent.click(within(dialog).getByRole('button', { name: 'Supprimer la pièce' }));
  expect(ondelete).toHaveBeenCalledOnce();
  first.unmount();

  render(DeleteRoomDialog, { room: s.rooms[1], ondelete });
  const button = screen.getByRole('button', { name: 'Supprimer la pièce' });
  expect(button).toHaveAttribute('aria-disabled', 'true');
  await fireEvent.click(button);
  expect(document.querySelector('dialog')!.open).toBe(false);
  expect(screen.getByText(/Videz d’abord la pièce/)).toBeInTheDocument();
  expect(ondelete).toHaveBeenCalledOnce();
});

it('a confirmed delete is sent once, and the trigger waits for the answer', async () => {
  let settle!: () => void;
  const ondelete = vi.fn(() => new Promise<void>((r) => (settle = r)));
  render(DeleteRoomDialog, { room: setupFixture().rooms[2], ondelete });
  const trigger = screen.getByRole('button', { name: 'Supprimer la pièce' });
  await fireEvent.click(trigger);
  const dialog = document.querySelector('dialog')!;
  const confirm = within(dialog).getByRole('button', { name: 'Supprimer la pièce' });
  await fireEvent.click(confirm);
  await fireEvent.click(confirm); // a second click while the sheet fades out
  expect(ondelete).toHaveBeenCalledOnce();
  expect(trigger).toHaveAttribute('aria-disabled', 'true');
  await fireEvent.click(trigger);
  expect(dialog.open).toBe(false);
  settle();
  await vi.waitFor(() => expect(trigger).toHaveAttribute('aria-disabled', 'false'));
});