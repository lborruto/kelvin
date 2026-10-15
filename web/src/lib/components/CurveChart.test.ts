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
    expect([...container.querySelectorAll('.readout .field dd .cur')].every((d) => d.textContent === '—')).toBe(true);
    expect(container.querySelector('line.cross')).toBeNull();
    await fireEvent.keyDown(s, { key: 'ArrowRight' });
    expect(container.querySelector('.readout .when')).toHaveTextContent('00:00–00:30');
    expect(s.getAttribute('aria-valuetext')).toBe(`00:00–00:30, 3,00${NB}kW, 1\u202f500${NB}Wh`);
    const fields = Object.fromEntries(
      [...container.querySelectorAll('.readout .field')].map((f) => [f.querySelector('dt')!.textContent, f.querySelector('dd .cur')!.textContent])
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
    expect(rad.querySelector('dd .cur .val')).toHaveTextContent('—');
    expect(rad.querySelector('dd .cur .why')).toHaveTextContent('1 sur 2 radiateurs mesurés');
  });

  /** Each field's stacked texts: every distinct text it takes that day, and which one is shown. */
  const stack = (c: Element, label: string) => {
    const f = [...c.querySelectorAll('.readout .field')].find((x) => x.querySelector('dt')!.textContent === label)!;
    const vs = [...f.querySelectorAll('dd > .v')];
    return {
      texts: vs.map((v) => v.textContent),
      shown: vs.filter((v) => v.classList.contains('cur')).map((v) => v.textContent),
      hidden: vs.filter((v) => !v.classList.contains('cur')).every((v) => v.getAttribute('aria-hidden') === 'true')
    };
  };

  it('stacks every text a field takes that day in one cell, so the browser sizes it and scrubbing never reflows (R2)', async () => {
    const withRad = four.map((p, i) => ({ ...p, radiators_wh: i === 1 ? null : 100, radiators_known: i === 1 ? 10 : 12, radiators_total: 12 }));
    const { container } = render(CurveChart, { intervals: withRad, label: 'Courbe' });
    const idle = stack(container, 'Radiateurs');
    // Idle « — », 100 Wh, and « — » with its reason: the widest and tallest is always laid out, only one is visible.
    expect(idle.texts).toEqual(['—', `100${NB}Wh`, '—10 sur 12 radiateurs mesurés']);
    expect(idle.shown).toEqual(['—']);
    expect(idle.hidden).toBe(true);
    const all = () => [...container.querySelectorAll('.readout .field')].map((f) => f.querySelectorAll('dd > .v').length);
    const counts = all();
    const s = screen.getByRole('slider');
    await fireEvent.keyDown(s, { key: 'ArrowRight' });
    await fireEvent.keyDown(s, { key: 'ArrowRight' });
    expect(stack(container, 'Radiateurs')).toEqual({ ...idle, shown: ['—10 sur 12 radiateurs mesurés'] });
    expect(all()).toEqual(counts);
  });

  it('an estimated value and a long reason are in the stack, so their field is as wide as they are', () => {
    const interp = four.map((p) => ({ ...p, wh: 400, radiators_wh: 110, radiators_known: 1, radiators_total: 1, radiators_interp: true }));
    const { container } = render(CurveChart, { intervals: interp, label: 'Courbe' });
    expect(stack(container, 'Reste').texts).toContain(`290${NB}Whest.`);
    // Radiators above the meter: « Radiateurs au-dessus du compteur : écart de mesure ».
    const above = four.map((p, i) => ({ ...p, radiators_wh: i === 0 ? p.wh + 200 : 100, radiators_known: 2, radiators_total: 2 }));
    const r = render(CurveChart, { intervals: above, label: 'Courbe' });
    expect(stack(r.container, 'Reste').texts).toContain(`—Radiateurs au-dessus du compteur${NB}: écart de mesure`);
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

  it('a legend only for what is drawn: no empty list when the subscribed power is only stated', () => {
    const { container, unmount } = render(CurveChart, { intervals: four, label: 'Courbe', kva: 12 });
    expect(container.querySelector('.legend')).toBeNull(); // no radiator line, kVA off the scale
    expect(container.querySelector('.kva-note')).not.toBeNull();
    unmount();
    const drawn = render(CurveChart, { intervals: four, label: 'Courbe', kva: 1 });
    expect([...drawn.container.querySelectorAll('.legend li')].map((l) => l.textContent)).toEqual([`Puissance souscrite (1${NB}kVA)`]);
    drawn.unmount();
    expect(render(CurveChart, { intervals: four, label: 'Courbe' }).container.querySelector('.legend')).toBeNull();
  });

  it('the readout’s temperature names its room', () => {
    const samples = [0, 300, 600, 900, 1200, 1500].map((s) => ({ ts: t0 + s, temperature: 19, setpoint: 20, working_rate: 40 }));
    const { container } = render(CurveChart, { intervals: four, label: 'Courbe', samples, room: 'Chambre 2' });
    expect([...container.querySelectorAll('.readout .field dt')].map((d) => d.textContent)).toContain('Température (Chambre 2)');
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
