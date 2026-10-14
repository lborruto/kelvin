import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import HcHpPanel from './HcHpPanel.svelte';

const lens = { hc_share: 0.384, slot_share: 0.3333, avg_price: 0.2437, delta_price: 0.0632 };
const text = (c: HTMLElement) => c.textContent!.replace(/\s+/g, ' ');

describe('HcHpPanel', () => {
  it('asks for the tariff when there is none', () => {
    render(HcHpPanel, { lens: null, tariff: false, hpKwh: null });
    expect(screen.getByRole('link', { name: 'Renseignez le tarif' })).toHaveAttribute('href', '/maison#tarif');
    expect(screen.getByText(/pour voir la répartition\./)).toBeInTheDocument();
  });

  it('states the facts, and the value of moving HP to HC with its formula, never as advice', async () => {
    const { container } = render(HcHpPanel, { lens, tariff: true, hpKwh: 254.3 });
    let t = text(container);
    expect(t).toContain('Part en heures creuses 38,4 %');
    expect(t).toContain('vos heures creuses durent 33,3 % de la journée');
    expect(t).toContain('Prix moyen payé 0,2437 €/kWh');
    expect(t).toContain('Chaque kWh passé d’HP en HC −0,0632 €/kWh');
    expect(t).toContain('Si 10 % de vos HP (25,43 kWh) étaient en HC : −1,61 €, à consommation identique.');
    expect(t).toContain('10 % × 254,30 kWh × 0,0632 €/kWh = 1,61 €');
    expect(t).toContain('Calcul sur vos prix et votre consommation, pas une économie garantie.');
    expect(t.match(/économi/g)).toHaveLength(1); // spec §9.1 rule 6
    const slider = screen.getByRole('slider', { name: 'Part de vos heures pleines déplacée en heures creuses' });
    expect(slider).toHaveAttribute('step', '5');
    expect(slider).toHaveAttribute('aria-valuetext', '10\u00a0%');
    await fireEvent.input(slider, { target: { value: '30' } });
    t = text(container);
    expect(t).toContain('Si 30 % de vos HP (76,29 kWh) étaient en HC : −4,82 €, à consommation identique.');
  });

  it('a tariff without HC slots reads « — » and says so', () => {
    const { container } = render(HcHpPanel, { lens: null, tariff: true, hpKwh: 10 });
    expect(text(container)).toContain('Part en heures creuses —');
    expect(screen.getByText('Le tarif n’a pas d’heures creuses.')).toBeInTheDocument();
  });

  it('a period without consumption reads « — » and says why', () => {
    const { container } = render(HcHpPanel, { lens: { ...lens, hc_share: null, avg_price: null }, tariff: true, hpKwh: null });
    expect(text(container)).toContain('Part en heures creuses —');
    expect(text(container)).toContain('Prix moyen payé —');
    expect(screen.getByText('Aucune consommation Linky sur la période.')).toBeInTheDocument();
    expect(container.querySelector('input')).toBeNull();
  });
});
