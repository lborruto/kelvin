import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import HeatingPanel from './HeatingPanel.svelte';

const rad = { kwh: 268.4, hc_kwh: 110, hp_kwh: 158.4, eur: 61.02, interpolated: false, apportioned: false, coverage: 1 };
const text = (c: HTMLElement) => c.textContent!.replace(/\s+/g, ' ');

describe('HeatingPanel', () => {
  it('the radiators’ share over the common days, with their count, and the heating cost', () => {
    const { container } = render(HeatingPanel, {
      heating: { value: 0.651, days: 11, of_days: 13, since: '2026-10-03', inconsistent: false },
      radiators: { ...rad, interpolated: true },
      restKwh: null
    });
    const t = text(container);
    expect(t).toContain('65 % de la consommation de la maison vient des radiateurs (11 jours sur 13).');
    expect(container.querySelector<HTMLElement>('.meter .rad')!.style.transform).toBe('scaleX(0.651)');
    expect(t).not.toContain('reste');
    expect(t).toContain('Coût du chauffage ≈ 61,02 € (énergie, hors abonnement)');
    expect(container.querySelector('.cost .est')).toHaveTextContent('est.');
  });

  it('gives the two parts in kWh when every day is covered', () => {
    const { container } = render(HeatingPanel, {
      heating: { value: 0.6505, days: 13, of_days: 13, since: '2026-10-01', inconsistent: false },
      radiators: rad,
      restKwh: 144.2
    });
    expect(text(container)).toContain('268,40 kWh radiateurs · 144,20 kWh reste');
    expect(text(container)).not.toContain('jours sur');
  });

  it('L7: radiators above the meter read « — » with the reason', () => {
    const { container } = render(HeatingPanel, {
      heating: { value: 1.08, days: 5, of_days: 5, since: '2026-10-01', inconsistent: true },
      radiators: rad,
      restKwh: null
    });
    expect(container.querySelector('.share')).toHaveTextContent('—');
    expect(screen.getByText('Les radiateurs dépassent le compteur : données incohérentes.')).toBeInTheDocument();
    expect(container.querySelector('.meter')).toBeNull();
  });

  it('no common day reads « — »', () => {
    render(HeatingPanel, { heating: { value: null, days: 0, of_days: 4, since: null, inconsistent: false }, radiators: null, restKwh: null });
    expect(screen.getByText('Aucun jour couvert à la fois par le Linky et par tous les radiateurs.')).toBeInTheDocument();
    // No radiator figure at all: the cost reads « — » and says why, never 0 €.
    expect(screen.getByText(/Coût du chauffage —/)).toHaveTextContent('Coût du chauffage — (aucun relevé de radiateur sur la période)');
  });

  it('a partial radiator sum says how much of the period it covers', () => {
    const { container } = render(HeatingPanel, {
      heating: { value: 0.6, days: 10, of_days: 13, since: '2026-10-01', inconsistent: false },
      radiators: { ...rad, coverage: 0.75 },
      restKwh: null
    });
    expect(text(container)).toContain('Radiateurs mesurés sur 75,0 % des jours (jusqu’à hier) : somme partielle.');
    // No radiator-day measured whole (a held reading): never « 0,0 % des jours » next to a cost.
    const none = render(HeatingPanel, {
      heating: { value: null, days: 0, of_days: 1, since: null, inconsistent: false },
      radiators: { ...rad, coverage: 0 },
      restKwh: null
    });
    expect(text(none.container)).toContain('Aucun jour de radiateur mesuré en entier (jusqu’à hier) : somme partielle.');
  });

  it('a running period says its radiators count up to yesterday', () => {
    const { container } = render(HeatingPanel, {
      heating: { value: 0.6, days: 13, of_days: 13, since: '2026-10-01', inconsistent: false },
      radiators: rad,
      restKwh: null,
      running: true
    });
    expect(text(container)).toContain('Période en cours : radiateurs comptés jusqu’à hier.');
  });

  it('without a tariff the cost reads « — » and says why', () => {
    render(HeatingPanel, {
      heating: { value: 0.6, days: 13, of_days: 13, since: '2026-10-01', inconsistent: false },
      radiators: { ...rad, eur: null, hc_kwh: null, hp_kwh: null },
      restKwh: null
    });
    expect(screen.getByText(/Coût du chauffage —/)).toHaveTextContent('Coût du chauffage — (pas de tarif renseigné)');
  });
});
