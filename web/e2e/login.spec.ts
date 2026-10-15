import { expect, test } from '@playwright/test';

// Its own browser session: logging out here must not end the session the other specs share.
test.use({ storageState: { cookies: [], origins: [] } });

test('a deep link asks for the login, then comes back; logout returns to the login', async ({ page }) => {
  await page.goto('/schedule');
  await expect(page).toHaveURL(/\/login\?next=%2Fschedule$/);
  await expect(page.getByText('Simulateur : demo@kelvin.local · kelvin')).toBeVisible();
  await page.getByLabel('Email').fill('demo@kelvin.local');
  await page.getByLabel('Mot de passe').fill('pas-le-bon');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('alert')).toHaveText('Email ou mot de passe Cozytouch incorrect.');
  await page.getByLabel('Mot de passe').fill('kelvin');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL(/\/schedule$/);
  await expect(page.getByRole('heading', { name: 'Programme', level: 1 })).toBeVisible();
  await page.goto('/home/account');
  await expect(page.getByText('demo@kelvin.local')).toBeVisible();
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/energy');
  await expect(page).toHaveURL(/\/login\?next=%2Fenergy$/);
});
