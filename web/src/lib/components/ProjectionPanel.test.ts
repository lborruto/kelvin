import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { applyLocale } from '$lib/i18n';
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
    const { container } = render(ProjectionPanel, { projection, last: '2026-10-14', today: '2026-10-15' });
    const rows = [...container.querySelectorAll('.row')];
    expect(text(rows[0])).toBe('Octobre 2026, mois complet ≈ 412,40 € dont 268,20 € mesurés · 3 jours manquants estimés');
    expect(text(rows[1])).toBe('365 prochains jours ≈ 2 141 € 15/10/2026 – 14/10/2027');
    expect(container.querySelector('.est')).toHaveTextContent('Estimation, au rythme récent et aux prix d’aujourd’hui.');
    expect(container.textContent).not.toMatch(/économ/i);
  });

  it('says how it is computed', async () => {
    const { container } = render(ProjectionPanel, { projection, last: '2026-10-14', today: '2026-10-15' });
    // Closed by default, findable; the « ≈ » estimate note sits in it with the method.
    const how = screen.getByRole('button', { name: /^Comment c’est calculé/ });
    expect(how).toHaveAttribute('aria-expanded', 'false');
    expect(container.querySelector('#projection')).not.toBeNull();
    expect(container.querySelector('circle.now')).not.toBeNull();
    await fireEvent.click(how);
    const d = text(container.querySelector('.disclosure')!);
    expect(d).toContain('20,00 kWh par jour');
    expect(d).toContain('Base : 20,00 kWh par jour, moyenne des jours relevés parmi les 30 jours jusqu’au 14/10');
    expect(d).toContain('appliquée telle quelle à chaque jour à venir (trop peu de jours relevés l’an dernier pour l’ajuster par mois)');
    expect(d).toContain('Prix moyen 0,2437 €/kWh : prix du 14/10 pondérés par votre part d’heures creuses sur ces 30 jours');
    expect(d).toContain('Mois en cours : jours mesurés, plus la base pour chaque jour restant ou manquant');
    expect(d).not.toContain('consommation d’aujourd’hui');
    // Measured days at their own day's price, days to come at today's.
    expect(d).toContain('Abonnement compris : au tarif de chaque jour pour les jours mesurés, au tarif d’aujourd’hui pour les jours à venir.');
  });

  it('draws the 12 projected months as a dashed line, with their values in a hidden table', () => {
    const { container } = render(ProjectionPanel, { projection, last: '2026-10-14', today: '2026-10-15' });
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
    const { container, unmount } = render(ProjectionPanel, { projection: plain, last: '2026-10-14', today: '2026-10-15' });
    expect(text(container.querySelector('.row')!)).toBe('Octobre 2026, mois complet ≈ 620,0 kWh dont 200,0 kWh mesurés');
    expect(container.querySelector('.visually-hidden tbody td')!.textContent).toBe('≈\u00a0400,0\u00a0kWh');
    unmount();
    render(ProjectionPanel, { projection: null, last: '2026-10-14', today: '2026-10-15' });
    expect(screen.getByText('Pas encore assez de jours relevés pour une projection.')).toBeInTheDocument();
  });

  it('without a projection because Linky is late, says so with the last day', () => {
    const { container, unmount } = render(ProjectionPanel, { projection: null, last: '2026-10-11', today: '2026-10-15' });
    expect(text(container.querySelector('.note')!)).toBe('Relevés Linky en retard (dernier jour le 11 octobre 2026) : pas de projection.');
    unmount();
    // Three days late is still on time (the backend's STALE_DAYS).
    render(ProjectionPanel, { projection: null, last: '2026-10-12', today: '2026-10-15' });
    expect(screen.getByText('Pas encore assez de jours relevés pour une projection.')).toBeInTheDocument();
  });

  it('always says what it covers, whatever period is shown', () => {
    for (const p of [projection, null]) {
      const { unmount } = render(ProjectionPanel, { projection: p, last: '2026-10-14', today: '2026-10-15' });
      expect(screen.getByText('Mois en cours et 365 prochains jours')).toBeInTheDocument();
      unmount();
    }
  });

  it('the seasonal and mixed methods say how the 30-day base is adjusted', async () => {
    for (const [method, phrase] of [
      ['seasonal', 'ajustée chaque mois selon le même mois de l’an dernier'],
      ['mixed', 'ajustée selon le même mois de l’an dernier quand il est connu, telle quelle sinon']
    ] as const) {
      const { container, unmount } = render(ProjectionPanel, {
        projection: { ...projection, rolling: { ...projection.rolling, method } },
        last: '2026-10-14',
        today: '2026-10-15'
      });
      const d = text(container.querySelector('.disclosure')!);
      expect(d).toContain('moyenne des jours relevés parmi les 30 jours jusqu’au 14/10');
      expect(d).toContain(phrase);
      unmount();
    }
  });
});

describe('ProjectionPanel: the month end from the weather (Plan 15)', () => {
  const weather = { why: null, observed_days: 1, today: true, forecast_days: 7, normal_days: 9, kwh_lo: 398.2, kwh_hi: 426.9, eur_lo: 90.21, eur_hi: 95.99, spread: 'full' as const };
  it('« selon la météo » after the month, the range and the days in Détails', async () => {
    const p = { ...projection, month: { ...projection.month, eur: 93.1, method: 'weather' as const, weather } };
    const { container } = render(ProjectionPanel, { projection: p, last: '2026-10-14', today: '2026-10-15' });
    expect(text(container.querySelectorAll('.row')[0])).toContain('≈ 93,10 € selon la météo');
    await fireEvent.click(screen.getByRole('button', { name: /^Comment c’est calculé/ }));
    const d = text(container.querySelector('.disclosure')!);
    expect(d).toContain(
      'entre 90,21 € et 95,99 € (8 chances sur 10) : 2 jours estimés sur la météo observée, 7 jours de prévision, 9 jours de normales de saison.'
    );
    expect(d).not.toContain('Mois en cours');
  });
  it('a reason keeps v0.2’s words plus one muted line', async () => {
    const p = { ...projection, month: { ...projection.month, method: 'seasonal' as const, weather: { ...weather, why: 'no_normals' as const } } };
    const { container } = render(ProjectionPanel, { projection: p, last: '2026-10-14', today: '2026-10-15' });
    expect(text(container.querySelectorAll('.row')[0])).not.toContain('selon la météo');
    await fireEvent.click(screen.getByRole('button', { name: /^Comment c’est calculé/ }));
    const d = text(container.querySelector('.disclosure')!);
    expect(d).toContain('Mois en cours');
    expect(d).toContain('normales de saison pas encore disponibles');
  });
  it('without a place: v0.2’s words only', async () => {
    const p = { ...projection, month: { ...projection.month, weather: null } };
    const { container } = render(ProjectionPanel, { projection: p, last: '2026-10-14', today: '2026-10-15' });
    await fireEvent.click(screen.getByRole('button', { name: /^Comment c’est calculé/ }));
    expect(text(container.querySelector('.disclosure')!)).not.toMatch(/météo|normales/);
  });
});

it('in English: a late Linky says so', () => {
  applyLocale('en');
  const { container } = render(ProjectionPanel, { projection: null, last: '2026-10-11', today: '2026-10-15' });
  expect(screen.getByRole('heading', { name: 'Forecast' })).toBeInTheDocument();
  expect(text(container.querySelector('.note')!)).toBe('Linky readings are late (last day 11 October 2026): no forecast.');
});
it('in English: the month, the next 365 days, how it is calculated, the short month names', async () => {
  applyLocale('en');
  const { container } = render(ProjectionPanel, { projection, last: '2026-10-14', today: '2026-10-15' });
  const rows = [...container.querySelectorAll('.row')];
  expect(text(rows[0])).toBe('October 2026, full month ≈ €412.40 €268.20 measured so far · 3 missing days estimated');
  expect(text(rows[1])).toBe('Next 365 days ≈ €2,141 15/10/2026 – 14/10/2027');
  expect(text(container.querySelector('.spark-ends')!)).toBe('Oct 2026Sept 2027');
  await fireEvent.click(screen.getByText('How it’s calculated'));
  const d = text(container.querySelector('.disclosure')!);
  expect(d).toContain('Base: 20.00 kWh a day, the average of the recorded days among the 30 days up to 14/10 (at least 7)');
  expect(d).toContain('Average price €0.2437/kWh: prices of 14/10 weighted by your off-peak share over these 30 days');
});
