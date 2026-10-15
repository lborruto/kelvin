import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findLegacyPaths, isLegacyPathLine } from '../../scripts/check-paths.mjs';
import { ANCHORS, canonical, isActive, LEGACY, LEGACY_HASH, NAV, ROUTES } from './paths';

describe('ROUTES', () => {
  it('English paths; a room id is encoded', () => {
    expect([ROUTES.rooms, ROUTES.schedule, ROUTES.energy, ROUTES.home, ROUTES.login]).toEqual([
      '/', '/schedule', '/energy', '/home', '/login'
    ]);
    expect(ROUTES.room('p-salon')).toBe('/rooms/p-salon');
    expect(ROUTES.room('a/b c')).toBe('/rooms/a%2Fb%20c');
    expect(ANCHORS).toEqual({ away: 'away', tariff: 'tariff', linky: 'linky', quality: 'quality', curve: 'curve' });
    expect(NAV.map((n) => n.href)).toEqual(['/', '/schedule', '/energy', '/home']);
  });
});

describe('canonical', () => {
  it('maps every legacy path, keeping the rest of the path', () => {
    expect(canonical('/pieces/p-salon')).toEqual({ pathname: '/rooms/p-salon', hash: '' });
    expect(canonical('/pieces')).toEqual({ pathname: '/', hash: '' });
    expect(canonical('/pieces/')).toEqual({ pathname: '/', hash: '' });
    expect(canonical('/programme')).toEqual({ pathname: '/schedule', hash: '' });
    expect(canonical('/energie/')).toEqual({ pathname: '/energy', hash: '' });
    expect(canonical('/maison')).toEqual({ pathname: '/home', hash: '' });
  });
  it('canonical keeps query and maps the hash', () => {
    expect(canonical('/maison', '#tarif')).toEqual({ pathname: '/home', hash: '#tariff' });
    expect(canonical('/maison', '#absence')).toEqual({ pathname: '/home', hash: '#away' });
    expect(canonical('/maison', '#linky')).toEqual({ pathname: '/home', hash: '#linky' });
    expect(canonical('/energie', '#qualite')).toEqual({ pathname: '/energy', hash: '#quality' });
    expect(canonical('/energie', '#courbe')).toEqual({ pathname: '/energy', hash: '#curve' });
    expect(canonical('/pieces/p-salon', '#y')).toEqual({ pathname: '/rooms/p-salon', hash: '#y' });
  });
  it('leaves English and look-alike paths alone', () => {
    for (const p of ['/', '/rooms/p-salon', '/schedule', '/energy', '/home', '/login', '/piecesX', '/maisons', '/programme/x']) {
      expect(canonical(p, '#tarif')).toBeNull();
    }
  });
});

describe('isActive', () => {
  it('Rooms covers the list and every room page; the others their own path', () => {
    expect(isActive('/', '/')).toBe(true);
    expect(isActive('/rooms/p-salon', '/')).toBe(true);
    expect(isActive('/schedule', '/')).toBe(false);
    expect(isActive('/home', '/home')).toBe(true);
    expect(isActive('/home/devices', '/home')).toBe(true);
    expect(isActive('/homework', '/home')).toBe(false);
  });
});

// Relative to this file, not the cwd: fileURLToPath takes the string (jsdom's URL class is not Node's).
const here = dirname(fileURLToPath(import.meta.url));
const appHtml = readFileSync(resolve(here, '../app.html'), 'utf8');

describe('app.html legacy redirect', () => {
  const block = appHtml.match(/\/\* legacy-paths:start \*\/([\s\S]*?)\/\* legacy-paths:end \*\//)?.[1] ?? '';
  const mirror = new Function(`${block}; return { LEGACY, LEGACY_HASH };`)() as {
    LEGACY: [RegExp, string][];
    LEGACY_HASH: Record<string, string>;
  };

  it('mirrors paths.ts exactly', () => {
    expect(mirror.LEGACY.map(([re, to]) => [re.source, to])).toEqual(LEGACY.map(([re, to]) => [re.source, to]));
    expect(mirror.LEGACY_HASH).toEqual(LEGACY_HASH);
  });

  it('rewrites before the router boots, keeping query and mapping the hash', () => {
    const script = appHtml.match(/<script>\s*\(function \(\) \{\s*\/\* legacy-paths:start[\s\S]*?<\/script>/)?.[0] ?? '';
    const calls: string[] = [];
    const run = (href: string) => {
      const u = new URL(href);
      const fake = {
        location: { pathname: u.pathname, search: u.search, hash: u.hash },
        history: { replaceState: (_s: unknown, _t: string, url: string) => calls.push(url) }
      };
      new Function('location', 'history', script.replace(/<\/?script>/g, ''))(fake.location, fake.history);
    };
    run('http://k/maison?x=1#tarif'); // legacy-path-test
    run('http://k/pieces/p-salon'); // legacy-path-test
    run('http://k/energie#qualite'); // legacy-path-test
    run('http://k/home#tarif');
    expect(calls).toEqual(['/home?x=1#tariff', '/rooms/p-salon', '/energy#quality']);
  });
});

describe('isLegacyPathLine', () => {
  // Each line below is a fixture of the guard: the marker would hide it, so none carries one.
  it('finds escaped, encoded, punctuated and bare-id forms of the old paths', () => {
    const found = [
      String.raw`await expect(page).toHaveURL(/\/pieces\/p-salon$/);`,
      String.raw`await expect(page).toHaveURL(/\/maison$/);`,
      `goto('/login?next=%2Fenergie');`,
      String.raw`toHaveURL(/\/login\?next=%2Fprogramme$/);`,
      `const s = 'see /maison.';`,
      `const s = '/maison, then';`,
      'const u = `${base}/energie;x`;',
      `document.getElementById('tarif');`,
      `<section id="absence">`,
      `if (location.hash.slice(1) === 'qualite') open();`,
      `goto('/maison');`,
      `goto('/login?next=%2fmaison');`,
      `el.closest('#courbe');`,
      `if (id !== 'tarif') return;`,
      `<a href="#contenu">`
    ];
    expect(found.filter((l) => !isLegacyPathLine(l))).toEqual([]);
  });
  it('leaves English paths, look-alikes, module paths and copy alone', () => {
    const clean = [
      `goto('/home#tariff');`,
      `goto('/maisons');`,
      `goto('/piecesX');`,
      `import { EnergieData } from './energie.svelte';`,
      `if (c.key === 'qualite') return;`,
      `const label = 'Programme';`,
      `const f = 'courbe_2026-10-12.csv';`,
      `goto('/rooms/p-salon');`
    ];
    expect(clean.filter((l) => isLegacyPathLine(l))).toEqual([]);
  });
});

describe('no French path outside the legacy blocks', () => {
  it('finds none in the web app, the e2e suite, the backend and the docs', () => {
    expect(findLegacyPaths(resolve(here, '../../..'))).toEqual([]);
  });
});
