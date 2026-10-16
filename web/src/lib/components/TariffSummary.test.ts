import { render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import type { Tariff } from '$lib/api/types';
import { applyLocale } from '$lib/i18n';
import TariffSummary from './TariffSummary.svelte';

const ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const NIGHT = [{ start: '22:00', end: '06:00' }];
const base = (option: 'base' | 'hchp' | 'tempo', rates: Record<string, number>, schedules = [{ valid_from: '2025-01-15', variants: [{ months: ALL, slots: NIGHT }] }]): Tariff => ({
  option, kva: 9, hc_slots: NIGHT, hc_schedules: schedules,
  tempo_hours: { hc_start: '22:00', hc_end: '06:00', day_start: '06:00' },
  prices: [{ valid_from: '2025-01-15', option, subscription_eur_month: 15, rates }]
});
const TODAY = '2026-10-15';
afterEach(() => applyLocale('fr'));

describe('TariffSummary', () => {
  it('HC/HP: option, power, subscription, both prices with their swatches, the hours on a bar with the words', () => {
    const { container } = render(TariffSummary, { tariff: base('hchp', { hc: 0.2, hp: 0.27 }), today: TODAY });
    expect(container.querySelector('input, select')).toBeNull(); // a fact, not a form
    expect(screen.getByText('Heures creuses / pleines')).toBeInTheDocument();
    expect(screen.getByText(/^9\skVA$/)).toBeInTheDocument();
    expect(screen.getByText(/^15,00\s€\/mois$/)).toBeInTheDocument();
    expect(screen.getByText(/^0,2000\s€\/kWh$/)).toBeInTheDocument();
    expect(screen.getByText(/^0,2700\s€\/kWh$/)).toBeInTheDocument();
    expect(container.querySelectorAll('.sw[data-series="hc"]')).toHaveLength(1);
    expect(container.querySelectorAll('.sw[data-series="hp"]')).toHaveLength(1);
    expect(screen.getByText('22:00–06:00')).toBeInTheDocument();
    const bar = screen.getByRole('img', { name: /^Heures creuses\s: 22:00–06:00$/ });
    expect(bar.querySelectorAll('.hc')).toHaveLength(2); // past midnight: two blocks
  });
  it('Base: one price, no hours', () => {
    render(TariffSummary, { tariff: base('base', { base: 0.2516 }), today: TODAY });
    expect(screen.getByText('Prix du kWh')).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
  });
  it('Tempo: a 3 × 2 grid named by colour and hour, and the Tempo hours', () => {
    const tariff = base('tempo', { blue_hc: 0.1296, blue_hp: 0.1609, white_hc: 0.1486, white_hp: 0.1894, red_hc: 0.1568, red_hp: 0.7562 });
    const { container } = render(TariffSummary, { tariff, today: TODAY });
    const table = screen.getByRole('table', { name: 'Prix Tempo (€/kWh)' });
    const red = within(table).getByRole('row', { name: /Rouge/ });
    expect(red).toHaveTextContent('0,1568');
    expect(red).toHaveTextContent('0,7562');
    expect(container.querySelectorAll('.dot')).toHaveLength(3); // TempoDot for the colour
    expect(screen.getByRole('img', { name: /22:00–06:00/ })).toBeInTheDocument();
  });
  it('seasonal: one bar per season with its months', () => {
    const tariff = base('hchp', { hc: 0.2, hp: 0.27 }, [
      { valid_from: '2025-01-15', variants: [{ months: [11, 12, 1, 2, 3], slots: NIGHT }, { months: [4, 5, 6, 7, 8, 9, 10], slots: [{ start: '01:00', end: '07:00' }] }] }
    ]);
    render(TariffSummary, { tariff, today: TODAY });
    expect(screen.getAllByRole('img')).toHaveLength(2);
    expect(screen.getByText(/nov\./)).toBeInTheDocument();
  });
  it('pulses the changed rows', () => {
    const { container } = render(TariffSummary, { tariff: base('hchp', { hc: 0.2, hp: 0.27 }), today: TODAY, changed: new Set(['hc']) });
    expect(container.querySelectorAll('.pulse')).toHaveLength(1);
  });
  it('in English: never HC/HP', () => {
    applyLocale('en');
    render(TariffSummary, { tariff: base('hchp', { hc: 0.2, hp: 0.27 }), today: TODAY });
    expect(screen.getByText('Off-peak / peak')).toBeInTheDocument();
    expect(screen.getByText('Off-peak')).toBeInTheDocument();
    expect(screen.getByText('Peak')).toBeInTheDocument();
    expect(screen.getByText(/^€15\.00\/month$/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\bHC\b|\bHP\b/);
  });
});
