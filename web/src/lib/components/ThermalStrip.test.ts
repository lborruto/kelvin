import { render } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ThermalStrip from './ThermalStrip.svelte';
import { applyLocale } from '$lib/i18n';

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

describe('ThermalStrip text equivalent', () => {
  // `target` is also a mount option: the props go under `props`.
  const describe_ = (c: HTMLElement) => {
    const svg = c.querySelector('svg')!;
    return document.getElementById(svg.getAttribute('aria-describedby')!)!.textContent!.trim();
  };
  it('French: range, last reading, setpoint, joined by a no-break-spaced semicolon', () => {
    const { container } = render(ThermalStrip, {
      props: { points, start, end, now: start + 5 * 3_600_000, mode: 'manual', target: 20, label: 'x' }
    });
    expect(describe_(container)).toMatch(/^de 19,0\s°C à 20,0\s°C\u00a0; dernière mesure 20,0\s°C\u00a0; consigne 20,0\s°C\.$/);
  });
  it('English', () => {
    applyLocale('en');
    const { container } = render(ThermalStrip, {
      props: { points, start, end, now: start + 5 * 3_600_000, mode: 'manual', target: 20, label: 'x' }
    });
    expect(describe_(container)).toMatch(/^19\.0\s°C to 20\.0\s°C; last reading 20\.0\s°C; setpoint 20\.0\s°C\.$/);
  });
});

describe('activity bands', () => {
  const start = Date.parse('2026-10-13T22:00:00Z');
  const end = start + 86_400_000;
  const s = start / 1000;
  const activity = {
    step: 300,
    window: [{ start: s + 3600, end: s + 4800, open: false }],
    presence: [{ start: s + 7200, end: s + 9000, open: false }, { start: s + 20_000, end: s + 21_000, open: false }]
  };
  it('a card (no `events`) draws no runs and keeps its setpoint a quiet dashed step', () => {
    const { container } = render(ThermalStrip, { props: { points: [], start, end, now: end, activity, label: 'Salon', mode: 'manual', target: 20 } });
    expect(container.querySelectorAll('rect.window, rect.presence')).toHaveLength(0);
    expect(container.querySelector('path.setpoint')).toHaveClass('quiet');
  });

  it('draws hatched window bands and faint presence bands with exact times', () => {
    const { container } = render(ThermalStrip, { props: { points: [], start, end, now: end, activity, label: 'Salon', events: true } });
    expect(container.querySelectorAll('rect.window')).toHaveLength(1);
    expect(container.querySelectorAll('rect.presence')).toHaveLength(2);
    expect(container.querySelector('rect.window title')!.textContent).toContain('Fenêtre ouverte (signalée par le radiateur) 01:00–01:20');
    expect(container.querySelector('rect.window title')!.textContent).toContain('relevé toutes les 5');
  });
  it('says the counts in the text equivalent, and nothing without activity', () => {
    const a = render(ThermalStrip, { props: { points: [], start, end, now: end, activity, label: 'Salon', events: true } });
    expect(a.container.querySelector('.visually-hidden')!.textContent).toMatch(/fenêtre ouverte 1 fois.*présence signalée 2 fois/);
    a.unmount();
    const b = render(ThermalStrip, { props: { points: [], start, end, now: end, label: 'Salon', events: true } });
    expect(b.container.querySelectorAll('rect.window, rect.presence')).toHaveLength(0);
  });
  it('English', () => {
    applyLocale('en');
    const { container } = render(ThermalStrip, { props: { points: [], start, end, now: end, activity, label: 'Salon', events: true } });
    expect(container.querySelector('.visually-hidden')!.textContent).toMatch(/window open 1 time.*presence reported 2 times/);
    applyLocale('fr');
  });
});
