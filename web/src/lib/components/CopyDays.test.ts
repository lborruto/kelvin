import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { applyLocale } from '$lib/i18n';
import CopyDays from './CopyDays.svelte';

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

const open = async () => {
  await fireEvent.click(screen.getByRole('button', { name: 'Copier vers…' }));
  return screen.getByRole('dialog', { name: 'Copier jeudi vers…' });
};

describe('CopyDays', () => {
  it('offers every day but the source and the locked ones; the button counts the days', async () => {
    const oncopy = vi.fn();
    render(CopyDays, { source: 'thursday', locks: { sunday: 'midnight' }, oncopy });
    const dialog = await open();
    expect(dialog).toHaveAttribute('open');
    const boxes = screen.getAllByRole('checkbox').map((b) => b.getAttribute('aria-label'));
    expect(boxes).toEqual(['Lundi', 'Mardi', 'Mercredi', 'Vendredi', 'Samedi']);
    expect(screen.getByRole('button', { name: 'Choisissez des jours' })).toHaveAttribute('aria-disabled', 'true');
    await fireEvent.click(screen.getByRole('checkbox', { name: 'Lundi' }));
    expect(screen.getByRole('button', { name: 'Copier sur 1 jour' })).toHaveAttribute('aria-disabled', 'false');
    expect(screen.getByText(/^Rien n’est envoyé avant «\sEnvoyer\s»\.$/)).toBeInTheDocument();
  });

  it('shortcuts pick weekdays, the weekend or every day, without the source or locked days', async () => {
    const oncopy = vi.fn();
    render(CopyDays, { source: 'thursday', locks: { sunday: 'midnight' }, oncopy });
    await open();
    await fireEvent.click(screen.getByRole('button', { name: 'Jours de semaine' }));
    expect(screen.getByRole('button', { name: 'Jours de semaine' })).toHaveAttribute('aria-pressed', 'true');
    const checked = () => screen.getAllByRole('checkbox').filter((b) => (b as HTMLInputElement).checked).map((b) => b.getAttribute('aria-label'));
    expect(checked()).toEqual(['Lundi', 'Mardi', 'Mercredi', 'Vendredi']);
    await fireEvent.click(screen.getByRole('button', { name: 'Week-end' }));
    expect(checked()).toEqual(['Samedi']);
    await fireEvent.click(screen.getByRole('button', { name: 'Tous les jours' }));
    expect(checked()).toHaveLength(5);
    await fireEvent.click(screen.getByRole('button', { name: 'Copier sur 5 jours' }));
    expect(oncopy).toHaveBeenCalledWith(['monday', 'tuesday', 'wednesday', 'friday', 'saturday']);
    expect(screen.queryByRole('checkbox')).toBeNull(); // closed
  });

  it('closing returns focus to « Copier vers… » and copies nothing', async () => {
    const oncopy = vi.fn();
    render(CopyDays, { source: 'monday', oncopy });
    await fireEvent.click(screen.getByRole('button', { name: 'Copier vers…' }));
    const d = screen.getByRole('dialog', { name: 'Copier lundi vers…' }); // the title names the source day
    await fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(d).not.toHaveAttribute('open');
    expect(screen.getByRole('button', { name: 'Copier vers…' })).toHaveFocus();
    expect(oncopy).not.toHaveBeenCalled();
  });

  it('does not open while a send is pending', async () => {
    render(CopyDays, { source: 'monday', disabled: true, oncopy: vi.fn() });
    const trigger = screen.getByRole('button', { name: 'Copier vers…' });
    expect(trigger).toHaveAttribute('aria-disabled', 'true');
    await fireEvent.click(trigger);
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('in English', async () => {
    applyLocale('en');
    render(CopyDays, { source: 'thursday', oncopy: vi.fn() });
    await fireEvent.click(screen.getByRole('button', { name: 'Copy to…' }));
    expect(screen.getByRole('dialog', { name: 'Copy Thursday to…' })).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Weekdays' }));
    expect(screen.getByRole('button', { name: 'Copy to 4 days' })).toBeInTheDocument();
    expect(screen.getByText('Nothing is sent until you press Send.')).toBeInTheDocument();
  });
});

it('a tap inside the sheet (its padding too) never closes it; only the backdrop does', async () => {
  render(CopyDays, { source: 'monday', oncopy: vi.fn() });
  await fireEvent.click(screen.getByRole('button', { name: 'Copier vers…' }));
  const dialog = screen.getByRole('dialog', { name: 'Copier lundi vers…' });
  await fireEvent.click(dialog.querySelector('.body')!);
  expect(dialog).toHaveAttribute('open');
  await fireEvent.click(dialog); // the backdrop: a click whose target is the dialog itself
  expect(dialog).not.toHaveAttribute('open');
});
