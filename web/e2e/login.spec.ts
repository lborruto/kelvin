import { expect, test } from '@playwright/test';
import { CLS_WIDTHS, clsWidths, FONT_MODES, measureCls } from './cls';

// Its own browser session: logging out here must not end the session the other specs share.
test.use({ storageState: { cookies: [], origins: [] } });

test('a deep link asks for the login, then comes back; logout returns to the login', async ({ page }) => {
  await page.goto('/schedule');
  await expect(page).toHaveURL(/\/login\?next=%2Fschedule$/);
  await expect(page.getByText('Simulateur : demo@kelvin.local · kelvin')).toBeVisible();
  await page.getByLabel('Email').fill('demo@kelvin.local');
  await page.getByLabel('Mot de passe', { exact: true }).fill('pas-le-bon');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('alert')).toHaveText('Cozytouch refuse cet email ou ce mot de passe.');
  await page.getByLabel('Mot de passe', { exact: true }).fill('kelvin');
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

// Batch 11: the claimed home (the suite's setup claimed it with Sauter): one server line, no choice.
test.describe('the login screen of a claimed home', () => {
  test('names the server without a choice, and says how it changes', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByText(/^Serveur\s*: Sauter Cozytouch$/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Changer' })).toHaveCount(0);
    await expect(page.getByRole('combobox')).toHaveCount(0);
    await expect(page.getByText('Pour changer de serveur, repartez d’une installation neuve (voir le README).')).toBeVisible();
    await expect(page.getByText(/^Première connexion/)).toHaveCount(0);
    await expect(page.getByText(/^Mot de passe oublié\s*\? Changez-le dans l’application Cozytouch\.$/)).toBeVisible();
  });

  test('shows the password on demand, keeps the field a password field, and signs in with Enter', async ({ page }) => {
    await page.goto('/login?next=%2Fschedule');
    await expect(page.getByText(/^Serveur\s*:/)).toBeVisible();
    const pw = page.getByLabel('Mot de passe', { exact: true });
    const reveal = page.getByRole('button', { name: 'Afficher le mot de passe' });
    await page.getByLabel('Email').fill('demo@kelvin.local');
    await pw.fill('kelvin');
    await expect(reveal).toHaveAttribute('aria-pressed', 'false');
    await reveal.click();
    await expect(reveal).toHaveAttribute('aria-pressed', 'true');
    await expect(pw).toHaveAttribute('type', 'text');
    await expect(pw).toHaveAttribute('name', 'password');
    await expect(pw).toHaveAttribute('autocomplete', 'current-password');
    await expect(pw).toHaveValue('kelvin');
    // Keyboard order on a claimed home: email → password → reveal → submit → language.
    await page.getByLabel('Email').focus();
    const names: string[] = [];
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Tab');
      names.push(await page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        return el.getAttribute('aria-label') ?? el.getAttribute('name') ?? el.textContent!.trim();
      }));
    }
    expect(names).toEqual(['password', 'Afficher le mot de passe', 'Se connecter', 'Français']);
    await pw.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/schedule$/);
  });
});

test.describe('CLS matrix · /login', () => {
  test.skip(({ isMobile }) => isMobile, 'explicit widths');
  test.use({ serviceWorkers: 'block' });

  for (const fonts of FONT_MODES) {
    test(`/login · fonts ${fonts} · CLS < 0.05 from 320 to 1440 px`, async ({ page }) => {
      test.setTimeout(150_000);
      for (const width of clsWidths(fonts)) {
        await page.setViewportSize({ width, height: 900 });
        const cls = await measureCls(page, '/login', { fonts });
        expect(cls, `/login at ${width} px, fonts ${fonts}`).toBeLessThan(0.05);
      }
    });
  }

  test('/login · the server list 2 s late · CLS < 0.05 from 320 to 1440 px', async ({ page }) => {
    test.setTimeout(150_000);
    for (const width of CLS_WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      const cls = await measureCls(page, '/login', { fonts: 'blocked', slow: { url: '**/api/auth/servers', ms: 2000 } });
      expect(cls, `/login at ${width} px, list 2 s late`).toBeLessThan(0.05);
    }
  });
});
