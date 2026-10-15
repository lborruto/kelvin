import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import type { EnergyDay } from '$lib/api/types';
import { parisDayStart } from '$lib/time';
import PowerPanel from './PowerPanel.svelte';

const a = parisDayStart('2026-10-13') / 1000;
const day = (o: Partial<EnergyDay> = {}): EnergyDay => ({
  date: '2026-10-13', complete: true, points: 48,
  intervals: Array.from({ length: 48 }, (_, i) => ({
    ts: a + i * 1800, minutes: 30, wh: 500, w: 1000, offpeak: 1, boundary: false, price: 0.25, eur: 0.125,
    radiators_wh: null, radiators_known: 0, radiators_total: 0, radiators_interp: false, radiators_apportioned: false, by_room: {}
  })),
  totals: { curve_kwh: 24, daily_kwh: 24, hc_kwh: 8, hp_kwh: 16, split_method: 'curve', hc_kwh_curve: 8, hp_kwh_curve: 16 },
  power: { peak_w: 6840, peak_ts: a + 19 * 3600, base_w_p10: 310, night_min_w: 280, kva: 12 },
  available: [], counted_from: null, not_counted: null, room: null, ...o
});
const text = (c: HTMLElement) => c.textContent!.replace(/\s+/g, ' ');
const week = { complete_days: 6, kwh: 140, peak_w: 7200, peak_ts: a + 19 * 3600, base_w_p10: 300, night_min_w: 250 };

describe('PowerPanel', () => {
  it('a complete day: the peak and its time, the subscribed power, the base load in kWh and €', () => {
    const { container } = render(PowerPanel, { view: 'day', day: day(), week: null });
    expect(screen.getByRole('heading', { name: 'Puissance' })).toBeInTheDocument();
    const t = text(container);
    expect(t).toContain('Pointe moyenne sur 30 min 6,84 kW 19:00–19:30');
    expect(t).toContain('la pointe instantanée peut être plus élevée');
    expect(t).toContain('abonnement 12 kVA');
    expect(t).toContain('57 % de la puissance souscrite (moyenne 30 min)');
    expect(t).toContain('kVA ≈ kW, facteur de puissance supposé 1');
    expect(t).toContain('Talon (veille) 310 W');
    expect(t).toContain('minimum de nuit (00:00–06:00) : 280 W');
    expect(t).toContain('10 % des demi-heures sont sous 310 W');
    expect(t).toContain('consommation de fond ≈ 7,44 kWh (≈ 1,86 €)');
    expect(container.querySelector<HTMLElement>('.meter span')!.style.transform).toBe('scaleX(0.57)');
  });

  it('an incomplete day reads « — » and says why', () => {
    const { container } = render(PowerPanel, { view: 'day', day: day({ complete: false }), week: null });
    expect(text(container)).toContain('Pointe moyenne sur 30 min —');
    expect(text(container)).toContain('Talon (veille) —');
    expect(screen.getByText('Pas de courbe complète ce jour-là.')).toBeInTheDocument();
    expect(container.querySelector('.meter')).toBeNull();
  });

  it('a week: the same figures from the period’s complete curve days, with the day of the peak', () => {
    const { container } = render(PowerPanel, { view: 'week', day: day(), week });
    const t = text(container);
    expect(t).toContain('Pointe moyenne sur 30 min 7,20 kW mardi 13 octobre, 19:00–19:30');
    expect(t).toContain('consommation de fond ≈ 7,20 kWh par jour');
    expect(t).toContain('sur 6 jours de courbe complète');
  });

  it('holds its shape while the day loads, never a « — » that is only pending', () => {
    const { container } = render(PowerPanel, { view: 'day', day: null, week: null });
    expect(container.querySelector('section')).toHaveAttribute('aria-busy', 'true');
    expect(container.querySelector('.skeleton')).not.toBeNull();
    expect(text(container)).not.toContain('—');
    // A week's figures come from the report: only the subscribed power waits on the day.
    const w = render(PowerPanel, { view: 'week', day: null, week });
    expect(text(w.container)).toContain('Pointe moyenne sur 30 min 7,20 kW');
    expect(w.container.querySelector('.skeleton')).not.toBeNull();
  });

  it('the day’s skeleton is a complete day’s own lines, so it wraps (and stands as tall) as the figures will', () => {
    const shape = (c: HTMLElement) => [...c.querySelectorAll('section > *:not(h2), .ghost > *')].filter((e) => !e.classList.contains('ghost')).map((e) => `${e.tagName}.${[...e.classList].filter((k) => ['figs', 'base', 'line', 'note', 'meter'].includes(k)).join('.')}`);
    const sk = render(PowerPanel, { view: 'day', day: null, week: null });
    const ghost = sk.container.querySelector('.ghost')!;
    expect(ghost).toHaveAttribute('aria-hidden', 'true');
    expect(ghost.querySelectorAll('.skeleton').length).toBeGreaterThan(5);
    const skShape = shape(sk.container);
    sk.unmount();
    const loaded = render(PowerPanel, { view: 'day', day: day(), week: null });
    expect(skShape).toEqual(shape(loaded.container));
  });

  it('a day that failed to load reads « — » and says so', () => {
    const { container } = render(PowerPanel, { view: 'day', day: null, week: null, failed: true });
    expect(text(container)).toContain('Pointe moyenne sur 30 min —');
    expect(screen.getByText('Courbe du jour indisponible.')).toBeInTheDocument();
    expect(container.querySelector('.skeleton')).toBeNull();
  });
});
