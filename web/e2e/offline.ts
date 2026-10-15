import type { Page } from '@playwright/test';

// The simulator's demo outage (« Chambre 2 ») began 45 min before Kelvin's first login, on the
// real wall clock: a suite started just after midnight sees it begin « le 15 oct. » (the UI's rule:
// the time alone only when it began today). These helpers pin the browser's clock to a known
// distance from that instant and give the words the UI writes, with the UI's own Intl options
// ($lib/format: clock and dayShort, Europe/Paris), so the assertions are exact at any hour.

/** When the room's radiators went offline (ms), from the house view. */
export async function offlineSince(page: Page, roomId = 'p-ch2'): Promise<number> {
  const res = await page.request.get('/api/house');
  const snap = (await res.json()) as { house: { radiators: { room_id: string; unreachable_since?: number | null }[] } };
  const since = snap.house.radiators.filter((r) => r.room_id === roomId).map((r) => r.unreachable_since);
  if (!since.length || since.some((s) => s == null)) throw new Error(`no outage known for ${roomId}`);
  return Math.max(...(since as number[])) * 1000;
}

const ZONE = 'Europe/Paris';
export const clockFr = (ms: number) =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: ZONE, hour: '2-digit', minute: '2-digit' }).format(new Date(ms));
export const dayShortFr = (ms: number) =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: ZONE, day: 'numeric', month: 'short' }).format(new Date(ms));

/**
 * Freeze the browser's Date at the outage's own instant (so it began « today ») and return the
 * status words « Hors ligne depuis 21:14 ». Call before `page.goto`.
 */
export async function pinSameDay(page: Page, roomId = 'p-ch2'): Promise<string> {
  const since = await offlineSince(page, roomId);
  await page.clock.setFixedTime(since);
  return `Hors ligne depuis ${clockFr(since)}`;
}
