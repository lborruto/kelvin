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
  login: '/login'
} as const;

/** Section anchors: Home (away, tariff, linky, alerts, sessions) and Energy (quality, curve). */
export const ANCHORS = { away: 'away', tariff: 'tariff', linky: 'linky', quality: 'quality', curve: 'curve', alerts: 'alerts', sessions: 'sessions' } as const;
/** Énergie's section anchors (the Résumé's key figures link to them). */
export const ENERGY_ANCHORS = { where: 'energy-where', offpeak: 'offpeak', projection: 'projection' } as const; // i18n-ignore: anchor ids (URL fragments), not copy

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
