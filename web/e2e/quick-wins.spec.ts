import { expect, test, type Page } from '@playwright/test';

// Plan 8 flows on the simulator (French, the default suite's locale).
test.describe.configure({ mode: 'serial' });

async function confirmed(page: Page) {
  await expect(page.getByText('Envoi…').first()).toBeVisible();
  await expect(page.getByText('Confirmé').first()).toBeVisible();
}

test('night-light brightness: pending, then confirmed by the radiator', async ({ page }) => {
  await page.goto('/rooms/p-ch1');
  const light = page.getByRole('switch', { name: 'Veilleuse' }).first();
  if ((await light.getAttribute('aria-checked')) !== 'true') {
    await light.click();
    await confirmed(page);
  }
  const slider = page.getByRole('slider', { name: 'Intensité de la veilleuse' }).first();
  // The simulator keeps the last brightness across projects: aim at a value it does not hold yet.
  const pages = (await slider.inputValue()) === '25' ? 2 : 1;
  await slider.focus();
  await slider.press('Home');
  for (let i = 0; i < pages; i++) await slider.press('PageUp');
  await confirmed(page);
  await expect(slider).toHaveAttribute('aria-valuetext', pages === 2 ? /50\s%/ : /25\s%/);
  await light.click(); // leave the simulator as it was
  await confirmed(page);
});

test('schedule: a change made elsewhere is never overwritten silently', async ({ page, browser, isMobile }) => {
  test.skip(isMobile, 'one project is enough: the flow is not layout-dependent');
  const other = await browser.newContext({ storageState: 'e2e/.auth/state.json', locale: 'fr-FR' });
  const elsewhere = await other.newPage();
  for (const p of [page, elsewhere]) {
    await p.goto('/schedule');
    await p.getByRole('radio', { name: 'Chambre 2' }).click();
  }
  // This page edits Monday and does not send yet.
  await page.getByRole('button', { name: 'Ajouter une plage le Lundi' }).click();
  // The other page changes Monday differently and sends it (Monday holds two periods: this page's
  // add makes three, the most a day takes, so the other page removes one).
  await elsewhere.getByRole('button', { name: 'Supprimer la plage 1 du Lundi' }).click();
  await elsewhere.getByRole('button', { name: 'Envoyer' }).click();
  await expect(elsewhere.getByText('Confirmé').first()).toBeVisible();
  // This page learns it through the stream.
  await expect(page.getByText('Programme modifié ailleurs')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Envoyer' })).toHaveAttribute('aria-disabled', 'true');
  await page.getByRole('button', { name: 'Remplacer quand même' }).click();
  await expect(page.getByText('Confirmé').first()).toBeVisible();
  await expect(page.getByText('Programme modifié ailleurs')).toHaveCount(0);
  await other.close();
});

test('schedule: Chambre 1 shows its locked days read-only', async ({ page }) => {
  await page.goto('/schedule');
  await page.getByRole('radio', { name: 'Chambre 1' }).click();
  const sunday = page.getByRole('button', { name: /^Dimanche/, expanded: false });
  if (await sunday.count()) await sunday.click();
  await expect(page.getByText(/Fin à minuit\s:\smodifiez ce jour/)).toBeVisible();
  await expect(page.getByText(/20:00–24:00/).first()).toBeVisible(); // the phone also sums it up in the day's header
  await expect(page.getByRole('button', { name: 'Ajouter une plage le Dimanche' })).toHaveCount(0);
});
