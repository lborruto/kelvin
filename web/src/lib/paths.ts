import type { IconName } from './components/Icon.svelte';

/** URL paths are English whatever the UI language (spec §4). French paths live only in the
 * legacy table below and its mirror in app.html. */
export const ROUTES = {
  rooms: '/',
  room: (id: string) => `/rooms/${encodeURIComponent(id)}`,
  schedule: '/schedule',
  energy: '/energy',
  home: '/home',
  devices: '/home/devices',
  tariff: '/home/tariff',
  linky: '/home/linky',
  sources: '/home/sources',
  account: '/home/account',
  login: '/login'
} as const;

/** Section anchors: Home (away, tariff, linky, alerts, sessions) and Energy (quality, curve). */
export const ANCHORS = { away: 'away', tariff: 'tariff', linky: 'linky', quality: 'quality', curve: 'curve', alerts: 'alerts', sessions: 'sessions' } as const;

/** Maison's old section anchors (one page until UX batch 8) and where each now lives: a sub-page, or the
 * Absence sheet opened over the overview (`away`). `#alerts` stays on the overview. */
export const HOME_ANCHORS: Record<string, string | 'away'> = {
  [ANCHORS.tariff]: ROUTES.tariff,
  [ANCHORS.linky]: ROUTES.linky,
  [ANCHORS.sessions]: `${ROUTES.account}#${ANCHORS.sessions}`,
  [ANCHORS.away]: 'away'
};

/** Where `/home` + `hash` now lives: a path, `'away'` (open the Absence sheet on the overview) or null. */
export function homeAnchor(hash: string): string | 'away' | null {
  const id = hash.replace(/^#/, '');
  return Object.hasOwn(HOME_ANCHORS, id) ? HOME_ANCHORS[id] : null;
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
