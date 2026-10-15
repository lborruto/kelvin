import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import type { Inspection } from '$lib/inspector';
import { T } from '$lib/motion';
import ChartInspector from './ChartInspector.svelte';
import EnergyBars from './EnergyBars.svelte';

// The transitions as spies (jsdom cannot animate): they report the params they get and run instantly.
const fx = vi.hoisted(() => ({
  fade: vi.fn((_n: Element, _p?: { duration?: number }) => ({ duration: 0 })),
  slide: vi.fn((_n: Element, _p?: { duration?: number }) => ({ duration: 0 }))
}));
vi.mock('svelte/transition', async (orig) => ({ ...(await orig<typeof import('svelte/transition')>()), ...fx }));
// dur() marks what passes through it, so a raw duration would show.
vi.mock('$lib/motion', async (orig) => ({ ...(await orig<typeof import('$lib/motion')>()), dur: (ms: number) => ms + 0.5 }));
const media = vi.hoisted(() => ({ desktop: { matches: false } }));
vi.mock('$lib/media.svelte', () => media);

const ins: Inspection = {
  title: 'Mardi 13 octobre 2026',
  rows: [
    { key: 'maison', label: 'Maison', value: '22,04\u00a0kWh' },
    { key: 'hc', label: 'Heures creuses', value: '8,98\u00a0kWh', est: true },
    { key: 'energie', label: 'dont énergie', value: '5,31\u00a0€', sub: true }
  ],
  notes: ['2 jours manquants'],
  empty: null,
  spoken: ''
};

describe('ChartInspector', () => {
  it('lists the rows, marks estimates and links the footnote to Qualité des données', () => {
    const { container } = render(ChartInspector, { ins, mode: 'sheet', id: 'i1' });
    expect(container.querySelector('.inspector.sheet')).toHaveAttribute('role', 'group');
    expect(container.querySelector('.title')).toHaveTextContent('Mardi 13 octobre 2026');
    const rows = [...container.querySelectorAll('.row')];
    expect(rows.map((r) => r.querySelector('dt')?.textContent)).toEqual(['Maison', 'Heures creuses', 'dont énergie']);
    expect(rows[1].querySelector('.est')).toHaveTextContent('est.');
    expect(rows[0].querySelector('.est')).toBeNull();
    expect(rows[2]).toHaveClass('sub');
    expect(screen.getByText('2 jours manquants')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Qualité des données' })).toHaveAttribute('href', '#quality');
  });

  it('a « — » says why', () => {
    const { container } = render(ChartInspector, {
      ins: { ...ins, rows: [{ key: 'radiateurs', label: 'Radiateurs', value: '—', note: 'jour en cours, compté une fois terminé' }] },
      mode: 'sheet',
      id: 'i4'
    });
    expect(container.querySelector('.row dd')).toHaveTextContent('—jour en cours, compté une fois terminé');
    expect(container.querySelector('.row .why')).toHaveTextContent('jour en cours, compté une fois terminé');
  });

  it('a card sits where it is told and catches the pointer only when pinned', () => {
    const { container, rerender } = render(ChartInspector, { ins, mode: 'card', id: 'i2', left: 157 });
    const card = container.querySelector<HTMLElement>('.inspector.card')!;
    expect(card.style.left).toBe('157px');
    expect(card.style.width).toBe('260px');
    expect(card).not.toHaveClass('pinned');
    rerender({ ins, mode: 'card', id: 'i2', left: 157, pinned: true });
    expect(container.querySelector('.inspector.card')).toHaveClass('pinned');
  });

  it('says when there is no data, and offers the drill action', async () => {
    const run = vi.fn();
    render(ChartInspector, {
      ins: { ...ins, rows: [], notes: [], empty: 'Aucune donnée Linky pour ce jour' },
      mode: 'sheet',
      id: 'i3',
      action: { label: 'Voir la courbe du 13/10', run }
    });
    expect(screen.getByText('Aucune donnée Linky pour ce jour')).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Voir la courbe du 13/10' }));
    expect(run).toHaveBeenCalledOnce();
  });

  it('Esc inside the card or the sheet asks the host to close it', async () => {
    for (const mode of ['card', 'sheet'] as const) {
      const onclose = vi.fn();
      const run = vi.fn();
      const { container, unmount } = render(ChartInspector, { ins, mode, id: `e-${mode}`, pinned: true, onclose, action: { label: 'Voir', run } });
      const box = container.querySelector<HTMLElement>('.inspector')!;
      expect(await fireEvent.keyDown(box, { key: 'Escape' })).toBe(false); // handled: default prevented
      // From a control inside it too (the drill action, the Qualité link).
      await fireEvent.keyDown(screen.getByRole('button', { name: 'Voir' }), { key: 'Escape' });
      await fireEvent.keyDown(box, { key: 'Enter' });
      expect(onclose).toHaveBeenCalledTimes(2);
      unmount();
    }
    // Without a host handler, Esc is left alone.
    const { container } = render(ChartInspector, { ins, mode: 'sheet', id: 'e-none' });
    expect(await fireEvent.keyDown(container.querySelector('.inspector')!, { key: 'Escape' })).toBe(true);
  });

  it('its entrance plays when the host mounts it inside its own {#if} (|global), timed by dur()', async () => {
    const bars = {
      groups: [{ label: '12/10', parts: [{ key: 'home', value: 12 }] }, { label: '13/10', parts: [{ key: 'home', value: 14 }] }],
      colors: { home: 'var(--series-1)' },
      unit: 'kWh',
      label: 'Consommation',
      details: [ins, { ...ins, title: 'Mercredi 14 octobre 2026' }]
    };
    // Phone: the pinned bar's sheet slides open.
    media.desktop.matches = false;
    fx.slide.mockClear();
    const phone = render(EnergyBars, bars);
    await fireEvent.click(screen.getAllByRole('button')[1]);
    expect(phone.container.querySelector('.inspector.sheet')).not.toBeNull();
    expect(fx.slide).toHaveBeenCalledOnce();
    expect(fx.slide.mock.calls[0][1]).toEqual({ duration: T.enter + 0.5 });
    phone.unmount();
    // Desktop: the card fades in.
    media.desktop.matches = true;
    fx.fade.mockClear();
    const desk = render(EnergyBars, bars);
    await fireEvent.click(screen.getAllByRole('button')[1]);
    expect(desk.container.querySelector('.inspector.card')).not.toBeNull();
    expect(fx.fade).toHaveBeenCalled();
    expect(fx.fade.mock.calls[0][1]).toEqual({ duration: T.state + 0.5 });
    desk.unmount();
    media.desktop.matches = false;
  });
});
