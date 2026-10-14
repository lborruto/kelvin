import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import type { Inspection } from '$lib/inspector';
import ChartInspector from './ChartInspector.svelte';

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
    expect(screen.getByRole('link', { name: 'Qualité des données' })).toHaveAttribute('href', '#qualite');
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
});
