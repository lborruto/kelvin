import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

// Plan 14, spec §7.6: on the brands simulator (a fresh Atlantic home, claimed by brands.spec.ts,
// which runs first) weather starts off, like a real install. Off → on → off on that one home.
test.describe.configure({ mode: 'serial' });
test.use({ storageState: 'e2e/.auth/brands.json' });

test('weather off, on, off', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('.cat').first()).toBeVisible();
  await expect(page.getByText('Dehors', { exact: true })).toHaveCount(0); // off: no chip, no empty widget
  await page.goto('/home');
  await expect(page.getByRole('link', { name: /^Météo\b.*Désactivée/ })).toBeVisible();

  await page.goto('/home/weather');
  const box = page.getByRole('combobox', { name: 'Rechercher une commune' });
  await box.fill('Lyo');
  await expect(page.getByRole('option', { name: /Lyon · Rhône · 173/ })).toBeVisible();
  await box.press('ArrowDown');
  await box.press('Enter');
  await expect(page.getByText('Lieu enregistré.')).toBeVisible();
  await expect(page.getByText(/Météo-France AROME HD, 1,5\s?km/)).toBeVisible();
  await expect(page.getByRole('link', { name: /Open-Meteo\.com/ }).first()).toHaveAttribute('href', 'https://open-meteo.com/');

  await page.goto('/');
  const chip = page.getByRole('button', { name: /^Dehors -?\d+,\d\s?°C, détails$/ });
  await expect(chip).toBeVisible({ timeout: 30_000 }); // the forecast job ran on request
  await chip.click();
  await expect(page.getByText('Température extérieure').filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText('publié').filter({ visible: true }).first()).toBeVisible();
  await page.keyboard.press('Escape');

  // The room chart: 7 j, so the lane has published hours whatever the time of day (24 h at 00:15 has one).
  await page.goto('/rooms/p-sejour');
  const more = page.getByRole('button', { name: 'Programme, températures, radiateurs' });
  if (await more.isVisible()) await more.click();
  await page.getByRole('radio', { name: '7\u00a0j' }).click();
  await expect(page.getByRole('dialog').locator('.legend')).toContainText('Dehors', { timeout: 20_000 });
  await expect(page.getByRole('dialog').getByRole('link', { name: /Open-Meteo/ }).first()).toHaveAttribute('href', 'https://open-meteo.com/');
  await page.keyboard.press('Escape');

  await page.goto('/home/weather');
  await page.getByRole('button', { name: 'Supprimer' }).click();
  const sheet = page.getByRole('dialog', { name: /^Supprimer le lieu et l’historique météo\s?\?$/ });
  await expect(sheet.getByRole('button', { name: 'Annuler' })).toBeFocused();
  await sheet.getByRole('button', { name: 'Supprimer' }).click();
  await expect(page.getByRole('combobox', { name: 'Rechercher une commune' })).toBeVisible();
  await page.goto('/');
  await expect(page.locator('.cat').first()).toBeVisible();
  await expect(page.getByText('Dehors', { exact: true })).toHaveCount(0);
});

test('the Énergie CSV keeps its weather columns without a place', async ({ page }) => {
  await page.goto('/energy');
  await page.locator('.export button[aria-haspopup="menu"]').filter({ visible: true }).first().click();
  const item = page.getByRole('menuitem', { name: 'Exporter la période (CSV)' });
  const [dl] = await Promise.all([page.waitForEvent('download'), item.click()]);
  const text = readFileSync((await dl.path())!, 'utf8');
  const [header, ...rows] = text.slice(1, -2).split('\r\n');
  expect(header.endsWith(';dehors_moy_c;dju_base18;meteo_jours')).toBe(true);
  for (const row of rows) expect(row.endsWith(';;;'), row).toBe(true); // empty when weather is off
});
