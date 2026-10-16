import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { applyLocale } from '$lib/i18n';
import HcHpPanel from './HcHpPanel.svelte';

const lens = { hc_share: 0.384, slot_share: 0.3333, avg_price: 0.2437, delta_price: 0.0632 };
const text = (c: HTMLElement) => c.textContent!.replace(/\s+/g, ' ');

describe('HcHpPanel', () => {
  it('asks for the tariff when there is none', () => {
    render(HcHpPanel, { lens: null, tariff: false, hpKwh: null });
    expect(screen.getByRole('link', { name: 'Renseignez le tarif' })).toHaveAttribute('href', '/home#tariff');
    expect(screen.getByText(/pour voir la répartition\./)).toBeInTheDocument();
  });

  it('states the facts, and the value of moving HP to HC with its formula, never as advice', async () => {
    const { container } = render(HcHpPanel, { lens, tariff: true, hpKwh: 254.3 });
    // L0: the share against the hours, its meter; the rest one « Détails » away (closed, findable).
    expect(text(container.querySelector('.lead')!)).toBe('38,4 % de l’énergie, pour 33,3 % des heures');
    expect(container.querySelector('#offpeak')).not.toBeNull();
    const details = screen.getByRole('button', { name: /^Détails/ });
    expect(details).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('slider')).toBeNull();
    await fireEvent.click(details);
    let t = text(container);
    expect(t).toContain('Part en heures creuses 38,4 %');
    expect(t).toContain('vos heures creuses durent 33,3 % de la journée');
    expect(t).toContain('Prix moyen payé 0,2437 €/kWh');
    expect(t).toContain('Gain par kWh déplacé en heures creuses −0,0632 €/kWh');
    expect(t).toContain('Si 10 % de vos heures pleines (25,43 kWh) passaient en heures creuses : −1,61 €, à consommation égale.');
    expect(t).toContain('10 % × 254,30 kWh × 0,0632 €/kWh = 1,61 €');
    expect(t).toContain('Calcul sur vos prix et votre consommation, pas une économie garantie.');
    expect(t.match(/économi/g)).toHaveLength(1); // spec §9.1 rule 6
    const slider = screen.getByRole('slider', { name: 'Part de vos heures pleines déplacée en heures creuses' });
    expect(slider).toHaveAttribute('step', '5');
    expect(slider).toHaveAttribute('aria-valuetext', '10\u00a0%');
    await fireEvent.input(slider, { target: { value: '30' } });
    t = text(container);
    expect(t).toContain('Si 30 % de vos heures pleines (76,29 kWh) passaient en heures creuses : −4,82 €, à consommation égale.');
  });

  it('a tariff without HC slots reads « — » and says so', () => {
    const { container } = render(HcHpPanel, { lens: null, tariff: true, hpKwh: 10 });
    expect(container.querySelector('.big')).toHaveTextContent('—');
    expect(screen.getByText('Le tarif n’a pas d’heures creuses.')).toBeInTheDocument();
  });

  it('a period without consumption reads « — » and says why', () => {
    const { container } = render(HcHpPanel, { lens: { ...lens, hc_share: null, avg_price: null }, tariff: true, hpKwh: null });
    expect(container.querySelector('.big')).toHaveTextContent('—');
    expect(text(container)).toContain('Prix moyen payé —');
    expect(screen.getByText('Aucune consommation Linky sur la période.')).toBeInTheDocument();
    expect(container.querySelector('input')).toBeNull();
  });
});

it('in English: off-peak share, prices with € first, the slider and its sentence', async () => {
  applyLocale('en');
  const { container } = render(HcHpPanel, { lens, tariff: true, hpKwh: 254.3 });
  expect(text(container.querySelector('.lead')!)).toBe('38.4% of the energy, for 33.3% of the hours');
  await fireEvent.click(screen.getByRole('button', { name: /^Details/ }));
  const t = text(container);
  expect(t).toContain('Off-peak share 38.4%');
  expect(t).toContain('your off-peak hours cover 33.3% of the day');
  expect(t).toContain('Average price paid €0.2437/kWh');
  expect(t).toContain('Saving per kWh moved to off-peak −€0.0632/kWh');
  expect(t).toContain('If 10% of your peak use (25.43 kWh) moved to off-peak: −€1.61, for the same consumption.');
  expect(t).toContain('10% × 254.30 kWh × €0.0632/kWh = €1.61');
  expect(screen.getByRole('slider', { name: 'Share of your peak use moved to off-peak' })).toHaveAttribute('aria-valuetext', '10%');
});

describe('a negative price difference (off-peak dearer than peak)', () => {
  const dear = { ...lens, delta_price: -0.07 };

  it('French: the sign leads the figure', () => {
    applyLocale('fr');
    const { container } = render(HcHpPanel, { lens: dear, tariff: true, hpKwh: 254.3, });
    expect(text(container)).toContain('10 % × 254,30 kWh × −0,0700 €/kWh = ');
  });

  it('English: the sign comes before the euro, as in fmtPrice', () => {
    applyLocale('en');
    const { container } = render(HcHpPanel, { lens: dear, tariff: true, hpKwh: 254.3 });
    const t = text(container);
    expect(t).toContain('10% × 254.30 kWh × −€0.0700/kWh = ');
    expect(t).not.toContain('€−');
  });
});

it('Base says there are no off-peak hours; Tempo shows its six rows without the HP→HC line', () => {
  const { unmount } = render(HcHpPanel, { lens: null, tariff: true, hpKwh: null, option: 'base', tempo: null });
  expect(screen.getByText((_, el) => el?.textContent === 'Option base\u00a0: pas d’heures creuses.')).toBeTruthy();
  unmount();
  const tempoLens = {
    rows: ['blue_hc', 'blue_hp', 'white_hc', 'white_hp', 'red_hc', 'red_hp'].map((key) => ({ key, kwh: 1, eur: 0.2 })),
    days: { blue: 1, white: 0, red: 1, unknown: 0 },
    unknown_kwh: null
  };
  const { container } = render(HcHpPanel, {
    lens: { hc_share: 0.33, slot_share: 0.3333, avg_price: 0.21, delta_price: null }, tariff: true, hpKwh: 3, option: 'tempo', tempo: tempoLens
  });
  expect(container.querySelectorAll('tbody tr').length).toBe(6);
  expect(container.querySelector('input[type="range"]')).toBeNull();
});
