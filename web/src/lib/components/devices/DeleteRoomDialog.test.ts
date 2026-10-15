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
