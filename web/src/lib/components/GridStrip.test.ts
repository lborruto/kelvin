import { render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { applyLocale } from '$lib/i18n';
import { grid } from '$lib/stores/grid.svelte';
import GridStrip from './GridStrip.svelte';

const NB = ' ';
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
const tomorrow = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date(Date.now() + 86_400_000));

afterEach(() => {
  grid.reset();
  applyLocale('fr');
});

describe('GridStrip', () => {
  it('an HC/HP home sees EcoWatt orange tomorrow and no Tempo colour', () => {
    grid.apply({ tempo: null, ecowatt: { days: [{ date: today, level: 1, hours: null }, { date: tomorrow, level: 2, hours: null }], fetched_at: 1_760_000_000 }, source: 'MyElectricalData' });
    const { container } = render(GridStrip);
    expect(container.textContent).toContain('EcoWatt orange demain');
    expect(container.textContent).not.toMatch(/Tempo|Bleu|Blanc|Rouge/);
    expect(container.querySelector('.bad')).toBeNull();
    expect(screen.getByText(/RTE via MyElectricalData/)).toBeTruthy();
  });

  it('a Tempo home sees today’s colour and that tomorrow is not published yet', () => {
    grid.apply({
      tempo: { today: { date: today, colour: 'blue' }, tomorrow: { date: tomorrow, colour: null, expected_at: '11:00' }, fetched_at: 1_760_000_000 },
      ecowatt: { days: [], fetched_at: null },
      source: 'MyElectricalData'
    });
    const { container } = render(GridStrip);
    expect(container.textContent).toContain(`Aujourd’hui${NB}: Bleu`);
    expect(container.textContent).toContain(`Demain${NB}: couleur pas encore publiée (vers 11:00)`);
    expect(container.querySelectorAll('.dot').length).toBe(2);
  });

  it('red is said with the bad colour, and in English', () => {
    applyLocale('en');
    grid.apply({
      tempo: { today: { date: today, colour: 'white' }, tomorrow: { date: tomorrow, colour: 'red', expected_at: null }, fetched_at: 1 },
      ecowatt: { days: [{ date: today, level: 3, hours: [{ start: '08:00', end: '10:00', level: 3 }] }], fetched_at: 1 },
      source: 'MyElectricalData'
    });
    const { container } = render(GridStrip);
    expect(container.textContent).toContain('Today: White');
    expect(container.textContent).toContain('Tomorrow: Red');
    expect(container.textContent).toContain('EcoWatt red today, 08:00–10:00');
    expect(container.querySelector('.eco.bad')).not.toBeNull();
  });

  it('level 1 everywhere and no Tempo: nothing at all', () => {
    grid.apply({ tempo: null, ecowatt: { days: [{ date: today, level: 1, hours: null }], fetched_at: 1 }, source: 'MyElectricalData' });
    const { container } = render(GridStrip);
    expect(container.querySelector('section')).toBeNull();
  });
});
