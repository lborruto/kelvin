import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

/** A command was sent: it shows as pending, then the radiator confirms it.
 * Waiting for "Envoi…" first matters: a previous "Confirmé" lingers a few seconds. */
async function confirmed(page: Page) {
  await expect(page.getByText('Envoi…').first()).toBeVisible();
  await expect(page.getByText('Confirmé').first()).toBeVisible();
}

const roomMode = (page: Page) => page.getByRole('radiogroup', { name: 'Mode de la pièce' });

test('rooms load with temperatures and thermal strips', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Pièces' })).toBeVisible();
  for (const name of ['Chambre 1', 'Salon', 'Chambre 2']) {
    await expect(page.getByRole('button', { name: new RegExp(name) }).first()).toBeVisible();
  }
  await expect(page.locator('svg[aria-label^="Salon"]').first()).toBeVisible();
});

test('a mode change shows pending then confirmed', async ({ page }) => {
  await page.goto('/pieces/p-ch1');
  await roomMode(page).getByRole('radio', { name: 'Manuel' }).click();
  await confirmed(page);
  await expect(roomMode(page).getByRole('radio', { name: 'Manuel' })).toHaveAttribute('aria-checked', 'true');
  await roomMode(page).getByRole('radio', { name: 'Programme' }).click();
  await confirmed(page);
});

test('rapid stepper taps send one setpoint', async ({ page }) => {
  await page.goto('/pieces/p-ch1');
  await roomMode(page).getByRole('radio', { name: 'Manuel' }).click();
  await confirmed(page);
  const output = page.getByRole('group', { name: 'Consigne' }).getByRole('status');
  const before = Number((await output.textContent())!.replace(/[^\d,]/g, '').replace(',', '.'));
  const plus = page.getByRole('button', { name: 'Augmenter Consigne' });
  const requests: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/setpoint')) requests.push(r.url());
  });
  await plus.click();
  await plus.click();
  await plus.click();
  await confirmed(page);
  expect(requests).toHaveLength(1);
  await expect(output).toContainText(String(before + 1.5).replace('.', ','));
  await roomMode(page).getByRole('radio', { name: 'Programme' }).click();
  await confirmed(page);
});

test('programme edit round-trips', async ({ page }) => {
  await page.goto('/programme');
  await page.getByRole('button', { name: 'Chambre 2' }).click();
  await expect(page.getByRole('button', { name: 'Chambre 2' })).toHaveAttribute('aria-pressed', 'true');
  const remove = page.getByRole('button', { name: 'Supprimer la plage 2 du Lundi' });
  await remove.click();
  await expect(page.getByText('Modifications')).toBeVisible();
  await page.getByRole('button', { name: 'Envoyer' }).click();
  await confirmed(page);
  await page.getByRole('button', { name: 'Ajouter une plage le Lundi' }).click();
  await page.getByRole('button', { name: 'Envoyer' }).click();
  await confirmed(page);
});

test('absence can be started and cancelled', async ({ page }) => {
  await page.goto('/maison');
  await page.getByRole('button', { name: 'Activer l’absence' }).click();
  const cancel = page.getByRole('button', { name: /^Annuler Absence/ });
  await expect(cancel).toBeVisible();
  await cancel.click();
  // Default timeout on purpose: the override must leave as soon as its restore settles.
  await expect(cancel).toBeHidden();
});

test('Énergie shows the bill estimate, HC/HP bars and the day curve from the simulator', async ({ page }) => {
  await page.goto('/energie');
  await expect(page.getByRole('heading', { name: 'Énergie', level: 1 })).toBeVisible();
  await expect(page.locator('.hero .big')).toContainText('€');
  await expect(page.locator('.hero .tag')).toHaveText('estimation');
  const chart = page.getByRole('img', { name: 'Consommation de la maison par mois' });
  await expect(chart).toBeVisible();
  const heights = await chart.locator('rect.part').evaluateAll((els) => els.map((e) => Number(e.getAttribute('height'))));
  expect(heights.filter((h) => h > 0).length).toBeGreaterThan(0);
  await expect(page.getByRole('img', { name: /^Consommation par demi-heure le / })).toBeVisible();
  const before = await page.getByRole('heading', { name: /^Courbe du / }).textContent();
  await page.getByRole('button', { name: 'Jour précédent' }).click();
  await expect(page.getByRole('heading', { name: /^Courbe du / })).not.toHaveText(before!);
  const rooms = page.locator('ul.rooms li');
  for (const name of ['Chambre 1', 'Salon', 'Chambre 2']) {
    await expect(rooms.filter({ hasText: name })).toHaveCount(1);
  }
  await page.getByRole('radio', { name: 'Mois' }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('img', { name: 'Consommation de la maison par jour' })).toBeVisible();
});

test('desktop shows the sidebar and the inspector with every radiator', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop layout only');
  await page.goto('/pieces/p-salon');
  await expect(page.getByRole('navigation', { name: 'Navigation principale' }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Salon', level: 2 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Faire clignoter' })).toHaveCount(2);
});

test('"/" opens a default room: inspector on desktop, expanded card on the phone', async ({ page, isMobile }) => {
  await page.goto('/');
  if (isMobile) {
    await expect(page.locator('button[aria-expanded="true"]')).toHaveCount(1);
    await expect(page.getByRole('radiogroup', { name: 'Mode', exact: true })).toBeVisible();
  } else {
    await expect(page.getByRole('heading', { level: 2 })).toBeVisible();
    await expect(page.getByRole('radiogroup', { name: 'Mode de la pièce' })).toBeVisible();
    // Cards never expand on desktop: the inspector holds the controls.
    await expect(page.getByRole('radiogroup', { name: 'Mode', exact: true })).toHaveCount(0);
  }
});

test('backend unreachable at load shows the shell and a banner', async ({ page }) => {
  await page.route('**/api/**', (route) => route.abort());
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Pièces' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Reconnexion à Kelvin…' })).toBeVisible();
});

test('offline after install still opens the app shell', async ({ page, context, isMobile }) => {
  test.skip(isMobile, 'service worker check runs once');
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Pièces' })).toBeVisible();
  // A deep link is served the precached SPA fallback too.
  await page.goto('/programme');
  await expect(page.getByRole('heading', { name: 'Programme', level: 1 })).toBeVisible();
  await context.setOffline(false);
});

test('a deep link registers the service worker at the root', async ({ page, isMobile }) => {
  test.skip(isMobile, 'service worker check runs once');
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/pieces/p-salon');
  const reg = await page.evaluate(async () => {
    const r = await navigator.serviceWorker.ready;
    return { scope: r.scope, script: r.active?.scriptURL };
  });
  expect(new URL(reg.scope).pathname).toBe('/');
  expect(new URL(reg.script!).pathname).toBe('/sw.js');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
  expect(errors.filter((e) => /MIME type/.test(e))).toEqual([]);
});

test('Maison and Énergie never scroll sideways at 390 px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ['/maison', '/energie']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    if (path === '/maison') await expect(page.locator('[aria-label="Historique des prix"]:visible')).toBeVisible();
    else await expect(page.getByRole('heading', { name: 'Par pièce' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});

test('Réglages saves a tariff and shows the simulated Linky', async ({ page }) => {
  await page.goto('/maison');
  const tarif = page.locator('#tarif');
  await tarif.getByLabel('Prix heures creuses (€/kWh)').fill('0,2068');
  await tarif.getByRole('button', { name: 'Enregistrer le tarif' }).click();
  await expect(tarif.getByText('Tarif enregistré.')).toBeVisible();
  // A table on desktop, one two-column list per price on phone: whichever is shown has the price.
  await expect(tarif.locator('[aria-label="Historique des prix"]:visible')).toContainText('0,2068');
  const linky = page.locator('#linky');
  await expect(linky).toContainText('Simulateur');
  await expect(linky).toContainText(/Relié · données jusqu’au \d{1,2}\/\d{1,2}/);
});

test('the manifest has a stable id; theme-color and the version follow the app', async ({ page, request }) => {
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest.id).toBe('/');
  const pkg = JSON.parse(await (await import('node:fs/promises')).readFile('package.json', 'utf8'));
  await page.goto('/maison');
  await expect(page.getByText(`Kelvin ${pkg.version}`)).toBeVisible();
  const themes = page.getByRole('radiogroup', { name: 'Thème' });
  const colours = () =>
    page.locator('meta[name="theme-color"]').evaluateAll((ms) => ms.map((m) => (m as HTMLMetaElement).content));
  await themes.getByRole('radio', { name: 'Clair' }).click();
  expect(await colours()).toEqual(['#f5f6f8', '#f5f6f8']);
  await themes.getByRole('radio', { name: 'Sombre' }).click();
  expect(await colours()).toEqual(['#0f1115', '#0f1115']);
  await themes.getByRole('radio', { name: 'Système' }).click();
  expect(await colours()).toEqual(['#0f1115', '#f5f6f8']);
});
