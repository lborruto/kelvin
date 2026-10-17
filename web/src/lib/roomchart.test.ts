import { afterEach, describe, expect, it } from 'vitest';
import { applyLocale } from './i18n';
import {
  inspectMoment, levelWords, momentProvenance, momentTitle, overrideAt, planAt, pointAt, runShare, slots, yRange, type MomentCtx
} from './roomchart';
import type { StripPoint } from './stores/history.svelte';

const day = Date.parse('2026-10-13T22:00:00Z'); // Wed 14 Oct 00:00, Paris
const Q = 900_000; // 15 min
const H = 3_600_000;
const at = (h: number, min = 0) => day + h * H + min * 60_000;

const pt = (t: number, v: number | null, extra: Partial<StripPoint> = {}): StripPoint => ({ t, v, s: 20, rate: 0, modes: ['program'], levels: ['comfort'], ...extra });

const ctx = (over: Partial<MomentCtx> = {}): MomentCtx => ({
  kind: 'day',
  stepMs: Q,
  now: at(14, 3),
  names: { a: 'Baie', b: 'Entrée' },
  several: false,
  plan: { mode: 'program', program: { wednesday: [{ start: '17:00', end: '22:00' }] }, comfort: 20, eco: 17, target: null },
  activity: { window: [], presence: [] },
  presence: false,
  window: false,
  ...over
});

const row = (ins: ReturnType<typeof inspectMoment>, key: string) => ins.rows.find((r) => r.key === key);

afterEach(() => applyLocale('fr'));

describe('slots', () => {
  it('starts every epoch-aligned bucket overlapping the range', () => {
    const s = slots(day, day + 86_400_000, Q);
    expect(s).toHaveLength(96);
    expect(s[0]).toBe(day);
    expect(s.at(-1)).toBe(day + 86_400_000 - Q);
    // An unaligned start (7 days back from now) takes the bucket it falls in.
    expect(slots(at(14, 3), at(16), H)).toEqual([at(14), at(15)]);
    expect(slots(day, day, Q)).toEqual([]);
  });
});

describe('pointAt: the value at a moment', () => {
  const points = [pt(at(10), 19), pt(at(10, 15), 19.5), pt(at(11), 20)];
  it('takes the nearest recorded bucket', () => {
    expect(pointAt(points, at(10, 15), Q)?.v).toBe(19.5);
    expect(pointAt(points, at(10, 20), Q)?.v).toBe(19.5);
    expect(pointAt(points, at(10, 5), Q)?.v).toBe(19);
  });
  it('is null in a gap (nothing within half a step) and on an empty series', () => {
    expect(pointAt(points, at(10, 30), Q)).toBeNull();
    expect(pointAt(points, at(9), Q)).toBeNull();
    expect(pointAt(points, at(12), Q)).toBeNull();
    expect(pointAt([], at(10), Q)).toBeNull();
  });
});

describe('yRange: the scale fits the data', () => {
  it('pads by 1 °C and ticks every degree when the span is small', () => {
    expect(yRange([19.2, 20.4])).toEqual({ lo: 18, hi: 22, step: 1, ticks: [18, 19, 20, 21, 22] });
  });
  it('ticks every 2 °C on a wider span, on even degrees', () => {
    expect(yRange([16.5, 21])).toEqual({ lo: 14, hi: 22, step: 2, ticks: [14, 16, 18, 20, 22] });
  });
  it('is never forced to 0 nor to a fixed band, ignores missing values, and has a default', () => {
    const r = yRange([21, null, undefined, Number.NaN, 21]);
    expect(r).toMatchObject({ lo: 20, hi: 22, step: 1 });
    expect(yRange([])).toMatchObject({ lo: 16, hi: 22, step: 2 });
    expect(yRange([7, 22]).step).toBe(5); // frost protection beside comfort: still at most 5 intervals
  });
  it('keeps whole ticks on fractional bounds and at most 5 intervals', () => {
    for (const vs of [[18.95, 19.05], [12.3, 23.7], [-2, 3], [19, 19]]) {
      const r = yRange(vs);
      expect((r.hi - r.lo) / r.step).toBeLessThanOrEqual(5);
      expect(r.lo).toBeLessThanOrEqual(Math.min(...vs) - 1);
      expect(r.hi).toBeGreaterThanOrEqual(Math.max(...vs) + 1);
      expect(r.ticks.every((t) => Number.isInteger(t / r.step))).toBe(true);
    }
  });
});

describe('levels, plan, override, runs', () => {
  it('names the levels a bucket ran at', () => {
    expect(levelWords({ modes: ['program'], levels: ['comfort'] })).toBe('Confort');
    expect(levelWords({ modes: ['program'], levels: ['comfort', 'eco'] })).toBe('Confort, Éco');
    expect(levelWords({ modes: ['manual'], levels: ['comfort'] })).toBe('Manuel');
    expect(levelWords({ modes: ['off'], levels: [] })).toBe('Arrêt');
    expect(levelWords({ modes: ['program'], levels: ['frostprotection'] })).toBe('Hors-gel');
    expect(levelWords({ modes: [], levels: ['eco'] })).toBe('Éco');
    expect(levelWords({ modes: [], levels: [] })).toBeNull();
    expect(levelWords(null)).toBeNull();
  });
  it('plans the rest of the day from the programme or the mode', () => {
    const plan = ctx().plan;
    expect(planAt(plan, at(18))).toEqual({ s: 20, level: 'Confort' });
    expect(planAt(plan, at(23))).toEqual({ s: 17, level: 'Éco' });
    expect(planAt({ ...plan, mode: 'manual', target: 21 }, at(23))).toEqual({ s: 21, level: 'Manuel' });
    expect(planAt({ ...plan, mode: 'off' }, at(23))).toEqual({ s: null, level: 'Arrêt' });
  });
  it('names the running override over its own span only', () => {
    const o = { id: 'o', kind: 'boost' as const, room_id: 'r', radiator_ids: ['a'], temperature: 22, ends_at: at(16) / 1000, restoring: false, created_at: at(14) / 1000 };
    expect(overrideAt(o, at(14), Q)).toBe('Chauffe temporaire');
    expect(overrideAt(o, at(13, 50), Q)).toBe('Chauffe temporaire'); // the bucket it started in
    expect(overrideAt(o, at(13, 30), Q)).toBeNull();
    expect(overrideAt(o, at(16), Q)).toBeNull();
    expect(overrideAt({ ...o, kind: 'away' }, at(15), Q)).toBe('Absence');
    expect(overrideAt({ ...o, created_at: null }, at(15), Q)).toBeNull();
  });
  it('measures how much of a bucket a run covers', () => {
    const runs = [{ start: at(10) / 1000, end: at(10, 30) / 1000, open: false }];
    expect(runShare(runs, at(10), at(10, 15))).toBe(1);
    expect(runShare(runs, at(10, 15), at(11))).toBeCloseTo(1 / 3);
    expect(runShare(runs, at(11), at(12))).toBe(0);
  });
});

describe('inspectMoment', () => {
  it('a day moment: time, temperature, setpoint, level, heating', () => {
    const ins = inspectMoment(at(10), pt(at(10), 19.43, { rate: 64 }), ctx());
    expect(ins.title).toBe('10:00–10:15');
    expect(row(ins, 'temp')?.value).toMatch(/^19,4\s°C$/);
    expect(row(ins, 'setpoint')?.value).toMatch(/^20,0\s°C$/);
    expect(row(ins, 'level')?.value).toBe('Confort');
    expect(row(ins, 'heating')?.value).toMatch(/^oui, 64\s%/);
    expect(row(ins, 'min')).toBeUndefined();
    expect(ins.spoken).toMatch(/^10:00–10:15 : Température 19,4/);
  });

  it('each radiator by name when the room has several', () => {
    const p = pt(at(10), 19.5, { rads: [{ id: 'a', v: 18.9, lo: null, hi: null, s: 20, rate: 0, modes: [], levels: [] }] });
    const ins = inspectMoment(at(10), p, ctx({ several: true }));
    expect(row(ins, 'rad:a')).toMatchObject({ label: 'Baie', sub: true });
    expect(row(ins, 'rad:a')?.value).toMatch(/^18,9/);
    expect(row(ins, 'rad:b')).toMatchObject({ label: 'Entrée', value: '—', note: 'non relevé' });
  });

  it('a 7-day bucket: its date, mean, min and max, the mean heating rate', () => {
    const p = pt(at(13), 19.2, { lo: 18.1, hi: 20.6, rate: 35, levels: ['comfort', 'eco'] });
    const ins = inspectMoment(at(13), p, ctx({ kind: 'week', stepMs: H }));
    expect(ins.title).toBe('14 oct., 13:00–14:00');
    expect(row(ins, 'temp')?.label).toBe('Température moyenne');
    expect(row(ins, 'min')?.value).toMatch(/^18,1/);
    expect(row(ins, 'max')?.value).toMatch(/^20,6/);
    expect(row(ins, 'level')?.value).toBe('Confort, Éco');
    expect(row(ins, 'heating')?.value).toMatch(/^35\s% de la puissance en moyenne$/);
  });

  it('a gap reads « — » with its reason, never zero', () => {
    const ins = inspectMoment(at(9), null, ctx({ presence: true }));
    for (const k of ['temp', 'setpoint', 'level', 'heating', 'presence']) {
      expect(row(ins, k)).toMatchObject({ value: '—', note: 'pas de relevé à ce moment' });
    }
    expect(momentProvenance(at(9), null, ctx())).toBeNull();
  });

  it('a radiator off has no setpoint in force', () => {
    const ins = inspectMoment(at(9), pt(at(9), 18, { s: null, modes: ['off'], levels: [] }), ctx());
    expect(row(ins, 'setpoint')).toMatchObject({ value: '—', note: 'radiateur à l’arrêt' });
    expect(row(ins, 'level')?.value).toBe('Arrêt');
  });

  it('later today: the planned setpoint and level, the rest still to come', () => {
    const ins = inspectMoment(at(18), null, ctx());
    expect(row(ins, 'temp')).toMatchObject({ value: '—', note: 'à venir' });
    expect(row(ins, 'setpoint')).toMatchObject({ label: 'Consigne prévue' });
    expect(row(ins, 'setpoint')?.value).toMatch(/^20,0/);
    expect(row(ins, 'level')?.value).toBe('Confort');
    expect(ins.notes).toEqual(['Ce que le programme prévoit pour ce moment.']);
    expect(momentProvenance(at(18), null, ctx())?.nature).toBe('projected');
  });

  it('presence and window from the reported runs, only where they apply', () => {
    const s = (h: number, mi = 0) => at(h, mi) / 1000;
    const activity = { window: [{ start: s(10, 5), end: s(10, 10), open: false }], presence: [{ start: s(9), end: s(11), open: false }] };
    const ins = inspectMoment(at(10), pt(at(10), 19), ctx({ activity, presence: true, window: true }));
    expect(row(ins, 'presence')?.value).toBe('détectée');
    expect(row(ins, 'window')?.value).toBe('ouverte par moments');
    expect(row(inspectMoment(at(12), pt(at(12), 19), ctx({ activity, presence: true, window: true })), 'presence')?.value).toBe('non détectée');
    expect(row(inspectMoment(at(10), pt(at(10), 19), ctx({ activity: null, presence: true })), 'presence')?.note).toBe('non relevé');
    expect(row(inspectMoment(at(10), pt(at(10), 19), ctx({ activity })), 'presence')).toBeUndefined();
  });

  it('says where the values come from: the radiators, measured, averaged over the bucket', () => {
    const prov = momentProvenance(at(10), pt(at(10), 19), ctx({ several: true }))!;
    expect(prov.nature).toBe('measured');
    expect(prov.rows.map((r) => r.value).join(' | ')).toMatch(/Cozytouch \| 10:15 \| mesuré · moyenne des radiateurs en ligne sur 15\smin/);
  });

  it('English', () => {
    applyLocale('en');
    const ins = inspectMoment(at(13), pt(at(13), 19.2, { lo: 18, hi: 20, rate: 0 }), ctx({ kind: 'month', stepMs: 6 * H }));
    expect(momentTitle(at(13), { kind: 'month', stepMs: 6 * H })).toBe('14 Oct, 13:00–19:00');
    expect(row(ins, 'temp')?.label).toBe('Mean temperature');
    expect(row(ins, 'heating')?.value).toBe('0% of full power on average');
    expect(ins.spoken).toMatch(/^14 Oct, 13:00–19:00: Mean temperature 19\.2/);
  });
});
