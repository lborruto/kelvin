import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findLegacyPaths } from '../../scripts/check-paths.mjs';
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

const appHtml = readFileSync(resolve(process.cwd(), 'src/app.html'), 'utf8');

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

describe('no French path outside the legacy blocks', () => {
  it('finds none in the web app, the e2e suite, the backend and the docs', () => {
    expect(findLegacyPaths(resolve(process.cwd(), '..'))).toEqual([]);
  });
});
