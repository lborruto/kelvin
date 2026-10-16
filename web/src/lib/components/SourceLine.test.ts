import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import Freshness from './Freshness.svelte';
import SourceLine from './SourceLine.svelte';

const media = vi.hoisted(() => ({ desktop: { matches: true } }));
vi.mock('$lib/media.svelte', () => media);

describe('Freshness', () => {
  it('solid ring fresh, dashed ring late, bad dot failed, nothing when there is nothing to say', () => {
    for (const state of ['fresh', 'late', 'bad'] as const) {
      const { container, unmount } = render(Freshness, { state });
      const svg = container.querySelector('svg')!;
      expect(svg).toHaveAttribute('aria-hidden', 'true');
      expect(svg).toHaveAttribute('data-fresh', state);
      expect(svg).toHaveClass(state);
      unmount();
    }
    expect(render(Freshness, { state: 'none' }).container.querySelector('svg')).toBeNull();
  });
});

describe('SourceLine', () => {
  it('one 12 px line « Source · state » with its mark; plain text without a Fiche', () => {
    const { container } = render(SourceLine, { source: 'Linky', text: 'données jusqu’au 14/10', state: 'fresh' });
    expect(container.querySelector('.source-line')).toHaveTextContent('Linky · données jusqu’au 14/10');
    expect(container.querySelector('[data-fresh="fresh"]')).not.toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('with a Fiche the words are a Fig that opens it; a failure is in bad text', async () => {
    const { container } = render(SourceLine, {
      source: 'Linky', text: 'MyElectricalData refuse le jeton', state: 'bad', title: 'Linky', rows: [{ label: 'Dernier relevé', value: '14/10' }]
    });
    expect(container.querySelector('.source-line')).toHaveClass('bad');
    const fig = screen.getByRole('button', { name: 'Linky · MyElectricalData refuse le jeton, détails' });
    await fireEvent.click(fig);
    expect(document.querySelector('.fiche')).toHaveTextContent('Dernier relevé');
    document.querySelectorAll('.fiche').forEach((n) => n.remove());
  });
});
