import { describe, expect, it } from 'vitest';
import { isFrench } from '../../../scripts/i18n-check.mjs';
import codes from './api-codes.json';
import { en } from './en';
import { fr } from './fr';

type Fn = (...a: unknown[]) => unknown;
const ERRORS = codes.errors as Record<string, { params: Record<string, unknown> }>;
const LABELS = codes.labels as Record<string, { params: Record<string, unknown> }>;

/** Sample arguments for messages whose parameters are not (number, string, string, …): a day key,
 * a list, an object. A task that adds such a message adds its line here. */
export const ARGS: Record<string, unknown[]> = {
  'tariff.prefilled': ['6', ['22:00–06:00', '12:00–14:00']],
  'linky.ok': ['12/10'],
  'linky.quota': ['12/10'],
  'linky.throttledAt': ['12/10', '14:30'],
  'linky.throttledLater': ['12/10'],
  'linky.calls': [3, 10],
  'strip.summary': [['a', 'b']],
  'radiator.facts': ['HEKLA P', 1500],
  'program.nextOn': ['monday', '06:15', 'B'],
  'inspector.radMeasured': [1, 2],
  'inspector.rates': [[['a', '1'], ['b', '2']]],
  'roomEnergy.roomFrom': [1, 2, '7/10'],
  'roomEnergy.roomPartial': [1, 2],
  'roomEnergy.statsOf': [1, 3],
  'hero.compare': ['C1', 'P', 12],
  'compare.tooFew': [9, 13],
  'heatingPanel.days': [3, 12],
  'heatingPanel.unmeasured': [true],
  'heatingPanel.partial': ['P', true],
  'hero.radPartial': ['P', true],
  'compare.zero': ['day'],
  'power.floorDay': ['K', 'E'],
  'projection.base': ['V', '12/10']
};

/** Messages allowed to read the same in both languages (proper nouns, symbols, brand). */
export const SAME = new Set<string>([
  'page.title', 'range.day', 'radiator.facts', 'inspector.est', 'inspector.eurWord',
  'chartInspector.est', 'heatingPanel.est', 'compare.range', 'power.range', 'projection.range', 'projection.approx', 'quality.mark.none',
  'curve.est', 'curvePanel.est', 'roomDay.wh', 'roomDay.degrees', 'roomDay.withWhy', 'roomsEnergy.kwh', 'roomsEnergy.eur', 'roomsEnergy.est',
  'roomInfo.watts', 'roomInfo.rssi', 'roomFigures.est'
]);

function leaves(o: object, prefix = ''): [string, unknown][] {
  return Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === 'object' ? leaves(v, `${prefix}${k}.`) : [[`${prefix}${k}`, v] as [string, unknown]]
  );
}

function render(path: string, v: unknown): string {
  if (typeof v === 'string') return v;
  const [group, ...rest] = path.split('.');
  const key = rest.join('.');
  const args =
    group === 'api' ? [ERRORS[key]?.params ?? {}] : group === 'action' ? [LABELS[key]?.params ?? {}] : (ARGS[path] ?? [2, 'B', 'C', 'D']);
  const out = (v as Fn)(...args);
  return typeof out === 'string' ? out : JSON.stringify(out);
}

const FR = leaves(fr).map(([p, v]) => [p, render(p, v)] as const);
const EN = new Map(leaves(en).map(([p, v]) => [p, render(p, v)]));

describe('dictionaries', () => {
  it('have the same keys', () => {
    // Same set of keys; group order inside the files is free.
    expect([...EN.keys()].sort()).toEqual(FR.map(([p]) => p).sort());
  });
  it('every message renders to real text', () => {
    for (const [p, t] of [...FR, ...EN]) {
      expect(t.length, p).toBeGreaterThan(0);
      expect(t, p).not.toMatch(/undefined|NaN|\[object/);
    }
  });
  it('English is not French left behind', () => {
    for (const [p, t] of FR) if (!SAME.has(p)) expect(EN.get(p), p).not.toBe(t);
  });
  it('French typography: ’, no-break space before units, % € and before : ; ? !, inside « »', () => {
    for (const [p, t] of FR) {
      expect(t, p).not.toMatch(/'/);
      expect(t, p).not.toMatch(/ [:;?!]/);
      expect(t, p).not.toMatch(/\d (?=°C|kWh|Wh\b|W\b|kVA\b|%|€)/);
      expect(t, p).not.toMatch(/« | »/);
    }
  });
  it('English typography: ’, no « », no-break space before °C and kWh, 42%, €16.20, never HC/HP', () => {
    for (const [p, t] of EN) {
      expect(t, p).not.toMatch(/['«»]/);
      expect(t, p).not.toMatch(/\d (?=°C|kWh|Wh\b|W\b|kVA\b)/);
      expect(t, p).not.toMatch(/\d[\s\u00a0]%|\d[\s\u00a0]?€/);
      expect(t, p).not.toMatch(/\bH[CP]\b|\blog ?in\b/i);
    }
  });
});

/** A function's parameter names, read from its source (arrow or plain function). */
function params(fn: Fn): string[] {
  const src = fn.toString();
  const m = /^(?:function[^(]*)?\(([^)]*)\)|^([\w$]+)\s*=>/.exec(src);
  const list = m ? (m[1] ?? m[2] ?? '') : '';
  return list
    .split(',')
    .map((s) => s.replace(/[=:].*$/s, '').trim())
    .filter(Boolean);
}

/** Every way `other`'s messages differ from `ref`'s: a missing or extra function, another arity,
 * other parameter names. Empty when they match. */
function paramMismatches(ref: object, other: object): string[] {
  const fns = (o: object) => new Map(leaves(o).filter(([, v]) => typeof v === 'function') as [string, Fn][]);
  const a = fns(ref);
  const b = fns(other);
  const out: string[] = [];
  for (const [p, f] of a) {
    const g = b.get(p);
    if (!g) out.push(`${p}: missing`);
    else if (g.length !== f.length) out.push(`${p}: arity ${g.length} ≠ ${f.length}`);
    else if (params(g).join() !== params(f).join()) out.push(`${p}: (${params(g)}) ≠ (${params(f)})`);
  }
  for (const p of b.keys()) if (!a.has(p)) out.push(`${p}: extra`);
  return out;
}

describe('English messages take the same parameters as French', () => {
  it('same functions, same arity and the same parameter names', () => {
    expect(leaves(fr).some(([, v]) => typeof v === 'function')).toBe(true);
    expect(paramMismatches(fr, en)).toEqual([]);
  });
  it('the check notices a dropped, renamed, missing or extra parameter or message', () => {
    const ref = { g: { a: (n: number, s: string) => `${n}${s}`, b: (x: string) => x } };
    expect(paramMismatches(ref, { g: { a: (n: number) => `${n}`, b: (x: string) => x } })).toEqual(['g.a: arity 1 ≠ 2']);
    expect(paramMismatches(ref, { g: { a: (n: number, t: string) => `${n}${t}`, b: (x: string) => x } })).toEqual([
      'g.a: (n,t) ≠ (n,s)'
    ]);
    expect(paramMismatches(ref, { g: { a: (n: number, s: string) => `${n}${s}` } })).toEqual(['g.b: missing']);
    expect(paramMismatches(ref, { g: { ...ref.g, c: (y: string) => y } })).toEqual(['g.c: extra']);
    expect(paramMismatches(ref, ref)).toEqual([]);
  });
});

/** French the strict scanner cannot tell from English or code, so a hard-coded copy of it would
 * slip through: short forms that are English words or names, a bare figure. Kept small on purpose. */
const SCANNER_BLIND = new Set([
  'modeSwitch.programShort', 'range.week', 'range.month', 'daysShort.monday', 'daysShort.tuesday', 'daysShort.wednesday',
  'daysShort.thursday', 'daysShort.friday', 'daysShort.saturday', 'daysShort.sunday', 'energy.weekShort',
  'inspector.rates', 'inspector.rateLabels.base', 'roomsEnergy.share',
  'roomInfo.title', 'roomInfo.signal', 'roomInfo.reachable', 'roomInfo.lastSignal'
]);

describe('the strict scanner against the real copy (Task 17)', () => {
  it('reads every French message as French', () => {
    const missed = FR.filter(([p, t]) => !SAME.has(p) && !SCANNER_BLIND.has(p) && !isFrench(t)).map(([p, t]) => `${p}: ${t}`);
    expect(missed).toEqual([]);
  });
  it('never reads an English message as French', () => {
    const flagged = [...EN].filter(([, t]) => isFrench(t)).map(([p, t]) => `${p}: ${t}`);
    expect(flagged).toEqual([]);
  });
  it('the blind list holds only messages the scanner really misses', () => {
    expect(FR.filter(([p, t]) => SCANNER_BLIND.has(p) && isFrench(t)).map(([p]) => p)).toEqual([]);
  });
});
