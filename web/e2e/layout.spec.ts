import { expect, test, type Page } from '@playwright/test';

// Layout guards, run once (desktop project; widths are set per check).
const WIDTHS = [320, 360, 390, 768, 1024, 1280, 1440];
const ROUTES = ['/', '/rooms/p-salon', '/schedule', '/energy', '/home'];

/** The page is in its loaded state: a title, no skeleton left. */
async function settled(page: Page) {
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  await page.waitForFunction(() => !document.querySelector('.skeleton'), null, { timeout: 15_000 });
  // Let the entrance motion finish (bars grow in 360 ms).
  await page.waitForTimeout(500);
}

const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.describe('layout', () => {
  test.skip(({ isMobile }) => isMobile, 'runs once, at explicit widths');

  for (const path of ROUTES) {
    test(`${path} never scrolls sideways from 320 to 1440 px`, async ({ page }) => {
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        await settled(page);
        expect(await overflow(page), `${path} at ${width} px`).toBeLessThanOrEqual(0);
      }
    });
  }

  test('/schedule with three periods on a day never scrolls sideways from 320 to 1440 px', async ({ page }) => {
    page.on('dialog', (d) => d.accept());
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto('/schedule');
    await settled(page);
    // The open day (today on a phone) gets its third period: its summary is then at its longest.
    // Clicked in the DOM: once the first period is added, the sticky send bar may cover the button.
    const add = page.locator('button.add').first();
    for (let i = 0; i < 3; i++) await add.evaluate((b: HTMLButtonElement) => b.click());
    await expect(add).toHaveAttribute('aria-disabled', 'true');
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(100);
      expect(await overflow(page), `/schedule (3 periods) at ${width} px`).toBeLessThanOrEqual(0);
    }
  });

  test('/login never scrolls sideways from 320 to 1440 px', async ({ browser }) => {
    const page = await (await browser.newContext({ storageState: { cookies: [], origins: [] }, locale: 'fr-FR' })).newPage();
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/login');
      await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();
      expect(await overflow(page), `/login at ${width} px`).toBeLessThanOrEqual(0);
    }
  });

  for (const path of ['/home', '/energy']) {
    test(`${path} loads without layout shift (CLS < 0.05)`, async ({ page }) => {
      // Registered once: every navigation starts a fresh count.
      await page.addInitScript(() => {
        const w = window as unknown as { __cls: number };
        w.__cls = 0;
        new PerformanceObserver((list) => {
          for (const e of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) {
            if (!e.hadRecentInput) w.__cls += e.value;
          }
        }).observe({ type: 'layout-shift', buffered: true });
      });
      for (const width of [390, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        // A cold load: the data arrives after the first paint, as on a real visit.
        await page.route('**/api/**', async (route) => {
          await new Promise((r) => setTimeout(r, 150));
          await route.continue();
        });
        await page.goto(path);
        await settled(page);
        await page.waitForTimeout(800);
        const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
        expect(cls, `${path} at ${width} px`).toBeLessThan(0.05);
        await page.unrouteAll({ behavior: 'ignoreErrors' });
      }
    });
  }
});

// The same guards with the English copy (Plan 7): English labels are often longer or shorter.
test.describe('layout in English', () => {
  test.skip(({ isMobile }) => isMobile, 'runs once, at explicit widths');
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('kelvin-locale', 'en'));
  });

  for (const path of ROUTES) {
    test(`layout in English never scrolls sideways: ${path}`, async ({ page }) => {
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        await settled(page);
        expect(await overflow(page), `${path} at ${width} px`).toBeLessThanOrEqual(0);
      }
    });
  }

  test('layout in English never scrolls sideways: /schedule with three periods on a day', async ({ page }) => {
    page.on('dialog', (d) => d.accept());
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto('/schedule');
    await settled(page);
    const add = page.locator('button.add').first();
    for (let i = 0; i < 3; i++) await add.evaluate((b: HTMLButtonElement) => b.click());
    await expect(add).toHaveAttribute('aria-disabled', 'true');
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(100);
      expect(await overflow(page), `/schedule (3 periods) at ${width} px`).toBeLessThanOrEqual(0);
    }
  });

  test('layout in English never scrolls sideways: /login', async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] }, locale: 'fr-FR' });
    await context.addInitScript(() => localStorage.setItem('kelvin-locale', 'en'));
    const page = await context.newPage();
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/login');
      await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
      expect(await overflow(page), `/login at ${width} px`).toBeLessThanOrEqual(0);
    }
    await context.close();
  });
});
