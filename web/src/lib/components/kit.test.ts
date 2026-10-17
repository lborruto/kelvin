import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { createRawSnippet, flushSync } from 'svelte';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { GridView, Tariff } from '$lib/api/types';
import { applyLocale } from '$lib/i18n';
import IconTile from './IconTile.svelte';
import ListRow from './ListRow.svelte';
import MaintenantCard from './MaintenantCard.svelte';
import MiniBars from './MiniBars.svelte';
import Notice from './Notice.svelte';
import RoomTile from './RoomTile.svelte';
import Sheet from './Sheet.svelte';
import SummaryChip from './SummaryChip.svelte';
import VSlider, { snapTo, valueAtY } from './VSlider.svelte';
import Widget from './Widget.svelte';

vi.mock('$lib/api/client', () => ({ api: {}, ApiError: class extends Error {} }));

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

const text = (s: string) => createRawSnippet(() => ({ render: () => `<span>${s}</span>` }));
const at = (hhmm: string) => Date.parse(`2026-10-16T${hhmm}:00+02:00`);
const tariff = (option: 'base' | 'hchp' | 'tempo', rates: Record<string, number>): Tariff => ({
  option, kva: 9, hc_slots: [{ start: '22:00', end: '06:00' }], hc_schedules: [],
  tempo_hours: { hc_start: '22:00', hc_end: '06:00', day_start: '06:00' },
  prices: [{ valid_from: '2026-01-01', option, subscription_eur_month: 23.48, rates }]
});

describe('Sheet', () => {
  it('a modal dialog named by its title; Esc closes and focus returns to the trigger', async () => {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();
    const onclose = vi.fn();
    const { rerender } = render(Sheet, { open: false, title: 'Partir en absence', onclose, trigger, children: text('corps') });
    await rerender({ open: true, title: 'Partir en absence', onclose, trigger, children: text('corps') });
    const dialog = screen.getByRole('dialog', { name: 'Partir en absence' });
    expect(dialog).toHaveAttribute('open');
    expect(within(dialog).getByText('corps')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Fermer' })).toBeInTheDocument();
    (dialog as HTMLDialogElement).close();
    expect(onclose).toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
  it('closes only on the real backdrop: a tap inside a tall sheet’s blank area keeps it open', async () => {
    const onclose = vi.fn();
    render(Sheet, { open: true, title: 'Salon', tall: true, onclose, children: text('x') });
    const dialog = screen.getByRole('dialog', { name: 'Salon' });
    dialog.getBoundingClientRect = () => ({ left: 0, right: 390, top: 56, bottom: 844, width: 390, height: 788, x: 0, y: 56, toJSON: () => ({}) }) as DOMRect;
    await fireEvent.click(dialog, { clientX: 200, clientY: 700 });
    expect(dialog).toHaveAttribute('open');
    expect(onclose).not.toHaveBeenCalled();
    await fireEvent.click(dialog, { clientX: 200, clientY: 20 });
    expect(onclose).toHaveBeenCalled();
  });
  it('an action sheet: no ×, a footer', () => {
    render(Sheet, { open: true, title: 'Actions', noClose: true, onclose: () => {}, children: text('x'), footer: text('Annuler') });
    const dialog = screen.getByRole('dialog', { name: 'Actions' });
    expect(within(dialog).queryByRole('button', { name: 'Fermer' })).toBeNull();
    expect(within(dialog).getByText('Annuler')).toBeInTheDocument();
  });
});

describe('VSlider', () => {
  it('snaps to 0,5 °C inside its bounds', () => {
    expect(snapTo(20.24, 0.5, 10, 26)).toBe(20);
    expect(snapTo(20.26, 0.5, 10, 26)).toBe(20.5);
    expect(snapTo(9, 0.5, 10, 26)).toBe(10);
    expect(snapTo(30, 0.5, 10, 26)).toBe(26);
  });
  it('reads the value under the finger: bottom is the minimum', () => {
    expect(valueAtY(300, 0, 300, 10, 26)).toBe(10);
    expect(valueAtY(0, 0, 300, 10, 26)).toBe(26);
    expect(valueAtY(150, 0, 300, 10, 26)).toBe(18);
  });
  it('an ARIA slider: keys step 0,5 and send once after the debounce; dim is inert', async () => {
    vi.useFakeTimers();
    const onchange = vi.fn();
    const { rerender } = render(VSlider, { value: 20, label: 'Consigne', measured: 19.6, onchange });
    const s = screen.getByRole('slider', { name: 'Consigne' });
    expect(s).toHaveAttribute('aria-valuetext', '20,0 °C');
    expect(s).toHaveAttribute('aria-orientation', 'vertical');
    await fireEvent.keyDown(s, { key: 'ArrowUp' });
    await fireEvent.keyDown(s, { key: 'ArrowUp' });
    expect(s).toHaveAttribute('aria-valuenow', '21');
    expect(onchange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(600);
    expect(onchange).toHaveBeenCalledTimes(1);
    expect(onchange).toHaveBeenCalledWith(21);
    await rerender({ value: 20, label: 'Consigne', dim: true, onchange });
    await fireEvent.keyDown(s, { key: 'ArrowUp' });
    vi.advanceTimersByTime(600);
    expect(onchange).toHaveBeenCalledTimes(1);
    expect(s).toHaveAttribute('aria-disabled', 'true');
    vi.useRealTimers();
  });
});

describe('RoomTile', () => {
  const base = { name: 'Salon', href: '/rooms/salon', ariaLabel: 'Salon, 19,6 °C, En chauffe', reading: 19.6 };
  it('the body is one link to the room sheet; the control sits above it', () => {
    const { container } = render(RoomTile, { ...base, heating: true, lead: 'En chauffe', tone: 'warm', rest: '→ 23:00', control: text('−/+') });
    expect(screen.getByRole('link', { name: 'Salon, 19,6 °C, En chauffe' })).toHaveAttribute('href', '/rooms/salon');
    expect(container.querySelector('.t')).toHaveTextContent('19,6°');
    expect(container.querySelector('.ti')).toHaveClass('heat');
    expect(container.querySelector('.ctl')).toHaveClass('above');
  });
  it('off, absence and read-only never render a control, even if one is passed; offline neither', () => {
    for (const variant of ['off', 'absence', 'readonly', 'offline'] as const) {
      const { container, unmount } = render(RoomTile, { ...base, variant, control: text('−/+') });
      expect(container.querySelector('.ctl'), variant).toBeNull();
      expect(container.textContent, variant).not.toContain('−/+');
      unmount();
    }
  });
  it('off: no control, the note; absence: cool, no heat', () => {
    const { container } = render(RoomTile, { ...base, variant: 'off', heating: true, note: 'Ne chauffe pas' });
    expect(container.querySelector('.ti')).not.toHaveClass('heat');
    expect(container.querySelector('.ctl')).toBeNull();
    expect(screen.getByText('Ne chauffe pas')).toBeInTheDocument();
  });
  it('offline: calm and faint, no temperature, never red', () => {
    const { container } = render(RoomTile, { ...base, reading: null, variant: 'offline', lead: 'Hors ligne depuis 04:07', hint: 'Radiateur hors tension ou hors de portée' });
    expect(container.querySelector('.rt')).toHaveClass('offline');
    expect(container.querySelector('.t')).toBeNull();
    expect(container.innerHTML).not.toMatch(/bad/);
  });
});

describe('small pieces', () => {
  it('SummaryChip: label and value separate; a link or a button; a skeleton keeps its size', () => {
    const { container, unmount } = render(SummaryChip, { icon: 'flame', label: 'Climat', value: '19,1–19,6°', href: '/' });
    expect(screen.getByRole('link')).toHaveTextContent('Climat19,1–19,6°');
    unmount();
    render(SummaryChip, { icon: 'away', label: 'Absence', value: 'Partir…', onclick: () => {} });
    expect(screen.getByRole('button', { name: /Absence/ })).toHaveTextContent('Absence');
    const sk = render(SummaryChip, { icon: 'away', label: 'x', skeleton: true, width: 120 });
    expect(sk.container.querySelector('.skeleton')).toHaveStyle({ width: '120px', height: '46px' });
    expect(container).toBeTruthy();
  });
  it('SummaryChip with a Fiche: one button styled as the pill, named « label value, détails », pinned on click', async () => {
    const fiche = { title: 'Température extérieure', rows: [{ label: 'Maintenant', value: '4,2\u00a0°C' }], link: { label: 'Open-Meteo', href: 'https://open-meteo.com/' } };
    const { container } = render(SummaryChip, { icon: 'weather', label: 'Dehors', value: '4,2\u00a0°C', fiche });
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    const chip = buttons[0];
    expect(chip).toHaveAccessibleName('Dehors 4,2\u00a0°C, détails');
    expect(chip).toHaveClass('fig', 'cat');
    expect(chip.querySelector('b')).toHaveTextContent('Dehors');
    expect(container.querySelector('a')).toBeNull();
    await fireEvent.click(chip);
    expect(chip).toHaveAttribute('aria-expanded', 'true');
    expect(document.body).toHaveTextContent('Température extérieure');
    expect(screen.getByRole('link', { name: 'Open-Meteo', hidden: true })).toHaveAttribute('href', 'https://open-meteo.com/');
  });

  it('IconTile: heat disc only with tone heat; inert keeps focus (aria-disabled) and ignores clicks', async () => {
    const onclick = vi.fn();
    const { container } = render(IconTile, { icon: 'bolt', title: 'Chauffe temp.', sub: 'Lancer…', onclick, inert: true });
    const b = screen.getByRole('button', { name: /Chauffe temp/ });
    expect(b).toHaveAttribute('aria-disabled', 'true');
    await fireEvent.click(b);
    expect(onclick).not.toHaveBeenCalled();
    expect(container.querySelector('.ti')).not.toHaveClass('heat');
  });
  it('ListRow: a link with a chevron; a disclosure row with aria-expanded', () => {
    render(ListRow, { label: 'Tarif', sub: 'Heures creuses / pleines', href: '/home/tariff' });
    expect(screen.getByRole('link', { name: /Tarif/ })).toHaveAttribute('href', '/home/tariff');
    render(ListRow, { label: 'Modifier la connexion', onclick: () => {}, expanded: false });
    expect(screen.getByRole('button', { name: 'Modifier la connexion' })).toHaveAttribute('aria-expanded', 'false');
  });
  it('Widget: a region named by its label, with its link', () => {
    render(Widget, { title: 'Énergie et réseau', link: { href: '/energy', label: 'Énergie ›' }, children: text('…') });
    expect(screen.getByRole('region', { name: 'Énergie et réseau' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Énergie ›' })).toHaveAttribute('href', '/energy');
  });
  it('Notice: neutral is a status, never bad unless asked', () => {
    const { container } = render(Notice, { title: 'Radiateur hors tension ou hors de portée' });
    expect(screen.getByRole('status')).toHaveTextContent('Radiateur hors tension');
    expect(container.querySelector('.notice')).not.toHaveClass('bad');
  });
  it('MiniBars: a missing day is a stub, never a zero bar; HC under HP; a hidden table', () => {
    const { container } = render(MiniBars, {
      values: [3, null, 4], parts: [{ hc: 1, hp: 2 }, null, { hc: 2, hp: 2 }], label: 'Hier',
      rows: [{ label: 'a', value: '3' }, { label: 'b', value: '—' }, { label: 'c', value: '4' }]
    });
    expect(container.querySelectorAll('.stub')).toHaveLength(1);
    expect(container.querySelectorAll('.seg.hc')).toHaveLength(2);
    expect(screen.getByRole('table', { name: 'Hier' })).toBeInTheDocument();
  });
});

describe('MaintenantCard', () => {
  it('HC/HP: the period, its end and the next price, the band named by the off-peak hours', () => {
    render(MaintenantCard, { tariff: tariff('hchp', { hc: 0.2, hp: 0.27 }), grid: null, now: at('18:42') });
    expect(screen.getByText('Heures pleines')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Maintenant' })).toHaveTextContent('jusqu’à 22:00, puis creuses à 0,2000 €');
    expect(screen.getByRole('button', { name: /^0,2700 €, détails$/ })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Heures creuses 22:00–06:00' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Maintenant' })).toHaveTextContent('heures creuses / pleines · 9 kVA');
    // Decision 3: no Tempo colour outside Tempo.
    expect(document.querySelector('.dot')).toBeNull();
  });
  it('Tempo: the day colour, tomorrow and its prices', () => {
    const grid: GridView = {
      tempo: { today: { date: '2026-10-16', colour: 'blue' }, tomorrow: { date: '2026-10-17', colour: 'white', expected_at: null }, fetched_at: null },
      ecowatt: { days: [], fetched_at: null }, source: 'MyElectricalData'
    };
    render(MaintenantCard, {
      tariff: tariff('tempo', { blue_hc: 0.1288, blue_hp: 0.1552, white_hc: 0.1447, white_hp: 0.1792, red_hc: 0.1518, red_hp: 0.6586 }), grid, now: at('18:42')
    });
    expect(screen.getByText(/Jour Tempo Bleu/)).toBeInTheDocument();
    expect(screen.getByText('Blanc')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Maintenant' })).toHaveTextContent('pleines 0,1792 € · creuses 0,1447 €');
  });
  it('Base: one price, no band; no tariff: « Renseigner le tarif »; English', () => {
    const { unmount } = render(MaintenantCard, { tariff: tariff('base', { base: 0.2516 }), grid: null, now: at('18:42') });
    expect(screen.getByRole('region', { name: 'Maintenant' })).toHaveTextContent('Prix unique 0,2516 €/kWh');
    expect(screen.queryByRole('img')).toBeNull();
    unmount();
    render(MaintenantCard, { tariff: null, grid: null, now: at('18:42') });
    expect(screen.getByRole('link', { name: 'Renseigner le tarif' })).toHaveAttribute('href', '/home/tariff');
    applyLocale('en');
    flushSync();
    expect(screen.getByRole('link', { name: 'Add your tariff' })).toBeInTheDocument();
  });
});
