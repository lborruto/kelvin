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
    expect(alertText(a('tempo_red_tomorrow', {}))).toBeNull();
  });
});
