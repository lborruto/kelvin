/** Where to go after login: a same-origin path only, never back to /login. */
export function safeNext(next: string | null | undefined): string {
  // Control characters (TAB/LF/CR are stripped by URL parsing) and backslashes can smuggle a host.
  // eslint-disable-next-line no-control-regex
  if (!next || !next.startsWith('/') || /[\u0000-\u001f\u007f\\]/.test(next)) return '/';
  const base = 'http://kelvin.invalid';
  let u: URL;
  try {
    u = new URL(next, base);
  } catch {
    return '/';
  }
  if (u.origin !== base) return '/';
  // Dot segments normalise to a protocol-relative path ('/.//evil.com' → '//evil.com').
  if (u.pathname.startsWith('//')) return '/';
  if (u.pathname === '/login' || u.pathname.startsWith('/login/')) return '/';
  return u.pathname + u.search + u.hash;
}

/** The login URL that brings the user back to `current` afterwards. */
export function loginHref(current: { pathname: string; search: string }, reauth = false): string {
  const next = current.pathname === '/login' ? '/' : current.pathname + current.search;
  const q = new URLSearchParams({ next });
  if (reauth) q.set('reauth', '1');
  return `/login?${q}`;
}
