import { describe, expect, it } from 'vitest';
import codes from './api-codes.json';
import { en } from './en';
import { fr } from './fr';

type Fn = (...a: unknown[]) => unknown;
const ERRORS = codes.errors as Record<string, { params: Record<string, unknown> }>;
const LABELS = codes.labels as Record<string, { params: Record<string, unknown> }>;

/** Sample arguments for messages whose parameters are not (number, string, string, …): a day key,
 * a list, an object. A task that adds such a message adds its line here. */
export const ARGS: Record<string, unknown[]> = {
  'strip.summary': [['a', 'b']],
  'radiator.facts': ['HEKLA P', 1500],
  'program.nextOn': ['monday', '06:15', 'B']
};

/** Messages allowed to read the same in both languages (proper nouns, symbols, brand). */
export const SAME = new Set<string>(['page.title', 'range.day', 'radiator.facts']);

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

describe('English messages take the same parameters as French', () => {
  const frFns = leaves(fr).filter(([, v]) => typeof v === 'function') as [string, Fn][];
  const enFns = new Map(leaves(en).filter(([, v]) => typeof v === 'function') as [string, Fn][]);
  it('same arity and the same parameter names', () => {
    expect(frFns.length).toBeGreaterThan(0);
    for (const [p, f] of frFns) {
      const e = enFns.get(p);
      expect(typeof e, p).toBe('function');
      expect(e!.length, `${p} arity`).toBe(f.length);
      expect(params(e!), `${p} names`).toEqual(params(f));
    }
    for (const p of enFns.keys()) expect(frFns.some(([q]) => q === p), p).toBe(true);
  });
  it('the check notices a dropped parameter', () => {
    const fewer: Fn = () => 'x';
    const more: Fn = ((n: number) => `${n}`) as Fn;
    expect(fewer.length).not.toBe(more.length);
    expect(params(more)).toEqual(['n']);
    expect(params(((a: string, b: number) => a + b) as Fn)).toEqual(['a', 'b']);
  });
});
