import { describe, expect, it } from 'vitest';
import type { Alert } from '$lib/api/types';
import { applyLocale } from '$lib/i18n';
import { house } from '$lib/stores/house.svelte';
import { alertText, fmtDayMonth } from './alerts-text';

const NB = ' ';
const a = (kind: string, params: Record<string, unknown>, severity: Alert['severity'] = 'warn'): Alert => ({
  id: 1, kind, severity, params, first_seen: 0, last_seen: 0, resolved_at: null, dismissed: false
});

describe('alert texts', () => {
  it('French dates use « 1er »', () => {
    applyLocale('fr');
    expect(fmtDayMonth('2027-02-01')).toBe('1er février');
    expect(fmtDayMonth('2026-12-03')).toBe('3 décembre');
    applyLocale('en');
    expect(fmtDayMonth('2027-02-01')).toBe('1 February');
    applyLocale('fr');
  });

  it('price change and consent, with their links', () => {
    applyLocale('fr');
    const p = alertText(a('price_change', { date: '2027-02-01' }, 'info'))!;
    expect(p.text).toBe(`Si votre offre suit le tarif réglementé, les prix changent le 1er février${NB}: ajoutez les nouveaux prix.`);
    expect(p.link).toEqual({ href: '/home#tariff', label: 'Ajouter les prix' });
    const c = alertText(a('consent_expiring', { date: '2026-12-03', days: 20 }))!;
    expect(c.text).toBe(`Le consentement Enedis expire le 3 décembre${NB}: renouvelez-le sur MyElectricalData.`);
    expect(c.link?.href).toBe('https://www.myelectricaldata.fr/');
    expect(alertText(a('consent_expiring', { date: '2026-10-10', days: -4 }, 'bad'))!.text).toBe(
      `Le consentement Enedis a expiré le 10 octobre${NB}: renouvelez-le sur MyElectricalData.`
    );
    applyLocale('en');
    expect(alertText(a('price_change', { date: '2027-02-01' }, 'info'))!.text).toBe(
      'If your plan follows the regulated tariff, prices change on 1 February: add the new prices.'
    );
    expect(alertText(a('consent_expiring', { date: '2026-12-03', days: 20 }))!.text).toBe(
      'Your Enedis consent expires on 3 December: renew it on MyElectricalData.'
    );
    applyLocale('fr');
  });

  it('unreachable radiator, failed command, stalled Linky; unknown kinds are not shown', () => {
    applyLocale('fr');
    house.applySnapshot({
      house: { rooms: [{ id: 'p-ch2', name: 'Chambre 2', radiator_ids: ['r2'] } as never], radiators: [{ id: 'r2', name: 'Radiateur', program: {} } as never] },
      pending: [], overrides: [], status: { connected: true, last_ok_at: 1, last_error: null }
    });
    const since = Date.parse('2026-10-14T11:20:00Z') / 1000;
    expect(alertText(a('radiator_unreachable', { radiator_id: 'r2', room_id: 'p-ch2', since }, 'bad'))!.text).toBe(
      `Chambre 2${NB}: radiateur injoignable depuis 13:20.`
    );
    expect(alertText(a('radiator_unreachable', { radiator_id: 'r2', room_id: 'p-ch2', since: null }, 'bad'))!.text).toBe(
      `Chambre 2${NB}: radiateur injoignable depuis plus de 30${NB}min.`
    );
    // A room the web no longer knows reads the generic name, never the id.
    expect(alertText(a('radiator_unreachable', { radiator_id: 'gone', room_id: 'gone-room', since }, 'bad'))!.text).not.toMatch(/gone/);
    const failed = alertText(
      a('command_failed', {
        pending_id: 'p1', at: since, label_code: 'mode', label_params: { name: 'Salon', mode: 'manual' },
        error_code: 'radiator_refused', error_params: {}
      }, 'bad')
    )!;
    expect(failed.text).toBe(`Commande non aboutie à 13:20${NB}: Salon${NB}: Manuel — Le radiateur a refusé la commande.`);
    expect(failed.text).not.toMatch(/p1/);
    const stalled = alertText(a('linky_stalled', { last_day: '2026-10-10', days: 4 }))!;
    expect(stalled.text).toBe(`Linky${NB}: pas de nouvelle donnée depuis le 10/10 (4${NB}jours).`);
    expect(stalled.link).toEqual({ href: '/home#linky', label: 'Linky' });
    expect(alertText(a('a_future_kind', {}))).toBeNull();
  });

  it('grid alerts: Tempo red tomorrow, EcoWatt, new off-peak hours', () => {
    applyLocale('fr');
    expect(alertText(a('tempo_red_tomorrow', { date: '2026-12-02' }))!.text).toBe(
      `Jour Tempo Rouge demain (2 décembre)${NB}: les heures pleines sont au prix rouge.`
    );
    expect(alertText(a('ecowatt', { date: '2026-12-02', level: 2, hours: null }))!.text).toBe(
      `EcoWatt orange le 2 décembre${NB}: système électrique tendu.`
    );
    expect(alertText(a('ecowatt', { date: '2026-12-02', level: 3, hours: [{ start: '18:00', end: '20:00', level: 3 }] }, 'bad'))!.text).toBe(
      `EcoWatt rouge le 2 décembre, 18:00–20:00${NB}: système électrique très tendu, coupures possibles.`
    );
    const hc = alertText(a('hc_changed', { slots: [{ start: '23:00', end: '07:00' }] }, 'info'))!;
    expect(hc.text).toBe(`Enedis indique de nouvelles heures creuses${NB}: 23:00–07:00.`);
    expect(hc.link).toEqual({ href: '/home#tariff', label: 'Ajouter ces heures creuses' });
    applyLocale('en');
    expect(alertText(a('tempo_red_tomorrow', { date: '2026-12-02' }))!.text).toBe('Tempo Red day tomorrow (2 December): peak hours are at the red price.');
    expect(alertText(a('ecowatt', { date: '2026-12-02', level: 2, hours: null }))!.text).toBe('EcoWatt orange on 2 December: the power grid is under strain.');
    applyLocale('fr');
  });
});

describe('fmtDayMonth', () => {
  it('a malformed date reads —, never throws', () => {
    expect(fmtDayMonth('')).toBe('—');
    expect(fmtDayMonth('garbage')).toBe('—');
  });
});
