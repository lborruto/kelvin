import { describe, expect, it } from 'vitest';
import type { EnergyDay, EnergyInterval, EnergyReport, EnergySummary } from './api/types';
import { BOM, csvNum, csvText, curveCsv, ENERGY_HEADER, energyCsv, pricesCsv, roomsCsv } from './csv';
import type { RoomRow } from './roomEnergy';
import { parisDayStart } from './time';

const lines = (text: string) => text.slice(BOM.length).split('\r\n').filter(Boolean);
const summary = (o: Partial<EnergySummary> = {}): EnergySummary => ({
  kwh: 22.041, hc_kwh: 8.976, hp_kwh: 13.065, radiators_kwh: 14.2, energy_eur: 5.31, subscription_eur: 0.48, eur: 5.79,
  days: 1, missing_days: 0, estimated_split: false, split_method: 'curve',
  prices: [{ valid_from: '2026-08-01', subscription_eur_month: 15, rates: { hc: 0.2068, hp: 0.27 } }],
  retro_priced: false, present_days: 1, curve: null,
  radiators: { kwh: 14.2, hc_kwh: 6.1, hp_kwh: 8.1, eur: 3.45, interpolated: false, apportioned: false, coverage: 1 },
  rest_kwh: 7.841, ...o
});

describe('CSV cells (spec §3,2.9)', () => {
  it('numbers use a decimal comma (French spreadsheets), fixed decimals, no grouping, and an empty cell for null (never 0)', () => {
    expect(csvNum(1.23456, 3)).toBe('1,235');
    expect(csvNum(0, 3)).toBe('0,000');
    expect(csvNum(-0.0001, 2)).toBe('0,00');
    expect(csvNum(null, 3)).toBe('');
    expect(csvNum(undefined, 2)).toBe('');
    expect(csvNum(Number.NaN, 2)).toBe('');
    expect(csvNum(1234567.891, 2)).toBe('1234567,89');
  });
  it('numbers round as the page does (a decimal tie rounds up, as Intl does), never as binary toFixed', () => {
    expect(csvNum(32.535, 2)).toBe('32,54');
    expect(csvNum(1.005, 2)).toBe('1,01');
    expect(csvNum(-0.4, 0)).toBe('0');
  });
  it('text is quoted when it must be, and a leading formula character is neutralised', () => {
    expect(csvText('Salon')).toBe('Salon');
    expect(csvText('=SUM(A1:A9)')).toBe("'=SUM(A1:A9)");
    expect(csvText('+33 6')).toBe("'+33 6");
    expect(csvText('-1+1')).toBe("'-1+1");
    expect(csvText('@cmd')).toBe("'@cmd");
    expect(csvText('\tx')).toBe("'\tx");
    expect(csvText('\rx')).toBe('"\'\rx"');
    expect(csvText('Chambre; bleue')).toBe('"Chambre; bleue"');
    expect(csvText('Le "grand" salon')).toBe('"Le ""grand"" salon"');
    expect(csvText('=A1;B1')).toBe('"\'=A1;B1"');
    expect(csvText(null)).toBe('');
  });
  it('price rows: compact, dated when a bucket used several', () => {
    expect(pricesCsv([{ valid_from: '2026-08-01', subscription_eur_month: 15, rates: { hp: 0.27, hc: 0.2068 } }])).toBe('hc=0,2068|hp=0,2700');
    expect(
      pricesCsv([
        { valid_from: '2026-01-01', subscription_eur_month: 15, rates: { hc: 0.2, hp: 0.3 } },
        { valid_from: '2026-09-16', subscription_eur_month: 16, rates: { hc: 0.25, hp: 0.35 } }
      ])
    ).toBe('2026-01-01:hc=0,2000|hp=0,3000 2026-09-16:hc=0,2500|hp=0,3500');
    expect(pricesCsv([])).toBe('');
  });
});

describe('energie_<from>_<to>_<group>.csv', () => {
  const chart = {
    group: 'day',
    buckets: [
      { key: '2026-10-10', ...summary() }, // before the selected period: not exported
      { key: '2026-10-11', ...summary() },
      { key: '2026-10-12', ...summary({ kwh: null, hc_kwh: null, hp_kwh: null, energy_eur: null, eur: null, rest_kwh: null, present_days: 0, missing_days: 1, prices: [], radiators: null }) },
      {
        key: '2026-10-13',
        ...summary({ estimated_split: true, rest_kwh: null, radiators: { kwh: 9.5, hc_kwh: 4.1, hp_kwh: 5.4, eur: 2.3, interpolated: false, apportioned: true, coverage: 0.5 } })
      },
      { key: '2026-10-14', ...summary() } // outside the selected period: not exported
    ]
  } as unknown as EnergyReport;
  const main = {
    period: {
      from: '2026-10-11', to: '2026-10-14',
      ...summary({ kwh: 44.082, energy_eur: 10.62, subscription_eur: 1.44, eur: 12.06, missing_days: 1, rest_kwh: null,
        radiators: { kwh: 23.7, hc_kwh: 10.2, hp_kwh: 13.5, eur: 5.75, interpolated: false, apportioned: true, coverage: 0.8333 } })
    }
  } as unknown as EnergyReport;
  const TODAY = '2026-10-20'; // the period is over: every radiator sum runs to its last day
  const file = energyCsv(chart, main, { from: '2026-10-11', to: '2026-10-14' }, TODAY);
  const [head, ...rows] = lines(file.text);

  it('exports exactly the period: its buckets, then the total; UTF-8 BOM, « ; », CRLF, decimal commas, ISO times with offset', () => {
    expect(file.name).toBe('energie_2026-10-11_2026-10-14_day.csv');
    expect(file.text.startsWith(BOM)).toBe(true);
    expect(file.text.endsWith('\r\n')).toBe(true);
    expect(file.text.slice(BOM.length).split('\n').every((l) => l === '' || l.endsWith('\r'))).toBe(true);
    expect(head).toBe(
      'periode;debut;fin;maison_kwh;hc_kwh;hp_kwh;split_estime;radiateurs_kwh;radiateurs_interp;reste_kwh;energie_eur;abonnement_eur;total_eur;prix;jours_manquants;radiateurs_jusqu_au;radiateurs_couverture'
    );
    expect(rows).toHaveLength(4);
    expect(rows[0]).toBe('2026-10-11;2026-10-11T00:00:00+02:00;2026-10-12T00:00:00+02:00;22,041;8,976;13,065;0;14,200;0;7,841;5,31;0,48;5,79;hc=0,2068|hp=0,2700;0;2026-10-11;1,0000');
    for (const r of rows) expect(r.split(';')).toHaveLength(ENERGY_HEADER.length);
  });

  it('a missing value is an empty cell, never 0; the subscription a counted day pays stays', () => {
    expect(rows[1]).toBe('2026-10-12;2026-10-12T00:00:00+02:00;2026-10-13T00:00:00+02:00;;;;;;;;;0,48;;;1;;');
  });

  it('R1: a partial radiator sum carries its coverage (the last column), and estimates say so', () => {
    const c = rows[2].split(';');
    expect(c.slice(6, 10)).toEqual(['1', '9,500', '1', '']);
    expect(c.at(-1)).toBe('0,5000');
  });

  it('R1, final review I-3: a running period’s radiator sum names the last day it counts, never reads as whole', () => {
    // Today is 13 October: the period runs to the 14th, its radiators count up to yesterday (the 12th).
    const running = energyCsv(chart, main, { from: '2026-10-11', to: '2026-10-14' }, '2026-10-13');
    const [h, ...body] = lines(running.text);
    const cols = h.split(';');
    const at = (r: string, name: string) => r.split(';')[cols.indexOf(name)];
    expect(cols.at(-1)).toBe('radiateurs_couverture');
    expect(cols.at(-2)).toBe('radiateurs_jusqu_au');
    const total = body.at(-1)!;
    expect(at(total, 'fin')).toBe('2026-10-14T00:00:00+02:00'); // the period
    expect(at(total, 'radiateurs_jusqu_au')).toBe('2026-10-12'); // what the radiator sum counts
    // A bar running into today: the same rule.
    const bar = body.find((r) => r.startsWith('2026-10-13;'))!;
    expect(at(bar, 'radiateurs_jusqu_au')).toBe('2026-10-12');
    // A bar wholly past: its own last day.
    expect(at(body.find((r) => r.startsWith('2026-10-11;'))!, 'radiateurs_jusqu_au')).toBe('2026-10-11');
  });

  it('the total row is the hero’s period, its own figures (never a sum recomputed here)', () => {
    expect(rows[3]).toBe(
      'total;2026-10-11T00:00:00+02:00;2026-10-14T00:00:00+02:00;44,082;8,976;13,065;0;23,700;1;;10,62;1,44;12,06;hc=0,2068|hp=0,2700;1;2026-10-13;0,8333'
    );
  });

  it('a day’s figures are its bucket’s, whatever period is exported', () => {
    const week = energyCsv(chart, main, { from: '2026-10-10', to: '2026-10-15' }, TODAY);
    const one = energyCsv(chart, main, { from: '2026-10-11', to: '2026-10-12' }, TODAY);
    const row = (f: { text: string }) => lines(f.text).find((l) => l.startsWith('2026-10-11;'));
    expect(row(week)).toBe(rows[0]);
    expect(row(one)).toBe(rows[0]);
  });

  it('one row per bar: the buckets before the first Linky day, which the chart leaves out, are not exported', () => {
    const early = {
      group: 'day', linky: true,
      buckets: [
        { key: '2026-10-11', ...summary({ kwh: null, hc_kwh: null, hp_kwh: null, energy_eur: null, subscription_eur: null, eur: null, rest_kwh: null, present_days: 0, prices: [], radiators: null }) },
        { key: '2026-10-12', ...summary() },
        { key: '2026-10-13', ...summary({ kwh: null, hc_kwh: null, hp_kwh: null, energy_eur: null, eur: null, rest_kwh: null, present_days: 0, missing_days: 1, prices: [], radiators: null }) }
      ]
    } as unknown as EnergyReport;
    const body = lines(energyCsv(early, main, { from: '2026-10-11', to: '2026-10-14' }, TODAY).text).slice(1);
    expect(body.map((l) => l.split(';')[0])).toEqual(['2026-10-12', '2026-10-13', 'total']);
  });

  it('a counted day before the first Linky day is a row: it pays its subscription, so the rows add up to the total (final review minor 4)', () => {
    const early = {
      group: 'day', linky: true,
      buckets: [
        { key: '2026-10-11', ...summary({ kwh: null, hc_kwh: null, hp_kwh: null, energy_eur: null, subscription_eur: null, eur: null, rest_kwh: null, present_days: 0, prices: [], radiators: null }) },
        { key: '2026-10-12', ...summary({ kwh: null, hc_kwh: null, hp_kwh: null, energy_eur: null, eur: null, rest_kwh: null, present_days: 0, missing_days: 1, prices: [], radiators: null }) },
        { key: '2026-10-13', ...summary() }
      ]
    } as unknown as EnergyReport;
    const body = lines(energyCsv(early, main, { from: '2026-10-11', to: '2026-10-14' }, TODAY).text).slice(1);
    expect(body.map((l) => l.split(';')[0])).toEqual(['2026-10-12', '2026-10-13', 'total']);
    expect(body[0].split(';')[11]).toBe('0,48');
  });

  it('month buckets: one row per month inside the year, the total last', () => {
    const year = {
      group: 'month',
      buckets: ['2025-12', '2026-01', '2026-02'].map((key) => ({ key, ...summary({ days: 31 }) }))
    } as unknown as EnergyReport;
    const f = energyCsv(year, main, { from: '2026-01-01', to: '2027-01-01' }, TODAY);
    expect(f.name).toBe('energie_2026-01-01_2027-01-01_month.csv');
    const body = lines(f.text).slice(1);
    expect(body.map((l) => l.split(';').slice(0, 3).join(';'))).toEqual([
      '2026-01;2026-01-01T00:00:00+01:00;2026-02-01T00:00:00+01:00',
      '2026-02;2026-02-01T00:00:00+01:00;2026-03-01T00:00:00+01:00',
      'total;2026-01-01T00:00:00+01:00;2027-01-01T00:00:00+01:00'
    ]);
  });
});

describe('courbe_<date>.csv', () => {
  it('a DST day exports 50 rows with distinct offsets', () => {
    const a = parisDayStart('2026-10-25') / 1000;
    const intervals: EnergyInterval[] = Array.from({ length: 50 }, (_, i) => ({
      ts: a + i * 1800, minutes: 30, wh: 367.4, w: 735, offpeak: i < 12 ? 1 : 0.6667, boundary: false, price: 0.2068,
      eur: 0.07598, radiators_wh: i === 3 ? null : 210.6, radiators_known: i === 3 ? 1 : 2, radiators_total: 2, radiators_interp: false,
      radiators_apportioned: false, by_room: {}
    }));
    const file = curveCsv({ date: '2026-10-25', intervals } as unknown as EnergyDay);
    expect(file.name).toBe('courbe_2026-10-25.csv');
    const [head, ...rows] = lines(file.text);
    expect(head).toBe('debut;fin;minutes;wh;w_moyen;part_hc;couleur_tempo;prix;eur;radiateurs_wh');
    expect(rows).toHaveLength(50);
    expect(new Set(rows.map((r) => r.split(';')[0])).size).toBe(50);
    expect(rows[4].split(';')[0]).toBe('2026-10-25T02:00:00+02:00');
    expect(rows[6].split(';')[0]).toBe('2026-10-25T02:00:00+01:00');
    expect(rows[0]).toBe('2026-10-25T00:00:00+02:00;2026-10-25T00:30:00+02:00;30;367;735;1,0000;;0,2068;0,0760;211');
    expect(rows[3].split(';')[9]).toBe('');
    expect(rows.at(-1)!.split(';')[1]).toBe('2026-10-26T00:00:00+01:00');
  });

  it('without a tariff, price, cost and HC share are empty cells', () => {
    const a = parisDayStart('2026-10-12') / 1000;
    const iv: EnergyInterval = {
      ts: a, minutes: 30, wh: 0, w: 0, offpeak: null, boundary: false, price: null, eur: null, radiators_wh: 0,
      radiators_known: 1, radiators_total: 1, radiators_interp: false, radiators_apportioned: false, by_room: {}
    };
    const [, row] = lines(curveCsv({ date: '2026-10-12', intervals: [iv] } as unknown as EnergyDay).text);
    expect(row).toBe('2026-10-12T00:00:00+02:00;2026-10-12T00:30:00+02:00;30;0;0;;;;;0');
  });
});

describe('pieces_<from>_<to>.csv', () => {
  it('rooms then their radiators; names only, no ids; injected names neutralised', () => {
    const shown = { kwh: null, hc: null, hp: null };
    const fig = { hc: 40, hp: 60, eur: 25, temp: 19.4, setpoint: 20, hours: 3, est: false, partial: null, statsWhy: null, shown };
    const rows: RoomRow[] = [
      {
        id: 'p-1', name: '=Salon', kwh: 100, share: '', fraction: 0.625, ...fig,
        radiators: [{ id: 'rad-9312063', name: 'Fenêtre', kwh: 100, ...fig, coverage: 0.8, from: '2026-10-07' }]
      },
      {
        id: 'p-2', name: 'Bureau', kwh: null, share: '', fraction: 0, ...fig, hc: null, hp: null, eur: null, temp: null, setpoint: null,
        hours: null, radiators: []
      }
    ];
    const file = roomsCsv(rows, { from: '2026-10-01', to: '2026-10-14' });
    expect(file.name).toBe('pieces_2026-10-01_2026-10-14.csv');
    const [head, ...body] = lines(file.text);
    expect(head).toBe('piece;radiateur;kwh;part;hc_kwh;hp_kwh;eur;temp_moy;consigne_moy;heures_chauffe;couverture;depuis');
    expect(body).toEqual([
      "'=Salon;;100,000;0,6250;40,000;60,000;25,00;19,4;20,0;3,0;;",
      "'=Salon;Fenêtre;100,000;;40,000;60,000;25,00;19,4;20,0;3,0;0,8000;2026-10-07",
      'Bureau;;;;;;;;;;;'
    ]);
    expect(file.text).not.toContain('rad-9312063');
    expect(file.text).not.toContain('p-1');
  });
});
