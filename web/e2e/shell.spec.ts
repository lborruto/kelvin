import { expect, test } from '@playwright/test';
import { settled } from './cls';

const overflow = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test('the browser going offline shows a neutral, dated banner within 1 s', async ({ page, context }) => {
  await page.goto('/');
  await settled(page);
  await context.setOffline(true);
  const banner = page.locator('.banner');
  await expect(banner).toContainText(/Hors connexion · données de \d\d:\d\d/, { timeout: 1000 });
  await expect(banner).toHaveClass(/neutral/);
  await expect(banner).not.toHaveClass(/\bbad\b/);
  await context.setOffline(false);
  await expect(banner).not.toContainText('Hors connexion', { timeout: 10_000 });
});

test('an unknown address: the 404 page with the ways out', async ({ page }) => {
  await page.goto('/nowhere');
  await expect(page.getByRole('heading', { level: 1, name: 'Cette page n’existe pas' })).toBeVisible();
  await expect(page.getByText('L’adresse est peut-être ancienne ou incomplète.')).toBeVisible();
  await page.getByRole('link', { name: 'Aller au tableau Maison' }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('data on demand: the room reading opens its Fiche (card on desktop, sheet on phone); Esc gives focus back', async ({ page, isMobile }) => {
  await page.goto('/rooms/p-salon');
  await settled(page);
  const fig = page.getByRole('dialog', { name: 'Salon' }).locator('.head .fig').first();
  await expect(fig).toBeVisible();
  await expect(fig).toHaveAccessibleName(/°C, détails$/);
  if (isMobile) {
    await fig.tap();
    const sheet = page.getByRole('dialog', { name: /^Température/ });
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText('Cozytouch');
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
  } else {
    await fig.focus();
    await page.keyboard.press('Enter');
    const card = page.locator('.fiche');
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('role', 'dialog');
    await expect(card).toContainText('Source');
    await expect(card).toContainText('Nature');
    // The card is beside its figure and inside the viewport.
    const box = (await card.boundingBox())!;
    const vw = page.viewportSize()!.width;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(vw);
    await page.keyboard.press('Escape');
    await expect(card).toHaveCount(0);
    await expect(fig).toBeFocused();
  }
});

test('the sidebar names the Cozytouch freshness and opens its Fiche', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the sidebar is desktop');
  await page.goto('/');
  await settled(page);
  const status = page.locator('.sidebar .status');
  await expect(status).toContainText(/Cozytouch · (il y a|à l’instant)/);
  await status.getByRole('button').click();
  await expect(page.locator('.fiche')).toContainText('Connexion à Cozytouch');
});

test('no sideways scroll at 320 px with a Fiche open', async ({ page, isMobile }) => {
  test.skip(isMobile, 'explicit width');
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/rooms/p-salon');
  await settled(page);
  await page.getByRole('dialog', { name: 'Salon' }).locator('.head .fig').first().click();
  await expect(page.getByRole('dialog', { name: /^Température/ })).toBeVisible();
  expect(await overflow(page)).toBeLessThanOrEqual(0);
});

// Tableau §2: the sidebar (Maison, Programme, Énergie, PIÈCES with readings, Partir…, Réglages) and the tab bar.
test('the Tableau shell: rooms in the sidebar, Partir… opens the Absence sheet; four tabs on a phone', async ({ page, isMobile }) => {
  await page.goto('/');
  await settled(page);
  if (isMobile) {
    const tabs = page.locator('.tabbar').getByRole('link');
    await expect(tabs).toHaveText(['Maison', 'Programme', 'Énergie', 'Réglages']);
    await expect(tabs.first()).toHaveAttribute('aria-current', 'page');
    return;
  }
  const side = page.locator('.sidebar');
  const rooms = side.getByRole('group', { name: 'Pièces' }).getByRole('link');
  await expect(rooms.first()).toHaveAccessibleName(/°C/);
  // Offline rooms come last, without a temperature.
  await expect(rooms.last()).toHaveAccessibleName(/hors ligne$/);
  await rooms.first().click();
  await expect(page).toHaveURL(/\/rooms\//);
  await expect(rooms.first()).toHaveAttribute('aria-current', 'page');
  await expect(side.getByRole('link', { name: 'Maison' })).not.toHaveAttribute('aria-current');
  // The room opens as a sheet over the tableau: close it before using the sidebar.
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/$/);
  await side.getByRole('button', { name: 'Partir…' }).click();
  await expect(page.getByRole('dialog', { name: 'Partir en absence' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(side.getByRole('button', { name: 'Partir…' })).toBeFocused();
  await expect(side.getByRole('link', { name: 'Réglages' })).toHaveAttribute('href', '/home');
});
