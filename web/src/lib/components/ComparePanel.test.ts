import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import type { Comparison } from '$lib/api/types';
import ComparePanel from './ComparePanel.svelte';

const cmp = (o: Partial<Comparison> = {}): Comparison => ({
  from: '2026-09-01', to: '2026-09-14', pairs: 13, of: 13, comparable: true, cur_kwh: 200, prev_kwh: 214.2,
  cur_energy_eur: 50.1, prev_energy_eur: 53.71, change: -0.0663, change_energy_eur: -0.0672, ...o
});
const text = (el: Element) => el.textContent!.replace(/\s+/g, ' ').trim();
const rows = (c: HTMLElement) => [...c.querySelectorAll('.row')].map(text);

describe('ComparePanel (M3)', () => {
  it('compares comparable days only, names the basis, and never colours the change', () => {
    const { container } = render(ComparePanel, {
      comparison: { basis: 'unit', previous: cmp(), last_year: cmp({ from: '2025-10-01', pairs: 9, of: 13, comparable: false, change: null }), avg4: null },
      view: 'month',
      tariff: true
    });
    const r = rows(container);
    expect(r[0]).toBe('Période précédente septembre 2026 −7 % −14,20 kWh · −3,61 € sur 13 jours comparables');
    expect(r[1]).toBe('Même période l’an dernier octobre 2025 — 9 jours comparables sur 13 : pas de comparaison');
    expect(container.innerHTML).not.toMatch(/--bad|--ok/);
    expect(container.textContent).not.toMatch(/économ/i);
  });

  it('the mean of the four previous periods, per day', () => {
    const { container } = render(ComparePanel, {
      comparison: { basis: 'unit', previous: null, last_year: null, avg4: { units: 4, cur_kwh_per_day: 12, prev_kwh_per_day: 10, change: 0.2 } },
      view: 'week',
      tariff: false
    });
    const r = rows(container);
    expect(r[2]).toBe('Moyenne des 4 dernières semaines +20 % 12,00 kWh par jour contre 10,00 kWh');
  });

  it('fewer than four comparable periods says over how many', () => {
    const { container } = render(ComparePanel, {
      comparison: { basis: 'unit', previous: null, last_year: null, avg4: { units: 2, cur_kwh_per_day: 12, prev_kwh_per_day: 10, change: 0.2 } },
      view: 'month',
      tariff: false
    });
    expect(rows(container)[2]).toBe('Moyenne des 4 derniers mois +20 % 12,00 kWh par jour contre 10,00 kWh sur 2 périodes comparables');
  });

  it('every « — » says why', () => {
    const { container } = render(ComparePanel, {
      comparison: {
        basis: 'unit',
        previous: null,
        last_year: cmp({ from: '2025-10-14', to: '2025-10-15', pairs: 1, of: 1, prev_kwh: 0, prev_energy_eur: 0, change: null }),
        avg4: { units: 0, cur_kwh_per_day: null, prev_kwh_per_day: null, change: null }
      },
      view: 'day',
      tariff: true
    });
    const r = rows(container);
    expect(r[0]).toBe('Période précédente — aucun jour relevé à comparer');
    expect(r[1]).toBe('Même période l’an dernier 14 octobre 2025 — rien de consommé ce jour-là : pas de comparaison');
    expect(r[2]).toBe('Moyenne des 4 derniers jours — aucun des 4 derniers jours n’est comparable');
  });

  it('without a tariff, no euros', () => {
    const { container } = render(ComparePanel, { comparison: { basis: 'unit', previous: cmp(), last_year: null, avg4: null }, view: 'day', tariff: false });
    expect(rows(container)[0]).toBe('Période précédente la veille −7 % −14,20 kWh sur 13 jours comparables');
    expect(text(container.querySelector('.foot')!)).toBe('Seuls les jours relevés des deux côtés comptent.');
  });

  it('a custom period is compared with the same length just before it', () => {
    const { container } = render(ComparePanel, { comparison: { basis: 'days', previous: cmp(), last_year: null, avg4: null }, view: 'month', tariff: false });
    expect(rows(container)[0]).toBe('Période précédente la même durée juste avant −7 % −14,20 kWh sur 13 jours comparables');
  });

  it('a week last year is named by its days', () => {
    const { container } = render(ComparePanel, {
      comparison: { basis: 'unit', previous: null, last_year: cmp({ from: '2025-10-13', to: '2025-10-16', pairs: 3, of: 3 }), avg4: null },
      view: 'week',
      tariff: false
    });
    expect(rows(container)[1]).toBe('Même période l’an dernier 13/10/2025 – 15/10/2025 −7 % −14,20 kWh sur 3 jours comparables');
  });
});
