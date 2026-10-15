import { test } from '@playwright/test';

const scheme = (process.env.SCREENS_SCHEME as 'light' | 'dark' | undefined) ?? 'light';
test.use({ colorScheme: scheme });

test.skip(!process.env.SCREENS, 'set SCREENS=1 to capture finish-review screenshots');
// Simulator only (playwright.config.ts starts KELVIN_FAKE=1). SCREENS_DIR=../docs/screenshots
// renders the README screenshots; the default stays inside the gitignored test-results/.
const outDir = process.env.SCREENS_DIR ?? 'test-results/screens';

for (const path of ['/', '/rooms/p-salon', '/schedule', '/energy', '/home', '/login']) {
  test(`screen ${path}`, async ({ browser, page: loggedIn }, info) => {
    // /login sends a logged-in visitor away: capture it from a fresh, logged-out context.
    const page =
      path === '/login'
        ? await (
            await browser.newContext({
              ...info.project.use,
              colorScheme: scheme,
              locale: 'fr-FR',
              storageState: { cookies: [], origins: [] }
            })
          ).newPage()
        : loggedIn;
    await page.goto(path);
    await page.getByRole('main').waitFor();
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(1200);
    const name = `${scheme}_${info.project.name}${path === '/' ? '_rooms' : path.replaceAll('/', '_')}.png`;
    await page.screenshot({ path: `${outDir}/${name}`, fullPage: true });
  });
}
