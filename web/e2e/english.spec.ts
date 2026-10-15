import { expect, test } from '@playwright/test';

// Choosing the language (Plan 7, Task 16). The French suite stays the default (an fr-FR browser,
// playwright.config.ts); these tests opt into English through the browser or the stored choice.
test.describe.configure({ mode: 'serial' });

const overflow = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

test('an English browser with no stored choice boots in English, <html lang> from the first paint', async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] }, locale: 'en-GB' });
  const page = await context.newPage();
  // The app.html snippet sets <html lang> before the app's own script runs.
  await page.addInitScript(() =>
    document.addEventListener('DOMContentLoaded', () => ((window as unknown as { __lang: string }).__lang = document.documentElement.lang))
  );
  await page.goto('/login');
  expect(await page.evaluate(() => (window as unknown as { __lang: string }).__lang)).toBe('en');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await expect(page).toHaveTitle('Sign in · Kelvin');
  await context.close();
});

test('the login screen switches FR | EN before signing in, at 320 px', async ({ browser }) => {
  // A French browser with no stored choice: the screen starts French, the switch makes it English.
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] }, locale: 'fr-FR' });
  const page = await context.newPage();
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();
  expect(await overflow(page), 'French /login at 320 px').toBeLessThanOrEqual(0);
  await page.getByRole('radio', { name: 'English' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('en');
  expect(await overflow(page), 'English /login at 320 px').toBeLessThanOrEqual(0);
  await page.getByLabel('Email').fill('demo@kelvin.local');
  await page.getByLabel('Password').fill('wrong');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Wrong Cozytouch email or password.');
  // The choice is remembered on this device.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await context.close();
});

test('Home › Settings: Language switches without a reload and is remembered', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('kv-seeded')) {
      sessionStorage.setItem('kv-seeded', '1');
      localStorage.setItem('kelvin-locale', 'en');
    }
  });
  await page.goto('/home');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  const group = page.getByRole('radiogroup', { name: 'Language' });
  await expect(group.getByRole('radio', { name: 'English' })).toHaveAttribute('aria-checked', 'true');
  const marker = await page.evaluate(() => ((window as unknown as { __kv: number }).__kv = Date.now()));
  await group.getByRole('radio', { name: 'Français' }).click();
  await expect(page.getByRole('heading', { name: 'Réglages' })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __kv: number }).__kv)).toBe(marker); // no reload
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('fr');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Maison', level: 1 })).toBeVisible();
});
