import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Menu, { type MenuItem } from './Menu.svelte';

const media = vi.hoisted(() => ({ desktop: { matches: true } }));
vi.mock('$lib/media.svelte', () => media);

const rename = vi.fn();
const remove = vi.fn();
const items: MenuItem[] = [
  { label: 'Renommer la pièce', icon: 'edit', onselect: rename },
  'separator',
  { label: 'Supprimer la pièce', danger: true, onselect: remove, disabled: 'Videz d’abord la pièce' }
];

beforeEach(() => {
  vi.clearAllMocks();
  media.desktop.matches = true;
});
afterEach(() => document.querySelectorAll('.pop').forEach((n) => n.remove()));

describe('Menu (desktop popover)', () => {
  it('a « ⋯ » icon trigger named by its label opens a menu; focus on the first item', async () => {
    render(Menu, { label: 'Actions pour Salon', items });
    const trigger = screen.getByRole('button', { name: 'Actions pour Salon' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveClass('btn-icon');
    await fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const menu = screen.getByRole('menu');
    expect(screen.getAllByRole('menuitem').map((i) => i.querySelector('.lab')!.textContent)).toEqual(['Renommer la pièce', 'Supprimer la pièce']);
    expect(menu.querySelector('[role="separator"]')).not.toBeNull();
    expect(document.activeElement).toBe(screen.getAllByRole('menuitem')[0]);
  });

  it('arrows, Home and End move; Enter activates and closes; Esc closes and gives focus back', async () => {
    render(Menu, { label: 'Actions pour Salon', items });
    const trigger = screen.getByRole('button', { name: 'Actions pour Salon' });
    await fireEvent.click(trigger);
    const [first, last] = screen.getAllByRole('menuitem');
    await fireEvent.keyDown(first, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(last);
    await fireEvent.keyDown(last, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(first);
    await fireEvent.keyDown(first, { key: 'End' });
    expect(document.activeElement).toBe(last);
    await fireEvent.keyDown(last, { key: 'Home' });
    expect(document.activeElement).toBe(first);
    await fireEvent.keyDown(first, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    await fireEvent.click(trigger);
    await fireEvent.click(screen.getAllByRole('menuitem')[0]);
    expect(rename).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('Tab closes the menu and gives focus back to the trigger, so Tab moves on from there', async () => {
    render(Menu, { label: 'Actions pour Salon', items });
    const trigger = screen.getByRole('button', { name: 'Actions pour Salon' });
    await fireEvent.click(trigger);
    await fireEvent.keyDown(screen.getAllByRole('menuitem')[0], { key: 'Tab' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('the default name follows the language', async () => {
    const { applyLocale } = await import('$lib/i18n');
    const { flushSync } = await import('svelte');
    render(Menu, { items });
    expect(screen.getByRole('button', { name: 'Plus d’actions' })).toBeInTheDocument();
    applyLocale('en');
    flushSync();
    expect(screen.getByRole('button', { name: 'More actions' })).toBeInTheDocument();
    applyLocale('fr');
  });

  it('a disabled item stays focusable, says why, and does nothing', async () => {
    render(Menu, { label: 'Actions pour Salon', items });
    await fireEvent.click(screen.getByRole('button', { name: 'Actions pour Salon' }));
    const del = screen.getAllByRole('menuitem')[1];
    expect(del).toHaveAttribute('aria-disabled', 'true');
    expect(del).not.toHaveAttribute('disabled');
    expect(del).toHaveClass('danger');
    expect(document.getElementById(del.getAttribute('aria-describedby')!)).toHaveTextContent('Videz d’abord la pièce');
    await fireEvent.click(del);
    expect(remove).not.toHaveBeenCalled();
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('a labelled ghost trigger (« Exporter ») with a muted footer line; the default name is « Plus d’actions »', async () => {
    const { unmount } = render(Menu, { label: 'Exporter', text: 'Exporter', items, footer: 'CSV : « ; » entre les colonnes.' });
    const trigger = screen.getByRole('button', { name: 'Exporter' });
    expect(trigger).toHaveClass('btn-ghost');
    await fireEvent.click(trigger);
    expect(screen.getByText('CSV : « ; » entre les colonnes.')).toBeInTheDocument();
    unmount();
    render(Menu, { items });
    expect(screen.getByRole('button', { name: 'Plus d’actions' })).toBeInTheDocument();
  });
});

describe('Menu (phone sheet)', () => {
  it('below 1024 px the same items sit in the bottom sheet', async () => {
    media.desktop.matches = false;
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    render(Menu, { label: 'Actions pour Salon', items });
    await fireEvent.click(screen.getByRole('button', { name: 'Actions pour Salon' }));
    const dialog = document.querySelector('dialog')!;
    expect(dialog).toHaveAttribute('open');
    expect(dialog.querySelector('[role="menu"]')).not.toBeNull();
    expect(dialog.querySelectorAll('[role="menuitem"]')).toHaveLength(2);
  });
});
