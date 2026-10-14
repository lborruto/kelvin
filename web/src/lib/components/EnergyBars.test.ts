import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import EnergyBars, { labelEvery } from './EnergyBars.svelte';

describe('EnergyBars', () => {
  it('stacks one rect per non-zero part and labels the chart', () => {
    const { container } = render(EnergyBars, {
      groups: [
        { label: '12/10', parts: [{ key: 'salon', value: 3.2 }, { key: 'ch1', value: 0 }] },
        { label: '13/10', parts: [{ key: 'salon', value: 2.1 }, { key: 'ch1', value: 1.4 }] }
      ],
      colors: { salon: '#f2793f', ch1: '#4c9bf5' },
      unit: 'kWh',
      label: 'Consommation par jour'
    });
    expect(container.querySelector('svg')).toHaveAttribute('aria-label', 'Consommation par jour');
    expect(container.querySelectorAll('rect.part')).toHaveLength(3);
    // fmtKwh uses a non-breaking space before the unit
    expect([...container.querySelectorAll('.axis .tick')].map((e) => e.textContent)).toEqual(['12/10', '13/10']);
    expect(container.querySelector('rect.part title')?.textContent).toBe('12/10 · 3,2 kWh');
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
    // not measured yet (first paint, tests): about ten labels
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
    expect(rows[1].textContent).toContain('2,0\u00a0kWh');
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
    const gaps = container.querySelectorAll('line.gap');
    expect(gaps).toHaveLength(1);
    expect(gaps[0].querySelector('title')?.textContent).toBe('2/10 · donnée manquante');
  });
});
