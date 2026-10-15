import { expect, test } from '@playwright/test';

// One fresh Kelvin (its own KELVIN_DATA) claimed with « Atlantic Cozytouch »: the simulator serves
// the Atlantic house (a setpoint radiator, a pilot-wire heater, a towel dryer, a water heater).
// The tests run in order on that one home.
test.describe.configure({ mode: 'serial' });

test('the first login chooses the server', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel('Serveur').selectOption('atlantic_cozytouch');
  await page.getByLabel('Email').fill('demo@kelvin.local');
  await page.getByLabel('Mot de passe').fill('kelvin');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('heading', { name: 'Pièces' })).toBeVisible();
  await page.context().storageState({ path: 'e2e/.auth/brands.json' });
});

test.describe('on the Atlantic house', () => {
  test.use({ storageState: 'e2e/.auth/brands.json' });

  test('a pilot-wire heater changes level, confirmed by the device', async ({ page }) => {
    await page.goto('/rooms/p-bureau');
    const levels = page.getByRole('radiogroup', { name: 'Allure' });
    await expect(levels.getByRole('radio')).toHaveText(['Confort', 'Éco', 'Hors-gel', 'Arrêt']);
    await expect(page.getByRole('radiogroup', { name: 'Mode de la pièce' })).toHaveCount(0);
    await levels.getByRole('radio', { name: 'Hors-gel' }).click();
    await expect(levels.getByRole('radio', { name: 'Hors-gel' })).toHaveAttribute('aria-checked', 'true');
    await expect(levels).toHaveAttribute('aria-busy', 'false', { timeout: 20_000 });
  });

  test('a pilot-wire room offers Arrêt, and shows no setpoint nor rename pencil', async ({ page }) => {
    await page.goto('/rooms/p-bureau');
    await expect(page.getByRole('button', { name: 'Arrêt' })).toBeVisible();
    await expect(page.getByText('Consigne active')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Renommer' })).toHaveCount(0);
  });

  test('a towel dryer starts drying, and the room has no comfort setting', async ({ page }) => {
    await page.goto('/rooms/p-sdb');
    const dryer = page.getByRole('radiogroup', { name: 'Sèche-serviettes' });
    await dryer.getByRole('radio', { name: 'Séchage' }).click();
    await expect(dryer.getByRole('radio', { name: 'Séchage' })).toHaveAttribute('aria-checked', 'true');
    await expect(dryer).toHaveAttribute('aria-busy', 'false', { timeout: 20_000 });
    await expect(page.getByText('Confort', { exact: true })).toHaveCount(0);
  });

  // Task 17 (Plan 8b merged) adds here: 'the water heater is listed read-only' on /home/devices.

  test('the schedule offers only rooms with an editable programme', async ({ page }) => {
    await page.goto('/schedule');
    await expect(page.getByRole('radio', { name: 'Séjour' })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Bureau' })).toHaveCount(0);
    await expect(page.getByRole('radio', { name: 'Salle de bain' })).toHaveCount(0);
  });

  test('Settings name the server', async ({ page }) => {
    await page.goto('/home');
    await expect(page.getByText('Atlantic Cozytouch')).toBeVisible();
  });

  // Task 17 adds '/home/devices' to this list once Plan 8b's page exists.
  for (const path of ['/rooms/p-bureau', '/rooms/p-sdb', '/login']) {
    test(`no horizontal scroll at 320 px: ${path}`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 700 });
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});
