import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import WeatherScatter from './WeatherScatter.svelte';
import { desktop } from '$lib/media.svelte';
import { order } from '$lib/scatter';
import { OK } from '$lib/weatherModel.fixture';

const props = { points: OK.house.points, line: OK.house.line, tb: 15.5, mode: 'kwh' as const, height: 260 };
const live = (c: HTMLElement) => c.querySelector('[aria-live="polite"]')!.textContent ?? '';
const nb = (t: string | null | undefined) => (t ?? '').replace(/[  ]/g, ' ');

afterEach(() => {
  desktop.matches = false;
});

describe('WeatherScatter', () => {
  it('one dot per point in kWh, fewer in € when a point lacks €', () => {
    const { container, unmount } = render(WeatherScatter, props);
    expect(container.querySelectorAll('circle.dot')).toHaveLength(OK.house.points.length);
    expect(container.querySelectorAll('circle.dot.excluded').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('circle.dot.period').length).toBe(OK.house.points.filter((p) => p.in_period && !p.excluded).length);
    unmount();
    const pts = OK.house.points.map((p, i) => (i < 3 ? { ...p, energy_eur: null } : p));
    const r = render(WeatherScatter, { ...props, points: pts, mode: 'eur' });
    expect(r.container.querySelectorAll('circle.dot')).toHaveLength(pts.length - 3);
  });
  it('is a named group with the model, its band and the balance rule', () => {
    const { container } = render(WeatherScatter, props);
    expect(screen.getByRole('group', { name: 'Consommation selon la température extérieure' })).toBeTruthy();
    expect(container.querySelector('path.model')!.getAttribute('d')).toMatch(/^M/);
    expect(container.querySelector('path.band')).not.toBeNull();
    expect(nb(container.querySelector('.tb-label')!.textContent)).toBe('équilibre 15,5 °C');
  });
  it('ArrowRight from nothing reads the coldest day; End the warmest; Esc clears', async () => {
    const { container } = render(WeatherScatter, props);
    const hit = screen.getByRole('button', { name: 'Lire le graphique jour par jour' });
    const o = order(OK.house.points);
    const title = (iso: string) => `${Number(iso.slice(8))}/${Number(iso.slice(5, 7))}`;
    await fireEvent.keyDown(hit, { key: 'ArrowRight' });
    expect(live(container).startsWith(title(o[0].date))).toBe(true);
    expect(live(container)).toContain('Dehors');
    expect(container.querySelector('circle.ring')).not.toBeNull();
    expect(screen.getByRole('group', { name: title(o[0].date) })).toBeTruthy(); // the docked inspector (phone)
    await fireEvent.keyDown(hit, { key: 'End' });
    expect(live(container).startsWith(title(o.at(-1)!.date))).toBe(true);
    await fireEvent.keyDown(hit, { key: 'Escape' });
    expect(container.querySelector('circle.ring')).toBeNull();
    expect(live(container)).toBe('');
  });
  it('desktop: a floating card', async () => {
    desktop.matches = true;
    const { container } = render(WeatherScatter, props);
    await fireEvent.keyDown(screen.getByRole('button'), { key: 'Home' });
    expect(container.querySelector('.inspector.card')).not.toBeNull();
  });
  it('the hidden table has a body row per point', () => {
    const { container } = render(WeatherScatter, props);
    expect(container.querySelectorAll('table tbody tr')).toHaveLength(OK.house.points.length);
    expect([...container.querySelectorAll('table thead th')].map((t) => t.textContent)).toEqual([
      'Jour', 'Dehors', 'Consommation', 'Coût (énergie)', 'Attendu par le modèle', 'Écarté'
    ]);
  });
  it('no rule and no line while the model is hidden', () => {
    const { container } = render(WeatherScatter, { ...props, line: [], tb: null });
    expect(container.querySelector('path.model')).toBeNull();
    expect(container.querySelector('.tb')).toBeNull();
  });
});
