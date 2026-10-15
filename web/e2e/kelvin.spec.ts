import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

/** A command was sent: it shows as pending, then the radiator confirms it.
 * Waiting for "Envoi…" first matters: a previous "Confirmé" lingers a few seconds. */
async function confirmed(page: Page) {
  await expect(page.getByText('Envoi…').first()).toBeVisible();
  await expect(page.getByText('Confirmé').first()).toBeVisible();
}

const roomMode = (page: Page) => page.getByRole('radiogroup', { name: 'Mode de la pièce' });

test('rooms load with temperatures and thermal strips', async ({ page, isMobile }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Pièces' })).toBeVisible();
  // Every card is a link to its room (the inspector on desktop, the room page on a phone).
  for (const name of ['Chambre 1', 'Salon', 'Chambre 2']) {
    await expect(page.getByRole('link', { name: new RegExp(`^${name},`) }).first()).toBeVisible();
  }
  await expect(page.locator('svg[aria-label^="Salon"]').first()).toBeVisible();
  // « Chambre 2 » is offline in the simulator: last, under its group label, with no figure and no strip.
  await expect(page.getByRole('heading', { name: 'Hors ligne · 1' })).toBeVisible();
  const offline = page.locator('article.card.off');
  await expect(offline).toHaveCount(1);
  await expect(offline).toContainText(/Hors ligne depuis \d\d:\d\d/);
  await expect(offline).not.toContainText('°C');
  await expect(offline.locator('svg[role="img"]')).toHaveCount(0);
  expect(await page.locator('article.card .name').allTextContents()).toEqual(['Chambre 1', 'Salon', 'Chambre 2']);
  void isMobile;
});

test('a mode change shows pending then confirmed', async ({ page }) => {
  await page.goto('/rooms/p-ch1');
  await roomMode(page).getByRole('radio', { name: 'Manuel' }).click();
  await confirmed(page);
  await expect(roomMode(page).getByRole('radio', { name: 'Manuel' })).toHaveAttribute('aria-checked', 'true');
  await roomMode(page).getByRole('radio', { name: 'Programme' }).click();
  await confirmed(page);
});

test('rapid stepper taps send one setpoint', async ({ page }) => {
  await page.goto('/rooms/p-ch1');
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
  await page.goto('/schedule');
  // « Chambre 2 » is offline in the simulator (read-only here): Salon is edited.
  await page.getByRole('radio', { name: 'Salon' }).click();
  await expect(page.getByRole('radio', { name: 'Salon' })).toHaveAttribute('aria-checked', 'true');
  // A week row opens its day: beside the week on desktop, as its own view on a phone.
  await page.getByRole('button', { name: /^Lundi,/ }).click();
  await expect(page.getByRole('heading', { name: /^Lundi/ })).toBeVisible();
  await page.getByRole('button', { name: 'Supprimer la plage 2 du Lundi' }).click();
  await expect(page.locator('.sendbar')).toContainText('1 jour modifié');
  await page.getByRole('button', { name: 'Envoyer', exact: true }).click();
  await confirmed(page);
  await page.getByRole('button', { name: 'Ajouter une plage le Lundi' }).click();
  await page.getByRole('button', { name: 'Envoyer', exact: true }).click();
  await confirmed(page);
});

test('Chauffe temporaire: a sentence, then the room says it until « Arrêter »', async ({ page, isMobile }) => {
  test.skip(isMobile, 'shared simulator state: one project runs it');
  await page.goto('/rooms/p-salon');
  const disc = page.getByRole('button', { name: /^Chauffe temporaire/ });
  await expect(disc).toHaveAttribute('aria-expanded', 'false');
  await disc.click();
  // Any wall time: a 2 h boost started after 22:00 ends « demain ».
  await expect(page.getByText(/^Puis retour au programme vers (demain )?\d\d:\d\d\.$/)).toBeVisible();
  await page.getByRole('button', { name: 'Lancer' }).click();
  const status = page.locator('.inspector .st');
  await expect(status).toContainText(/Chauffe temporaire · \d+,\d\s°C jusqu’à/, { timeout: 20_000 });
  await expect(page.locator('article.card', { hasText: 'Salon' }).locator('.status')).toContainText('Chauffe temporaire');
  await page.getByRole('button', { name: 'Arrêter' }).click();
  await expect(status).not.toContainText('Chauffe temporaire', { timeout: 20_000 });
});

test('absence can be started and cancelled', async ({ page }) => {
  await page.goto('/home');
  await page.getByRole('button', { name: 'Activer l’absence' }).click();
  const cancel = page.getByRole('button', { name: /^Annuler Absence/ });
  await expect(cancel).toBeVisible();
  await cancel.click();
  // Default timeout on purpose: the override must leave as soon as its restore settles.
  await expect(cancel).toBeHidden();
});

test('desktop shows the sidebar and the inspector with every radiator', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop layout only');
  await page.goto('/rooms/p-salon');
  await expect(page.getByRole('navigation', { name: 'Navigation principale' }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Salon', level: 2 })).toBeVisible();
  // Each radiator is a disclosure row: name, power and reachability, its reading; its controls one tap away.
  const rows = page.locator('.rad button.row');
  await expect(rows).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Faire clignoter' })).toHaveCount(0);
  for (const row of await rows.all()) await row.click();
  await expect(page.getByRole('button', { name: 'Faire clignoter' })).toHaveCount(2);
});

test('desktop: choosing a room card keeps keyboard focus on it and marks it current', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop layout only');
  await page.goto('/');
  const card = page.getByRole('link', { name: /^Salon/ });
  await card.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/rooms\/p-salon$/);
  await expect(page.getByRole('heading', { name: 'Salon', level: 2 })).toBeVisible();
  await expect(card).toHaveAttribute('aria-current', 'page');
  await expect(card).toBeFocused();
});

test('phone room page: the room is the h1, and moving to another tab focuses its title', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phone layout only');
  await page.goto('/rooms/p-salon');
  await expect(page.getByRole('heading', { name: 'Salon', level: 1 })).toBeVisible();
  await page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link', { name: 'Programme' }).click();
  await expect(page.getByRole('heading', { name: 'Programme', level: 1 })).toBeFocused();
});

test('the toast live regions are rendered (not display: none) before any toast', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Pièces' })).toBeVisible();
  const displays = await page
    .locator('.toasts [aria-live]')
    .evaluateAll((els) => els.map((e) => getComputedStyle(e).display));
  expect(displays).toHaveLength(2);
  expect(displays).not.toContain('none');
});

test('"/" opens a default room in the inspector on desktop; a phone taps a card to its room page', async ({ page, isMobile }) => {
  await page.goto('/');
  if (isMobile) {
    // No expansion in place: the card is a link, the room page starts with the controls.
    await expect(page.locator('[aria-expanded]')).toHaveCount(0);
    await page.getByRole('link', { name: /^Salon,/ }).click();
    await expect(page).toHaveURL(/\/rooms\/p-salon$/);
    await expect(page.getByRole('heading', { name: 'Salon', level: 1 })).toBeVisible();
    await expect(page.getByRole('radiogroup', { name: 'Mode de la pièce' })).toBeVisible();
  } else {
    // The default room is one that answers, never the offline one.
    const title = page.locator('.inspector h2.name');
    await expect(title).toBeVisible();
    await expect(title).not.toHaveText('Chambre 2');
    await expect(page.getByRole('radiogroup', { name: 'Mode de la pièce' })).toBeVisible();
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
  await page.goto('/schedule');
  await expect(page.getByRole('heading', { name: 'Programme', level: 1 })).toBeVisible();
  await context.setOffline(false);
});

test('a deep link registers the service worker at the root', async ({ page, isMobile }) => {
  test.skip(isMobile, 'service worker check runs once');
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/rooms/p-salon');
  const reg = await page.evaluate(async () => {
    const r = await navigator.serviceWorker.ready;
    return { scope: r.scope, script: r.active?.scriptURL };
  });
  expect(new URL(reg.scope).pathname).toBe('/');
  expect(new URL(reg.script!).pathname).toBe('/sw.js');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
  expect(errors.filter((e) => /MIME type/.test(e))).toEqual([]);
});

test('/home#linky and #tariff land on their panel once it has loaded', async ({ page }) => {
  for (const id of ['linky', 'tariff']) {
    await page.goto(`/home#${id}`);
    await expect(page.locator(`#${id} h2`)).toBeVisible();
    await expect(page.locator(`#${id}`).getByRole('button').first()).toBeVisible();
    await expect(page.locator(`#${id} h2`)).toBeInViewport();
  }
});

test('Réglages saves a tariff and shows the simulated Linky', async ({ page }) => {
  await page.goto('/home');
  const tarif = page.locator('#tariff');
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
  await page.goto('/home');
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
