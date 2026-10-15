import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import type { TempoLens } from '$lib/api/types';
import { applyLocale } from '$lib/i18n';
import TempoRows from './TempoRows.svelte';

const NB = '\u00a0';
const text = (t: string) => (_: string, el: Element | null) => el?.textContent === t && el.children.length === 0;
const lens: TempoLens = {
  rows: [
    { key: 'blue_hc', kwh: 8, eur: 1.04 }, { key: 'blue_hp', kwh: 16, eur: 2.57 },
    { key: 'white_hc', kwh: 8, eur: 1.19 }, { key: 'white_hp', kwh: 16, eur: 3.03 },
    { key: 'red_hc', kwh: 8, eur: 1.25 }, { key: 'red_hp', kwh: 16, eur: 12.1 }
  ],
  days: { blue: 1, white: 1, red: 1, unknown: 1 },
  unknown_kwh: 18
};

describe('TempoRows', () => {
  it('six rows in kWh and €, the colour days, and the kWh without a colour', () => {
    const { container } = render(TempoRows, { lens });
    const rows = container.querySelectorAll('tbody tr');
    expect(rows.length).toBe(6);
    expect(rows[5].textContent).toContain('Rouge HP');
    expect(rows[5].textContent).toContain(`16,00${NB}kWh`);
    expect(rows[5].textContent).toContain(`12,10${NB}€`);
    expect(screen.getByText(text(`Jours rouges${NB}: 1`))).toBeTruthy();
    expect(screen.getByText(text(`Jours Tempo${NB}: 1 bleu · 1 blanc · 1 rouge · 1 sans couleur connue`))).toBeTruthy();
    expect(screen.getByText(text(`18,00${NB}kWh sans couleur connue, non comptés en euros.`))).toBeTruthy();
  });
  it('in English', () => {
    applyLocale('en');
    render(TempoRows, { lens: { ...lens, unknown_kwh: null, days: { blue: 3, white: 0, red: 2, unknown: 0 } } });
    expect(screen.getByText('Red days: 2')).toBeTruthy();
    expect(screen.getByText('Tempo days: 3 blue · 0 white · 2 red')).toBeTruthy();
    expect(screen.getByText('Red peak')).toBeTruthy();
    applyLocale('fr');
  });
});
