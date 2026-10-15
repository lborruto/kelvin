import { describe, expect, it } from 'vitest';
import { loginHref, safeNext } from './auth';

describe('safeNext', () => {
  it('keeps same-origin paths', () => {
    expect(safeNext('/schedule')).toBe('/schedule');
    expect(safeNext('/rooms/p-salon?x=1')).toBe('/rooms/p-salon?x=1');
    expect(safeNext('/rooms/p-salon?x=1#y')).toBe('/rooms/p-salon?x=1#y');
    expect(safeNext('/%2F%2Fevil.com')).toBe('/%2F%2Fevil.com');
  });
  it('safeNext canonicalises a legacy next', () => {
    expect(safeNext('/maison#tarif')).toBe('/home#tariff'); // legacy-path-test
    expect(safeNext('/pieces/p-salon?x=1#y')).toBe('/rooms/p-salon?x=1#y'); // legacy-path-test
    expect(safeNext('/energie?p=1')).toBe('/energy?p=1'); // legacy-path-test
    expect(safeNext('/pieces')).toBe('/'); // legacy-path-test
  });
  it('refuses dot segments that normalise to a protocol-relative path', () => {
    for (const bad of ['/.//evil.com', '/..//evil.com/x', '/%2e//evil.com', '/a/..//evil.com']) {
      expect(safeNext(bad)).toBe('/');
    }
  });
  it('refuses anything that could leave the app or loop', () => {
    for (const bad of [null, undefined, '', 'https://evil.fr', '//evil.fr', '/\\evil.fr', '/login', '/login?next=%2F', '/login#x',
      '/\t/evil.com', '/\n/evil.com', '/\r/evil.com', '/\t\\evil.com', '/\\evil.com',
      'javascript:alert(1)']) {
      expect(safeNext(bad)).toBe('/');
    }
  });
});

describe('loginHref', () => {
  it('carries the current page as next', () => {
    expect(loginHref({ pathname: '/schedule', search: '' })).toBe('/login?next=%2Fschedule');
    expect(loginHref({ pathname: '/', search: '' })).toBe('/login?next=%2F');
    expect(loginHref({ pathname: '/energy', search: '?p=1' }, true)).toBe('/login?next=%2Fenergy%3Fp%3D1&reauth=1');
  });
  it('carries the English path of a legacy page', () => {
    expect(loginHref({ pathname: '/programme', search: '' })).toBe('/login?next=%2Fschedule'); // legacy-path-test
  });
  it('carries the anchor, mapped for a legacy page', () => {
    expect(loginHref({ pathname: '/home', search: '?x=1', hash: '#tariff' })).toBe('/login?next=%2Fhome%3Fx%3D1%23tariff');
    expect(loginHref({ pathname: '/maison', search: '', hash: '#tarif' })).toBe('/login?next=%2Fhome%23tariff'); // legacy-path-test
  });
  it('never nests the login page', () => {
    expect(loginHref({ pathname: '/login', search: '?next=%2Fhome' })).toBe('/login?next=%2F');
  });
});
