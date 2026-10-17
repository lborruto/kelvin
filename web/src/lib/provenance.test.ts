import { describe, expect, it } from 'vitest';
import { applyLocale } from './i18n';
import { natureText, provenance, sourceName, when } from './provenance';

const now = Date.parse('2026-10-15T19:11:00Z'); // 21:11 in Paris
const flat = (rows: { label: string; value: string }[]) => rows.map((r) => `${r.label}: ${r.value.replace(/\s/g, ' ')}`);

describe('provenance', () => {
  it('Linky day: Source, Relevé (day and sync), Nature mesuré', () => {
    const p = provenance('linky-day', { day: '2026-10-14', syncAt: now - 3 * 60_000 }, now);
    expect(p.nature).toBe('measured');
    expect(flat(p.rows)).toEqual([
      'Source: Linky · Enedis via MyElectricalData',
      'Relevé: jusqu’au 14/10 · synchro il y a 3 min',
      'Nature: mesuré'
    ]);
  });
  it('every kind has its source and default nature', () => {
    const kinds = ['linky-day', 'linky-curve', 'radiator-meter', 'tariff', 'rte-ecowatt', 'tempo', 'cozytouch', 'kelvin-calc'] as const;
    expect(kinds.map((k) => provenance(k, {}, now).nature)).toEqual([
      'measured', 'measured', 'measured', 'computed', 'published', 'published', 'measured', 'computed'
    ]);
    expect(sourceName('radiator-meter', 'Salon 1')).toBe('Compteur du radiateur (Salon 1)');
    expect(sourceName('radiator-meter')).toBe('Compteurs des radiateurs');
    expect(sourceName('kelvin-calc')).toBe('Calcul Kelvin');
    expect(sourceName('tariff')).toBe('Votre tarif');
    expect(sourceName('rte-ecowatt')).toBe('RTE EcoWatt via MyElectricalData');
  });
  it('no time known: no Relevé row; Source and Nature always', () => {
    expect(provenance('tariff', {}, now).rows.map((r) => r.label)).toEqual(['Source', 'Nature']);
  });
  it('a nature with its method; notes kept for the block', () => {
    const p = provenance('radiator-meter', { name: 'Salon 1', nature: 'estimated', method: 'réparti entre deux relevés', notes: ['n'] }, now);
    expect(p.rows.at(-1)!.value).toBe('estimé · réparti entre deux relevés');
    expect(p.notes).toEqual(['n']);
    expect(natureText('projected', 'au rythme des 28 derniers jours')).toBe('projection · au rythme des 28 derniers jours');
  });
  it('an instant in the fewest words: ago within the hour, the time today, else date and time', () => {
    expect(when(now - 5 * 60_000, now)).toBe('il y a 5 min');
    expect(when(now - 3 * 3_600_000, now)).toBe('18:11');
    expect(when(now - 30 * 3_600_000, now)).toMatch(/14 oct\.?,? 15:11/);
  });
  it('weather: published, the model as its Source', () => {
    const p = provenance('weather', { at: now - 20 * 60_000, model: 'era5_land' }, now);
    expect(p.nature).toBe('published');
    expect(flat(p.rows)).toEqual(['Source: ERA5-Land (réanalyse Copernicus) via Open-Meteo', 'Relevé: il y a 20 min', 'Nature: publié']);
    expect(sourceName('weather')).toBe('Météo-France AROME HD via Open-Meteo');
  });
  it('reads in English', () => {
    applyLocale('en');
    const p = provenance('linky-curve', { day: '2026-10-14' }, now);
    expect(flat(p.rows)).toEqual(['Source: Linky · Enedis via MyElectricalData', 'Reading: curve up to 14/10', 'Kind: measured']);
    expect(natureText('computed')).toBe('calculated');
  });
});
