import type { IconName } from './components/Icon.svelte';

/** URL paths are English whatever the UI language (spec §4). French paths live only in the
 * legacy table below and its mirror in app.html. */
export const ROUTES = {
  rooms: '/',
  /** A room's sheet over Maison (the tableau's tiles). Over another page: `roomSheetHref(page.url, id)`. */
  room: (id: string) => roomSheetHref(ROUTES.rooms, id),
  schedule: '/schedule',
  energy: '/energy',
  home: '/home',
  devices: '/home/devices',
  tariff: '/home/tariff',
  linky: '/home/linky',
  sources: '/home/sources',
  weather: '/home/weather',
  account: '/home/account',
  login: '/login'
} as const;

/** Section anchors: Home (away, tariff, linky, alerts, sessions) and Energy (quality, curve). */
export const ANCHORS = { away: 'away', tariff: 'tariff', linky: 'linky', quality: 'quality', curve: 'curve', alerts: 'alerts', sessions: 'sessions', mcp: 'mcp' } as const;
/** Énergie's section anchors (the Résumé's key figures link to them). */
export const ENERGY_ANCHORS = { where: 'energy-where', offpeak: 'offpeak', projection: 'projection', weather: 'weather-cost' } as const; // i18n-ignore: anchor ids (URL fragments), not copy

/** Maison's old section anchors (one page until UX batch 8, now Réglages at `/home`) and where each now lives: a
 * sub-page, or the Absence sheet opened over the Maison tableau at `/` (`away`). `#alerts` stays on the overview. */
export const HOME_ANCHORS: Record<string, string | 'away'> = {
  [ANCHORS.tariff]: ROUTES.tariff,
  [ANCHORS.linky]: ROUTES.linky,
  [ANCHORS.sessions]: `${ROUTES.account}#${ANCHORS.sessions}`,
  [ANCHORS.mcp]: `${ROUTES.account}#${ANCHORS.mcp}`,
  [ANCHORS.away]: 'away'
};

/** Where `/home` + `hash` now lives: a path, `'away'` (open the Absence sheet over `/`) or null. */
export function homeAnchor(hash: string): string | 'away' | null {
  const id = hash.replace(/^#/, '');
  return Object.hasOwn(HOME_ANCHORS, id) ? HOME_ANCHORS[id] : null;
}

/** The room sheet is a shell overlay opened over whatever page is under it by this search parameter
 * (`/energy?sheet=p-salon`): a reload or a shared link opens it again, Back closes it. `boost` (with it) opens the
 * sheet with the Chauffe temporaire form unfolded. `/rooms/[id]` (older links) redirects to `/?sheet=[id]`. */
export const ROOM_SHEET = 'sheet';
export const ROOM_SHEET_BOOST = 'boost';
/** The legacy room path: `/rooms/<id>` (redirected to the sheet over Maison). */
export const roomPath = (id: string) => `/rooms/${encodeURIComponent(id)}`;

const BASE = 'http://kelvin.invalid';
/** The pages a room sheet may open over: the app's own paths (Login excepted). Hrefs are built only from these,
 * never by echoing the address bar's path: with the SPA fallback a crafted `//evil.example/x` (or `/\evil…`) path
 * still renders Kelvin, and echoing it would make a protocol-relative link off-site (an open redirect). */
const SHEET_PAGES: ReadonlySet<string> = new Set(
  (Object.values(ROUTES) as unknown[]).filter((v): v is string => typeof v === 'string' && v !== ROUTES.login)
);
/** The query parameters the pages under a sheet read (Programme's `room` and `day`); any other one is dropped. */
const PAGE_PARAMS = ['room', 'day'] as const;

/** The page under a sheet: a known path (else Maison), only its own parameters, the hash kept when asked. */
function pageUnder(at: string | URL, hash: boolean): { path: string; params: URLSearchParams; hash: string } {
  // A string is a path of ours (`ROUTES.*`); anything not starting with one '/' is not, and is never resolved.
  const u = typeof at === 'string' ? new URL(/^\/(?![/\\])/.test(at) ? at : '/', BASE) : at;
  const path = SHEET_PAGES.has(u.pathname) ? u.pathname : ROUTES.rooms;
  const params = new URLSearchParams();
  for (const k of PAGE_PARAMS) {
    const v = u.searchParams.get(k);
    if (v != null) params.set(k, v);
  }
  return { path, params, hash: hash && /^#[\w-]+$/.test(u.hash) ? u.hash : '' };
}
const href = (p: { path: string; params: URLSearchParams; hash: string }) => {
  const q = p.params.toString();
  return `${p.path}${q ? `?${q}` : ''}${p.hash}`;
};

/** The page `at` (a path or the current URL) with room `id`'s sheet open over it; any other sheet (and its boost)
 * replaced, the page's own parameters kept, the hash dropped (the page stays where it is scrolled). Always a
 * same-origin path from `ROUTES`. */
export function roomSheetHref(at: string | URL, id: string, opts: { boost?: boolean } = {}): string {
  const p = pageUnder(at, false);
  p.params.set(ROOM_SHEET, id);
  if (opts.boost) p.params.set(ROOM_SHEET_BOOST, '1');
  return href(p);
}

/** The room whose sheet `url` opens, or null. */
export function roomSheetOf(url: URL | null | undefined): string | null {
  return url?.searchParams.get(ROOM_SHEET) || null;
}

/** `url` with no room sheet: the page under it (a known path, its own parameters, a plain anchor kept). */
export function withoutRoomSheet(url: URL): string {
  return href(pageUnder(url, true));
}

/** Whether `a` → `b` only opens, closes or switches the room sheet: the page under it is the same (path and
 * parameters; the hash ignored), so it stays mounted, scrolled and focused as it was. */
export function sheetOnly(a: URL | null | undefined, b: URL | null | undefined): boolean {
  if (!a || !b) return false;
  const rest = (u: URL) => {
    const q = new URLSearchParams(u.searchParams);
    q.delete(ROOM_SHEET);
    q.delete(ROOM_SHEET_BOOST);
    q.sort();
    return `${u.origin}${u.pathname}?${q}`;
  };
  return roomSheetOf(a) !== roomSheetOf(b) && rest(a) === rest(b);
}

export type NavKey = 'rooms' | 'schedule' | 'energy' | 'home';
/** The four destinations of the sidebar and the tab bar; labels come from m.nav[key]. */
export const NAV: { key: NavKey; href: string; icon: IconName }[] = [
  { key: 'rooms', href: ROUTES.rooms, icon: 'rooms' },
  { key: 'schedule', href: ROUTES.schedule, icon: 'program' },
  { key: 'energy', href: ROUTES.energy, icon: 'energy' },
  { key: 'home', href: ROUTES.home, icon: 'house' }
];

/** Rooms covers "/" and every room page; the others their own path and what is under it. */
export function isActive(pathname: string, href: string): boolean {
  if (href === ROUTES.rooms) return pathname === '/' || pathname.startsWith('/rooms/');
  return pathname === href || pathname.startsWith(`${href}/`);
}

/* legacy-paths:start — mirrored in src/app.html; paths.test.ts checks the two are equal. */
export const LEGACY: [RegExp, string][] = [
  [/^\/pieces\/?$/, '/'],
  [/^\/pieces\/(.+)$/, '/rooms/$1'],
  [/^\/programme\/?$/, '/schedule'],
  [/^\/energie\/?$/, '/energy'],
  [/^\/maison\/?$/, '/home']
];
export const LEGACY_HASH: Record<string, string> = {
  '#tarif': '#tariff',
  '#absence': '#away',
  '#qualite': '#quality',
  '#courbe': '#curve',
  '#contenu': '#content'
};
/* legacy-paths:end */

/** The English path (and anchor) of an old French one; null when `pathname` is not legacy. */
export function canonical(pathname: string, hash = ''): { pathname: string; hash: string } | null {
  for (const [re, to] of LEGACY) {
    if (re.test(pathname)) return { pathname: pathname.replace(re, to), hash: LEGACY_HASH[hash] ?? hash };
  }
  return null;
}
