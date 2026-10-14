import { describe, expect, it } from 'vitest';
import { loginHref, safeNext } from './auth';

describe('safeNext', () => {
  it('keeps same-origin paths', () => {
    expect(safeNext('/programme')).toBe('/programme');
    expect(safeNext('/pieces/p-salon?x=1')).toBe('/pieces/p-salon?x=1');
    expect(safeNext('/pieces/p-salon?x=1#y')).toBe('/pieces/p-salon?x=1#y');
    expect(safeNext('/%2F%2Fevil.com')).toBe('/%2F%2Fevil.com');
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
    expect(loginHref({ pathname: '/programme', search: '' })).toBe('/login?next=%2Fprogramme');
    expect(loginHref({ pathname: '/', search: '' })).toBe('/login?next=%2F');
    expect(loginHref({ pathname: '/energie', search: '?p=1' }, true)).toBe('/login?next=%2Fenergie%3Fp%3D1&reauth=1');
  });
  it('never nests the login page', () => {
    expect(loginHref({ pathname: '/login', search: '?next=%2Fmaison' })).toBe('/login?next=%2F');
  });
});
