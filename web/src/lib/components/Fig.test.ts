import { fireEvent, render, screen } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { provenance } from '$lib/provenance';
import Fig from './Fig.svelte';
import { fichePlace } from './Fiche.svelte';

const media = vi.hoisted(() => ({ desktop: { matches: true } }));
vi.mock('$lib/media.svelte', () => media);

const NB = ' ';
const now = Date.parse('2026-10-15T19:11:00Z');
const props = {
  value: `91,00${NB}€`,
  title: 'Octobre 2026, du 1er au 14',
  rows: [
    { label: 'Énergie', value: `84,23${NB}€` },
    { label: 'dont heures creuses', value: `10,82${NB}€`, sub: true },
    { label: 'Total', value: `91,00${NB}€`, est: true }
  ],
  provenance: provenance('linky-day', { day: '2026-10-14', syncAt: now - 60_000 }, now)
};
const fig = () => screen.getByRole('button', { name: `91,00${NB}€, détails` });
const card = () => document.querySelector<HTMLElement>('.fiche');

beforeEach(() => {
  vi.useFakeTimers();
  media.desktop.matches = true;
});
afterEach(() => {
  vi.useRealTimers();
  document.querySelectorAll('.fiche').forEach((n) => n.remove());
});

describe('Fig + Fiche (desktop card)', () => {
  it('is a button named « value, détails » that looks like its text (dotted underline class)', () => {
    render(Fig, props);
    expect(fig()).toHaveClass('fig');
    expect(fig().textContent).toBe(`91,00${NB}€`);
    expect(fig()).toHaveAttribute('aria-haspopup', 'dialog');
    expect(fig()).toHaveAttribute('aria-expanded', 'false');
  });

  it('hover opens after 120 ms and closes 200 ms after the pointer leaves (unless it reaches the card)', async () => {
    render(Fig, props);
    await fireEvent.pointerEnter(fig(), { pointerType: 'mouse' });
    vi.advanceTimersByTime(119);
    flushSync();
    expect(card()).toBeNull();
    vi.advanceTimersByTime(1);
    flushSync();
    expect(card()).not.toBeNull();
    expect(card()).toHaveAttribute('role', 'dialog');
    expect(card()!.getAttribute('aria-labelledby')).toBe(card()!.querySelector('.title')!.id);
    // Moving onto the card keeps it.
    await fireEvent.pointerLeave(fig(), { pointerType: 'mouse' });
    await fireEvent.pointerEnter(card()!, { pointerType: 'mouse' });
    vi.advanceTimersByTime(300);
    flushSync();
    expect(card()).not.toBeNull();
    await fireEvent.pointerLeave(card()!, { pointerType: 'mouse' });
    vi.advanceTimersByTime(199);
    flushSync();
    expect(card()).not.toBeNull();
    vi.advanceTimersByTime(1);
    flushSync();
    vi.runAllTimers();
    flushSync();
    expect(fig()).toHaveAttribute('aria-expanded', 'false');
  });

  it('focus leaving to nowhere (a click on the page) closes a pinned card', async () => {
    render(Fig, props);
    await fireEvent.click(fig());
    await fireEvent.focusOut(card()!, { relatedTarget: null });
    expect(fig()).toHaveAttribute('aria-expanded', 'false');
  });

  it('click pins it (close button), a second click unpins; Esc closes and returns focus to the figure', async () => {
    render(Fig, props);
    await fireEvent.click(fig());
    expect(card()).toHaveClass('pinned');
    expect(screen.getByRole('button', { name: 'Fermer' })).toBeInTheDocument();
    await fireEvent.click(fig());
    expect(fig()).toHaveAttribute('aria-expanded', 'false');
    // Keyboard: Enter is a click with detail 0; focus goes into the card, Esc brings it back.
    await fireEvent.click(fig(), { detail: 0 });
    await vi.runAllTimersAsync();
    expect(document.activeElement).toBe(card());
    await fireEvent.keyDown(card()!, { key: 'Escape' });
    expect(document.activeElement).toBe(fig());
    expect(fig()).toHaveAttribute('aria-expanded', 'false');
  });

  it('draws the rows (dont indented, est. marked) and the Provenance block: Source, Relevé, Nature', async () => {
    render(Fig, props);
    await fireEvent.click(fig());
    const rows = [...card()!.querySelectorAll('dl:not(.prov) .row')];
    expect(rows.map((r) => r.querySelector('dt')!.textContent)).toEqual(['Énergie', 'dont heures creuses', 'Total']);
    expect(rows[1]).toHaveClass('sub');
    expect(rows[2].querySelector('.est')).toHaveTextContent('est.');
    const prov = [...card()!.querySelectorAll('.prov .row')].map((r) => r.textContent!.replace(/\s/g, ' '));
    expect(prov).toEqual(['SourceLinky · Enedis via MyElectricalData', 'Relevéjusqu’au 14/10 · synchro il y a 1 min', 'Naturemesuré']);
  });
});

describe('Fig + Fiche (phone sheet)', () => {
  it('below 1024 px a tap opens the bottom sheet, titled, with the same rows', async () => {
    media.desktop.matches = false;
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    render(Fig, props);
    await fireEvent.click(fig());
    const dialog = document.querySelector('dialog')!;
    expect(dialog).toHaveAttribute('open');
    expect(dialog.querySelector('h2')).toHaveTextContent('Octobre 2026, du 1er au 14');
    expect(dialog.querySelectorAll('.row').length).toBe(6);
    expect(card()).toBeNull();
  });
});

describe('fichePlace', () => {
  const view = { width: 1440, height: 900 };
  const size = { width: 280, height: 200 };
  it('right of the trigger, else below (right-aligned), else above, else left, else clamped', () => {
    expect(fichePlace({ left: 100, right: 180, top: 300, bottom: 320 }, size, view)).toEqual({ left: 188, top: 294 });
    // No room on the right: below, right-aligned to the trigger.
    expect(fichePlace({ left: 1200, right: 1300, top: 300, bottom: 320 }, size, view)).toEqual({ left: 1020, top: 328 });
    // Nor below: above.
    expect(fichePlace({ left: 1200, right: 1300, top: 700, bottom: 720 }, size, view)).toEqual({ left: 1020, top: 492 });
    // Nor above (a short viewport): left of it.
    expect(fichePlace({ left: 1100, right: 1300, top: 100, bottom: 120 }, size, { width: 1440, height: 300 })).toEqual({ left: 812, top: 92 });
    expect(fichePlace({ left: 20, right: 300, top: 850, bottom: 870 }, size, { width: 320, height: 900 })).toEqual({ left: 20, top: 642 });
    // Nothing fits: below, clamped in the viewport.
    expect(fichePlace({ left: 20, right: 300, top: 100, bottom: 200 }, size, { width: 320, height: 300 })).toEqual({ left: 20, top: 92 });
  });
});
