import type { IconName } from './components/Icon.svelte';
import type { Radiator, Room } from './api/types';
import { NAV, type NavKey } from './paths';
import { isOffline, roomReading } from './status';

/** The Tableau shell's glyph for each destination (spec §2): Maison is the dashboard at `/`, Réglages is
 * `/home`. The hrefs, keys and order are `NAV` in paths.ts (unchanged); labels come from `m.nav[key]`. */
export const NAV_ICON: Record<NavKey, IconName> = { rooms: 'home', schedule: 'cal', energy: 'chart', home: 'gear' };

/** The sidebar's top links (Maison, Programme, Énergie) and its bottom link (Réglages). */
export const NAV_TOP = NAV.filter((n) => n.key !== 'home');
export const NAV_BOTTOM = NAV.filter((n) => n.key === 'home');

/** The key that carries the alert dot: the dashboard (decision 1). */
export const ALERT_KEY: NavKey = 'rooms';

export interface SidebarRoom {
  id: string;
  name: string;
  reading: number | null;
  heating: boolean;
  offline: boolean;
}

/** The sidebar's « PIÈCES » rows: Cozytouch order, offline rooms last (their own order kept). */
export function sidebarRooms(
  rooms: Room[],
  radiatorsOf: (id: string) => Radiator[],
  heating: (id: string) => boolean,
  name: (r: Room) => string
): SidebarRoom[] {
  const rows = rooms.map((r) => {
    const rads = radiatorsOf(r.id);
    const offline = isOffline(rads);
    return { id: r.id, name: name(r), reading: offline ? null : roomReading(r, rads), heating: !offline && heating(r.id), offline };
  });
  return [...rows.filter((r) => !r.offline), ...rows.filter((r) => r.offline)];
}
