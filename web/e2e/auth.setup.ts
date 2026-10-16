import { expect, test as setup } from '@playwright/test';

export const AUTH_STATE = 'e2e/.auth/state.json';

// The backend starts on a fresh KELVIN_DATA, in setup mode: this first login with the simulator
// account becomes the home's account (spec §3.7), through the real login screen.
setup('log in with the simulator account', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login\?next=%2F$/);
  await page.getByLabel('Email').fill('demo@kelvin.local');
  await page.getByLabel('Mot de passe').fill('kelvin');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('heading', { name: 'Maison', level: 1 })).toBeVisible();
  await page.context().storageState({ path: AUTH_STATE });
});
