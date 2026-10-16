import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyLocale } from '$lib/i18n';
import { grid } from '$lib/stores/grid.svelte';
import GridChips from './GridChips.svelte';

const media = vi.hoisted(() => ({ desktop: { matches: true } }));
vi.mock('$lib/media.svelte', () => media);

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
const tomorrow = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date(Date.now() + 86_400_000));
const fetched = Math.floor(Date.now() / 1000) - 600;

afterEach(() => {
  grid.reset();
  applyLocale('fr');
  document.querySelectorAll('.fiche').forEach((n) => n.remove());
});

describe('GridChips', () => {
  it('the Tempo pair as two chips, each a figure whose Fiche lists the signals with RTE’s time', async () => {
    grid.apply({
      tempo: { today: { date: today, colour: 'blue' }, tomorrow: { date: tomorrow, colour: 'red', expected_at: null }, fetched_at: fetched },
      ecowatt: { days: [], fetched_at: null },
      source: 'MyElectricalData'
    });
    const { container } = render(GridChips);
    expect(container.querySelectorAll('.dot')).toHaveLength(2);
    const chip = screen.getByRole('button', { name: 'Demain Rouge, détails' });
    expect(screen.getByRole('button', { name: 'Aujourd’hui Bleu, détails' })).toBeInTheDocument();
    await fireEvent.click(chip);
    const card = document.querySelector('.fiche')!;
    expect(card).toHaveTextContent('Tempo aujourd’hui Bleu');
    expect(card).toHaveTextContent('Tempo demain Rouge');
    expect(card).toHaveTextContent('Relevé RTE');
    expect(card).toHaveTextContent('Tempo (EDF) via MyElectricalData');
    expect(card).toHaveTextContent('publié');
    // The RTE time is in the Fiche, not on the page.
    expect(container.textContent).not.toMatch(/RTE|\d\d:\d\d/);
  });

  it('tomorrow not yet published says when it is expected', () => {
    grid.apply({
      tempo: { today: { date: today, colour: 'white' }, tomorrow: { date: tomorrow, colour: null, expected_at: '11:00' }, fetched_at: fetched },
      ecowatt: { days: [], fetched_at: null },
      source: 'MyElectricalData'
    });
    render(GridChips);
    expect(screen.getByRole('button', { name: 'Demain vers 11:00, détails' })).toBeInTheDocument();
  });

  it('EcoWatt: a chip with the alert glyph, bad text at level 3; no Tempo without a Tempo tariff', () => {
    grid.apply({
      tempo: null,
      ecowatt: { days: [{ date: today, level: 3, hours: [{ start: '08:00', end: '10:00', level: 3 }] }, { date: tomorrow, level: 2, hours: null }], fetched_at: fetched },
      source: 'MyElectricalData'
    });
    const { container } = render(GridChips);
    const eco = container.querySelectorAll('li.eco');
    expect(eco).toHaveLength(2);
    expect(eco[0]).toHaveClass('bad');
    expect(eco[0].querySelector('svg')).not.toBeNull();
    expect(eco[0]).toHaveTextContent('EcoWatt rouge aujourd’hui, 08:00–10:00');
    expect(eco[1]).not.toHaveClass('bad');
    expect(container.textContent).not.toMatch(/Tempo|Bleu|Blanc|Rouge/);
  });

  it('nothing to say: nothing at all; in English the colours and words follow', () => {
    grid.apply({ tempo: null, ecowatt: { days: [{ date: today, level: 1, hours: null }], fetched_at: 1 }, source: 'MyElectricalData' });
    const { container, unmount } = render(GridChips);
    expect(container.querySelector('ul')).toBeNull();
    unmount();
    applyLocale('en');
    grid.apply({
      tempo: { today: { date: today, colour: 'white' }, tomorrow: { date: tomorrow, colour: 'red', expected_at: null }, fetched_at: fetched },
      ecowatt: { days: [], fetched_at: null },
      source: 'MyElectricalData'
    });
    render(GridChips);
    expect(screen.getByRole('button', { name: 'Tomorrow Red, details' })).toBeInTheDocument();
  });
});
