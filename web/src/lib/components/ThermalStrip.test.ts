import { render } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ThermalStrip from './ThermalStrip.svelte';

const start = Date.parse('2026-10-12T22:00:00Z'); // Tue 00:00 Paris
const end = start + 86_400_000;
const program = { tuesday: [{ start: '06:15', end: '08:00' }, { start: '17:30', end: '22:30' }] };
const points = [
  { t: start + 3_600_000, v: 19, s: 17 },
  { t: start + 7_200_000, v: 19.5, s: 17 },
  { t: start + 10_800_000, v: null, s: null },
  { t: start + 14_400_000, v: 20, s: 20 }
];

describe('ThermalStrip', () => {
  it('draws comfort bands, the temperature line, the setpoint and the now marker', () => {
    const { container } = render(ThermalStrip, {
      points, start, end, now: start + 5 * 3_600_000, program, mode: 'program', comfort: 20, eco: 17, label: 'Salon, 24 h'
    });
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('aria-label', 'Salon, 24 h');
    expect(container.querySelectorAll('rect.band')).toHaveLength(2);
    expect(container.querySelector('path.temp')!.getAttribute('d')).toMatch(/^M/);
    expect(container.querySelector('path.setpoint')).not.toBeNull();
    expect(container.querySelector('line.now')).not.toBeNull();
  });

  it('manual mode draws a flat target and a dashed pending target', () => {
    const { container } = render(ThermalStrip, {
      props: { points, start, end, now: start + 5 * 3_600_000, mode: 'manual', target: 20, pendingTarget: 21, label: 'x' }
    });
    expect(container.querySelectorAll('rect.band')).toHaveLength(0);
    expect(container.querySelector('path.setpoint')).not.toBeNull();
    expect(container.querySelector('path.pending-target')).not.toBeNull();
  });

  it('colours the temperature line from the theme heat tokens', () => {
    const { container } = render(ThermalStrip, { points, start, end, now: start, label: 'x' });
    const stops = [...container.querySelectorAll('stop')].map((s) => s.getAttribute('style'));
    expect(stops).toEqual(['stop-color: var(--warm);', 'stop-color: var(--neutral);', 'stop-color: var(--cool);']);
  });

  it('copes with no data', () => {
    const { container } = render(ThermalStrip, { points: [], start, end, now: start, label: 'x' });
    expect(container.querySelector('path.temp')!.getAttribute('d')).toBe('');
  });

  describe('pending comfort', () => {
    const base = { points, start, end, now: start + 12 * 3_600_000, program, mode: 'program' as const, comfort: 20, eco: 17, label: 'x' };

    it('redraws the future of the programme dashed at the pending comfort', () => {
      const { container } = render(ThermalStrip, { ...base, pendingComfort: 22 });
      const path = container.querySelector('path.pending-comfort')!;
      expect(path).not.toBeNull();
      const clip = container.querySelector(path.getAttribute('clip-path')!.replace(/^url\((.*)\)$/, '$1'))!;
      expect(clip.querySelector('rect')!.getAttribute('x')).toBe('150');
      expect(path.getAttribute('d')).not.toBe(container.querySelector('path.setpoint')!.getAttribute('d'));
    });

    it('draws nothing pending without a pending comfort or outside programme mode', () => {
      const { container } = render(ThermalStrip, { props: { ...base, mode: 'manual', target: 20, pendingComfort: 22 } });
      expect(container.querySelector('path.pending-comfort')).toBeNull();
    });
  });

  describe('confirmation', () => {
    afterEach(() => vi.useRealTimers());
    const base = { points, start, end, now: start + 5 * 3_600_000, mode: 'manual' as const, label: 'x' };

    it('keeps the pending path briefly and morphs it to solid when the radiator reports the value', async () => {
      vi.useFakeTimers();
      const r = render(ThermalStrip, { props: { ...base, target: 20, pendingTarget: 21 } });
      expect(r.container.querySelector('path.pending-target')).not.toHaveClass('confirmed');
      await r.rerender({ target: 21, pendingTarget: null });
      expect(r.container.querySelector('path.pending-target')).toHaveClass('confirmed');
      await vi.advanceTimersByTimeAsync(250);
      expect(r.container.querySelector('path.pending-target')).toBeNull();
    });

    it('does not show a failed value as confirmed', async () => {
      vi.useFakeTimers();
      const r = render(ThermalStrip, { props: { ...base, target: 20, pendingTarget: 21 } });
      await r.rerender({ pendingTarget: null });
      expect(r.container.querySelector('path.pending-target.confirmed')).toBeNull();
      await vi.advanceTimersByTimeAsync(250);
      expect(r.container.querySelector('path.pending-target')).toBeNull();
    });

    it('confirms a pending comfort the same way', async () => {
      vi.useFakeTimers();
      const r = render(ThermalStrip, { props: { ...base, program, mode: 'program', comfort: 20, eco: 17, pendingComfort: 21 } });
      await r.rerender({ comfort: 21, eco: 18, pendingComfort: null });
      expect(r.container.querySelector('path.pending-comfort')).toHaveClass('confirmed');
      await vi.advanceTimersByTimeAsync(250);
      expect(r.container.querySelector('path.pending-comfort')).toBeNull();
    });
  });

  describe('axis', () => {
    it('is off by default', () => {
      const { container } = render(ThermalStrip, { points, start, end, now: start, label: 'x' });
      expect(container.querySelector('.axis')).toBeNull();
    });

    it('labels the day and the current time at the now marker, hiding an hour it would overlap', () => {
      const { container } = render(ThermalStrip, { points, start, end, now: start + 5 * 3_600_000, axis: true, label: 'x' });
      const ticks = [...container.querySelectorAll('.axis .tick:not(.now-label)')].map((e) => e.textContent);
      expect(ticks).toEqual(['00', '12', '18', '24']);
      const nowLabel = container.querySelector('.axis .now-label')!;
      expect(nowLabel.textContent).toBe('05:00');
      expect(container.querySelector('.axis')).toHaveAttribute('aria-hidden', 'true');
    });
  });
});
