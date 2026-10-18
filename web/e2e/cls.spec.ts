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
// Plan 15 « Météo et coût » with the demo place: Maison's « Demain » (phone Bill + Demain 164 px, desktop Demain +
// Hier 134 px), the room sheet's « Froid » row (skeleton 136 px) and Énergie scrolled to the panel.
ROUTES.push('/energy#weather-cost');

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
