import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { applyLocale } from '$lib/i18n';
import type { EnergyInterval, RoomSample } from '$lib/api/types';
import RoomDayChart from './RoomDayChart.svelte';

const t0 = Date.UTC(2026, 9, 12, 22) / 1000; // 13 Oct 00:00 Paris
const iv = (i: number, room: number | null): EnergyInterval => ({
  ts: t0 + i * 1800, minutes: 30, wh: 500, w: 1000, offpeak: null, boundary: false, price: null, eur: null,
  radiators_wh: room, radiators_known: room == null ? 0 : 1, radiators_total: room == null ? 0 : 1, radiators_interp: false, radiators_apportioned: false,
  by_room: room == null ? {} : { salon: room }
});
const four = [iv(0, 100), iv(1, 0), iv(2, null), iv(3, 250)];
// Six 5-min samples in each of the first two half-hours; none after (a gap, never zero).
const samples: RoomSample[] = Array.from({ length: 12 }, (_, k) => ({
  ts: t0 + k * 300, temperature: k < 6 ? 19 : 19.5, setpoint: 20, working_rate: 40
}));
const props = { intervals: four, roomId: 'salon', samples, label: 'Salon le 13 octobre 2026' };

/** The readout as read on screen: the half-hour, then each field's visible value (and its reason). */
const seen = (c: HTMLElement) =>
  [
    c.querySelector('.readout .when dd')!.textContent,
    ...[...c.querySelectorAll('.readout .field')].map((f) =>
      [f.querySelector('dt')!, ...f.querySelectorAll('dd .cur > span')].map((e) => e.textContent).join(' ')
    )
  ]
    .join(' · ')
    .replace(/\s+/g, ' ');

describe('RoomDayChart', () => {
  it('names its three marks in a legend, and only when something was measured', () => {
    const { container, unmount } = render(RoomDayChart, props);
    expect([...container.querySelectorAll('.legend li')].map((l) => l.textContent)).toEqual(['Radiateurs de la pièce', 'Température', 'Consigne']);
    unmount();
    const empty = render(RoomDayChart, { ...props, intervals: [iv(0, null), iv(1, null)], samples: [] });
    expect(screen.getByText('Pas de relevé pour cette pièce ce jour-là.')).toBeInTheDocument();
    expect(empty.container.querySelector('.legend')).toBeNull();
  });

  it('draws the room’s radiator energy as bars, unknown half-hours as nothing, on two labelled axes', () => {
    const { container } = render(RoomDayChart, props);
    expect(container.querySelectorAll('rect.bar')).toHaveLength(2); // 100 and 250 Wh; 0 Wh draws nothing, null too
    expect(container.querySelector('rect.bar')!.getAttribute('style')).toContain('var(--series-3)');
    expect([...container.querySelectorAll('.units span')].map((s) => s.textContent)).toEqual(['Wh', '°C']);
    expect(container.querySelectorAll('text.tick-w').length).toBeGreaterThan(1);
    expect(container.querySelectorAll('text.tick-t').length).toBeGreaterThan(1);
    expect(container.querySelector('.room-axis .tick')?.textContent).toBe('00');
  });

  it('the temperature follows the heat ramp; the setpoint is a step line; both break where samples are missing', () => {
    const { container } = render(RoomDayChart, props);
    const temp = container.querySelector('path.temp')!;
    expect(temp.getAttribute('stroke')).toMatch(/^url\(#/);
    expect(container.querySelectorAll('linearGradient stop')).toHaveLength(3);
    expect(temp.getAttribute('d')!.match(/M/g)).toHaveLength(1);
    expect(container.querySelector('path.set')!.getAttribute('d')!.match(/M/g)).toHaveLength(1);
  });

  it('an isolated measured half-hour is drawn as a dot; the setpoint stays inside the plot', () => {
    // Samples only in the first half-hour and the third: two runs of one.
    const lone: RoomSample[] = [0, 1, 2, 3, 4, 5, 12, 13, 14, 15, 16, 17].map((k) => ({ ts: t0 + k * 300, temperature: 19, setpoint: 20, working_rate: 0 }));
    const { container } = render(RoomDayChart, { ...props, samples: lone });
    expect(container.querySelectorAll('circle.temp-dot')).toHaveLength(2);
    expect(container.querySelector('path.temp')).toBeNull();
    const ends = [...container.querySelector('path.set')!.getAttribute('d')!.matchAll(/H([\d.]+)/g)].map((m) => Number(m[1]));
    const w = Number(container.querySelector('svg')!.getAttribute('width'));
    expect(Math.max(...ends)).toBeLessThanOrEqual(w - 34);
  });

  it('draws no grid that would belong to one axis only', () => {
    const { container } = render(RoomDayChart, props);
    expect(container.querySelector('line.grid')).toBeNull();
  });

  it('scrubs by keyboard: the readout fields and the crosshair follow', async () => {
    const { container } = render(RoomDayChart, props);
    expect(container.querySelector('.readout .when')).toHaveTextContent('Survolez ou touchez le graphique');
    const s = screen.getByRole('slider', { name: 'Parcourir la journée de la pièce, demi-heure par demi-heure' });
    await fireEvent.keyDown(s, { key: 'ArrowRight' });
    expect(seen(container)).toBe('00:00–00:30 · Radiateurs 100 Wh · Température 19,0 °C · Consigne 20,0 °C');
    expect(s.getAttribute('aria-valuetext')!.replace(/\u00a0/g, ' ')).toBe('00:00–00:30, radiateurs 100 Wh, température 19,0 °C, consigne 20,0 °C');
    await fireEvent.keyDown(s, { key: 'End' });
    expect(seen(container)).toBe('01:30–02:00 · Radiateurs 250 Wh · Température — pas assez de relevés · Consigne — pas assez de relevés');
    expect(container.querySelector('line.cross')).not.toBeNull();
  });

  it('the readout never reflows: every field holds every text of the day, only the current one shown', async () => {
    const { container } = render(RoomDayChart, props);
    const counts = () => [...container.querySelectorAll('.readout .field')].map((f) => f.querySelectorAll('dd > .v').length);
    const before = counts();
    await fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowRight' });
    expect(counts()).toEqual(before);
    expect(before.every((n) => n > 1)).toBe(true);
    expect([...container.querySelectorAll('.readout .field')].every((f) => f.querySelectorAll('dd > .v.cur').length === 1)).toBe(true);
  });

  it('a room whose radiator has no figure reads « — » with the reason, never a partial sum', async () => {
    const held = [...four.slice(0, 3), { ...four[3], radiators_wh: null, radiators_known: 0, radiators_total: 1, by_room: { salon: null } }];
    const { container } = render(RoomDayChart, { ...props, intervals: held });
    await fireEvent.keyDown(screen.getByRole('slider'), { key: 'End' });
    expect(seen(container)).toContain('Radiateurs — radiateur sans relevé');
    expect(screen.getByRole('slider').getAttribute('aria-valuetext')).toContain('radiateurs — (radiateur sans relevé)');
    const last = container.querySelectorAll('.visually-hidden tbody tr')[3];
    expect(last.querySelector('td')).toHaveTextContent('— (radiateur sans relevé)');
    expect(container.querySelectorAll('rect.bar')).toHaveLength(1);
  });

  it('a half-hour before the room had a radiator says so', async () => {
    const { container } = render(RoomDayChart, props);
    const s = screen.getByRole('slider');
    await fireEvent.keyDown(s, { key: 'ArrowRight' });
    await fireEvent.keyDown(s, { key: 'ArrowRight' });
    await fireEvent.keyDown(s, { key: 'ArrowRight' });
    expect(seen(container)).toContain('Radiateurs — pas de radiateur relevé à cette heure');
  });

  it('starts on the shared half-hour it is given', () => {
    const { container } = render(RoomDayChart, { ...props, index: 1 });
    expect(seen(container)).toBe('00:30–01:00 · Radiateurs 0 Wh · Température 19,5 °C · Consigne 20,0 °C');
  });

  it('carries every value in its hidden table, « — » with the reason when missing', () => {
    const { container } = render(RoomDayChart, props);
    const table = container.querySelector('.visually-hidden > table')!;
    expect([...table.querySelectorAll('thead th')].map((t) => t.textContent)).toEqual(['Heure', 'Radiateurs de la pièce', 'Température', 'Consigne']);
    expect([...table.querySelectorAll('tbody tr')[2].querySelectorAll('td')].map((t) => t.textContent)).toEqual([
      '— (pas de radiateur relevé à cette heure)',
      '— (pas assez de relevés)',
      '— (pas assez de relevés)'
    ]);
  });

  it('a room with nothing measured that day says so', () => {
    render(RoomDayChart, { ...props, intervals: four.map((x) => ({ ...x, by_room: {} })), samples: [] });
    expect(screen.getByText('Pas de relevé pour cette pièce ce jour-là.')).toBeInTheDocument();
  });
});

it('in English: the legend and the readout’s field names', () => {
  applyLocale('en');
  const { container } = render(RoomDayChart, props);
  expect([...container.querySelectorAll('.legend li')].map((l) => l.textContent)).toEqual(['The room’s radiators', 'Temperature', 'Setpoint']);
  expect([...container.querySelectorAll('.readout .field dt')].map((d) => d.textContent)).toEqual(['Radiators', 'Temperature', 'Setpoint']);
  expect(container.querySelector('.readout')!.textContent).toContain('no radiator recorded at this time');
});
