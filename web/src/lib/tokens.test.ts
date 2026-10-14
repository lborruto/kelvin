import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
