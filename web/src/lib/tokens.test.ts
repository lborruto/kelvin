import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The Tableau tokens (spec .superpowers/sdd/tableau/spec.md §1): one dark theme. DESIGN.md « Tokens ».
const css = readFileSync(resolve(process.cwd(), 'src/app.css'), 'utf8');

function body(start: string): string {
  const i = css.indexOf(start);
  expect(i).toBeGreaterThan(-1);
  const open = css.indexOf('{', i);
  const end = css.indexOf('}', open);
  return css.slice(open + 1, end);
}
function tokens(start: string): Record<string, string> {
  return Object.fromEntries(
    body(start)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split(';')
      .map((d) => d.trim())
      .filter((d) => d.startsWith('--'))
      .map((d) => {
        const i = d.indexOf(':');
        return [d.slice(0, i).trim(), d.slice(i + 1).trim()] as [string, string];
      })
  );
}
function lum(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = c.map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const t = tokens('\n:root {');

describe('one dark theme', () => {
  it('has no light block and no prefers-color-scheme path', () => {
    expect(css).not.toMatch(/data-theme|prefers-color-scheme/);
    expect(t['color-scheme' as never]).toBeUndefined();
    expect(body('\n:root {')).toContain('color-scheme: dark');
  });
});

describe('spec colour values', () => {
  it('take the Tableau values', () => {
    expect({
      ground: t['--ground'], bg: t['--bg'], s1: t['--s1'], s2: t['--s2'], s3: t['--s3'], in: t['--in'], line: t['--line'],
      field: t['--field'], side: t['--side'], sheet: t['--sheet'], modal: t['--modal'], pop: t['--pop'], tx: t['--tx'],
      mu: t['--mu'], heat: t['--heat'], cool: t['--cool'], hc: t['--hc'], hp: t['--hp'], bad: t['--bad'], ok: t['--ok'],
      s3c: t['--s3c'], bleu: t['--tempo-bleu'], blanc: t['--tempo-blanc'], rouge: t['--tempo-rouge'], faMark: t['--fa-mark']
    }).toEqual({
      ground: '#050506', bg: '#0b0b0d', s1: '#1b1b1f', s2: '#2a2a2f', s3: '#35353b', in: '#08080a', line: '#26262b',
      field: '#4a4a52', side: '#111113', sheet: '#1c1c1f', modal: '#151518', pop: '#232328', tx: '#f5f5f7',
      mu: '#a1a1a8', heat: '#ff9346', cool: '#7ab8ff', hc: '#a9d3ff', hp: '#3f6fd4', bad: '#ff6961', ok: '#4cd28a',
      s3c: '#c9c9d1', bleu: '#4f7dff', blanc: '#f5f5f7', rouge: '#ff5a5a', faMark: '#6c6c74'
    });
  });
});

describe('text contrast (axe: 4.5:1)', () => {
  const grounds = ['--bg', '--s1', '--side', '--sheet', '--modal', '--pop'];
  it('ink and muted read on every surface, s2 and s3 included', () => {
    for (const k of ['--tx', '--mu']) for (const s of [...grounds, '--s2', '--s3']) expect(contrast(t[k], t[s]), `${k} on ${s}`).toBeGreaterThanOrEqual(4.5);
  });
  it('faint text reads on every surface but the s2/s3 controls (it never sits there)', () => {
    for (const s of grounds) expect(contrast(t['--fa'], t[s]), `--fa on ${s}`).toBeGreaterThanOrEqual(4.5);
    // The spec's faint is kept for non-text marks only: it would fail as text.
    expect(contrast(t['--fa-mark'], t['--s1'])).toBeLessThan(4.5);
  });
  it('heat, cool, bad and ok read as text on bg, s1 and s2', () => {
    for (const k of ['--heat', '--cool', '--bad', '--ok']) for (const s of ['--bg', '--s1', '--s2']) expect(contrast(t[k], t[s]), `${k} on ${s}`).toBeGreaterThanOrEqual(4.5);
  });
  it('the primary button: bg ink on tx; the heat glyph ink on heat', () => {
    expect(contrast(t['--bg'], t['--tx'])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t['--heat-ink'], t['--heat'])).toBeGreaterThanOrEqual(4.5);
  });
});

describe('tariff blues (decision 3: Tempo colours only when Tempo)', () => {
  it('each reads ≥ 3:1 against the page and widgets; HC is the lighter, ≥ 3:1 from HP', () => {
    for (const k of ['--hc', '--hp']) for (const s of ['--bg', '--s1', '--s2']) expect(contrast(t[k], t[s]), `${k} on ${s}`).toBeGreaterThanOrEqual(3);
    expect(lum(t['--hc'])).toBeGreaterThan(lum(t['--hp']));
    expect(contrast(t['--hc'], t['--hp'])).toBeGreaterThanOrEqual(3);
  });
  it('never reuse the cool, Tempo or heat colours', () => {
    const others = ['--cool', '--tempo-bleu', '--heat', '--series-1', '--series-2', '--series-4'].map((k) => t[k]);
    expect(others).not.toContain(t['--hc']);
    expect(others).not.toContain(t['--hp']);
  });
  it('the hatch is the ground at 40 %, 1 px every 4 px at 45°', () => {
    expect(t['--hc-hatch']).toBe(
      'repeating-linear-gradient(45deg, color-mix(in srgb, var(--bg) 40%, transparent) 0 1px, transparent 1px 4px)'
    );
  });
});

describe('Tempo day tokens', () => {
  it('blue and red reach 3:1 on the widgets', () => {
    for (const k of ['--tempo-bleu', '--tempo-rouge']) for (const s of ['--bg', '--s1', '--s2']) expect(contrast(t[k], t[s]), `${k} on ${s}`).toBeGreaterThanOrEqual(3);
  });
  it('are used only by the Tempo day chip', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(svelte|ts|css)$/.test(e.name) && !e.name.endsWith('.test.ts')) files.push(p);
      }
    };
    walk(resolve(process.cwd(), 'src'));
    const users = files.filter((f) => readFileSync(f, 'utf8').includes('var(--tempo-')).map((f) => f.split('/').pop());
    expect(users).toEqual(['TempoDot.svelte']);
  });
});

describe('series', () => {
  it('radiators are the radiator-only grey; no series is heat or a tariff blue', () => {
    expect(t['--series-3']).toBe(t['--s3c']);
    for (const i of [1, 2, 4]) {
      const c = t[`--series-${i}`];
      expect([t['--heat'], t['--cool'], t['--hc'], t['--hp']]).not.toContain(c);
      for (const s of ['--s1', '--bg']) expect(contrast(c, t[s]), `series-${i} on ${s}`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('scale', () => {
  it('radii follow the spec', () => {
    expect([t['--r-pill'], t['--r-sheet'], t['--r-widget'], t['--r-tile'], t['--r-pop'], t['--r-group'], t['--r-menu'], t['--r-input'], t['--r-seg'], t['--r-chip']]).toEqual(
      ['99px', '28px', '22px', '20px', '18px', '16px', '14px', '12px', '10px', '6px']
    );
  });
  it('buttons are 40 / 34 / 52; fields and segments 36 with a 44 px hit area', () => {
    expect([t['--btn-h'], t['--btn-h-sm'], t['--btn-h-lg'], t['--ctl-h'], t['--ctl-hit']]).toEqual(['40px', '34px', '52px', '36px', '44px']);
  });
  it('sizes short values intrinsically', () => {
    expect([t['--w-time'], t['--w-price'], t['--w-date'], t['--w-kva']]).toEqual(['6.5rem', '7.5rem', '10rem', '8rem']);
  });
  it('motion has the spec durations', () => {
    expect([t['--t-sheet-in'], t['--t-sheet-out'], t['--t-modal'], t['--t-value'], t['--t-dip'], t['--t-snap'], t['--ease-sheet']]).toEqual(
      ['280ms', '200ms', '180ms', '120ms', '400ms', '60ms', 'cubic-bezier(0.2, 0.8, 0.2, 1)']
    );
  });
  it('fields, buttons and the hit utility use the scale', () => {
    const rule = (sel: string) => {
      const i = css.indexOf(`\n${sel} {`);
      expect(i, sel).toBeGreaterThan(-1);
      return css.slice(css.indexOf('{', i) + 1, css.indexOf('}', i));
    };
    expect(rule("input:not([type='checkbox'], [type='radio'], [type='range']),\nselect,\ntextarea")).toContain('min-height: var(--ctl-h);');
    expect(rule('.btn')).toContain('min-height: var(--btn-h);');
    expect(rule('.btn-lg')).toContain('min-height: var(--btn-h-lg);');
    expect(rule('.hit::before')).toContain('inset: var(--hit-y, calc((var(--ctl-h) - var(--ctl-hit)) / 2)) var(--hit-x, 0px);');
  });
  it('the body is Geist with tabular figures', () => {
    expect(t['--font']).toMatch(/^'Geist Variable'/);
    expect(body('\nbody {')).toContain("font-feature-settings: 'tnum' 1;");
  });
});
