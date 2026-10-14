import { describe, expect, it } from 'vitest';
import type { EnergyInterval, EnergySummary, RoomSample } from './api/types';
import { bucketSpan, periodOf } from './energy';
import { inspectBucket, inspectionTable, intervalLabel, pricesText, readInterval, roomInterval } from './inspector';
import { parisDayStart } from './time';

const NB = '\u00a0';
const bucket = (o: Partial<EnergySummary> = {}): EnergySummary => ({
  kwh: 22.041, hc_kwh: 8.976, hp_kwh: 13.064, radiators_kwh: 14.2, energy_eur: 5.31, subscription_eur: 0.48, eur: 5.79,
  days: 1, missing_days: 0, estimated_split: false, split_method: 'curve',
  prices: [{ valid_from: '2026-08-01', subscription_eur_month: 15, rates: { hc: 0.2068, hp: 0.27 } }],
  retro_priced: false, present_days: 1, curve: null,
  radiators: { kwh: 14.2, hc_kwh: 6.1, hp_kwh: 8.1, eur: 3.45, interpolated: false, apportioned: false, coverage: 1 },
  rest_kwh: 7.841, ...o
});
const day = { group: 'day' as const, span: periodOf('day', '2026-10-13') };
const values = (rows: { key: string; value: string }[]) => Object.fromEntries(rows.map((r) => [r.key, r.value]));

describe('bucket inspector (spec §3.2.3)', () => {
  it('a full day: every row, exact, in order', () => {
    const ins = inspectBucket(bucket(), day);
    expect(ins.title).toBe('Mardi 13 octobre 2026');
    expect(ins.rows.map((r) => r.key)).toEqual([
      'maison', 'hc', 'hp', 'hc_share', 'radiateurs', 'reste', 'part_rad', 'cout', 'energie', 'abonnement', 'prix', 'prix_moyen'
    ]);
    expect(values(ins.rows)).toEqual({
      maison: `22,04${NB}kWh`, hc: `8,98${NB}kWh`, hp: `13,06${NB}kWh`, hc_share: `40,7${NB}%`,
      radiateurs: `14,20${NB}kWh`, reste: `7,84${NB}kWh`, part_rad: `64,4${NB}%`,
      cout: `5,79${NB}€`, energie: `5,31${NB}€`, abonnement: `0,48${NB}€`,
      prix: `HC 0,2068 · HP 0,2700${NB}€/kWh`, prix_moyen: `0,2409${NB}€/kWh`
    });
    expect(ins.rows.find((r) => r.key === 'hc')!.label).toBe('Heures creuses');
    expect(ins.rows.filter((r) => r.sub).map((r) => r.key)).toEqual(['hc_share', 'energie', 'abonnement']);
    expect(ins.notes).toEqual([]);
    expect(ins.empty).toBeNull();
    expect(ins.spoken).toBe('13 octobre, 22,04 kilowattheures, 5,79 euros');
  });

  it('a bucket’s rows, omitted when null: a missing day keeps its radiator row', () => {
    const none = bucket({ kwh: null, hc_kwh: null, hp_kwh: null, energy_eur: null, eur: null, rest_kwh: null, present_days: 0, missing_days: 1, prices: [] });
    const ins = inspectBucket(none, day);
    expect(ins.empty).toBe('Aucune donnée Linky pour ce jour');
    expect(ins.rows.map((r) => r.key)).toEqual(['radiateurs']);
    expect(ins.notes).toEqual([]);
    expect(ins.spoken).toBe('13 octobre, radiateurs 14,20 kilowattheures');
    expect(inspectBucket(none, { group: 'month', span: bucketSpan('2026-10', 'month') }).empty).toBe('Aucune donnée Linky pour cette période');
    expect(inspectBucket(none, { ...day, linky: false }).empty).toBeNull();
    const nothing = inspectBucket({ ...none, radiators: null }, day);
    expect(nothing.rows).toEqual([]);
    expect(nothing.spoken).toBe('13 octobre, aucune donnée Linky');
  });

  it('marks estimates and explains them', () => {
    const ins = inspectBucket(
      bucket({
        estimated_split: true,
        split_method: 'fallback_window',
        missing_days: 2,
        days: 30,
        present_days: 28,
        retro_priced: true,
        prices: [{ valid_from: '2026-10-01', subscription_eur_month: 15, rates: { hc: 0.2, hp: 0.3 } }],
        radiators: { kwh: 14.2, hc_kwh: 6.1, hp_kwh: 8.1, eur: 3.45, interpolated: true, apportioned: false, coverage: 0.75 },
        rest_kwh: null
      }),
      { group: 'month', span: bucketSpan('2026-09', 'month') }
    );
    const est = Object.fromEntries(ins.rows.map((r) => [r.key, !!r.est]));
    expect(est).toMatchObject({ maison: false, hc: true, hp: true, radiateurs: true, cout: true, abonnement: false });
    expect(ins.rows.some((r) => r.key === 'part_rad' || r.key === 'reste')).toBe(false);
    expect(ins.notes).toEqual([
      '2 jours manquants',
      'énergie de 2 jours manquants non comptée',
      `courbe absente${NB}: HC/HP estimés`,
      `radiateurs${NB}: couverture 75,0${NB}%`,
      'prix du 1/10 appliqué aux jours antérieurs'
    ]);
  });

  it('price rows name the day a price changed', () => {
    const text = pricesText([
      { valid_from: '2026-01-01', subscription_eur_month: 15, rates: { hp: 0.3, hc: 0.2 } },
      { valid_from: '2026-09-16', subscription_eur_month: 16, rates: { hc: 0.25, hp: 0.35 } }
    ]);
    expect(text).toBe(`HC 0,2000 · HP 0,3000${NB}€/kWh\ndepuis le 16/9${NB}: HC 0,2500 · HP 0,3500${NB}€/kWh`);
  });

  it('gives a bar’s share of the selected period and its daily mean', () => {
    const ins = inspectBucket(bucket({ kwh: 300, present_days: 30, days: 30 }), {
      group: 'month',
      span: bucketSpan('2026-09', 'month'),
      period: { span: periodOf('year', '2026-01-01'), kwh: 2000 }
    });
    expect(values(ins.rows)).toMatchObject({ part_periode: `15,0${NB}%`, moyenne: `10,00${NB}kWh` });
    // A bar that is the whole period, or outside it, has no « Part de la période ».
    const same = inspectBucket(bucket(), { ...day, period: { span: day.span, kwh: 22.041 } });
    expect(same.rows.some((r) => r.key === 'part_periode')).toBe(false);
    const outside = inspectBucket(bucket(), { ...day, period: { span: periodOf('day', '2026-10-14'), kwh: 20 } });
    expect(outside.rows.some((r) => r.key === 'part_periode')).toBe(false);
  });

  it('a null radiator sum reads « — » with its reason, never 0, in a home with radiators', () => {
    // Today: the radiators count up to yesterday, so a bucket holding only today has no sum yet.
    const today = inspectBucket(bucket({ radiators: null, rest_kwh: null }), { ...day, radiators: true, today: '2026-10-13' });
    expect(today.rows.find((r) => r.key === 'radiateurs')).toMatchObject({ value: '—', note: 'jour en cours, compté une fois terminé' });
    expect(today.rows.some((r) => r.key === 'part_rad' || r.key === 'reste')).toBe(false);
    // Another day without any radiator figure.
    const none = inspectBucket(bucket({ radiators: null, rest_kwh: null }), { ...day, radiators: true, today: '2026-10-20' });
    expect(none.rows.find((r) => r.key === 'radiateurs')).toMatchObject({ value: '—', note: 'aucun relevé de radiateur' });
    // A day still to come has nothing to say; a home without radiators has no row at all.
    expect(inspectBucket(bucket({ radiators: null }), { ...day, radiators: true, today: '2026-10-12' }).rows.some((r) => r.key === 'radiateurs')).toBe(false);
    expect(inspectBucket(bucket({ radiators: null }), day).rows.some((r) => r.key === 'radiateurs')).toBe(false);
    // A running week: the sum stops at yesterday, and says so.
    const week = inspectBucket(bucket({ days: 7 }), { group: 'week', span: periodOf('week', '2026-10-13'), radiators: true, today: '2026-10-14' });
    expect(week.notes).toContain(`radiateurs${NB}: jusqu’à hier`);
    // The hidden table carries the reason after the « — ».
    const t = inspectionTable([{ head: '13/10', ins: today }]);
    expect(t.rows[0].cells[t.columns.findIndex((c) => c.key === 'radiateurs')]).toBe('— (jour en cours, compté une fois terminé)');
  });

  it('builds the hidden table: one column per row kind, « — » where a bucket lacks it, est. kept', () => {
    const t = inspectionTable([
      { head: '12/10', ins: inspectBucket(bucket({ estimated_split: true }), { group: 'day', span: periodOf('day', '2026-10-12') }) },
      { head: '13/10', ins: inspectBucket(bucket({ kwh: null, hc_kwh: null, hp_kwh: null, eur: null, energy_eur: null, rest_kwh: null, radiators: null, prices: [] }), day) }
    ]);
    expect(t.columns.map((c) => c.label)).toEqual([
      'Maison', 'Heures creuses', 'Heures pleines', 'dont HC', 'Radiateurs', 'Reste de la maison', 'Part des radiateurs',
      'Coût estimé', 'dont énergie', 'dont abonnement', 'Prix appliqués', 'Prix moyen', 'Qualité'
    ]);
    expect(t.rows[0].cells[1]).toBe(`8,98${NB}kWh est.`);
    expect(t.rows[1].cells.slice(0, 12).every((c) => c === '—')).toBe(true);
    expect(t.rows[1].cells[12]).toBe('Aucune donnée Linky pour ce jour');
  });
});

const iv = (ts: number, o: Partial<EnergyInterval> = {}): EnergyInterval => ({
  ts, minutes: 30, wh: 734, w: 1468, offpeak: 1, boundary: false, price: 0.2068, eur: 0.1518,
  radiators_wh: 400, radiators_known: 1, radiators_total: 1, radiators_interp: false, radiators_apportioned: false, by_room: {}, ...o
});
const dayOf = (iso: string) => {
  const a = parisDayStart(iso) / 1000;
  const n = Math.round((parisDayStart(new Date(Date.parse(`${iso}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10)) / 1000 - a) / 1800);
  return Array.from({ length: n }, (_, i) => iv(a + i * 1800));
};

describe('half-hour readout (spec §3.2.4)', () => {
  it('labels the repeated autumn hour', () => {
    const all = dayOf('2026-10-25');
    expect(all).toHaveLength(50);
    expect(intervalLabel(all[37], all)).toBe('17:30–18:00');
    expect(intervalLabel(all[4], all)).toBe('02:00–02:30 (heure d’été)');
    expect(intervalLabel(all[6], all)).toBe('02:00–02:30 (heure d’hiver)');
  });

  it('reads one half-hour: power, energy, rate, price, cost, radiators, rest', () => {
    const all = dayOf('2026-10-14');
    const r = readInterval(all[37], { intervals: all, tariff: true });
    expect(r.title).toBe('18:30–19:00');
    expect(values(r.rows)).toEqual({
      puissance: `1,47${NB}kW`, energie: `734${NB}Wh`, tarif: 'Heures creuses', prix: `0,2068${NB}€/kWh`,
      cout: `0,152${NB}€`, radiateurs: `400${NB}Wh`, reste: `334${NB}Wh`
    });
    expect(r.spoken).toBe(`18:30–19:00, 1,47${NB}kW, 734${NB}Wh`);
  });

  it('a prorated boundary reads « ≈ », a partial share reads « HC 67 % », a negative rest reads « — »', () => {
    const all = dayOf('2026-10-14');
    all[1] = iv(all[1].ts, { offpeak: 0.6667, boundary: true, radiators_wh: 900, radiators_apportioned: true });
    const r = readInterval(all[1], { intervals: all, tariff: true });
    expect(values(r.rows)).toMatchObject({ tarif: `≈${NB}HC 67${NB}%`, radiateurs: `900${NB}Wh`, reste: '—' });
    expect(r.rows.find((x) => x.key === 'radiateurs')!.est).toBe(true);
    expect(r.rows.find((x) => x.key === 'tarif')!.est).toBe(true);
  });

  it('an unknown radiator sum reads « — » with how many radiators were measured, never a partial sum', () => {
    const all = dayOf('2026-10-14');
    // The latest half-hours: one radiator's increase is held until its next reading.
    all[40] = iv(all[40].ts, { radiators_wh: null, radiators_known: 2, radiators_total: 3 });
    const r = readInterval(all[40], { intervals: all, tariff: true });
    expect(r.rows.find((x) => x.key === 'radiateurs')).toMatchObject({ value: '—', note: '2 sur 3 radiateurs mesurés' });
    expect(r.rows.find((x) => x.key === 'reste')).toMatchObject({ value: '—' });
    // Every half-hour unknown: the rows stay (the day had radiators), each « — » with its reason.
    const unknown = all.map((x) => ({ ...x, radiators_wh: null, radiators_known: 0, radiators_total: 2 }));
    expect(readInterval(unknown[3], { intervals: unknown, tariff: true }).rows.find((x) => x.key === 'radiateurs')).toMatchObject({
      value: '—', note: '0 sur 2 radiateurs mesurés'
    });
  });

  it('keeps a fixed set of rows for a day; nothing chosen reads « — »', () => {
    const all = dayOf('2026-10-14').map((x) => ({ ...x, radiators_wh: null, radiators_known: 0, radiators_total: 0, offpeak: null, price: null, eur: null }));
    const idle = readInterval(null, { intervals: all, tariff: false });
    expect(idle.title).toBe('—');
    expect(idle.rows.map((r) => r.key)).toEqual(['puissance', 'energie']);
    expect(idle.rows.every((r) => r.value === '—')).toBe(true);
  });

  it('averages the room’s samples over the half-hour, « — » below half of them', () => {
    const t0 = parisDayStart('2026-10-14') / 1000;
    const samples: RoomSample[] = [0, 300, 600, 900].map((s, i) => ({ ts: t0 + s, temperature: 19 + i * 0.2, setpoint: 20, working_rate: 40 }));
    expect(roomInterval(samples, t0, 30)).toEqual({ temperature: 19.3, setpoint: 20 });
    expect(roomInterval(samples.slice(0, 2), t0, 30)).toEqual({ temperature: null, setpoint: null });
    const all = dayOf('2026-10-14');
    const r = readInterval(all[0], { intervals: all, tariff: true, samples });
    expect(r.rows.at(-1)).toMatchObject({ key: 'temperature', value: `19,3${NB}°C · consigne 20,0${NB}°C` });
  });
});

describe('review fixes: shown sums add up, DST labels', () => {
  const num = (s: string) => Number(s.replace(/[^\d,−-]/g, '').replace('−', '-').replace(',', '.'));

  it('backend-realistic 3 dp inputs: HC + HP = Maison, Radiateurs + Reste = Maison, énergie + abonnement = Coût', () => {
    const ins = inspectBucket(
      bucket({
        kwh: 22.04, hc_kwh: 8.975, hp_kwh: 13.065, radiators_kwh: 14.205, rest_kwh: 7.835, energy_eur: 5.305, subscription_eur: 0.485, eur: 5.79,
        radiators: { kwh: 14.205, hc_kwh: 6, hp_kwh: 8.2, eur: 3.4, interpolated: false, apportioned: false, coverage: 1 }
      }),
      day
    );
    const v = values(ins.rows);
    expect(num(v.hc) + num(v.hp)).toBeCloseTo(num(v.maison), 6);
    expect(num(v.radiateurs) + num(v.reste)).toBeCloseTo(num(v.maison), 6);
    expect(num(v.energie) + num(v.abonnement)).toBeCloseTo(num(v.cout), 6);
  });

  it('random realistic buckets: displayed parts always sum to the displayed total', () => {
    let seed = 99;
    const r = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    const r3 = (x: number) => Math.round(x * 1000) / 1000;
    for (let n = 0; n < 500; n++) {
      const hc = r3(r() * 400), hp = r3(r() * 800), rad = r3(r() * (hc + hp));
      const kwh = r3(hc + hp);
      const en = Math.round(r() * 50000) / 1000, sub = Math.round(r() * 3000) / 1000;
      const ins = inspectBucket(
        bucket({
          kwh, hc_kwh: hc, hp_kwh: hp, radiators_kwh: rad, rest_kwh: r3(kwh - rad), energy_eur: en, subscription_eur: sub,
          eur: Math.round((en + sub) * 100) / 100,
          radiators: { kwh: rad, hc_kwh: null, hp_kwh: null, eur: null, interpolated: false, apportioned: false, coverage: 1 }
        }),
        { group: 'month', span: bucketSpan('2026-09', 'month') }
      );
      const v = values(ins.rows);
      expect(Math.round((num(v.hc) + num(v.hp)) * 100)).toBe(Math.round(num(v.maison) * 100));
      expect(Math.round((num(v.radiateurs) + num(v.reste)) * 100)).toBe(Math.round(num(v.maison) * 100));
      // The rounded cost is a 2 dp figure of its own; the parts are matched to it.
      expect(Math.round((num(v.energie) + num(v.abonnement)) * 100)).toBe(Math.round(num(v.cout) * 100));
    }
  });

  it('the readout’s Reste is round(wh) − round(radiators_wh)', () => {
    const all = dayOf('2026-10-14');
    all[5] = iv(all[5].ts, { wh: 734, radiators_wh: 400.5 });
    const v = values(readInterval(all[5], { intervals: all, tariff: true }).rows);
    expect(num(v.radiateurs) + num(v.reste)).toBe(num(v.energie));
    for (const [wh, rad] of [[734.4, 400.5], [100.5, 20.5], [333.3, 111.6]]) {
      all[6] = iv(all[6].ts, { wh, radiators_wh: rad });
      const w = values(readInterval(all[6], { intervals: all, tariff: true }).rows);
      expect(num(w.radiateurs) + num(w.reste)).toBe(num(w.energie));
    }
  });

  const shape = /^(\d\d):(\d\d)–(\d\d):(\d\d)( \(heure d’(été|hiver)\))?$/;
  const minutes = (h: string, m: string) => Number(h) * 60 + Number(m);

  it('every half-hour of both DST days reads start–end on the start’s own clock', () => {
    for (const [d, count] of [['2026-10-25', 50], ['2026-03-29', 46], ['2026-10-14', 48]] as const) {
      const all = dayOf(d);
      expect(all).toHaveLength(count);
      const labels = all.map((x) => intervalLabel(x, all));
      expect(new Set(labels).size).toBe(count);
      labels.forEach((l) => {
        const m = shape.exec(l)!;
        expect(m, l).not.toBeNull();
        const len = (minutes(m[3], m[4]) - minutes(m[1], m[2]) + 1440) % 1440;
        expect(len, l).toBe(30);
      });
    }
    const autumn = dayOf('2026-10-25').map((x, _, all) => intervalLabel(x, all));
    expect(autumn.slice(3, 9)).toEqual([
      '01:30–02:00', '02:00–02:30 (heure d’été)', '02:30–03:00 (heure d’été)', '02:00–02:30 (heure d’hiver)',
      '02:30–03:00 (heure d’hiver)', '03:00–03:30'
    ]);
    expect(autumn.filter((l) => l.includes('heure'))).toHaveLength(4);
    expect(autumn.at(-1)).toBe('23:30–00:00');
    const spring = dayOf('2026-03-29').map((x, _, all) => intervalLabel(x, all));
    expect(spring.slice(2, 6)).toEqual(['01:00–01:30', '01:30–02:00', '03:00–03:30', '03:30–04:00']);
    expect(spring.some((l) => l.includes('heure'))).toBe(false);
  });
});
