import { describe, expect, it } from 'vitest';
import { ANCHORS, canonical, isActive, NAV, ROUTES } from './paths';

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
