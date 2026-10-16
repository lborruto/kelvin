import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyLocale } from '$lib/i18n';
import type { ByRadiator, Heating, RadiatorSum } from '$lib/api/types';
import { house } from '$lib/stores/house.svelte';
import EnergyWhere from './EnergyWhere.svelte';

const media = vi.hoisted(() => ({ desktop: { matches: true } }));
vi.mock('$lib/media.svelte', () => media);

const row = (id: string, room: string | null, o: Partial<ByRadiator> = {}): ByRadiator => ({
  radiator_id: id, room_id: room, kwh: 100, hc_kwh: 40, hp_kwh: 60, eur: 25, coverage: 1, interpolated: false,
  apportioned: false, from: '2026-09-01', temp_avg: 19.4, setpoint_avg: 20, heating_hours: 3, ...o
});
const rad: RadiatorSum = { kwh: 268.4, hc_kwh: 110, hp_kwh: 158.4, eur: 61.02, interpolated: false, apportioned: false, coverage: 1 };
const heating = (o: Partial<Heating> = {}): Heating => ({ value: 0.651, days: 11, of_days: 13, since: '2026-10-03', inconsistent: false, ...o });
const span = { from: '2026-10-01', to: '2026-10-14' };
const text = (c: Element) => c.textContent!.replace(/\s+/g, ' ');
const base = (o: Record<string, unknown> = {}) => ({ heating: heating(), radiators: rad, restKwh: null, rows: [] as ByRadiator[], span, tariff: true, ...o });

function snapshot(rooms: { id: string; name: string; radiator_ids: string[] }[], radiators: object[]) {
  house.applySnapshot({
    house: { rooms: rooms as never, radiators: radiators as never },
    pending: [], overrides: [], status: { connected: true, last_ok_at: null, last_error: null }
  });
}

beforeEach(() => {
  media.desktop.matches = true;
  snapshot(
    [{ id: 'salon', name: 'Salon', radiator_ids: ['a', 'b'] }, { id: 'ch1', name: 'Chambre 1', radiator_ids: ['c'] }, { id: 'ch2', name: 'Chambre 2', radiator_ids: ['d'] }],
    [
      { id: 'a', room_id: 'salon', name: 'Fenêtre', model: 'HEKLA P', energy_wh: { total: 2_400_000, t1: 1_000_000, t2: 1_400_000 } },
      { id: 'b', room_id: 'salon', name: 'Porte', model: 'IPALA H', energy_wh: { total: 900_000, t1: null, t2: 900_000 } },
      { id: 'c', room_id: 'ch1', name: 'Radiateur', energy_wh: null },
      { id: 'd', room_id: 'ch2', name: 'Radiateur', energy_wh: null }
    ]
  );
});
afterEach(() => document.querySelectorAll('.fiche').forEach((n) => n.remove()));

describe('EnergyWhere: the heating share', () => {
  it('the radiators’ share over the common days, its meter, and the heating cost as a figure (est. when spread)', async () => {
    const { container } = render(EnergyWhere, base({ radiators: { ...rad, interpolated: true } }));
    expect(screen.getByRole('heading', { name: 'Où part l’énergie' })).toBeInTheDocument();
    expect(container.querySelector('section')).toHaveAttribute('id', 'energy-where');
    expect(text(container)).toContain('65 % de la consommation de la maison vient des radiateurs (11 jours sur 13).');
    expect(container.querySelector<HTMLElement>('.meter span')!.style.transform).toBe('scaleX(0.651)');
    expect(container.querySelector('.cost')).toHaveTextContent('Coût du chauffage ≈ 61,02 € est. · énergie seule');
    await fireEvent.click(screen.getByRole('button', { name: /^Coût du chauffage ≈\s61,02\s€, détails$/ }));
    const card = document.querySelector('.fiche')!;
    expect(card).toHaveTextContent(/Radiateurs\s*268,40\skWh/);
    expect(card).toHaveTextContent('estimé · réparti entre deux relevés du radiateur');
  });

  it('the parts in kWh are in the cost’s Fiche when every day is covered; « 1 jour », not « 1 jours »', async () => {
    const { container } = render(EnergyWhere, base({ heating: heating({ value: 0.5, days: 1, of_days: 2 }), restKwh: 144.2 }));
    expect(text(container)).toContain('(1 jour sur 2)');
    await fireEvent.click(screen.getByRole('button', { name: /^Coût du chauffage/ }));
    expect(document.querySelector('.fiche')).toHaveTextContent(/Reste\sde\sla\smaison\s*144,20\skWh/);
  });

  it('L7: radiators above the meter read « — » with the reason; no common day reads « — »', () => {
    const { container, unmount } = render(EnergyWhere, base({ heating: heating({ value: 1.08, inconsistent: true }) }));
    expect(container.querySelector('.share')).toHaveTextContent('—');
    expect(screen.getByText('Les radiateurs dépassent le compteur : données incohérentes.')).toBeInTheDocument();
    expect(container.querySelector('.meter')).toBeNull();
    unmount();
    render(EnergyWhere, base({ heating: heating({ value: null, days: 0, of_days: 4, since: null }), radiators: null }));
    expect(screen.getByText('Aucun jour couvert à la fois par le Linky et par tous les radiateurs.')).toBeInTheDocument();
    // No radiator figure at all: the cost reads « — » and says why, never 0 €.
    expect(screen.getByText(/Coût du chauffage —/)).toHaveTextContent('Coût du chauffage — (aucun relevé de radiateur sur la période)');
  });

  it('a partial radiator sum is a footnote mark, its sentence written once under the list', () => {
    const { container } = render(EnergyWhere, base({ radiators: { ...rad, coverage: 0.75 }, rows: [row('a', 'salon')] }));
    expect(container.querySelector('.cost sup')).toHaveTextContent('¹');
    expect(text(container.querySelector('.foot')!)).toContain('¹ Radiateurs mesurés sur 75,0 % des jours : somme partielle.');
    const none = render(EnergyWhere, base({ heating: heating({ value: null, days: 0, of_days: 1 }), radiators: { ...rad, coverage: 0 }, rows: [row('a', 'salon')] }));
    expect(text(none.container)).toContain('Aucun jour de radiateur mesuré en entier : somme partielle.');
    const running = render(EnergyWhere, base({ radiators: { ...rad, coverage: 0.75 }, running: true, rows: [row('a', 'salon')] }));
    expect(text(running.container)).toContain('Radiateurs mesurés sur 75,0 % des jours (jusqu’à hier) : somme partielle.');
  });

  it('a running period says its radiators count up to yesterday; without a tariff the cost says why', () => {
    const { container, unmount } = render(EnergyWhere, base({ running: true, rows: [row('a', 'salon')] }));
    expect(text(container)).toContain('Période en cours : radiateurs comptés jusqu’à hier.');
    unmount();
    render(EnergyWhere, base({ radiators: { ...rad, eur: null, hc_kwh: null, hp_kwh: null }, tariff: false }));
    expect(screen.getByText(/Coût du chauffage —/)).toHaveTextContent('Coût du chauffage — (pas de tarif renseigné)');
  });

  it('without Linky: no heating share, the rooms alone', () => {
    const { container } = render(EnergyWhere, base({ linky: false, radiators: { ...rad, coverage: 0.5 }, rows: [row('a', 'salon')] }));
    expect(container.querySelector('.heating')).toBeNull();
    // Its coverage footnote goes with the heating line.
    expect(container.textContent).not.toContain('Radiateurs mesurés sur');
    expect(container.querySelectorAll('.rooms > li')).toHaveLength(3);
  });
});

describe('EnergyWhere: the rooms', () => {
  const rows = [
    row('a', 'salon', { kwh: 64.87, hc_kwh: 20.11, hp_kwh: 44.76, eur: 17.27 }),
    row('c', 'ch1', { kwh: 17.29, hc_kwh: 5, hp_kwh: 12.29, eur: 4.6, coverage: 0.5, from: '2026-10-08' }),
    row('d', 'ch2', { kwh: 18.54, hc_kwh: 6, hp_kwh: 12.54, eur: 4.93, coverage: 0.5, from: '2026-10-08' })
  ];
  const names = (c: Element) => [...c.querySelectorAll('.rooms > li .n')].map((n) => n.textContent);

  it('ranked by kWh, shares adding to 100 %, € adding to the rooms’ cost, the period as meta', () => {
    const { container } = render(EnergyWhere, base({ rows }));
    expect(container.querySelector('.meta')).toHaveTextContent('du 1/10 au 13/10');
    // The room without a recorded radiator (Salon holds a second radiator never recorded) still ranks by its kWh.
    expect(names(container)).toEqual(['Salon', 'Chambre 2', 'Chambre 1']);
    const pct = [...container.querySelectorAll('.rooms > li .pct')].map((p) => p.textContent!);
    expect(pct).toEqual(['64,4 %', '18,4 %', '17,2 %']);
    expect(pct.reduce((a, p) => a + Number(p.replace(/[^\d,]/g, '').replace(',', '.')), 0)).toBeCloseTo(100, 5);
    const eur = [...container.querySelectorAll('.rooms > li .eur')].map((e) => Number(e.textContent!.replace(/[^\d,]/g, '').replace(',', '.')));
    expect(eur.reduce((a, b) => a + b, 0)).toBeCloseTo(17.27 + 4.93 + 4.6, 5);
    expect(screen.getByRole('img', { name: /^Salon\s:\s64,4\s%\sde l’énergie des radiateurs$/ })).toBeInTheDocument();
    // Spec §2.7, ruling 5: a radiator's past figures count toward its current room.
    expect(container).toHaveTextContent('Pièces selon la répartition actuelle des radiateurs.');
  });

  it('partial rows carry one mark per sentence, written once under the list', () => {
    const { container } = render(EnergyWhere, base({ rows }));
    const sups = [...container.querySelectorAll('.rooms > li .mark')].map((s) => s.textContent);
    expect(sups).toEqual(['¹', '¹']);
    expect(container.querySelectorAll('.foot li')).toHaveLength(1);
    expect(container.querySelector('.foot')).toHaveTextContent('¹ partiel : 1 radiateur sur 1 enregistré à partir du 8/10');
  });

  it('a room’s kWh is a figure: its Fiche gives HC/HP, the cost and how it was measured', async () => {
    render(EnergyWhere, base({ rows: [row('a', 'salon', { interpolated: true })] }));
    await fireEvent.click(screen.getByRole('button', { name: /^Salon, 100,00\skWh, détails$/ }));
    const card = document.querySelector('.fiche')!;
    expect(card).toHaveTextContent(/HC\s*40,00\skWh/);
    expect(card).toHaveTextContent(/Coût\s\(énergie\)\s*25,00\s€/);
    expect(card).toHaveTextContent('estimé · réparti entre deux relevés du radiateur');
  });

  it('a row opens (findable while closed) on its facts and radiators, with the lifetime counters as figures', async () => {
    const onroom = vi.fn();
    const { container } = render(EnergyWhere, base({ rows: [row('a', 'salon'), row('b', 'salon', { kwh: 50, coverage: 0.6, from: '2026-10-07' })], onroom }));
    const toggle = container.querySelector<HTMLButtonElement>('.rooms button.name')!;
    const region = document.getElementById(toggle.getAttribute('aria-controls')!)!;
    expect(region).toHaveAttribute('hidden', 'until-found');
    await fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(region).not.toHaveAttribute('hidden');
    expect(onroom).toHaveBeenCalledWith('salon');
    expect(text(region)).toContain('Moy. °C19,4 °C');
    expect([...region.querySelectorAll('.rname')].map((n) => n.textContent)).toEqual(['FenêtreHEKLA P', 'PorteIPALA H']);
    expect(text(region)).toContain('enregistré à partir du 7/10');
    expect(text(region)).toMatch(/depuis l’installation 2\s400\skWh/);
    await fireEvent.click(screen.getByRole('button', { name: /^depuis l’installation 2\s400\skWh, détails$/ }));
    const card = document.querySelector('.fiche')!;
    expect(card).toHaveTextContent(/Compteur\sinterne\s1\sdu\sradiateur\s*1\s000\skWh/);
    expect(card).toHaveTextContent(/Compteur\sinterne\s2\sdu\sradiateur\s*1\s400\skWh/);
    // An absent register reads « — », never 0.
    await fireEvent.click(screen.getByRole('button', { name: /^depuis l’installation 900\skWh, détails$/ }));
    expect([...document.querySelectorAll('.fiche')].at(-1)).toHaveTextContent(/Compteur\sinterne\s1\sdu\sradiateur\s*—/);
    // Find-in-page opens a closed row.
    await fireEvent.click(toggle);
    region.dispatchEvent(new Event('beforematch'));
    await Promise.resolve();
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('without a tariff no € and no HC/HP; under Base the € stays and HC/HP go', () => {
    const { container, unmount } = render(EnergyWhere, base({ rows, tariff: false, radiators: { ...rad, eur: null } }));
    expect(container.querySelector('.eur')).toBeNull();
    expect(text(container.querySelector('.rooms')!)).not.toContain('HC');
    unmount();
    const b = render(EnergyWhere, base({ rows, split: false }));
    expect(b.container.querySelector('.eur')).not.toBeNull();
    expect(text(b.container.querySelector('.rooms')!)).not.toContain('Heures creuses');
  });

  it('°C, consigne and heures de chauffe « — » carry their reason; a room with no recorded radiator says so; « Sans pièce » last', () => {
    const none = { temp_avg: null, setpoint_avg: null, heating_hours: null };
    const { container } = render(EnergyWhere, base({ rows: [row('a', 'salon', none), row('z', null, { kwh: 500 })] }));
    expect(names(container).at(-1)).toBe('Sans pièce');
    const salon = container.querySelector('.rooms > li')!;
    expect(salon).toHaveTextContent('°C, consigne et chauffe : moins de la moitié de la période mesurée');
    const ch1 = [...container.querySelectorAll('.rooms > li')].find((l) => l.querySelector('.n')!.textContent === 'Chambre 1')!;
    expect(ch1).toHaveTextContent('aucun radiateur enregistré');
    expect(ch1.querySelector('.kwh')).toHaveTextContent('—');
  });

  it('holds a skeleton until the house is known, and says « le … » for a single day', () => {
    house.reset();
    const { container } = render(EnergyWhere, base({ rows, span: { from: '2026-10-13', to: '2026-10-14' } }));
    expect(container.querySelector('section')).toHaveAttribute('aria-busy', 'true');
    expect(container.querySelector('.skeleton')).not.toBeNull();
    expect(container.querySelector('.meta')).toHaveTextContent('le 13 octobre 2026');
  });
});

it('in English: the heading, the share sentence, the cost, a partial room', () => {
  applyLocale('en');
  const { container } = render(EnergyWhere, base({ heating: heating(), radiators: { ...rad, interpolated: true }, rows: [row('a', 'salon', { coverage: 0.5, from: '2026-10-08' })] }));
  expect(screen.getByRole('heading', { name: 'Where the energy goes' })).toBeInTheDocument();
  const t = text(container);
  expect(t).toContain('65% of the home’s consumption comes from the radiators (11 of 13 days).');
  expect(t).toContain('Heating cost ≈ €61.02 est. · energy only');
  expect(container.querySelector('.foot')).toHaveTextContent('¹ partial: 1 of 1 radiator recorded from 8/10');
});
