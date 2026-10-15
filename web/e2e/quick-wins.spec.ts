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
