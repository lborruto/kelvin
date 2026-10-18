import type { Page } from '@playwright/test';

// Pinning the browser's clock against the backend's. The simulator seeds a week of history up to the
// moment it starts, on its own wall clock: a test that reads a moment of « today » (06:00 measured, a
// step after now) depends on the hour it runs at. These helpers place the browser at a fixed Paris time
// on a day the backend has whole, so the same words come out at 00:05, 06:00 or 23:55.

const ZONE = 'Europe/Paris';

/** The backend's own time (ms), from its HTTP Date header: the same clock its history was seeded on. */
export async function serverNow(page: Page): Promise<number> {
  const res = await page.request.get('/api/health');
  const date = res.headers()['date'];
  if (!date) throw new Error('no Date header on /api/health');
  return Date.parse(date);
}

/** The Paris calendar day of `ms`, as YYYY-MM-DD. */
export const parisDay = (ms: number) => new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(new Date(ms));

/** `day` ± `n` calendar days (never ± n × 24 h: a day is 23 or 25 h at the clock changes). */
export const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** The instant (ms) of `hh:mm` Paris time on `day` (YYYY-MM-DD). */
export function parisAt(day: string, hh: number, mm = 0): number {
  const wall = Date.parse(`${day}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00Z`);
  // The zone's offset at that instant; twice, so a time just after a clock change lands right.
  let t = wall;
  for (let i = 0; i < 2; i++) {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
        .formatToParts(new Date(t))
        .map((p) => [p.type, p.value])
    );
    const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
    t = wall - (asUtc - t);
  }
  return t;
}

/**
 * Freeze the browser's Date at `hh:mm` Paris time on the backend's yesterday: a whole day of seeded
 * history, whatever the hour the suite runs at. Returns the instant. Call before `page.goto`.
 */
export async function pinYesterdayAt(page: Page, hh: number, mm = 0): Promise<number> {
  const at = parisAt(addDays(parisDay(await serverNow(page)), -1), hh, mm);
  await page.clock.setFixedTime(at);
  return at;
}
