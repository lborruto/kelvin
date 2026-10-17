// Énergie's Résumé: the outdoor line (Plan 14). Only the fields the Résumé reads.
import { render } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import type { EnergyReport, EnergySummary, Outdoor } from '$lib/api/types';
import { applyLocale } from '$lib/i18n';
import EnergyHero from './EnergyHero.svelte';

vi.mock('$lib/today.svelte', () => ({ today: { iso: '2026-11-20' } }));

const summary = (o: Partial<EnergySummary> = {}): EnergySummary => ({
  kwh: 310.4, hc_kwh: 120.2, hp_kwh: 190.2, radiators_kwh: null, energy_eur: 70.1, subscription_eur: 15, eur: 85.1,
  days: 30, missing_days: 0, estimated_split: false, split_method: 'curve', prices: [], retro_priced: false, present_days: 30, curve: null,
  radiators: null, rest_kwh: null, tempo: null, by_rate: null, missing_colour_days: 0, retro_scheduled: false, ...o
});
const report = (outdoor?: Outdoor | null) =>
  ({
    group: 'day', linky: true, tariff: true, last_day: '2026-10-31', from: '2026-10-01', to: '2026-11-01',
    period: { from: '2026-10-01', to: '2026-11-01', quality: { estimated_days: 0 }, ...summary(outdoor === undefined ? {} : { outdoor }) },
    comparison: { basis: 'unit', previous: null, last_year: null, avg4: null },
    quality: { radiators_since: null },
    heating: { value: null, days: 0, of_days: 0, since: null, inconsistent: false },
    option: 'base',
    hc_lens: null,
    buckets: [],
    projection: null
  }) as unknown as EnergyReport;
const OUT = { mean_c: 7.94, min_c: -1.2, max_c: 16.3, dju: 312.04, days: 31, of: 31 };

describe('EnergyHero: the outdoor line (Plan 14)', () => {
  it('one muted line « Dehors : moy. 7,9 °C · 312,0 DJU » for the selected period', () => {
    const { container } = render(EnergyHero, { report: report(OUT), view: 'month', last: '2026-10-31' });
    const line = container.querySelector('.outdoor')!;
    expect(line.textContent!.replace(/\s/g, ' ')).toBe('Dehors : moy. 7,9 °C · 312,0 DJU');
    expect(line).toHaveClass('muted');
  });
  it('a partial period: the mean without the degree days; no weather for it: says so', () => {
    const partial = render(EnergyHero, { report: report({ ...OUT, dju: null, days: 12, of: 31 }), view: 'month', last: '2026-10-31' });
    expect(partial.container.querySelector('.outdoor')!.textContent!.replace(/\s/g, ' ')).toBe('Dehors : moy. 7,9 °C');
    partial.unmount();
    const none = render(EnergyHero, { report: report({ ...OUT, mean_c: null, dju: null, days: 0 }), view: 'month', last: '2026-10-31' });
    expect(none.container.querySelector('.outdoor')!.textContent!.replace(/\s/g, ' ')).toBe('Dehors : — (pas de météo pour cette période)');
  });
  it('without a weather place (null, or an older backend): nothing', () => {
    expect(render(EnergyHero, { report: report(null), view: 'month', last: '2026-10-31' }).container.querySelector('.outdoor')).toBeNull();
    expect(render(EnergyHero, { report: report(), view: 'month', last: '2026-10-31' }).container.querySelector('.outdoor')).toBeNull();
  });
  it('in English', () => {
    applyLocale('en');
    const { container } = render(EnergyHero, { report: report(OUT), view: 'month', last: '2026-10-31' });
    expect(container.querySelector('.outdoor')!.textContent!.replace(/\s/g, ' ')).toBe('Outside: avg. 7.9 °C · 312.0 HDD');
    applyLocale('fr');
  });
});
