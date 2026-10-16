import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// Choosing the language (Plan 7, Task 16). The French suite stays the default (an fr-FR browser,
// playwright.config.ts); these tests opt into English through the browser or the stored choice.
test.describe.configure({ mode: 'serial' });

const overflow = (page: Page) =>
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
  await expect(page.getByRole('alert')).toHaveText('Cozytouch didn’t accept this email or password.');
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
  await expect(page.getByRole('heading', { name: 'Display' })).toBeVisible();
  const group = page.getByRole('radiogroup', { name: 'Language' });
  await expect(group.getByRole('radio', { name: 'English' })).toHaveAttribute('aria-checked', 'true');
  const marker = await page.evaluate(() => ((window as unknown as { __kv: number }).__kv = Date.now()));
  await group.getByRole('radio', { name: 'Français' }).click();
  await expect(page.getByRole('heading', { name: 'Affichage' })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __kv: number }).__kv)).toBe(marker); // no reload
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('fr');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Réglages', level: 1 })).toBeVisible();
});

// The key flows in English (Plan 7, Task 18), from a stored choice on every navigation.
test.describe('key flows in English', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('kelvin-locale', 'en'));
  });

  /** Waiting for "Sending…" first matters: a previous "Confirmed" lingers a few seconds. */
  async function confirmed(page: Page) {
    await expect(page.getByText('Sending…').first()).toBeVisible();
    await expect(page.getByText('Confirmed').first()).toBeVisible();
  }

  test('<html lang> is English, and the Home page reads in English', async ({ page, isMobile }) => {
    await page.goto('/');
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('en');
    await expect(page.getByRole('heading', { name: 'Home', level: 1 })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Summary' })).toContainText('Climate');
    // Phone: the rooms' summary line; desktop: the offline rooms' column.
    if (isMobile) await expect(page.getByText(/^(none|\d+) heating · 1 offline$/)).toBeVisible();
    else await expect(page.getByRole('heading', { name: 'Offline · 1' })).toBeVisible();
    await expect(page).toHaveTitle('Home · Kelvin');
  });

  test('a mode change shows Sending… then Confirmed', async ({ page }) => {
    await page.goto('/rooms/p-ch1');
    const mode = page.getByRole('radiogroup', { name: 'Room mode' });
    await mode.getByRole('radio', { name: 'Manual' }).click();
    await confirmed(page);
    await mode.getByRole('radio', { name: 'Schedule' }).click();
    await confirmed(page);
  });

  test('Energy: the euro before the figure, English chart labels', async ({ page }) => {
    await page.goto('/energy');
    await expect(page.getByRole('heading', { name: 'Energy', level: 1 })).toBeVisible();
    await expect(page.locator('.hero .big')).toHaveText(/^€[\d,]+(\.\d{2})?/);
    await expect(page.locator('.hero .tag')).toHaveText('est.');
    await expect(page.getByRole('button', { name: /^€[\d,.]+, estimate, details$/ })).toBeVisible();
    // Month (the default view) draws day bars.
    await expect(page.getByRole('img', { name: 'Home consumption by day' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /^Load curve, / })).toBeVisible();
  });

  test('Energy: the CSV follows the UI language, its headers stay French (Decision 30)', async ({ page }) => {
    await page.goto('/energy');
    await expect(page.getByRole('heading', { name: 'Energy', level: 1 })).toBeVisible();
    // The previous month is complete in the simulator at any hour.
    const label = page.locator('#period-label');
    const month = (await label.textContent())!;
    await page.getByRole('button', { name: 'Previous period' }).click();
    await expect(label).not.toHaveText(month);
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      (async () => {
        await page.locator('.export button[aria-haspopup="menu"]').filter({ visible: true }).first().click();
        await page.getByRole('menuitem', { name: 'Export the period (CSV)' }).click();
      })()
    ]);
    expect(dl.suggestedFilename()).toMatch(/^energie_\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}_day\.csv$/);
    const rows = readFileSync((await dl.path())!, 'utf8').slice(1).split('\r\n');
    expect(rows[0]).toBe(
      'periode,debut,fin,maison_kwh,hc_kwh,hp_kwh,split_estime,radiateurs_kwh,radiateurs_interp,reste_kwh,energie_eur,abonnement_eur,total_eur,prix,jours_manquants,radiateurs_jusqu_au,radiateurs_couverture'
    );
    for (const r of rows.filter(Boolean)) expect(r.split(',')).toHaveLength(17); // no text cell of this file holds a comma
    const total = rows.find((r) => r.startsWith('total,'))!;
    expect(total.split(',')[3]).toMatch(/^\d+\.\d{3}$/); // maison_kwh: a decimal point, 3 decimals
  });

  test('Schedule: the week, one day editor, copy and the offline room read in English', async ({ page }) => {
    await page.goto('/schedule');
    await expect(page.getByRole('heading', { name: 'Schedule', level: 1 })).toBeVisible();
    await expect(page.getByText('Outside comfort periods, the room is on eco.')).toBeVisible();
    await expect(page.getByText(/^Now: (Comfort|Eco)/)).toBeVisible();
    await page.getByRole('radio', { name: 'Chambre 2 offline' }).click();
    await expect(page.getByText('Chambre 2 is offline')).toBeVisible();
    await page.getByRole('radio', { name: 'Salon' }).click();
    await page.getByRole('button', { name: 'How to edit' }).click();
    await expect(page.getByText(/drag it to move it/)).toBeVisible();
    await page.getByRole('button', { name: /^Monday,/ }).click();
    await expect(page.getByRole('heading', { name: /^Monday/ })).toBeVisible();
    await page.getByRole('button', { name: 'Copy to…' }).click();
    const sheet = page.getByRole('dialog', { name: 'Copy Monday to…' });
    await sheet.getByRole('button', { name: 'Weekdays' }).click();
    await expect(sheet.getByRole('button', { name: 'Copy to 4 days' })).toBeVisible();
    await expect(sheet.getByText('Nothing is sent until you press Send.')).toBeVisible();
    await sheet.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('button', { name: 'Copy to…' })).toBeFocused();
  });

  test('a French bookmark lands on the English page, in English', async ({ page }) => {
    await page.goto('/maison#tarif'); // legacy-path-test
    await expect(page).toHaveURL(/\/home\/tariff$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tariff');
  });
});
