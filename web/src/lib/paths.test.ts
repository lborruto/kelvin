import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findLegacyPaths, isLegacyPathLine } from '../../scripts/check-paths.mjs';
import {
  ANCHORS, canonical, homeAnchor, isActive, LEGACY, LEGACY_HASH, NAV, roomPath, roomSheetHref, roomSheetOf, ROUTES, sheetOnly,
  withoutRoomSheet
} from './paths';

describe('ROUTES', () => {
  it('English paths; a room id is encoded', () => {
    expect([ROUTES.rooms, ROUTES.schedule, ROUTES.energy, ROUTES.home, ROUTES.login]).toEqual([
      '/', '/schedule', '/energy', '/home', '/login'
    ]);
    expect(ROUTES.room('p-salon')).toBe('/?sheet=p-salon');
    expect(ROUTES.room('a/b c')).toBe('/?sheet=a%2Fb+c');
    expect(roomPath('a/b c')).toBe('/rooms/a%2Fb%20c');
    expect(ANCHORS).toEqual({ away: 'away', tariff: 'tariff', linky: 'linky', quality: 'quality', curve: 'curve', alerts: 'alerts', sessions: 'sessions', mcp: 'mcp' });
    expect(NAV.map((n) => n.href)).toEqual(['/', '/schedule', '/energy', '/home']);
  });
});

describe('the room sheet in the URL (`?sheet=<id>`, over any page)', () => {
  const u = (s: string) => new URL(s, 'http://kelvin.test');
  it('opens over the page the user is on, its parameters kept, the hash dropped, one sheet at a time', () => {
    expect(roomSheetHref(u('/energy'), 'p-salon')).toBe('/energy?sheet=p-salon');
    expect(roomSheetHref(u('/schedule?room=p-ch1&day=mon#x'), 'p-salon')).toBe('/schedule?room=p-ch1&day=mon&sheet=p-salon');
    // A sheet already open (and its boost) is replaced, never stacked.
    expect(roomSheetHref(u('/energy?sheet=p-ch1&boost=1'), 'p-salon')).toBe('/energy?sheet=p-salon');
    expect(roomSheetHref('/', 'p-salon', { boost: true })).toBe('/?sheet=p-salon&boost=1');
    expect(roomSheetHref('/', 'a/b c&d')).toBe('/?sheet=a%2Fb+c%26d');
  });
  it('reads the open room back, and the page under it', () => {
    expect(roomSheetOf(u('/energy?sheet=a%2Fb+c%26d'))).toBe('a/b c&d');
    expect(roomSheetOf(u('/energy?sheet='))).toBeNull();
    expect(roomSheetOf(u('/energy'))).toBeNull();
    expect(roomSheetOf(u(roomSheetHref(u('/home/tariff'), 'p-salon')))).toBe('p-salon');
    expect(withoutRoomSheet(u('/schedule?room=p-ch1&sheet=p-salon&boost=1#week'))).toBe('/schedule?room=p-ch1#week');
    expect(withoutRoomSheet(u('/?sheet=p-salon'))).toBe('/');
    expect(withoutRoomSheet(u('/energy'))).toBe('/energy');
  });
  it('tells a sheet opening, closing or switching over the same page from a page change', () => {
    expect(sheetOnly(u('/energy'), u('/energy?sheet=p-salon'))).toBe(true);
    expect(sheetOnly(u('/energy?sheet=p-salon'), u('/energy'))).toBe(true);
    expect(sheetOnly(u('/energy#energy-where'), u('/energy?sheet=p-salon'))).toBe(true);
    expect(sheetOnly(u('/energy?sheet=p-salon'), u('/energy?sheet=p-ch1'))).toBe(true);
    expect(sheetOnly(u('/?sheet=p-salon'), u('/?sheet=p-salon&boost=1'))).toBe(false);
    expect(sheetOnly(u('/energy'), u('/energy'))).toBe(false);
    expect(sheetOnly(u('/energy?sheet=p-salon'), u('/schedule?room=p-salon'))).toBe(false);
    expect(sheetOnly(u('/schedule?day=mon'), u('/schedule?day=tue&sheet=p-salon'))).toBe(false);
  });
});

describe('Maison sub-pages (UX batch 8)', () => {
  it('English sub-paths under /home', () => {
    expect([ROUTES.devices, ROUTES.tariff, ROUTES.linky, ROUTES.sources, ROUTES.weather, ROUTES.account]).toEqual([
      '/home/devices', '/home/tariff', '/home/linky', '/home/sources', '/home/weather', '/home/account'
    ]);
    for (const r of [ROUTES.tariff, ROUTES.linky, ROUTES.sources, ROUTES.weather, ROUTES.account]) expect(isActive(r, ROUTES.home)).toBe(true);
  });
  it('the old Maison anchors reach their new place', () => {
    expect(homeAnchor('#tariff')).toBe('/home/tariff');
    expect(homeAnchor('#linky')).toBe('/home/linky');
    expect(homeAnchor('#sessions')).toBe('/home/account#sessions');
    expect(homeAnchor('#away')).toBe('away');
    expect(homeAnchor('away')).toBe('away');
    // #alerts stays on the overview; anything else is not an old section.
    expect(homeAnchor('#alerts')).toBeNull();
    expect(homeAnchor('')).toBeNull();
    expect(homeAnchor('#constructor')).toBeNull();
  });
  it('a French bookmark lands on the new page in two steps (/maison#tarif → /home#tariff → /home/tariff)', () => {
    const c = canonical('/maison', '#tarif'); // legacy-path-test
    expect(c).toEqual({ pathname: '/home', hash: '#tariff' });
    expect(homeAnchor(c!.hash)).toBe('/home/tariff');
    expect(homeAnchor(canonical('/maison', '#absence')!.hash)).toBe('away'); // legacy-path-test
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
    expect(canonical('/pieces', '#contenu')).toEqual({ pathname: '/', hash: '#content' });
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

it('the device screen lives under Home', () => {
  expect(ROUTES.devices).toBe('/home/devices');
  expect(isActive('/home/devices', ROUTES.home)).toBe(true);
});
