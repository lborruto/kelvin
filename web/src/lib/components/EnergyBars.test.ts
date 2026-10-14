import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Inspection } from '$lib/inspector';
import { announcer } from '$lib/stores/announcer.svelte';
import EnergyBars, { labelEvery } from './EnergyBars.svelte';

const media = vi.hoisted(() => ({ desktop: { matches: false } }));
vi.mock('$lib/media.svelte', () => media);

const ins = (title: string, value: string): Inspection => ({
  title,
  rows: [{ key: 'maison', label: 'Maison', value }],
  notes: [],
  empty: null,
  spoken: `${title}, ${value}`
});
// At the default 600 px: step 200, bars of 150 px at x = 25, 225, 425 (centres 100, 300, 500).
const three = {
  groups: [
    { label: '11/10', parts: [{ key: 'home', value: 10 }] },
    { label: '12/10', parts: [{ key: 'home', value: 12 }] },
    { label: '13/10', parts: [{ key: 'home', value: 14 }] }
  ],
  colors: { home: 'var(--series-1)' },
  unit: 'kWh',
  label: 'Consommation de la maison par jour',
  details: [ins('11 octobre', '10,00\u00a0kWh'), ins('12 octobre', '12,00\u00a0kWh'), ins('13 octobre', '14,00\u00a0kWh')]
};

beforeEach(() => {
  media.desktop.matches = false;
  announcer.clear();
});

describe('EnergyBars', () => {
  it('stacks one rect per non-zero part and labels the chart', () => {
    const { container } = render(EnergyBars, {
      groups: [
        { label: '12/10', parts: [{ key: 'salon', value: 3.2 }, { key: 'ch1', value: 0 }] },
        { label: '13/10', parts: [{ key: 'salon', value: 2.1 }, { key: 'ch1', value: 1.4 }] }
      ],
      colors: { salon: 'var(--series-1)', ch1: 'var(--series-2)' },
      unit: 'kWh',
      label: 'Consommation par jour'
    });
    expect(container.querySelector('svg')).toHaveAttribute('aria-label', 'Consommation par jour');
    expect(container.querySelectorAll('rect.part')).toHaveLength(3);
    expect([...container.querySelectorAll('.axis .tick')].map((e) => e.textContent)).toEqual(['12/10', '13/10']);
    // L12: no SVG <title> tooltip anywhere; the inspector and the table carry the values.
    expect(container.querySelector('title')).toBeNull();
  });

  it('renders an empty state', () => {
    const { getByText } = render(EnergyBars, { groups: [], colors: {}, unit: 'kWh', label: 'x' });
    expect(getByText('Pas encore de données.')).toBeInTheDocument();
  });

  it('keeps at least 44 px per axis label at the rendered width', () => {
    expect(labelEvery(30, 1320)).toBe(1);
    expect(labelEvery(30, 600)).toBe(3);
    expect(labelEvery(30, 320)).toBe(5);
    expect(labelEvery(12, 320)).toBe(2);
    expect(labelEvery(30, 0)).toBe(3);
  });

  it('fills the bars through style, so theme tokens work', () => {
    const { container } = render(EnergyBars, {
      groups: [{ label: '1/10', parts: [{ key: 'salon', value: 1 }] }],
      colors: { salon: 'var(--series-1)' },
      unit: 'kWh',
      label: 'x'
    });
    expect(container.querySelector('rect.part')!.getAttribute('style')).toContain('var(--series-1)');
  });

  it('draws the overlay as one mark per bar and exposes every value in a table', () => {
    const { container } = render(EnergyBars, {
      groups: [
        { label: '9/26', parts: [{ key: 'hc', value: 120 }, { key: 'hp', value: 180 }] },
        { label: '10/26', parts: [{ key: 'hc', value: 50 }, { key: 'hp', value: 70 }] }
      ],
      colors: { hc: 'var(--series-1)', hp: 'var(--series-2)' },
      names: { hc: 'Heures creuses', hp: 'Heures pleines' },
      overlay: { label: 'Radiateurs', values: [140, null], color: 'var(--series-3)' },
      unit: 'kWh',
      label: 'Consommation de la maison par mois'
    });
    const marks = container.querySelectorAll('line.mark');
    expect(marks).toHaveLength(1);
    expect(marks[0].getAttribute('style')).toContain('var(--series-3)');
    const table = container.querySelector('.visually-hidden > table')!;
    expect(table.querySelector('caption')?.textContent).toBe('Consommation de la maison par mois');
    expect([...table.querySelectorAll('thead th')].map((t) => t.textContent)).toEqual([
      'Période', 'Heures creuses', 'Heures pleines', 'Radiateurs'
    ]);
    expect(table.querySelectorAll('tbody tr')[1].textContent).toContain('—');
    expect(table.querySelectorAll('tbody tr')[0].textContent).toContain('140\u00a0kWh');
  });

  it('never draws a missing value as zero: no bar, « — » in the table', () => {
    const { container } = render(EnergyBars, {
      groups: [
        { label: '7/26', parts: [{ key: 'hc', value: null }, { key: 'hp', value: null }] },
        { label: '8/26', parts: [{ key: 'hc', value: 2 }, { key: 'hp', value: 3 }] }
      ],
      colors: { hc: 'var(--series-1)', hp: 'var(--series-2)' },
      names: { hc: 'Heures creuses', hp: 'Heures pleines' },
      unit: 'kWh',
      label: 'x'
    });
    expect(container.querySelectorAll('rect.part')).toHaveLength(2);
    for (const r of container.querySelectorAll('rect.part')) expect(Number(r.getAttribute('height'))).not.toBeNaN();
    const rows = container.querySelectorAll('.visually-hidden > table tbody tr');
    expect([...rows[0].querySelectorAll('td')].map((td) => td.textContent)).toEqual(['—', '—']);
    expect(rows[1].textContent).toContain('2,0 kWh');
    expect(container.querySelectorAll('line.gap')).toHaveLength(0); // leading, not interior
  });

  it('marks an interior gap with a baseline tick, and a zero with nothing', () => {
    const { container } = render(EnergyBars, {
      groups: [
        { label: '1/10', parts: [{ key: 'home', value: 2 }] },
        { label: '2/10', parts: [{ key: 'home', value: null }] },
        { label: '3/10', parts: [{ key: 'home', value: 0 }] },
        { label: '4/10', parts: [{ key: 'home', value: 3 }] },
        { label: '5/10', parts: [{ key: 'home', value: null }] }
      ],
      colors: { home: 'var(--series-1)' },
      unit: 'kWh',
      label: 'x'
    });
    expect(container.querySelectorAll('line.gap')).toHaveLength(1);
  });

  it('bars are a roving-tabindex group: arrows move, select and announce; Esc clears', async () => {
    const { container } = render(EnergyBars, three);
    const keys = screen.getAllByRole('button');
    expect(keys.map((k) => k.getAttribute('tabindex'))).toEqual(['-1', '-1', '0']);
    expect(keys[1]).toHaveAttribute('aria-label', '12 octobre, 12,00\u00a0kWh');
    keys[2].focus();
    await fireEvent.keyDown(keys[2], { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(keys[1]);
    expect(keys[1]).toHaveAttribute('aria-pressed', 'true');
    expect(keys[1]).toHaveAttribute('tabindex', '0');
    expect(announcer.polite).toBe('12 octobre, 12,00\u00a0kWh');
    const sheet = container.querySelector('.inspector.sheet')!;
    expect(sheet.querySelector('.title')).toHaveTextContent('12 octobre');
    expect(sheet.querySelector('dd')).toHaveTextContent('12,00 kWh');
    expect(container.querySelector('rect.sel')).not.toBeNull();
    await fireEvent.keyDown(keys[1], { key: 'Escape' });
    expect(container.querySelector('.inspector')).toBeNull();
    expect(container.querySelector('rect.sel')).toBeNull();
    expect(keys[1]).toHaveAttribute('aria-pressed', 'false');
  });

  it('Enter drills down; the inspector offers the same action', async () => {
    const ondrill = vi.fn();
    render(EnergyBars, { ...three, ondrill, drillLabel: (i: number) => (i === 1 ? 'Voir la courbe du 12/10' : null) });
    const keys = screen.getAllByRole('button');
    await fireEvent.keyDown(keys[2], { key: 'Enter' });
    expect(ondrill).toHaveBeenLastCalledWith(2);
    await fireEvent.click(keys[1]);
    await fireEvent.click(screen.getByRole('button', { name: 'Voir la courbe du 12/10' }));
    expect(ondrill).toHaveBeenLastCalledWith(1);
  });

  it('a horizontal swipe steps the period, a tap selects the nearest bar and a second tap closes', async () => {
    const onswipe = vi.fn();
    const { container } = render(EnergyBars, { ...three, onswipe });
    const plot = container.querySelector('.plot')!;
    const tap = async (x0: number, x1 = x0, y1 = 50) => {
      await fireEvent.pointerDown(plot, { clientX: x0, clientY: 50, pointerType: 'touch' });
      await fireEvent.pointerUp(plot, { clientX: x1, clientY: y1, pointerType: 'touch' });
    };
    await tap(290);
    expect(screen.getAllByRole('button')[1]).toHaveAttribute('aria-pressed', 'true');
    expect(container.querySelector('.inspector.sheet .title')).toHaveTextContent('12 octobre');
    await tap(300);
    expect(container.querySelector('.inspector')).toBeNull();
    await tap(400, 320, 60);
    expect(onswipe).toHaveBeenCalledWith(1);
    expect(container.querySelector('.inspector')).toBeNull();
  });

  it('desktop: hovering shows the card beside the bar, flipped at the right edge', async () => {
    media.desktop.matches = true;
    const { container } = render(EnergyBars, three);
    const plot = container.querySelector('.plot')!;
    await fireEvent.pointerMove(plot, { clientX: 100, pointerType: 'mouse' });
    expect(container.querySelector('.inspector.card .title')).toHaveTextContent('11 octobre');
    expect(container.querySelector<HTMLElement>('.inspector.card')!.style.left).toBe('183px');
    await fireEvent.pointerMove(plot, { clientX: 500, pointerType: 'mouse' });
    expect(container.querySelector<HTMLElement>('.inspector.card')!.style.left).toBe('157px');
    expect(container.querySelector('.inspector.sheet')).toBeNull();
    await fireEvent.pointerLeave(plot);
    expect(container.querySelector('.inspector')).toBeNull();
  });

  it('desktop: the pointer on a pinned card stays with it, so its action can be clicked', async () => {
    media.desktop.matches = true;
    const ondrill = vi.fn();
    const { container } = render(EnergyBars, { ...three, ondrill, drillLabel: () => 'Voir la courbe' });
    const plot = container.querySelector('.plot')!;
    await fireEvent.pointerMove(plot, { clientX: 100, pointerType: 'mouse' });
    await fireEvent.pointerDown(plot, { clientX: 100, pointerType: 'mouse' });
    await fireEvent.pointerUp(plot, { clientX: 100, pointerType: 'mouse' });
    const card = container.querySelector('.inspector.card')!;
    expect(card).toHaveClass('pinned');
    // The card sits over the third bar's column: moving or pressing on it neither re-aims nor unpins it.
    const action = screen.getByRole('button', { name: 'Voir la courbe' });
    await fireEvent.pointerMove(action, { clientX: 480, pointerType: 'mouse' });
    await fireEvent.pointerDown(action, { clientX: 480, pointerType: 'mouse' });
    await fireEvent.pointerUp(action, { clientX: 480, pointerType: 'mouse' });
    await fireEvent.click(action);
    expect(ondrill).toHaveBeenLastCalledWith(0);
    expect(container.querySelector('.inspector.card .title')).toHaveTextContent('11 octobre');
    expect(screen.getAllByRole('button')[0]).toHaveAttribute('aria-pressed', 'true');
  });

  it('the hidden table carries every inspector column', () => {
    const { container } = render(EnergyBars, three);
    const table = container.querySelector('.visually-hidden > table')!;
    expect([...table.querySelectorAll('thead th')].map((t) => t.textContent)).toEqual(['Période', 'Maison']);
    expect(table.querySelectorAll('tbody tr')[2].textContent).toContain('14,00\u00a0kWh');
  });
});
