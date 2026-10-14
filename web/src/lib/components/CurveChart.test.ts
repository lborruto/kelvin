import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import CurveChart from './CurveChart.svelte';

const t0 = Date.UTC(2026, 9, 12, 22) / 1000; // 13 Oct 00:00 Paris
const points = [
  { ts: t0, minutes: 30, wh: 1500, offpeak: 1 },
  { ts: t0 + 1800, minutes: 30, wh: 300, offpeak: 0 },
  { ts: t0 + 3600, minutes: 30, wh: 600, offpeak: 0.5 },
  { ts: t0 + 5400, minutes: 30, wh: 200, offpeak: 1 }
];

describe('CurveChart', () => {
  it('splits each half hour into HC (series-1) and HP (series-2)', () => {
    const { container } = render(CurveChart, { points, label: 'Courbe' });
    expect(container.querySelectorAll('rect.hc')).toHaveLength(3);
    expect(container.querySelectorAll('rect.hp')).toHaveLength(2);
    expect(container.querySelector('rect.hc')!.getAttribute('style')).toContain('var(--series-1)');
    expect(container.querySelector('rect.hp')!.getAttribute('style')).toContain('var(--series-2)');
    expect(container.querySelector('g title')?.textContent).toBe('00:00 · 1\u202f500\u00a0Wh · heures creuses');
    expect(container.querySelector('table.visually-hidden tbody td')?.textContent).toBe('1\u202f500\u00a0Wh');
    expect(container.querySelectorAll('table.visually-hidden tbody tr')).toHaveLength(4);
    expect(container.querySelector('svg')).toHaveAttribute('aria-label', 'Courbe');
    expect(container.querySelector('.curve-axis .curve-tick')?.textContent).toBe('00');
    expect(container.querySelector('.axis')).toBeNull();
  });

  it('without a tariff, draws one series and claims no HC/HP split', () => {
    const { container } = render(CurveChart, { points, label: 'Courbe', split: false });
    expect(container.querySelectorAll('rect.hc, rect.hp')).toHaveLength(0);
    expect(container.querySelectorAll('rect.all')).toHaveLength(4);
    expect(container.querySelector('g title')?.textContent).toBe('00:00 · 1\u202f500\u00a0Wh');
    expect([...container.querySelectorAll('table thead th')].map((t) => t.textContent)).toEqual(['Heure', 'Énergie']);
  });

  it('has an empty state', () => {
    const { getByText } = render(CurveChart, { points: [], label: 'x' });
    expect(getByText('Pas de courbe pour ce jour.')).toBeInTheDocument();
  });
});
