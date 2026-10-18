import { expect, test } from '@playwright/test';
import { CLS_WIDTHS, clsWidths, FONT_MODES, measureCls } from './cls';

// The CLS matrix (direction-2 §10): each route × 3 font modes (6 widths with fonts blocked, 320/390/1440 with
// fonts normal or late: `clsWidths`) stays under 0.05. Later batches
// add their routes here (and run their own interactions through measureCls).
const ROUTES = ['/', '/schedule', '/energy', '/home'];
// Maison sub-pages (UX batches 8–10).
ROUTES.push('/home/tariff', '/home/linky', '/home/sources', '/home/weather', '/home/account', '/home/devices');
// UX batch 13: the phone room page and the 404 (/login has its own matrix in login.spec.ts).
ROUTES.push('/rooms/p-salon', '/no-such-page');
// Programme (Tableau): the day view (a phone width) beside the agenda, and an offline room's read-only agenda.
ROUTES.push('/schedule?room=p-ch1&day=tuesday', '/schedule?room=p-ch2');
// Tableau: the room sheet of an offline room (notice, ghost day) over the tableau.
ROUTES.push('/rooms/p-ch2');

test.describe('CLS matrix', () => {
  test.skip(({ isMobile }) => isMobile, 'explicit widths');
  test.use({ serviceWorkers: 'block' });

  for (const route of ROUTES) {
    for (const fonts of FONT_MODES) {
      test(`${route} · fonts ${fonts} · CLS < 0.05 from 320 to 1440 px`, async ({ page }) => {
        test.setTimeout(150_000);
        for (const width of clsWidths(fonts)) {
          await page.setViewportSize({ width, height: 900 });
          const cls = await measureCls(page, route, { fonts });
          expect(cls, `${route} at ${width} px, fonts ${fonts}`).toBeLessThan(0.05);
        }
      });
    }
  }
});

// « Détails techniques » on (direction-2 §1.3): the preference is applied before first paint, so the
// opened disclosures, the live power and the radiator rows' inline facts never shift the page.
test.describe('CLS with technical details on', () => {
  test.skip(({ isMobile }) => isMobile, 'explicit widths');
  test.use({ serviceWorkers: 'block' });
  for (const route of ['/', '/rooms/p-salon', '/energy', '/home/tariff', '/home/devices']) {
    test(`${route} · details on · CLS < 0.05 from 320 to 1440 px`, async ({ page }) => {
      test.setTimeout(150_000);
      await page.addInitScript(() => localStorage.setItem('kelvin-detail', 'on'));
      for (const width of CLS_WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        const cls = await measureCls(page, route, { fonts: 'blocked' });
        expect(cls, `${route} at ${width} px, details on`).toBeLessThan(0.05);
      }
    });
  }
});

// An alert the server raises just after Maison's first frame (CI, 2026-10-17: the simulator raised its EcoWatt alert
// one evaluation after the offline radiator's, 1 s apart; the page had drawn one row, the second pushed the rooms
// and « Énergie » 80 px down at 320 px: CLS 0.0517). Maison keeps the rows it drew; a new one is announced (toast,
// « Mettre à jour » in the widget) and drawn on the owner's tap, so nothing moves under their finger.
test.describe('CLS when an alert arrives after the first frame', () => {
  test.skip(({ isMobile }) => isMobile, 'explicit widths');
  test.use({ serviceWorkers: 'block' });
  const LATE = {
    id: 990_001, kind: 'tempo_red_tomorrow', severity: 'warn', params: { date: '2026-10-18' },
    first_seen: 0, last_seen: 0, resolved_at: null, dismissed: false
  };
  const LATE_MS = 1200;
  for (const width of [320, 390, 1024, 1440]) {
    test(`/ at ${width} px · a late alert moves nothing`, async ({ page }) => {
      test.setTimeout(60_000);
      await page.setViewportSize({ width, height: 900 });
      const cls = await measureCls(page, '/', {
        fonts: 'normal',
        windowMs: LATE_MS + 1800,
        // The first answer is the server's list; every later one (the page asks again as the summary lands)
        // answers 1.2 s late with one more alert, as when the server raises it meanwhile.
        routes: async (p) => {
          let first = true;
          await p.route('**/api/alerts?state=active', async (r) => {
            const res = await r.fetch();
            const live = (await res.json()) as object[];
            if (first) {
              first = false;
              return r.fulfill({ response: res, json: live });
            }
            await new Promise((ok) => setTimeout(ok, LATE_MS));
            await r.fulfill({ response: res, json: [...live, LATE] }).catch(() => {});
          });
        }
      });
      expect(cls, `/ at ${width} px, an alert after the first frame`).toBeLessThan(0.005);
      // The late path ran: the new alert is announced, not drawn, until the owner asks for it.
      const late = page.getByText(/^Jour Tempo Rouge demain/);
      await expect(page.getByText('1 nouvelle alerte')).toBeVisible();
      await expect(late).toHaveCount(0);
      await page.getByRole('button', { name: 'Afficher', exact: true }).click();
      await expect(late).toBeVisible();
    });
  }
});

// « Dehors » (Plan 14) arriving after the first frame: the snapshot had no weather (a place saved meanwhile, from
// another device), then the SSE `weather` event brings the chip with its reading. The chip is last in the row, so
// its arrival moves no other chip; the row is one line, so it never changes the page's height. (Right after Climat,
// it pushed the month, Réseau and Absence sideways.)
test.describe('CLS when the weather reading arrives after the first frame', () => {
  test.skip(({ isMobile }) => isMobile, 'explicit widths');
  test.use({ serviceWorkers: 'block' });
  const LATE_MS = 1200;
  for (const width of [320, 390, 1024, 1440]) {
    test(`/ at ${width} px · a late weather reading moves nothing`, async ({ page }) => {
      test.setTimeout(60_000);
      await page.setViewportSize({ width, height: 900 });
      const cls = await measureCls(page, '/', {
        fonts: 'normal',
        windowMs: LATE_MS + 1800,
        // The stream: no weather in the snapshot, the `weather` event with a reading 1.2 s later.
        routes: (p) =>
          p.addInitScript((late) => {
            const s = Date.now() / 1000;
            const reading = {
              now: { temperature_c: 4.2, apparent_c: 1.8, humidity_pct: 86, at: s, model: 'arome_hd' },
              today: { min_c: 1.9, min_at: s - 3600, min_ahead: false, max_c: 9.8, max_at: s + 3600, max_ahead: true, hours: 48 },
              fetched_at: s, mode: 'meteofrance', fetch: { state: 'ok', next: s + 3600, error_since: null }
            };
            const Real = window.EventSource;
            class Late extends Real {
              addEventListener(type: string, fn: EventListenerOrEventListenerObject, opts?: boolean | AddEventListenerOptions) {
                const call = (e: Event) => (typeof fn === 'function' ? fn.call(this, e) : fn.handleEvent(e));
                if (type === 'snapshot')
                  return super.addEventListener(type, (e) => {
                    const d = JSON.parse((e as MessageEvent).data);
                    call(new MessageEvent('snapshot', { data: JSON.stringify({ ...d, weather: null }) }));
                  }, opts);
                if (type === 'weather') setTimeout(() => call(new MessageEvent('weather', { data: JSON.stringify(reading) })), late);
                return super.addEventListener(type, fn, opts);
              }
            }
            window.EventSource = Late;
          }, LATE_MS)
      });
      await expect(page.getByRole('button', { name: /^Dehors 4,2\s?°C, détails$/ }).first()).toBeAttached();
      // ≈ 0 here; right after Climat it measured 0.0017–0.0041 (320 → 1440 px).
      expect(cls, `/ at ${width} px, the weather reading after the first frame`).toBeLessThan(0.001);
    });
  }
});
