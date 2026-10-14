import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import type { EnergyInterval } from '$lib/api/types';
import { parisDayStart } from '$lib/time';
import CurveChart from './CurveChart.svelte';

const NB = '\u00a0';
const t0 = Date.UTC(2026, 9, 12, 22) / 1000; // 13 Oct 00:00 Paris
const iv = (ts: number, wh: number, offpeak: number | null, o: Partial<EnergyInterval> = {}): EnergyInterval => ({
  ts, minutes: 30, wh, w: wh * 2, offpeak, boundary: false, price: offpeak == null ? null : 0.25, eur: offpeak == null ? null : (wh / 1000) * 0.25,
  radiators_wh: null, radiators_known: 0, radiators_total: 0, radiators_interp: false, radiators_apportioned: false, by_room: {}, ...o
});
const four = [iv(t0, 1500, 1), iv(t0 + 1800, 300, 0), iv(t0 + 3600, 600, 0.5), iv(t0 + 5400, 200, 1)];

describe('CurveChart', () => {
  it('splits each half hour into HC (series-1) and HP (series-2), without <title> tooltips', () => {
    const { container } = render(CurveChart, { intervals: four, label: 'Courbe' });
    expect(container.querySelectorAll('rect.hc')).toHaveLength(3);
    expect(container.querySelectorAll('rect.hp')).toHaveLength(2);
    expect(container.querySelector('rect.hc')!.getAttribute('style')).toContain('var(--series-1)');
    expect(container.querySelector('rect.hp')!.getAttribute('style')).toContain('var(--series-2)');
    expect(container.querySelector('title')).toBeNull();
    expect(container.querySelector('svg')).toHaveAttribute('aria-label', 'Courbe');
    expect(container.querySelector('.curve-axis .curve-tick')?.textContent).toBe('00');
    const table = container.querySelector('.visually-hidden > table')!;
    expect([...table.querySelectorAll('thead th')].map((t) => t.textContent)).toEqual([
      'Heure', 'Puissance moyenne', 'Énergie', 'Tarif', 'Prix', 'Coût'
    ]);
    expect(table.querySelectorAll('tbody tr')).toHaveLength(4);
    expect(table.querySelector('tbody th')?.textContent).toBe('00:00–00:30');
    expect(table.querySelector('tbody td:nth-of-type(2)')?.textContent).toBe(`1\u202f500${NB}Wh`);
  });

  it('without a tariff, draws one series and claims no HC/HP split', () => {
    const plain = four.map((p) => ({ ...p, offpeak: null, price: null, eur: null }));
    const { container } = render(CurveChart, { intervals: plain, label: 'Courbe', split: false });
    expect(container.querySelectorAll('rect.hc, rect.hp')).toHaveLength(0);
    expect(container.querySelectorAll('rect.all')).toHaveLength(4);
    expect([...container.querySelectorAll('table thead th')].map((t) => t.textContent)).toEqual(['Heure', 'Puissance moyenne', 'Énergie']);
  });

  it('has an empty state', () => {
    const { getByText } = render(CurveChart, { intervals: [], label: 'x' });
    expect(getByText('Pas de courbe pour ce jour.')).toBeInTheDocument();
  });

  it('scrubs by keyboard: the readout row and the crosshair follow', async () => {
    const { container } = render(CurveChart, { intervals: four, label: 'Courbe' });
    const s = screen.getByRole('slider', { name: 'Parcourir la courbe, demi-heure par demi-heure' });
    expect(container.querySelector('.readout .when')).toHaveTextContent('Survolez ou touchez la courbe');
    expect([...container.querySelectorAll('.readout .field dd')].every((d) => d.textContent === '—')).toBe(true);
    expect(container.querySelector('line.cross')).toBeNull();
    await fireEvent.keyDown(s, { key: 'ArrowRight' });
    expect(container.querySelector('.readout .when')).toHaveTextContent('00:00–00:30');
    expect(s.getAttribute('aria-valuetext')).toBe(`00:00–00:30, 3,00${NB}kW, 1\u202f500${NB}Wh`);
    const fields = Object.fromEntries(
      [...container.querySelectorAll('.readout .field')].map((f) => [f.querySelector('dt')!.textContent, f.querySelector('dd')!.textContent])
    );
    expect(fields).toEqual({
      'Puissance moyenne': `3,00${NB}kW`, Énergie: `1\u202f500${NB}Wh`, Tarif: 'Heures creuses', Prix: `0,2500${NB}€/kWh`, Coût: `0,375${NB}€`
    });
    expect(container.querySelector('line.cross')).not.toBeNull();
    await fireEvent.keyDown(s, { key: 'End' });
    expect(container.querySelector('.readout .when')).toHaveTextContent('01:30–02:00');
    await fireEvent.keyDown(s, { key: 'Escape' });
    expect(container.querySelector('line.cross')).toBeNull();
  });

  it('draws the radiators as a step line and the subscribed power when it fits; an unknown sum says why', async () => {
    // Half-hour 1: one of the two radiators has no figure, so the sum is unknown (never a partial sum).
    const withRad = four.map((p, i) => ({ ...p, radiators_wh: i === 1 ? null : 100 * (i + 1), radiators_known: i === 1 ? 1 : 2, radiators_total: 2 }));
    const { container } = render(CurveChart, { intervals: withRad, label: 'Courbe', kva: 3 });
    const d = container.querySelector('path.rad')!.getAttribute('d')!;
    expect(d.match(/M/g)).toHaveLength(2); // the unknown half-hour breaks the line, never drops to zero
    expect(container.querySelector('path.rad')!.getAttribute('style')).toContain('var(--series-3)');
    expect(container.querySelector('line.kva')).not.toBeNull(); // 3 kVA = 1 500 Wh per half-hour, within 2× the data
    expect(container.querySelector('.kva-note')).toBeNull();
    expect([...container.querySelectorAll('table thead th')].map((t) => t.textContent)).toContain('Radiateurs');
    const s = screen.getByRole('slider');
    await fireEvent.keyDown(s, { key: 'ArrowRight' });
    await fireEvent.keyDown(s, { key: 'ArrowRight' });
    const rad = [...container.querySelectorAll('.readout .field')].find((f) => f.querySelector('dt')!.textContent === 'Radiateurs')!;
    expect(rad.querySelector('dd')).toHaveTextContent('—');
    expect(rad.querySelector('.why')).toHaveTextContent('1 sur 2 radiateurs mesurés');
  });

  it('reserves the reason line on the fields that can have one, so scrubbing never reflows (R2)', async () => {
    const withRad = four.map((p, i) => ({ ...p, radiators_wh: i === 1 ? null : 100, radiators_known: i === 1 ? 1 : 2, radiators_total: 2 }));
    const { container } = render(CurveChart, { intervals: withRad, label: 'Courbe' });
    const why = () =>
      [...container.querySelectorAll('.readout .field')].map((f) => [f.querySelector('dt')!.textContent, f.querySelector('.why')?.textContent ?? null]);
    const idle = why();
    expect(idle.filter(([, w]) => w != null)).toEqual([['Radiateurs', '']]);
    const s = screen.getByRole('slider');
    await fireEvent.keyDown(s, { key: 'ArrowRight' });
    expect(why()).toEqual(idle);
    await fireEvent.keyDown(s, { key: 'ArrowRight' });
    expect(why().find(([k]) => k === 'Radiateurs')![1]).toBe('1 sur 2 radiateurs mesurés');
  });

  it('sizes every field for the longest text of its day, never for the scrubbed half-hour (R2)', async () => {
    const width = (c: Element, label: string) => {
      const f = [...c.querySelectorAll<HTMLElement>('.readout .field')].find((x) => x.querySelector('dt')!.textContent === label)!;
      return parseFloat(f.style.width.replace('min(100%, ', ''));
    };
    const withRad = four.map((p, i) => ({ ...p, radiators_wh: i === 1 ? null : 100, radiators_known: i === 1 ? 10 : 12, radiators_total: 12 }));
    const { container } = render(CurveChart, { intervals: withRad, label: 'Courbe' });
    // « 10 sur 12 radiateurs mesurés »: 28 characters at 11 px fit on the field's one reserved line.
    expect(width(container, 'Radiateurs')).toBeGreaterThanOrEqual(28 * 11 * 0.6);
    expect(width(container, 'Énergie')).toBeLessThan(width(container, 'Radiateurs'));
    const before = [...container.querySelectorAll<HTMLElement>('.readout .field')].map((f) => f.style.width);
    const s = screen.getByRole('slider');
    await fireEvent.keyDown(s, { key: 'ArrowRight' });
    await fireEvent.keyDown(s, { key: 'ArrowRight' });
    expect([...container.querySelectorAll<HTMLElement>('.readout .field')].map((f) => f.style.width)).toEqual(before);
  });

  it('an estimated value reserves the whole « est. » beside it (4 px gap and 4 characters at 12 px), not a scaled-down share', () => {
    const width = (c: Element, label: string) => {
      const f = [...c.querySelectorAll<HTMLElement>('.readout .field')].find((x) => x.querySelector('dt')!.textContent === label)!;
      return parseFloat(f.style.width.replace('min(100%, ', ''));
    };
    // « 110 Wh est. » measured 75 px in Chromium's UI face; the field was sized 71 px and clipped it.
    const interp = four.map((p) => ({ ...p, wh: 400, radiators_wh: 110, radiators_known: 1, radiators_total: 1, radiators_interp: true }));
    const { container } = render(CurveChart, { intervals: interp, label: 'Courbe' });
    const value = `110${NB}Wh`.length * 13 * 0.6;
    expect(width(container, 'Reste')).toBeGreaterThanOrEqual(value + 4 + 4 * 12 * 0.6);
  });

  it('a reason too long for a phone line reserves two lines', () => {
    // Radiators above the meter: « Radiateurs au-dessus du compteur : écart de mesure ».
    const above = four.map((p, i) => ({ ...p, radiators_wh: i === 0 ? p.wh + 200 : 100, radiators_known: 2, radiators_total: 2 }));
    const { container } = render(CurveChart, { intervals: above, label: 'Courbe' });
    const reste = [...container.querySelectorAll('.readout .field')].find((f) => f.querySelector('dt')!.textContent === 'Reste')!;
    expect(reste.querySelector('.why')).toHaveClass('two');
  });

  it('the idle prompt is one short line (the keyboard hint only where there is room)', () => {
    const { container } = render(CurveChart, { intervals: four, label: 'Courbe' });
    const when = container.querySelector('.readout .when dd')!;
    expect(when.firstChild?.textContent).toBe('Survolez ou touchez la courbe');
    expect(when.querySelector('.wide')).toHaveTextContent(', ou utilisez les flèches');
  });

  it('states the subscribed power instead of drawing it when it is off the scale', () => {
    const { container } = render(CurveChart, { intervals: four, label: 'Courbe', kva: 12 });
    expect(container.querySelector('line.kva')).toBeNull();
    expect(container.querySelector('.kva-note')).toHaveTextContent(/Puissance souscrite \(12 kVA, soit 6\s000 Wh par demi-heure\) hors de l’échelle du graphique\./);
  });

  it('a DST day has 50 bars, and the repeated hour says which one it is', async () => {
    const a = parisDayStart('2026-10-25') / 1000;
    const day = Array.from({ length: 50 }, (_, i) => iv(a + i * 1800, 400, i < 12 ? 1 : 0));
    const { container } = render(CurveChart, { intervals: day, label: 'Courbe' });
    expect(container.querySelectorAll('svg g')).toHaveLength(50);
    const s = screen.getByRole('slider');
    for (let k = 0; k < 5; k++) await fireEvent.keyDown(s, { key: 'ArrowRight' });
    expect(container.querySelector('.readout .when')).toHaveTextContent('02:00–02:30 (heure d’été)');
    await fireEvent.keyDown(s, { key: 'ArrowRight' });
    await fireEvent.keyDown(s, { key: 'ArrowRight' });
    expect(container.querySelector('.readout .when')).toHaveTextContent('02:00–02:30 (heure d’hiver)');
  });
});
