import { describe, expect, it } from 'vitest';
import { applyLocale } from '$lib/i18n';
import type { EnergyInterval, EnergySummary, RoomSample } from './api/types';
import { bucketSpan, periodOf } from './energy';
import { fmtPrice } from '$lib/format';
import { inspectBucket, inspectionTable, intervalLabel, pricesText, readInterval, roomInterval } from './inspector';
import { parisDayStart } from './time';

const NB = '\u00a0';
const bucket = (o: Partial<EnergySummary> = {}): EnergySummary => ({
  kwh: 22.041, hc_kwh: 8.976, hp_kwh: 13.064, radiators_kwh: 14.2, energy_eur: 5.31, subscription_eur: 0.48, eur: 5.79,
  days: 1, missing_days: 0, estimated_split: false, split_method: 'curve',
  prices: [{ valid_from: '2026-08-01', subscription_eur_month: 15, rates: { hc: 0.2068, hp: 0.27 } }],
  retro_priced: false, present_days: 1, curve: null,
  radiators: { kwh: 14.2, hc_kwh: 6.1, hp_kwh: 8.1, eur: 3.45, interpolated: false, apportioned: false, coverage: 1 },
  rest_kwh: 7.841, tempo: null, by_rate: null, missing_colour_days: 0, retro_scheduled: false, ...o
});
const day = { group: 'day' as const, span: periodOf('day', '2026-10-13') };
const values = (rows: { key: string; value: string }[]) => Object.fromEntries(rows.map((r) => [r.key, r.value]));

describe('bucket inspector (spec §3.2.3)', () => {
  it('a full day: every row, exact, in order', () => {
    const ins = inspectBucket(bucket(), day);
    expect(ins.title).toBe('Mardi 13 octobre 2026');
    expect(ins.rows.map((r) => r.key)).toEqual([
      'home', 'hc', 'hp', 'hc_share', 'radiators', 'rest', 'rad_share', 'cost', 'energy', 'subscription', 'prices', 'avg_price'
    ]);
    expect(values(ins.rows)).toEqual({
      home: `22,04${NB}kWh`, hc: `8,98${NB}kWh`, hp: `13,06${NB}kWh`, hc_share: `40,7${NB}%`,
      radiators: `14,20${NB}kWh`, rest: `7,84${NB}kWh`, rad_share: `64,4${NB}%`,
      cost: `5,79${NB}€`, energy: `5,31${NB}€`, subscription: `0,48${NB}€`,
      prices: `HC 0,2068 · HP 0,2700${NB}€/kWh`, avg_price: `0,2409${NB}€/kWh`
    });
    expect(ins.rows.find((r) => r.key === 'hc')!.label).toBe('Heures creuses');
    expect(ins.rows.filter((r) => r.sub).map((r) => r.key)).toEqual(['hc_share', 'energy', 'subscription']);
    expect(ins.notes).toEqual([]);
    expect(ins.empty).toBeNull();
    expect(ins.spoken).toBe('13 octobre, 22,04 kilowattheures, 5,79 euros');
  });

  it('a bucket’s rows, omitted when null: a missing day keeps its radiator row', () => {
    const none = bucket({ kwh: null, hc_kwh: null, hp_kwh: null, energy_eur: null, eur: null, rest_kwh: null, present_days: 0, missing_days: 1, prices: [] });
    const ins = inspectBucket(none, day);
    expect(ins.empty).toBe('Aucune donnée Linky pour ce jour');
    expect(ins.rows.map((r) => r.key)).toEqual(['radiators', 'cost', 'subscription']);
    expect(ins.notes).toEqual([]);
    expect(ins.spoken).toBe('13 octobre, radiateurs 14,20 kilowattheures');
    expect(inspectBucket(none, { group: 'month', span: bucketSpan('2026-10', 'month') }).empty).toBe('Aucune donnée Linky pour cette période');
    expect(inspectBucket(none, { ...day, linky: false }).empty).toBeNull();
    const nothing = inspectBucket({ ...none, radiators: null, subscription_eur: null }, day);
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
    expect(est).toMatchObject({ home: false, hc: true, hp: true, radiators: true, cost: true, subscription: false });
    expect(ins.rows.some((r) => r.key === 'rad_share' || r.key === 'rest')).toBe(false);
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
    expect(values(ins.rows)).toMatchObject({ period_share: `15,0${NB}%`, per_day: `10,00${NB}kWh` });
    // A bar that is the whole period, or outside it, has no « Part de la période ».
    const same = inspectBucket(bucket(), { ...day, period: { span: day.span, kwh: 22.041 } });
    expect(same.rows.some((r) => r.key === 'period_share')).toBe(false);
    const outside = inspectBucket(bucket(), { ...day, period: { span: periodOf('day', '2026-10-14'), kwh: 20 } });
    expect(outside.rows.some((r) => r.key === 'period_share')).toBe(false);
  });

  it('a null radiator sum reads « — » with its reason, never 0, in a home with radiators', () => {
    // Today: the radiators count up to yesterday, so a bucket holding only today has no sum yet.
    const today = inspectBucket(bucket({ radiators: null, rest_kwh: null }), { ...day, radiators: true, today: '2026-10-13' });
    expect(today.rows.find((r) => r.key === 'radiators')).toMatchObject({ value: '—', note: 'jour en cours, compté une fois terminé' });
    expect(today.rows.some((r) => r.key === 'rad_share' || r.key === 'rest')).toBe(false);
    // Another day without any radiator figure.
    const none = inspectBucket(bucket({ radiators: null, rest_kwh: null }), { ...day, radiators: true, today: '2026-10-20' });
    expect(none.rows.find((r) => r.key === 'radiators')).toMatchObject({ value: '—', note: 'aucun relevé de radiateur' });
    // A day still to come has nothing to say; a home without radiators has no row at all.
    expect(inspectBucket(bucket({ radiators: null }), { ...day, radiators: true, today: '2026-10-12' }).rows.some((r) => r.key === 'radiators')).toBe(false);
    expect(inspectBucket(bucket({ radiators: null }), day).rows.some((r) => r.key === 'radiators')).toBe(false);
    // A running week: the sum stops at yesterday, and says so.
    const week = inspectBucket(bucket({ days: 7 }), { group: 'week', span: periodOf('week', '2026-10-13'), radiators: true, today: '2026-10-14' });
    expect(week.notes).toContain(`radiateurs${NB}: jusqu’à hier`);
    // The hidden table carries the reason after the « — ».
    const t = inspectionTable([{ head: '13/10', ins: today }]);
    expect(t.rows[0].cells[t.columns.findIndex((c) => c.key === 'radiators')]).toBe('— (jour en cours, compté une fois terminé)');
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
    // The day still pays its subscription: Coût « — » says why, and the abonnement column keeps it, so the column adds up.
    const cells = Object.fromEntries(t.columns.map((c, i) => [c.key, t.rows[1].cells[i]]));
    expect(cells.cost).toBe('— (aucune donnée Linky : énergie inconnue)'.replace(' : ', `${NB}: `));
    expect(cells.subscription).toBe(`0,48${NB}€`);
    expect(t.columns.filter((c) => !['cost', 'subscription', 'quality'].includes(c.key)).every((c) => cells[c.key] === '—')).toBe(true);
    expect(cells.quality).toBe('Aucune donnée Linky pour ce jour');
  });

  it('a day with a subscription but no Linky energy: Coût « — » with its reason, and « dont abonnement » kept', () => {
    const b = bucket({
      kwh: null, hc_kwh: null, hp_kwh: null, energy_eur: null, eur: null, rest_kwh: null, present_days: 0, missing_days: 1,
      subscription_eur: 0.48
    });
    const ins = inspectBucket(b, day);
    expect(ins.rows.find((r) => r.key === 'cost')).toMatchObject({ value: '—', note: `aucune donnée Linky${NB}: énergie inconnue` });
    expect(ins.rows.find((r) => r.key === 'subscription')).toMatchObject({ value: `0,48${NB}€`, sub: true });
    expect(ins.rows.find((r) => r.key === 'energy')).toBeUndefined();
    // No € in the bar's name: the day's cost is unknown.
    expect(ins.spoken).toBe('13 octobre, radiateurs 14,20 kilowattheures');
    // A day not counted (no subscription either) shows no cost rows at all.
    expect(inspectBucket({ ...b, subscription_eur: null }, day).rows.map((r) => r.key)).toEqual(['radiators']);
  });
});

const iv = (ts: number, o: Partial<EnergyInterval> = {}): EnergyInterval => ({
  ts, minutes: 30, wh: 734, w: 1468, offpeak: 1, tempo_colour: null, boundary: false, price: 0.2068, eur: 0.1518,
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
      power: `1,47${NB}kW`, energy: `734${NB}Wh`, rate: 'Heures creuses', price: `0,2068${NB}€/kWh`,
      cost: `0,152${NB}€`, radiators: `400${NB}Wh`, rest: `334${NB}Wh`
    });
    expect(r.spoken).toBe(`18:30–19:00, 1,47${NB}kW, 734${NB}Wh`);
  });

  it('a prorated boundary reads « ≈ », a partial share reads « HC 67 % », a negative rest reads « — »', () => {
    const all = dayOf('2026-10-14');
    all[1] = iv(all[1].ts, { offpeak: 0.6667, boundary: true, radiators_wh: 900, radiators_apportioned: true });
    const r = readInterval(all[1], { intervals: all, tariff: true });
    expect(values(r.rows)).toMatchObject({ rate: `≈${NB}HC 67${NB}%`, radiators: `900${NB}Wh`, rest: '—' });
    // Same copy ruling as the bar inspector: the radiators above the meter is a measurement gap, and says so.
    expect(r.rows.find((x) => x.key === 'rest')!.note).toBe(`Radiateurs au-dessus du compteur${NB}: écart de mesure`);
    expect(r.rows.find((x) => x.key === 'radiators')!.est).toBe(true);
    expect(r.rows.find((x) => x.key === 'rate')!.est).toBe(true);
  });

  it('an unknown radiator sum reads « — » with how many radiators were measured, never a partial sum', () => {
    const all = dayOf('2026-10-14');
    // The latest half-hours: one radiator's increase is held until its next reading.
    all[40] = iv(all[40].ts, { radiators_wh: null, radiators_known: 2, radiators_total: 3 });
    const r = readInterval(all[40], { intervals: all, tariff: true });
    expect(r.rows.find((x) => x.key === 'radiators')).toMatchObject({ value: '—', note: '2 sur 3 radiateurs mesurés' });
    expect(r.rows.find((x) => x.key === 'rest')).toMatchObject({ value: '—' });
    // Every half-hour unknown: the rows stay (the day had radiators), each « — » with its reason.
    const unknown = all.map((x) => ({ ...x, radiators_wh: null, radiators_known: 0, radiators_total: 2 }));
    expect(readInterval(unknown[3], { intervals: unknown, tariff: true }).rows.find((x) => x.key === 'radiators')).toMatchObject({
      value: '—', note: '0 sur 2 radiateurs mesurés'
    });
  });

  it('with a tariff, a half-hour without a price reads « — » and says why', () => {
    const all = dayOf('2026-10-14');
    all[3] = iv(all[3].ts, { offpeak: null, price: null, eur: null });
    const rows = readInterval(all[3], { intervals: all, tariff: true }).rows;
    for (const key of ['rate', 'price', 'cost']) {
      expect(rows.find((x) => x.key === key)).toMatchObject({ value: '—', note: 'aucun tarif pour cette demi-heure' });
    }
    // A priced half-hour carries no reason; nothing chosen is the idle « — », no reason either.
    expect(readInterval(all[2], { intervals: all, tariff: true }).rows.find((x) => x.key === 'price')!.note).toBeUndefined();
    expect(readInterval(null, { intervals: all, tariff: true }).rows.find((x) => x.key === 'price')!.note).toBeUndefined();
  });

  it('keeps a fixed set of rows for a day; nothing chosen reads « — »', () => {
    const all = dayOf('2026-10-14').map((x) => ({ ...x, radiators_wh: null, radiators_known: 0, radiators_total: 0, offpeak: null, price: null, eur: null }));
    const idle = readInterval(null, { intervals: all, tariff: false });
    expect(idle.title).toBe('—');
    expect(idle.rows.map((r) => r.key)).toEqual(['power', 'energy']);
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
    expect(r.rows.at(-1)).toMatchObject({ label: 'Température' });
    // The Courbe names the room whose temperature it reads.
    expect(readInterval(all[0], { intervals: all, tariff: true, samples, room: 'Salon' }).rows.at(-1)).toMatchObject({ label: 'Température (Salon)' });
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
    expect(num(v.hc) + num(v.hp)).toBeCloseTo(num(v.home), 6);
    expect(num(v.radiators) + num(v.rest)).toBeCloseTo(num(v.home), 6);
    expect(num(v.energy) + num(v.subscription)).toBeCloseTo(num(v.cost), 6);
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
      expect(Math.round((num(v.hc) + num(v.hp)) * 100)).toBe(Math.round(num(v.home) * 100));
      expect(Math.round((num(v.radiators) + num(v.rest)) * 100)).toBe(Math.round(num(v.home) * 100));
      // The rounded cost is a 2 dp figure of its own; the parts are matched to it.
      expect(Math.round((num(v.energy) + num(v.subscription)) * 100)).toBe(Math.round(num(v.cost) * 100));
    }
  });

  it('the readout’s Reste is round(wh) − round(radiators_wh)', () => {
    const all = dayOf('2026-10-14');
    all[5] = iv(all[5].ts, { wh: 734, radiators_wh: 400.5 });
    const v = values(readInterval(all[5], { intervals: all, tariff: true }).rows);
    expect(num(v.radiators) + num(v.rest)).toBe(num(v.energy));
    for (const [wh, rad] of [[734.4, 400.5], [100.5, 20.5], [333.3, 111.6]]) {
      all[6] = iv(all[6].ts, { wh, radiators_wh: rad });
      const w = values(readInterval(all[6], { intervals: all, tariff: true }).rows);
      expect(num(w.radiators) + num(w.rest)).toBe(num(w.energy));
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

describe('review fix round 2: € lines shaped like the backend’s (2 dp each)', () => {
  const num = (s: string) => Number(s.replace(/[^\d,−-]/g, '').replace('−', '-').replace(',', '.'));
  it('2 dp lines that add up to the total stay as they are', () => {
    const v = values(inspectBucket(bucket({ energy_eur: 5.3, subscription_eur: 0.48, eur: 5.78 }), day).rows);
    expect([v.energy, v.subscription, v.cost]).toEqual([`5,30${NB}€`, `0,48${NB}€`, `5,78${NB}€`]);
  });
  it('guard: lines that do not add up to the total show Coût as the sum of the lines', () => {
    const v = values(inspectBucket(bucket({ energy_eur: 5.3, subscription_eur: 0.48, eur: 5.79 }), day).rows);
    expect([v.energy, v.subscription, v.cost]).toEqual([`5,30${NB}€`, `0,48${NB}€`, `5,78${NB}€`]);
  });
  it('random 2 dp lines: the shown lines always add up to the shown Coût', () => {
    let seed = 5;
    const r = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    for (let n = 0; n < 500; n++) {
      const en = Math.round(r() * 100000) / 100, sub = Math.round(r() * 5000) / 100;
      const eur = Math.round((en + sub) * 100) / 100 + (r() < 0.3 ? 0.01 : 0);
      const v = values(inspectBucket(bucket({ energy_eur: en, subscription_eur: sub, eur }), day).rows);
      expect(Math.round((num(v.energy) + num(v.subscription)) * 100)).toBe(Math.round(num(v.cost) * 100));
    }
  });
});

describe('inspector in English', () => {
  it('a full day: English labels, en-GB figures, € before the figure, the spoken line', () => {
    applyLocale('en');
    const ins = inspectBucket(bucket(), day);
    expect(ins.title).toMatch(/^Tuesday,? 13 October 2026$/);
    expect(values(ins.rows)).toEqual({
      home: `22.04${NB}kWh`, hc: `8.98${NB}kWh`, hp: `13.06${NB}kWh`, hc_share: '40.7%',
      radiators: `14.20${NB}kWh`, rest: `7.84${NB}kWh`, rad_share: '64.4%',
      cost: '€5.79', energy: '€5.31', subscription: '€0.48',
      prices: 'Off-peak €0.2068 · Peak €0.2700 per kWh', avg_price: '€0.2409/kWh'
    });
    expect(ins.rows.find((r) => r.key === 'hc')!.label).toBe('Off-peak');
    expect(ins.spoken).toBe('13 October, 22.04 kilowatt hours, 5.79 euros');
  });
  it('notes and an empty bucket', () => {
    applyLocale('en');
    const none = bucket({ kwh: null, hc_kwh: null, hp_kwh: null, energy_eur: null, eur: null, rest_kwh: null, present_days: 0, missing_days: 1, prices: [] });
    expect(inspectBucket(none, day).empty).toBe('No Linky data for this day');
    const est = inspectBucket(bucket({ estimated_split: true, missing_days: 2, days: 30, present_days: 28 }), { group: 'month', span: bucketSpan('2026-09', 'month') });
    expect(est.notes).toEqual(['2 days missing', 'energy of 2 missing days not counted', 'no curve: off-peak/peak estimated']);
  });
  it('the hidden table: English column labels and its quality column', () => {
    applyLocale('en');
    const t = inspectionTable([{ head: '13/10', ins: inspectBucket(bucket({ missing_days: 1 }), day) }]);
    expect(t.columns.at(-1)).toEqual({ key: 'quality', label: 'Quality' });
    expect(t.columns.map((c) => c.label)).toContain('of which standing charge');
    const two = bucket({
      prices: [
        { valid_from: '2026-08-01', subscription_eur_month: 15, rates: { hc: 0.2068, hp: 0.27 } },
        { valid_from: '2026-10-13', subscription_eur_month: 15, rates: { hc: 0.21, hp: 0.28 } }
      ]
    });
    const cells = inspectionTable([{ head: '13/10', ins: inspectBucket(two, day) }]);
    expect(cells.rows[0].cells[cells.columns.findIndex((c) => c.key === 'prices')]).toBe(
      'Off-peak €0.2068 · Peak €0.2700 per kWh; from 13/10: Off-peak €0.2100 · Peak €0.2800 per kWh'
    );
  });
});

describe('tariff v2 in the inspector', () => {
  it('a Tempo bucket counts its colour days and says which days have no €', () => {
    const b = bucket({ tempo: { blue: 3, white: 1, red: 0, unknown: 1 }, missing_colour_days: 1 });
    const ins = inspectBucket(b, { group: 'month', span: periodOf('month', '2026-12-01') });
    expect(ins.rows.find((r) => r.key === 'tempo')?.value).toBe('3 bleus · 1 blanc · 0 rouge · 1 sans couleur connue');
    expect(ins.notes).toContain('énergie de 1 jour sans couleur Tempo non comptée');
  });
  it('an HC/HP bucket has no Tempo row; a retro-scheduled one says so', () => {
    const ins = inspectBucket(bucket({ retro_scheduled: true }), day);
    expect(ins.rows.some((r) => r.key === 'tempo')).toBe(false);
    expect(ins.notes).toContain('heures creuses du premier relevé appliquées aux jours antérieurs');
  });
  it('the readout names the Tempo colour, and Base keeps price and cost without a rate row', () => {
    const red = iv(1_764_658_800, { wh: 500, offpeak: 0, tempo_colour: 'red', price: 0.7562, eur: 0.3781 });
    const tempo = readInterval(red, { intervals: [red], tariff: true });
    expect(tempo.rows.find((r) => r.key === 'rate')?.value).toBe('Heures pleines · Rouge');
    const base = iv(1_764_658_800, { wh: 500, offpeak: null, tempo_colour: null, price: 0.1952, eur: 0.0976 });
    const plain = readInterval(base, { intervals: [base], tariff: true });
    expect(plain.rows.some((r) => r.key === 'rate')).toBe(false);
    expect(plain.rows.find((r) => r.key === 'price')?.value).toBe(fmtPrice(0.1952));
  });
});
