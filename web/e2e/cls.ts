import { expect, type Page } from '@playwright/test';

/** How the web fonts arrive: as usual, never (`*.woff2` aborted, as on CI), or 3 s late. */
export type FontMode = 'normal' | 'blocked' | 'late';
export const FONT_MODES: FontMode[] = ['normal', 'blocked', 'late'];
export const CLS_WIDTHS = [320, 390, 768, 1024, 1280, 1440];
export const LATE_FONT_MS = 3000;

/** The page is in its loaded state: a title, no skeleton left. */
export async function settled(page: Page) {
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  await page.waitForFunction(() => !document.querySelector('.skeleton'), null, { timeout: 15_000 });
}

/**
 * The cumulative layout shift of a cold load of `route` (direction-2 §10): every `layout-shift` entry
 * without recent input, summed over the first 5 s (or until the late fonts have landed), with the API
 * answering 150 ms late as on a real visit. Call once per load; the page keeps its viewport.
 * Use with `test.use({ serviceWorkers: 'block' })` so the routes see every font request.
 */
export async function measureCls(page: Page, route: string, opts: { fonts?: FontMode; windowMs?: number } = {}): Promise<number> {
  const fonts = opts.fonts ?? 'normal';
  await page.addInitScript(() => {
    const w = window as unknown as { __cls?: number };
    if (w.__cls !== undefined) return;
    w.__cls = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) {
        if (!e.hadRecentInput) w.__cls! += e.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  if (fonts === 'blocked') await page.route('**/*.woff2', (r) => r.abort());
  if (fonts === 'late')
    await page.route('**/*.woff2', async (r) => {
      await new Promise((ok) => setTimeout(ok, LATE_FONT_MS));
      await r.continue().catch(() => {});
    });
  await page.route('**/api/**', async (r) => {
    await new Promise((ok) => setTimeout(ok, 150));
    await r.continue().catch(() => {});
  });
  const start = Date.now();
  await page.goto(route);
  await settled(page);
  const windowMs = opts.windowMs ?? (fonts === 'late' ? LATE_FONT_MS + 1200 : 2000);
  const left = windowMs - (Date.now() - start);
  if (left > 0) await page.waitForTimeout(left);
  const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  return cls;
}
