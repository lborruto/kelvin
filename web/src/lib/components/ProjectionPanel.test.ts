import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import type { Projection } from '$lib/api/types';
import ProjectionPanel from './ProjectionPanel.svelte';

const months = Array.from({ length: 12 }, (_, i) => ({
  key: `${2026 + Math.floor((9 + i) / 12)}-${String(((9 + i) % 12) + 1).padStart(2, '0')}`,
  kwh: 400 + i * 10,
  eur: 100 + i * 2.5,
  method: 'linear' as const
}));
const projection: Projection = {
  month: { key: '2026-10', kwh: 620, eur: 412.4, actual_kwh: 200, actual_eur: 268.2, actual_energy_eur: 255.1, filled_days: 3, method: 'linear' },
  year: { from: '2026-10', to: '2027-09', kwh: 5460, eur: 1365, method: 'linear', months },
  rolling: { from: '2026-10-15', to: '2027-10-15', kwh: 7300, eur: 2140.5, per_day_kwh: 20, price_eur_kwh: 0.2437, method: 'linear' }
};
const text = (el: Element) => el.textContent!.replace(/\s+/g, ' ').trim();

describe('ProjectionPanel (M4, M5)', () => {
  it('the month in full with what is measured, and the next 365 days with their dates', () => {
    const { container } = render(ProjectionPanel, { projection });
    const rows = [...container.querySelectorAll('.row')];
    expect(text(rows[0])).toBe('Octobre 2026, mois complet ≈ 412,40 € dont 268,20 € mesurés · 3 jours manquants estimés');
    expect(text(rows[1])).toBe('365 prochains jours ≈ 2 141 € 15/10/2026 – 14/10/2027');
    expect(container.querySelector('.est')).toHaveTextContent('Estimation, à consommation et prix d’aujourd’hui.');
    expect(container.textContent).not.toMatch(/économ/i);
  });

  it('says how it is computed', async () => {
    const { container } = render(ProjectionPanel, { projection });
    await fireEvent.click(screen.getByText('Comment c’est calculé'));
    const d = text(container.querySelector('details')!);
    expect(d).toContain('20,00 kWh par jour');
    expect(d).toContain('prix moyen 0,2437 €/kWh au 14/10');
    expect(d).toContain('d’après les 30 derniers jours (pas encore un an d’historique)');
    expect(d).toContain('Abonnement compris');
  });

  it('draws the 12 projected months as a dashed line, with their values in a hidden table', () => {
    const { container } = render(ProjectionPanel, { projection });
    expect(container.querySelector('svg polyline.proj')!.getAttribute('points')!.split(' ')).toHaveLength(12);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect([...container.querySelectorAll('.spark-ends span')].map((s) => s.textContent)).toEqual(['oct. 2026', 'sept. 2027']);
    const table = container.querySelector('.visually-hidden > table')!;
    expect(table.querySelector('caption')).toHaveTextContent('Projection des 12 prochains mois (estimation)');
    expect(table.querySelectorAll('tbody tr')).toHaveLength(12);
    expect([...table.querySelectorAll('tbody tr')][0].querySelector('td')!.textContent).toBe('≈\u00a0100,00\u00a0€');
  });

  it('kWh without a tariff, and a plain note without a projection', () => {
    const plain: Projection = {
      ...projection,
      month: { ...projection.month, eur: null, actual_eur: null, actual_energy_eur: null, filled_days: 0 },
      year: { ...projection.year, eur: null, months: months.map((m) => ({ ...m, eur: null })) },
      rolling: { ...projection.rolling, eur: null, price_eur_kwh: null }
    };
    const { container, unmount } = render(ProjectionPanel, { projection: plain });
    expect(text(container.querySelector('.row')!)).toBe('Octobre 2026, mois complet ≈ 620,0 kWh dont 200,0 kWh mesurés');
    expect(container.querySelector('.visually-hidden tbody td')!.textContent).toBe('≈\u00a0400,0\u00a0kWh');
    unmount();
    render(ProjectionPanel, { projection: null });
    expect(screen.getByText('Pas encore assez de jours relevés pour une projection.')).toBeInTheDocument();
  });
});
