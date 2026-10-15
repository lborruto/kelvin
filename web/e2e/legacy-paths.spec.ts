import { expect, test } from '@playwright/test';

// Old French URLs keep working (Plan 7, spec §4). Every French path here is the point of the test.

test('a bookmarked French page lands on its English page with its anchor', async ({ page }) => {
  await page.goto('/maison#tarif'); // legacy-path-test
  await expect(page).toHaveURL(/\/home#tariff$/);
  await expect(page.locator('#tariff h2')).toBeInViewport();
  await page.goto('/pieces/p-salon?x=1'); // legacy-path-test
  await expect(page).toHaveURL(/\/rooms\/p-salon\?x=1$/);
  await expect(page.getByRole('heading', { name: 'Salon' }).first()).toBeVisible();
  // replaceState: going back does not return to the French URL.
  await page.goBack();
  await expect(page).toHaveURL(/\/home#tariff$/);
  await page.goto('/energie#qualite'); // legacy-path-test
  await expect(page).toHaveURL(/\/energy#quality$/);
  await expect(page.locator('#quality [aria-expanded]')).toHaveAttribute('aria-expanded', 'true');
});

test('a stale next= after login goes to the English page', async ({ browser }) => {
  // locale: Playwright's Chromium is en-US; Kelvin's French copy needs a French browser once Task 16 detects it.
  const page = await (await browser.newContext({ storageState: { cookies: [], origins: [] }, locale: 'fr-FR' })).newPage();
  await page.goto('/login?next=%2Fmaison%23tarif'); // legacy-path-test
  await page.getByLabel('Email').fill('demo@kelvin.local');
  await page.getByLabel('Mot de passe').fill('kelvin');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL(/\/home#tariff$/);
});

test('offline, the installed app still redirects a French path', async ({ page, context, isMobile }) => {
  test.skip(isMobile, 'service worker check runs once');
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await context.setOffline(true);
  await page.goto('/energie'); // legacy-path-test
  await expect(page).toHaveURL(/\/energy$/);
  await expect(page.getByRole('heading', { name: 'Énergie', level: 1 })).toBeVisible();
  await context.setOffline(false);
});
