import { expect, test } from '@playwright/test';
import { CLS_WIDTHS, FONT_MODES, measureCls } from './cls';

// The CLS matrix (direction-2 §10): each route × 6 widths × 3 font modes stays under 0.05. Later batches
// add their routes here (and run their own interactions through measureCls).
const ROUTES = ['/', '/schedule', '/energy', '/home'];
// Maison sub-pages (UX batches 8–10).
ROUTES.push('/home/tariff', '/home/linky', '/home/sources', '/home/account', '/home/devices');

test.describe('CLS matrix', () => {
  test.skip(({ isMobile }) => isMobile, 'explicit widths');
  test.use({ serviceWorkers: 'block' });

  for (const route of ROUTES) {
    for (const fonts of FONT_MODES) {
      test(`${route} · fonts ${fonts} · CLS < 0.05 from 320 to 1440 px`, async ({ page }) => {
        test.setTimeout(150_000);
        for (const width of CLS_WIDTHS) {
          await page.setViewportSize({ width, height: 900 });
          const cls = await measureCls(page, route, { fonts });
          expect(cls, `${route} at ${width} px, fonts ${fonts}`).toBeLessThan(0.05);
        }
      });
    }
  }
});
