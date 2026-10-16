import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'src/app.css'), 'utf8');

function body(start: string): string {
  const i = css.indexOf(start);
  expect(i).toBeGreaterThan(-1);
  const open = css.indexOf('{', i + start.length);
  const end = css.indexOf('}', open);
  return css
    .slice(open + 1, end)
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean)
    .join(';');
}

describe('light theme tokens', () => {
  it('manual and prefers-color-scheme light blocks are identical', () => {
    const manual = body(":root[data-theme='light']");
    const media = body(":root:not([data-theme='dark'])");
    expect(media).toBe(manual);
  });
});

function tokens(start: string): Record<string, string> {
  return Object.fromEntries(
    body(start)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split(';')
      .map((d) => d.trim())
      .filter((d) => d.startsWith('--'))
      .map((d) => d.split(':').map((s) => s.trim()) as [string, string])
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

describe('heat ramp tokens', () => {
  const dark = tokens(':root');
  const light = tokens(":root[data-theme='light']");
  it('the dark neutral stop is bright enough not to read as disabled', () => {
    expect(dark['--neutral']).toBe('#c8ccd6');
  });
  it('every light heat stop passes AA (4.5:1) on cards and the page', () => {
    for (const k of ['--cool', '--neutral', '--warm']) {
      expect(contrast(light[k], light['--s1']), k).toBeGreaterThanOrEqual(4.5);
      expect(contrast(light[k], light['--bg']), k).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('every dark heat stop passes AA on both surfaces', () => {
    for (const k of ['--cool', '--neutral', '--warm']) {
      expect(contrast(dark[k], dark['--s1']), k).toBeGreaterThanOrEqual(4.5);
      expect(contrast(dark[k], dark['--s2']), k).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('series tokens', () => {
  it('define four non-heat series colours per theme, each ≥3:1 against the surfaces', () => {
    for (const [t, theme] of [[tokens(':root'), 'dark'], [tokens(":root[data-theme='light']"), 'light']] as const) {
      for (let i = 1; i <= 4; i++) {
        const c = t[`--series-${i}`];
        expect(c, `${theme} --series-${i}`).toMatch(/^#[0-9a-f]{6}$/);
        expect([t['--cool'], t['--neutral'], t['--warm']]).not.toContain(c);
        for (const s of ['--s1', '--s2', '--bg']) expect(contrast(c, t[s]), `${theme} ${i} on ${s}`).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

describe('field boundary token', () => {
  it('--field-line reaches 3:1 against every ground a field can sit on, in both themes (WCAG 1.4.11)', () => {
    for (const [t, theme] of [[tokens(':root'), 'dark'], [tokens(":root[data-theme='light']"), 'light']] as const) {
      expect(t['--field-line'], theme).toMatch(/^#[0-9a-f]{6}$/);
      for (const s of ['--in', '--s1', '--s2', '--bg']) {
        expect(contrast(t['--field-line'], t[s]), `${theme} field-line on ${s}`).toBeGreaterThanOrEqual(3);
      }
    }
  });
  it('the selected segment border (muted) reaches 3:1 against the well', () => {
    for (const t of [tokens(':root'), tokens(":root[data-theme='light']")]) {
      expect(contrast(t['--mu'], t['--in'])).toBeGreaterThanOrEqual(3);
      expect(contrast(t['--mu'], t['--s2'])).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('Tempo day tokens (ruling 2)', () => {
  it('blue and red reach 3:1 on every surface and stay off the heat and state hues; white is a colour', () => {
    for (const [t, theme] of [[tokens(':root'), 'dark'], [tokens(":root[data-theme='light']"), 'light']] as const) {
      for (const k of ['--tempo-blue', '--tempo-red']) {
        expect(t[k], `${theme} ${k}`).toMatch(/^#[0-9a-f]{6}$/);
        expect([t['--cool'], t['--warm'], t['--bad']]).not.toContain(t[k]);
        for (const s of ['--s1', '--s2', '--bg']) expect(contrast(t[k], t[s]), `${theme} ${k} on ${s}`).toBeGreaterThanOrEqual(3);
      }
      expect(t['--tempo-white'], `${theme} --tempo-white`).toMatch(/^#[0-9a-f]{6}$/);
    }
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

describe('tariff blues (owner ruling: heures creuses light blue, heures pleines dark blue)', () => {
  const themes = [
    ['dark', tokens(':root')],
    ['light', tokens(":root[data-theme='light']")]
  ] as const;
  it('take the direction-2 §1.5 values in both themes', () => {
    expect([themes[0][1]['--hc'], themes[0][1]['--hp']]).toEqual(['#a6d8ff', '#3567d6']);
    expect([themes[1][1]['--hc'], themes[1][1]['--hp']]).toEqual(['#2b8ad4', '#0a2a6e']);
  });
  it('each reads ≥ 3:1 against the page and the panels', () => {
    for (const [name, t] of themes) {
      for (const k of ['--hc', '--hp']) {
        for (const s of ['--bg', '--s1', '--s2']) expect(contrast(t[k], t[s]), `${name} ${k} on ${s}`).toBeGreaterThanOrEqual(3);
      }
    }
  });
  it('HC is always the lighter blue, ≥ 3.4:1 from HP, so the pair reads by luminance (and in greyscale)', () => {
    for (const [name, t] of themes) {
      expect(lum(t['--hc']), name).toBeGreaterThan(lum(t['--hp']));
      expect(contrast(t['--hc'], t['--hp']), name).toBeGreaterThanOrEqual(3.4);
    }
  });
  it('never reuse the cool, Tempo or series colours', () => {
    for (const [name, t] of themes) {
      const others = ['--cool', '--tempo-blue', '--series-1', '--series-2', '--series-3', '--series-4'].map((k) => t[k]);
      expect(others, name).not.toContain(t['--hc']);
      expect(others, name).not.toContain(t['--hp']);
    }
  });
  it('cool and the Tempo blue keep their values', () => {
    expect([themes[0][1]['--cool'], themes[0][1]['--tempo-blue']]).toEqual(['#4c9bf5', '#6c8cff']);
    expect([themes[1][1]['--cool'], themes[1][1]['--tempo-blue']]).toEqual(['#1f6fd1', '#3355cc']);
  });
  it('the hatch is the ground at 35 %, 1 px every 4 px at 45°', () => {
    expect(tokens(':root')['--hc-hatch']).toBe(
      'repeating-linear-gradient(45deg, color-mix(in srgb, var(--bg) 35%, transparent) 0 1px, transparent 1px 4px)'
    );
  });
});

describe('compact control scale (owner ruling: « les champs sont GROS »)', () => {
  const t = tokens(':root');
  it('paints controls at 36 px and keeps a 44 px hit area; one large size for the primary action', () => {
    expect([t['--ctl-h'], t['--ctl-h-lg'], t['--ctl-hit']]).toEqual(['36px', '44px', '44px']);
    expect([t['--ctl-radius'], t['--ctl-pad-x'], t['--ctl-gap']]).toEqual(['8px', '10px', '12px']);
  });
  it('sizes short values intrinsically', () => {
    expect([t['--w-time'], t['--w-price'], t['--w-date'], t['--w-kva'], t['--w-temp']]).toEqual(['6.5rem', '7.5rem', '10rem', '8rem', '136px']);
  });
  it('fields, buttons and the hit utility use the scale', () => {
    /** The declarations of the first rule whose selector line is exactly `sel`. */
    const rule = (sel: string) => {
      const i = css.indexOf(`\n${sel} {`);
      expect(i, sel).toBeGreaterThan(-1);
      return css.slice(css.indexOf('{', i) + 1, css.indexOf('}', i));
    };
    expect(rule("select")).toContain('min-height: var(--ctl-h);');
    expect(rule('.btn')).toContain('min-height: var(--ctl-h);');
    expect(rule('.btn-lg')).toContain('min-height: var(--ctl-h-lg);');
    expect(rule('.hit::before')).toContain('inset: var(--hit-y, calc((var(--ctl-h) - var(--ctl-hit)) / 2)) var(--hit-x, 0px);');
    expect(rule('.w-time')).toContain('width: var(--w-time);');
  });
});
