import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The service worker precaches only the font subsets Kelvin's copy can use (French and English: latin and
// latin-ext). The others (cyrillic, greek, vietnamese) stay on the server: a browser fetches a subset only for a
// character in its unicode-range, and no message has one.
const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');
const KEPT = ['latin', 'latin-ext'];

/** subset → its unicode-range, from a fontsource stylesheet (`/* geist-latin-wght-normal *\/` … `unicode-range: …;`). */
function subsets(css: string, family: string): Map<string, [number, number][]> {
  const out = new Map<string, [number, number][]>();
  for (const [, name, ranges] of css.matchAll(new RegExp(`/\\* ${family}-([a-z-]+?)-(?:wght|\\d+)-normal \\*/[^}]*unicode-range: ([^;]+);`, 'g'))) {
    out.set(
      name,
      ranges.split(',').map((r) => {
        const [a, b] = r.trim().slice(2).split('-');
        return [parseInt(a, 16), parseInt(b ?? a, 16)] as [number, number];
      })
    );
  }
  return out;
}
const covers = (ranges: [number, number][], cp: number) => ranges.some(([a, b]) => cp >= a && cp <= b);

const families = [
  subsets(read('node_modules/@fontsource-variable/geist/index.css'), 'geist'),
  subsets(read('node_modules/@fontsource/jetbrains-mono/400.css'), 'jetbrains-mono')
];
const copy = new Set([...read('src/lib/i18n/fr.ts'), ...read('src/lib/i18n/en.ts')].map((c) => c.codePointAt(0)!));

describe('precached fonts', () => {
  it('the fontsource stylesheets are read (both families, latin among their subsets)', () => {
    for (const f of families) expect([...f.keys()]).toEqual(expect.arrayContaining(KEPT));
  });

  it('French and English typography comes from the latin subset', () => {
    for (const f of families) for (const c of 'éàçœŒ’€−«»—°\u00a0\u202f') expect(covers(f.get('latin')!, c.codePointAt(0)!), c).toBe(true);
  });

  it('no character of the dictionaries needs a subset other than latin and latin-ext', () => {
    for (const f of families) {
      const needs = [...copy].filter((cp) => [...f].some(([name, r]) => !KEPT.includes(name) && covers(r, cp)) && !KEPT.some((k) => covers(f.get(k)!, cp)));
      expect(needs.map((cp) => String.fromCodePoint(cp))).toEqual([]);
    }
  });

  it('the service worker leaves every other subset out of its precache', () => {
    const ignored = read('vite.config.ts').match(/globIgnores: \['\*\*\/\*-\{([a-z,-]+)\}-\*\.woff2'\]/)?.[1].split(',') ?? [];
    const others = new Set(families.flatMap((f) => [...f.keys()]).filter((n) => !KEPT.includes(n)));
    expect(ignored.sort()).toEqual([...others].sort());
  });
});
