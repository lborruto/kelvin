import { expect, test } from '@playwright/test';

// Plan 15 « Météo et coût » on the simulator (the Sauter demo house seeds its weather place; the backend couples the
// fake Linky and the rooms to the fake outdoor). Assertions say « value or reason » where the date decides (summer).
// « Weather off shows nothing » runs on the brands home, which has no place (weather.spec.ts).
test.describe('Météo et coût', () => {
  test('Énergie shows the panel with figures or its reason', async ({ page }) => {
    await page.goto('/energy#weather-cost');
    const panel = page.locator('#weather-cost');
    await expect(panel.getByRole('heading', { name: 'Météo et coût' })).toBeVisible();
    await expect(panel.getByRole('list', { name: 'Prévision des 7 prochains jours' }).getByRole('listitem')).toHaveCount(7);
    const figures = panel.getByText(/kWh\/jour/);
    const reason = panel.getByText(/pas encore assez|pas assez de jours|ne suit pas/);
    await expect(figures.first().or(reason.first())).toBeVisible();
  });

  test('the scatter reads a day with the keyboard', async ({ page }) => {
    await page.goto('/energy#weather-cost');
    const chart = page.getByRole('group', { name: 'Consommation selon la température extérieure' });
    await chart.getByRole('button', { name: 'Lire le graphique jour par jour' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(chart.locator('[aria-live="polite"]')).toContainText('Dehors');
  });

  test('Maison says tomorrow', async ({ page }) => {
    await page.goto('/');
    const tomorrow = page.getByRole('region', { name: 'Demain' });
    await expect(tomorrow.getByRole('button', { name: /de chauffage, détails$|pas de chauffage prévu, détails$|^—, détails$/ }).first()).toBeVisible();
  });

  test('the room sheet has its cold row', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /Salon/ }).first().click();
    // On a phone the figures sit behind « Programme, températures, radiateurs » (as in weather.spec.ts).
    const more = page.getByRole('button', { name: 'Programme, températures, radiateurs' });
    const cold = page.getByText('Froid', { exact: true });
    await expect(more.or(cold).first()).toBeVisible();
    if ((await more.count()) && (await more.getAttribute('aria-expanded')) === 'false') await more.click();
    await expect(cold).toBeVisible();
  });

  test('the meteo CSV downloads', async ({ page }) => {
    await page.goto('/energy');
    await page.getByRole('button', { name: /Exporter|⋯/ }).first().click();
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: /météo et consommation/ }).click()]);
    expect(dl.suggestedFilename()).toMatch(/^meteo_\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.csv$/);
  });
});
