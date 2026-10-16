import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { settled } from './cls';

// axe-core on every route (one dark theme, Tableau): no serious or critical violation. Runs in both
// projects (phone and desktop), so the tab bar and the sidebar, the phone sheets and the desktop panels
// are all checked. The 404 and the login screen are routes too.
const ROUTES = [
  '/',
  '/rooms/p-salon',
  '/schedule',
  '/energy',
  '/home',
  '/home/tariff',
  '/home/linky',
  '/home/sources',
  '/home/account',
  '/home/devices',
  '/no-such-page'
];

async function violations(page: Page) {
  // Scan a still page: a sheet fading in or a button turning enabled is mid-colour for a moment
  // (reduced motion keeps the opacity and colour transitions, DESIGN « Motion »).
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity));
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
  return result.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => `${n.target.join(' ')} [${n.any.map((c) => c.message).join('; ')}]`).slice(0, 5).join(' | ')}`);
}

test.describe('accessibility (axe)', () => {
  test.use({ serviceWorkers: 'block' });
  {
    for (const route of ROUTES) {
      test(`${route} · no serious or critical axe violation`, async ({ page }) => {
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.goto(route);
        await settled(page);
        expect(await violations(page)).toEqual([]);
      });
    }

    test(`/energy Jour, Semaine and Année · no serious or critical axe violation`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('/energy');
      await settled(page);
      for (const view of ['Jour', 'Semaine', 'Année']) {
        await page.getByRole('radio', { name: view, exact: true }).click();
        await settled(page);
        expect(await violations(page), view).toEqual([]);
      }
    });

    test(`/login · no serious or critical axe violation`, async ({ browser }, info) => {
      const context = await browser.newContext({ ...info.project.use, storageState: { cookies: [], origins: [] } });
      const page = await context.newPage();
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('/login');
      await settled(page);
      expect(await violations(page)).toEqual([]);
      await context.close();
    });

    test(`the Absence sheet and technical details · no serious or critical axe violation`, async ({ page }) => {
      await page.addInitScript(() => localStorage.setItem('kelvin-detail', 'on'));
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('/home');
      await settled(page);
      expect(await violations(page)).toEqual([]);
      await page.getByRole('button', { name: /^Partir en absence/ }).click();
      await expect(page.getByRole('dialog', { name: 'Partir en absence' })).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });
  }
});

// Dark only (Tableau): a browser that prefers light still gets the one dark theme.
test('a light-preferring browser still gets the dark theme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/home');
  await settled(page);
  const [bg, ground] = await page.evaluate(() => [getComputedStyle(document.body).backgroundColor, getComputedStyle(document.documentElement).backgroundColor]);
  expect(bg).toBe('rgb(11, 11, 13)');
  expect(ground).toBe('rgb(5, 5, 6)');
});
