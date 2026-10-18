import { describe, expect, it } from 'vitest';
import { dotKind, nearest, order, scatterLayout } from './scatter';
import { OK } from './weatherModel.fixture';

describe('scatter layout', () => {
  const L = scatterLayout(OK.house.points, OK.house.line, 'kwh', 600, 260, 15.5);
  it('puts colder days left and more kWh higher', () => {
    const cold = L.dots.find((d) => d.p.t_c === -3)!;
    const warm = L.dots.find((d) => d.p.t_c === 24)!;
    expect(cold.cx).toBeLessThan(warm.cx);
    expect(cold.cy).toBeLessThan(warm.cy); // SVG y grows downwards
  });
  it('every dot inside the plot, the y axis from 0', () => {
    for (const d of L.dots) {
      expect(d.cx).toBeGreaterThanOrEqual(40);
      expect(d.cx).toBeLessThanOrEqual(592);
      expect(d.cy).toBeGreaterThanOrEqual(8);
      expect(d.cy).toBeLessThanOrEqual(232);
    }
    expect(L.y.domain()[0]).toBe(0);
    expect(L.ticksX.length).toBeGreaterThan(2);
  });
  it('€ mode skips days without €', () => {
    const pts = OK.house.points.map((p, i) => (i === 0 ? { ...p, energy_eur: null } : p));
    expect(scatterLayout(pts, OK.house.line, 'eur', 600, 260).dots).toHaveLength(pts.length - 1);
  });
  it('keyboard order is by temperature then date, and the dots follow it', () => {
    const o = order(OK.house.points);
    for (let i = 1; i < o.length; i++) {
      expect(o[i - 1].t_c <= o[i].t_c).toBe(true);
      if (o[i - 1].t_c === o[i].t_c) expect(o[i - 1].date < o[i].date).toBe(true);
    }
    expect(L.dots.map((d) => d.p.date)).toEqual(o.map((p) => p.date));
  });
  it('dot kinds: left out, in the period, used', () => {
    const p = OK.house.points[0];
    expect(dotKind({ ...p, excluded: 'outlier' })).toBe('excluded');
    expect(dotKind({ ...p, excluded: null, in_period: true })).toBe('period');
    expect(dotKind({ ...p, excluded: null, in_period: false })).toBe('used');
  });
  it('nearest dot', () => {
    const d = L.dots[5];
    expect(nearest(L.dots, d.cx + 0.1, d.cy - 0.1)).toBe(5);
    expect(nearest([], 0, 0)).toBeNull();
  });
  it('the band path exists only with a line; € mode skips samples without €', () => {
    expect(L.band).not.toBe('');
    expect(L.path.startsWith('M')).toBe(true);
    expect(scatterLayout(OK.house.points, [], 'kwh', 600, 260).band).toBe('');
    const noEur = OK.house.line.map((s) => ({ ...s, eur: null, eur_lo: null, eur_hi: null }));
    expect(scatterLayout(OK.house.points, noEur, 'eur', 600, 260).path).toBe('');
  });
});
