import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ThermalStrip from './ThermalStrip.svelte';
import { applyLocale } from '$lib/i18n';
import { desktop } from '$lib/media.svelte';
import { announcer } from '$lib/stores/announcer.svelte';

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

describe('the room chart: a fitted scale and the inspector', () => {
  const start = Date.parse('2026-10-13T22:00:00Z'); // Wed 00:00 Paris
  const end = start + 86_400_000;
  const Q = 900_000;
  const now = start + 14 * 3_600_000 + 3 * 60_000;
  const pts = [
    { t: start + 10 * 3_600_000, v: 19.4, s: 20, rate: 64, modes: ['program'], levels: ['comfort'], rads: [] },
    { t: start + 13 * 3_600_000, v: 20.2, s: 20, rate: 0, modes: ['program'], levels: ['comfort'], rads: [] }
  ];
  const inspect = { kind: 'day' as const, stepMs: Q, names: { a: 'Salon' }, several: false, presence: false, window: false };
  const props = { points: pts, start, end, now, mode: 'manual' as const, target: 20, label: 'Salon, 24 h', yAxis: true, height: 96, inspect };
  afterEach(() => {
    desktop.matches = false;
  });

  it('scales to the data, never to 0 °C, with a tick every degree', () => {
    const { container } = render(ThermalStrip, { props: { ...props, points: [...pts, { t: start + 3_600_000, v: null, s: 0 }] } });
    const ticks = [...container.querySelectorAll('.ytick')].map((e) => e.textContent);
    expect(ticks).toEqual(['18°', '19°', '20°', '21°', '22°']);
    expect(container.querySelectorAll('line.grid')).toHaveLength(5);
  });

  it('draws presence as a thin lane along the bottom', () => {
    const s = start / 1000;
    const activity = { step: 300, window: [], presence: [{ start: s + 7200, end: s + 9000, open: false }] };
    const { container } = render(ThermalStrip, { props: { ...props, activity, events: true } });
    const lane = container.querySelector('rect.presence')!;
    expect(lane.getAttribute('y')).toBe('92');
    expect(lane.getAttribute('height')).toBe('4');
  });

  it('keyboard: a focusable slider that starts at now, steps with ←/→, Home/End, and clears with Esc', async () => {
    render(ThermalStrip, { props });
    const slider = screen.getByRole('slider', { name: /Salon, 24 h/ });
    expect(slider).toHaveAttribute('tabindex', '0');
    expect(slider).toHaveAttribute('aria-valuemax', '95');
    await fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(slider).toHaveAttribute('aria-valuenow', '56'); // 14:00, the moment now is in
    expect(slider.getAttribute('aria-valuetext')).toMatch(/^14:00–14:15 : Température/);
    await fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    expect(slider).toHaveAttribute('aria-valuenow', '55');
    await fireEvent.keyDown(slider, { key: 'Home' });
    expect(slider).toHaveAttribute('aria-valuenow', '0');
    await fireEvent.keyDown(slider, { key: 'End' });
    expect(slider).toHaveAttribute('aria-valuenow', '95');
    expect(screen.getByRole('group', { name: '23:45–00:00' })).toBeInTheDocument();
    await fireEvent.keyDown(slider, { key: 'Escape' });
    expect(screen.queryByRole('group', { name: '23:45–00:00' })).toBeNull();
  });

  it('desktop: hovering shows the card with the temperature and the setpoint, a guide and a dot; leaving hides it', async () => {
    desktop.matches = true;
    const { container } = render(ThermalStrip, { props });
    const slider = screen.getByRole('slider');
    // 10:00 is 125/300 of the day; jsdom's box is 0 wide, so the scrubber reads x in chart units.
    await fireEvent.pointerMove(slider, { clientX: 125, pointerType: 'mouse' });
    const card = screen.getByRole('group', { name: '10:00–10:15' });
    expect(card).toHaveClass('card');
    expect(card).toHaveTextContent(/Température\s*19,4\s°C/);
    expect(card).toHaveTextContent(/Consigne\s*20,0\s°C/);
    expect(card).toHaveTextContent(/Chauffe\s*oui, 64\s%/);
    expect(card).toHaveTextContent(/mesuré/);
    expect(container.querySelector('.guide')).not.toBeNull();
    expect(container.querySelector('.dot')).not.toBeNull();
    // Neither side of a 300 px plot fits a 260 px card at 10:00: it goes under the plot, never over the point read.
    expect(card.style.top).toBe('104px');
    await fireEvent.pointerMove(slider, { clientX: 12.5, pointerType: 'mouse' });
    const early = screen.getByRole('group', { name: '01:00–01:15' });
    expect(early.style.left).toBe('24.5px'); // right of the guide, 12 px off
    expect(early.style.top).toBe('0px');
    expect(early).toHaveTextContent(/Température\s*—\s*pas de relevé à ce moment/);
    await fireEvent.pointerLeave(slider, { pointerType: 'mouse' });
    expect(screen.queryByRole('group', { name: '01:00–01:15' })).toBeNull();
  });

  it('phone: a tap docks the inspector under the chart and says it; a second tap closes it', async () => {
    const say = vi.spyOn(announcer, 'say');
    render(ThermalStrip, { props });
    const slider = screen.getByRole('slider');
    await fireEvent.pointerDown(slider, { clientX: 162.5, pointerType: 'touch', pointerId: 1 });
    await fireEvent.pointerUp(slider, { clientX: 162.5, pointerType: 'touch', pointerId: 1 });
    const sheet = screen.getByRole('group', { name: '13:00–13:15' });
    expect(sheet).toHaveClass('sheet');
    expect(sheet).toHaveTextContent(/Température\s*20,2\s°C/);
    expect(say).toHaveBeenLastCalledWith(expect.stringMatching(/^13:00–13:15 : Température 20,2/));
    await fireEvent.pointerDown(slider, { clientX: 162.5, pointerType: 'touch', pointerId: 1 });
    await fireEvent.pointerUp(slider, { clientX: 162.5, pointerType: 'touch', pointerId: 1 });
    expect(screen.queryByRole('group', { name: '13:00–13:15' })).toBeNull();
    say.mockRestore();
  });

  it('a hidden table holds every recorded moment in the inspector’s words', () => {
    const { container } = render(ThermalStrip, { props });
    const rows = [...container.querySelectorAll('.visually-hidden table tbody tr')];
    expect(rows).toHaveLength(2);
    expect(rows[0].querySelector('th')!.textContent).toBe('10:00–10:15');
    expect(container.querySelector('.visually-hidden table caption')!.textContent).toBe('Salon, 24 h');
  });

  it('no inspector without `inspect` (a read-only room)', () => {
    render(ThermalStrip, { props: { ...props, inspect: null } });
    expect(screen.queryByRole('slider')).toBeNull();
  });
});
