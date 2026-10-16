// The Énergie « Tableau » board widgets (spec §4 Énergie): presentation over figures the page already has.
import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ByRadiator, EnergyDay, Heating } from '$lib/api/types';
import type { Inspection } from '$lib/inspector';
import { roomEnergy } from '$lib/roomEnergy';
import { house } from '$lib/stores/house.svelte';
import CurveMini from './CurveMini.svelte';
import EnergyBars from './EnergyBars.svelte';
import EnergyMonths from './EnergyMonths.svelte';
import HcHpPanel from './HcHpPanel.svelte';
import WhereTop from './WhereTop.svelte';

const media = vi.hoisted(() => ({ desktop: { matches: true } }));
vi.mock('$lib/media.svelte', () => media);

const text = (c: Element) => c.textContent!.replace(/\s+/g, ' ').trim();
const ins = (rows: Inspection['rows']): Inspection => ({ title: 't', rows, notes: [], empty: null, spoken: 's' });
const row = (id: string, room: string, kwh: number | null, eur: number | null, o: Partial<ByRadiator> = {}): ByRadiator => ({
  radiator_id: id, room_id: room, kwh, hc_kwh: kwh == null ? null : kwh * 0.4, hp_kwh: kwh == null ? null : kwh * 0.6, eur, coverage: 1,
  interpolated: false, apportioned: false, from: '2026-09-01', temp_avg: 19, setpoint_avg: 20, heating_hours: 3, ...o
});
const heating: Heating = { value: 0.634, days: 12, of_days: 12, since: '2026-10-01', inconsistent: false };
const span = { from: '2026-10-01', to: '2026-10-13' };

beforeEach(() => {
  house.applySnapshot({
    house: {
      rooms: [
        { id: 's', name: 'Salon', radiator_ids: ['a'] }, { id: 'c1', name: 'Chambre 1', radiator_ids: ['b'] },
        { id: 'c2', name: 'Chambre 2', radiator_ids: ['c'] }, { id: 'b', name: 'Bureau', radiator_ids: ['d'] }
      ] as never,
      radiators: [
        { id: 'a', room_id: 's', name: 'A', energy_wh: null }, { id: 'b', room_id: 'c1', name: 'B', energy_wh: null },
        { id: 'c', room_id: 'c2', name: 'C', energy_wh: null }, { id: 'd', room_id: 'b', name: 'D', energy_wh: null }
      ] as never
    },
    pending: [], overrides: [], status: { connected: true, last_ok_at: null, last_error: null }
  });
});

describe('WhereTop', () => {
  const rows = [row('a', 's', 141.2, 34.81), row('b', 'c1', 46.3, 11.42), row('c', 'c2', 39, 9.62), row('d', 'b', 12, 3.1)];
  it('the heating share, then the top three rooms by kWh with the very figures of the full section, and « Tout voir »', () => {
    const { container } = render(WhereTop, { heating, linky: true, rows, span, tariff: true });
    expect(container.querySelector('.share')).toHaveTextContent(/^63\s%\svient des radiateurs$/);
    const items = [...container.querySelectorAll('.rooms li')];
    expect(items.map((l) => l.querySelector('.n')!.textContent)).toEqual(['Salon', 'Chambre 1', 'Chambre 2']);
    // Same share and matched kWh as roomEnergy (what « Où part l’énergie » shows).
    const full = roomEnergy(rows, house.rooms, house.radiators, span).find((r) => r.id === 's')!;
    expect(text(items[0])).toBe(`Salon 141,20 kWh · 34,81 € ${full.share}`.replace(/\s+/g, " "));
    expect(screen.getByRole('link', { name: 'Tout voir' })).toHaveAttribute('href', '#energy-where');
  });
  it('without Linky: rooms only; without a tariff: no €; a partial room says so', () => {
    const { container } = render(WhereTop, { heating, linky: false, rows: [row('a', 's', 10, null, { coverage: 0.5 })], span, tariff: false });
    expect(container.querySelector('.share')).toBeNull();
    expect(container.textContent).not.toContain('€');
    expect(container.querySelector('.rooms li')).toHaveTextContent('partiel');
  });
});

describe('EnergyBars on the board', () => {
  const groups = ['1/10', '2/10', '3/10'].map((label, i) => ({ label, parts: [{ key: 'home', value: 10 + i }] }));
  const base = { groups, colors: { home: 'var(--series-1)' }, unit: 'kWh', label: 'Consommation' };
  it('takes its height, and draws Tempo dots only when given (unknown dashed, none where undefined)', () => {
    const { container } = render(EnergyBars, { ...base, height: 300, tempo: ['blue', null, undefined] });
    expect(container.querySelector('svg')).toHaveAttribute('height', '300');
    const dots = [...container.querySelectorAll('.dots .dot')].map((d) => [...d.classList].filter((c) => !c.startsWith('svelte-')).join(' '));
    expect(dots).toEqual(['dot blue', 'dot unknown']);
  });
  it('no dots without `tempo`; a ghost is a dashed outline that raises the scale to the estimate', () => {
    const { container } = render(EnergyBars, { ...base, ghost: { index: 2, value: 40 } });
    expect(container.querySelector('.dots')).toBeNull();
    const g = container.querySelector('rect.ghost')!;
    expect(g).not.toBeNull();
    // The estimate (40) is the top of the scale: its outline reaches above every measured bar.
    const tops = [...container.querySelectorAll('rect.part')].map((r) => Number(r.getAttribute('y')));
    expect(Number(g.getAttribute('y'))).toBeLessThan(Math.min(...tops));
  });
});

describe('HcHpPanel ring', () => {
  it('the ring’s words are the period’s HC and HP, matched to the total kWh', () => {
    const { container } = render(HcHpPanel, {
      lens: { hc_share: 0.335, slot_share: 0.333, avg_price: 0.25, delta_price: 0.07 }, tariff: true, option: 'hchp',
      kwh: 359.5, hcKwh: 120.44, hpKwh: 239.06
    });
    expect(container.querySelector('svg.donut')).toHaveAttribute('aria-hidden', 'true');
    expect(text(container.querySelector('.rw')!)).toBe('Heures creuses 120,4 kWh Heures pleines 239,1 kWh');
  });
});

describe('CurveMini', () => {
  const day: EnergyDay = {
    date: '2026-10-12', complete: true, points: 2,
    intervals: [
      { ts: 0, minutes: 30, wh: 400, w: 800, offpeak: 1, tempo_colour: null, boundary: false, price: 0.2, eur: 0.08 },
      { ts: 1800, minutes: 30, wh: 300, w: 600, offpeak: 0, tempo_colour: null, boundary: false, price: 0.3, eur: 0.09 }
    ] as never,
    totals: { curve_kwh: 0.7, daily_kwh: 22.03, hc_kwh: 8.98, hp_kwh: 13.05, split_method: 'curve', hc_kwh_curve: null, hp_kwh_curve: null },
    power: { peak_w: 800, peak_ts: 0, base_w_p10: null, night_min_w: null, kva: 9 },
    available: [], counted_from: null, not_counted: null, room: null
  };
  it('the day’s figures are the bar’s (readDay), the half-hours cut at their off-peak share; the link opens the Courbe', async () => {
    const onopen = vi.fn();
    const bar = ins([{ key: 'home', label: 'Maison', value: '22,03 kWh' }, { key: 'cost', label: 'Coût estimé', value: '6,10 €' }]);
    const { container } = render(CurveMini, { dayIso: '2026-10-12', day, split: true, bar, onopen });
    expect(screen.getByRole('heading', { name: 'Courbe du 12 octobre 2026' })).toBeInTheDocument();
    expect(container.querySelector('.line')).toHaveTextContent(/^22,03\skWh · 6,10\s€ · pointe 800\sW à \d\d:\d\d$/);
    expect(container.querySelectorAll('.seg.hc')).toHaveLength(2);
    expect(screen.getByRole('img', { name: 'Aperçu de la courbe du 12 octobre 2026' })).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'par demi-heure' }));
    expect(onopen).toHaveBeenCalledOnce();
  });
  it('another day still on screen is never drawn under this heading; an empty day says so', () => {
    const { container, rerender } = render(CurveMini, { dayIso: '2026-10-11', day, split: true, onopen: () => {} });
    expect(container.querySelector('.skeleton')).not.toBeNull();
    rerender({ dayIso: '2026-10-12', day: { ...day, points: 0, intervals: [] }, split: true, onopen: () => {} });
    expect(screen.getByText('Pas de courbe pour ce jour.')).toBeInTheDocument();
  });
});

describe('EnergyMonths', () => {
  it('one row per month with its bar’s kWh and € (« est. » kept), « au 12/10 » on the running month, a row opens it', async () => {
    const onopen = vi.fn();
    const details = [
      ins([{ key: 'home', label: 'Maison', value: '1 269,01 kWh' }, { key: 'cost', label: 'Coût', value: '340,86 €', est: true }]),
      ins([{ key: 'home', label: 'Maison', value: '120,00 kWh' }, { key: 'cost', label: 'Coût', value: '30,00 €' }])
    ];
    const { container } = render(EnergyMonths, { keys: ['2026-09', '2026-10'], details, last: '2026-10-12', onopen });
    const rows = [...container.querySelectorAll('li')];
    expect(text(rows[0])).toBe('Septembre 2026 1 269,01 kWh 340,86 € est.');
    expect(text(rows[1])).toBe('Octobre 2026 au 12/10 120,00 kWh 30,00 €');
    await fireEvent.click(rows[1].querySelector('button')!);
    expect(onopen).toHaveBeenCalledWith(1);
  });
});
