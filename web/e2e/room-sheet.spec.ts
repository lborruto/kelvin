import { expect, test, type Page } from '@playwright/test';
import { settled } from './cls';

// The room sheet over any page (option B, 2026-10-21): the sidebar's « Pièces » rows open a room's sheet over the
// page the user is on (`?sheet=<id>`), never a trip to Maison; closing it (×, Esc, the backdrop, Back) leaves the
// page exactly as it was. Maison has no « Pièces » rows (its tiles are the rooms). Phone: unchanged (tiles).
test.describe.configure({ mode: 'serial' });
test.skip(({ isMobile }) => isMobile, 'the sidebar is desktop; the phone opens rooms from Maison’s tiles');

const side = (page: Page) => page.locator('.sidebar');
const row = (page: Page, name: string) => side(page).getByRole('group', { name: 'Pièces' }).getByRole('link', { name: new RegExp(`^${name},`) });

/** Énergie on Semaine, one period back, scrolled down a little: the state a sheet must leave untouched. */
async function energyAway(page: Page) {
  await page.goto('/energy');
  await settled(page);
  await page.getByRole('radio', { name: 'Semaine', exact: true }).click();
  await expect(page.locator('.panels')).toHaveAttribute('aria-busy', 'false');
  const label = page.locator('#period-label');
  const before = (await label.textContent())!;
  await page.getByRole('button', { name: 'Période précédente' }).click();
  await expect(label).not.toHaveText(before);
  await settled(page);
  await page.evaluate(() => scrollTo(0, 240));
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(240);
  return { period: (await label.textContent())! };
}

async function expectEnergyAsLeft(page: Page, period: string) {
  await expect(page).toHaveURL(/\/energy$/);
  await expect(page.getByRole('heading', { name: 'Énergie', level: 1 })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Semaine', exact: true })).toBeChecked();
  await expect(page.locator('#period-label')).toHaveText(period);
  expect(await page.evaluate(() => scrollY)).toBe(240);
}

test('from Énergie, a sidebar room opens its sheet over the page; a setpoint changes; Esc leaves Énergie as it was, focus on the row', async ({ page }) => {
  const { period } = await energyAway(page);
  const salon = row(page, 'Salon');
  await salon.focus();
  await page.keyboard.press('Enter');
  const sheet = page.getByRole('dialog', { name: 'Salon' });
  await expect(sheet).toBeVisible();
  await expect(page).toHaveURL(/\/energy\?sheet=p-salon$/);
  // Énergie stays under it, mounted; its link stays current, the room's row is current too.
  await expect(page.getByRole('heading', { name: 'Énergie', level: 1 })).toBeAttached();
  await expect(side(page).getByRole('link', { name: 'Énergie' })).toHaveAttribute('aria-current', 'page');
  await expect(salon).toHaveAttribute('aria-current', 'true');
  await expect(side(page).getByRole('link', { name: 'Maison' })).not.toHaveAttribute('aria-current');
  // The sheet's own data, without Maison mounted: the chart and the radiators.
  await expect(page.getByRole('heading', { name: 'Maison', level: 1 })).toHaveCount(0);
  await expect(sheet.locator('.rad button.row').first()).toBeVisible();
  // A setpoint changed in the sheet (simulator), then put back.
  const stepper = sheet.getByRole('group', { name: /^Consigne / });
  await expect(stepper).toBeVisible({ timeout: 20_000 });
  const output = stepper.getByRole('status');
  const value = async () => Number((await output.textContent())!.replace(/[^\d,]/g, '').replace(',', '.'));
  const before = await value();
  await stepper.getByRole('button', { name: /^Augmenter / }).click();
  await expect(sheet.getByText('Confirmé').first()).toBeVisible({ timeout: 20_000 });
  await expect(output).toContainText(String(before + 0.5).replace('.', ','));
  await stepper.getByRole('button', { name: /^Diminuer / }).click();
  await expect(output).toContainText(String(before).replace('.', ','), { timeout: 20_000 });
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expectEnergyAsLeft(page, period);
  await expect(salon).toBeFocused();
  await expect(salon).not.toHaveAttribute('aria-current');
});

test('Back closes the sheet and keeps Énergie as it was; × does too; one sheet at a time', async ({ page }) => {
  const { period } = await energyAway(page);
  await row(page, 'Chambre 1').click();
  const sheet = page.getByRole('dialog', { name: 'Chambre 1' });
  await expect(sheet).toBeVisible();
  await expect(page).toHaveURL(/\/energy\?sheet=p-ch1$/);
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await page.goBack();
  await expect(sheet).toBeHidden();
  await expectEnergyAsLeft(page, period);
  // Forward opens it again; × closes it with one step back (Back now leaves Énergie, not the sheet).
  await page.goForward();
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: 'Fermer' }).click();
  await expect(sheet).toBeHidden();
  await expectEnergyAsLeft(page, period);
  await expect(row(page, 'Chambre 1')).toBeFocused();
});

test('a reload (or a shared link) with the parameter opens the sheet again over its page; closing keeps the page', async ({ page }) => {
  await page.goto('/schedule');
  await settled(page);
  await row(page, 'Salon').click();
  await expect(page).toHaveURL(/\/schedule\?sheet=p-salon$/);
  await page.reload();
  const sheet = page.getByRole('dialog', { name: 'Salon' });
  await expect(sheet).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Programme', level: 1 })).toBeAttached();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(/\/schedule$/);
  await expect(page.getByRole('heading', { name: 'Programme', level: 1 })).toBeVisible();
  // A link to a sheet over Réglages opens there too.
  await page.goto('/home?sheet=p-ch1');
  await expect(page.getByRole('dialog', { name: 'Chambre 1' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Réglages', level: 1 })).toBeAttached();
});

test('Maison has no « Pièces » rows; its tiles open the same sheet; the older `/rooms/<id>` lands on it', async ({ page }) => {
  await page.goto('/');
  await settled(page);
  await expect(side(page).getByRole('group', { name: 'Pièces' })).toHaveCount(0);
  await expect(side(page).getByRole('link', { name: 'Maison' })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('main').getByRole('link', { name: /^Salon,/ }).click();
  await expect(page).toHaveURL(/\/\?sheet=p-salon$/);
  await expect(page.getByRole('dialog', { name: 'Salon' })).toBeVisible();
  await expect(side(page).getByRole('link', { name: 'Maison' })).toHaveAttribute('aria-current', 'page');
  await page.goto('/rooms/p-ch1');
  await expect(page).toHaveURL(/\/\?sheet=p-ch1$/);
  await expect(page.getByRole('dialog', { name: 'Chambre 1' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Maison', level: 1 })).toBeAttached();
});
