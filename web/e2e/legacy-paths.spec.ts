import { expect, test, type Page } from '@playwright/test';

// Old French URLs keep working (Plan 7, spec §4). Every French path here is the point of the test.

async function signIn(page: Page) {
  await page.getByLabel('Email').fill('demo@kelvin.local');
  await page.getByLabel('Mot de passe').fill('kelvin');
  await page.getByRole('button', { name: 'Se connecter' }).click();
}

test('a bookmarked French page lands on its English page with its anchor', async ({ page }) => {
  await page.goto('/maison#tarif'); // legacy-path-test
  // Two steps: the French path (app.html), then Maison's old anchor to its sub-page (UX batch 8).
  await expect(page).toHaveURL(/\/home\/tariff$/);
  await expect(page.getByRole('heading', { name: 'Tarif', level: 1 })).toBeInViewport();
  await page.goto('/pieces/p-salon?x=1'); // legacy-path-test
  await expect(page).toHaveURL(/\/\?sheet=p-salon&x=1$/);
  await expect(page.getByRole('heading', { name: 'Salon' }).first()).toBeVisible();
  // replaceState: going back does not return to the French URL.
  await page.goBack();
  await expect(page).toHaveURL(/\/home\/tariff$/);
  await page.goto('/energie#qualite'); // legacy-path-test
  await expect(page).toHaveURL(/\/energy#quality$/);
  await expect(page.locator('#quality [aria-expanded]')).toHaveAttribute('aria-expanded', 'true');
});

test('a stale next= after login goes to the English page', async ({ browser }) => {
  // locale: Playwright's Chromium is en-US; Kelvin's French copy needs a French browser once Task 16 detects it.
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] }, locale: 'fr-FR' });
  try {
    const page = await context.newPage();
    await page.goto('/login?next=%2Fmaison%23tarif'); // legacy-path-test
    await signIn(page);
    await expect(page).toHaveURL(/\/home\/tariff$/);
  } finally {
    await context.close();
  }
});

test('logged out, a French deep link keeps its anchor through the login', async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] }, locale: 'fr-FR' });
  try {
    const page = await context.newPage();
    await page.goto('/maison#tarif'); // legacy-path-test
    await expect(page).toHaveURL(/\/login\?next=%2Fhome%23tariff$/);
    await signIn(page);
    await expect(page).toHaveURL(/\/home\/tariff$/);
    await expect(page.getByRole('heading', { name: 'Tarif', level: 1 })).toBeInViewport();
  } finally {
    await context.close();
  }
});

test('Maison’s old anchors reach their new place; #away opens the Absence sheet over the Maison tableau', async ({ page }) => {
  await page.goto('/maison#absence'); // legacy-path-test
  await expect(page.getByRole('dialog', { name: 'Partir en absence' })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Maison', level: 1, includeHidden: true })).toBeAttached();
  await page.goto('/home#sessions');
  await expect(page).toHaveURL(/\/home\/account#sessions$/);
  await expect(page.locator('#sessions')).toBeVisible();
  await page.goto('/home#linky');
  await expect(page).toHaveURL(/\/home\/linky$/);
});

test('offline, the installed app still redirects a French path', async ({ page, context, isMobile }) => {
  test.skip(isMobile, 'service worker check runs once');
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await context.setOffline(true);
  try {
    await page.goto('/energie'); // legacy-path-test
    await expect(page).toHaveURL(/\/energy$/);
    await expect(page.getByRole('heading', { name: 'Énergie', level: 1 })).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});
