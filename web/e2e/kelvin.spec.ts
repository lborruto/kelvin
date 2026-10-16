import { expect, test, type Page } from '@playwright/test';
import { dayShortFr, offlineSince, pinSameDay } from './offline';

test.describe.configure({ mode: 'serial' });

/** A command was sent: it shows as pending, then the radiator confirms it.
 * Waiting for "Envoi…" first matters: a previous "Confirmé" lingers a few seconds. */
async function confirmed(page: Page) {
  await expect(page.getByText('Envoi…').first()).toBeVisible();
  await expect(page.getByText('Confirmé').first()).toBeVisible();
}

const roomMode = (page: Page) => page.getByRole('radiogroup', { name: 'Mode de la pièce' });

test('Maison loads its rooms with their readings and today’s programme', async ({ page, isMobile }) => {
  const sinceText = await pinSameDay(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Maison', level: 1 })).toBeVisible();
  // Every tile is a link to its room (the room sheet over the tableau).
  for (const name of ['Chambre 1', 'Salon', 'Chambre 2']) {
    await expect(page.getByRole('main').getByRole('link', { name: new RegExp(`^${name},`) })).toBeVisible();
  }
  await expect(page.getByRole('img', { name: /^Salon\s: confort/ })).toBeVisible();
  // « Chambre 2 » is offline in the simulator: last, calm, with no figure (desktop: under its column label).
  if (!isMobile) await expect(page.getByRole('heading', { name: 'Hors ligne · 1' })).toBeVisible();
  const offline = page.locator('article.rt.offline');
  await expect(offline).toHaveCount(1);
  await expect(offline).toContainText(sinceText);
  await expect(offline).not.toContainText('°');
  expect(await page.locator('article.rt .n').allTextContents()).toEqual(['Chambre 1', 'Salon', 'Chambre 2']);
});
test('an outage that began another day says its date (« depuis le 15 oct. »)', async ({ page }) => {
  const since = await offlineSince(page);
  await page.clock.setFixedTime(since + 24 * 3_600_000); // the next day, whatever the hour
  await page.goto('/');
  await expect(page.locator('article.rt.offline')).toContainText(`Hors ligne depuis le ${dayShortFr(since)}`);
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
  // The large −/+ of the room sheet changes the setpoint in force: in Manuel, the manual setpoint.
  const output = page.getByRole('group', { name: 'Consigne Manuel' }).getByRole('status');
  const before = Number((await output.textContent())!.replace(/[^\d,]/g, '').replace(',', '.'));
  const plus = page.getByRole('button', { name: 'Augmenter Consigne Manuel' });
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
  await expect(page.getByText(/^Puis retour au programme (demain )?vers \d\d:\d\d\.$/)).toBeVisible();
  await page.getByRole('button', { name: 'Lancer' }).click();
  const status = page.getByRole('dialog', { name: 'Salon' }).locator('.st');
  await expect(status).toContainText(/Chauffe temporaire · \d+,\d\s°C jusqu’à/, { timeout: 20_000 });
  // The tile behind the sheet says it too, in heat.
  await expect(page.locator('article.rt', { hasText: 'Salon' }).locator('.lead.warm').first()).toContainText(/Chauffe temp/);
  await page.getByRole('dialog', { name: 'Salon' }).getByRole('button', { name: 'Arrêter', exact: true }).click();
  await expect(status).not.toContainText('Chauffe temporaire', { timeout: 20_000 });
});

/** Réglages › Tarif shows the tariff in force; « Nouveau prix… » opens the editor (no tariff yet: the editor is the page). */
async function openTariffEditor(page: import('@playwright/test').Page) {
  const fresh = page.getByRole('button', { name: 'Nouveau prix…' });
  await expect(fresh.or(page.getByRole('button', { name: 'Enregistrer le tarif' }))).toBeVisible();
  if (await fresh.isVisible()) await fresh.click();
}

test('absence can be started from Maison and ended from its « Absence » row on Maison', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^(Partir…|Absence…)$/ }).filter({ visible: true }).first().click();
  const sheet = page.getByRole('dialog', { name: 'Partir en absence' });
  await expect(sheet.getByText(/^Les \d+ pièces passeront à 12,0\s°C jusqu’à/)).toBeVisible();
  await sheet.getByRole('button', { name: 'Partir' }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByText(/^Absence jusqu’à .*\.$/).first()).toBeVisible(); // the toast
  const end = page.getByRole('button', { name: 'Terminer l’absence' });
  await expect(end).toBeVisible({ timeout: 20_000 });
  await end.click();
  // Default timeout on purpose: the override must leave as soon as its restore settles.
  await expect(end).toBeHidden();
});

test('absence from Maison in two taps (desktop sidebar, phone header), ended from the sheet', async ({ page, isMobile }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Maison', level: 1 })).toBeVisible();
  const opener = isMobile ? page.locator('.phone-actions').getByRole('button', { name: 'Absence…' }) : page.locator('.sidebar').getByRole('button', { name: 'Partir…' });
  await opener.click();
  const sheet = page.getByRole('dialog', { name: 'Partir en absence' });
  await expect(sheet.getByRole('button', { pressed: true })).toBeFocused();
  await sheet.getByRole('button', { name: 'Partir' }).click();
  await expect(sheet).toBeHidden();
  // The opener now says the absence and opens it in its active state.
  const active = isMobile ? page.locator('.phone-actions').getByRole('button', { name: /^Absence · / }) : page.locator('.sidebar').getByRole('button', { name: /^Absence · / });
  await expect(active).toBeVisible({ timeout: 20_000 });
  await active.click();
  const running = page.getByRole('dialog', { name: 'Absence en cours' });
  await running.getByRole('button', { name: 'Terminer maintenant' }).click();
  await expect(running).toBeHidden();
  await expect(opener).toBeVisible({ timeout: 20_000 });
});

test('desktop shows the sidebar and the room sheet with every radiator', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop layout only');
  await page.goto('/rooms/p-salon');
  await expect(page.getByRole('navigation', { name: 'Navigation principale' }).first()).toBeAttached();
  await expect(page.getByRole('dialog', { name: 'Salon' })).toBeVisible();
  // Each radiator is a disclosure row: name, power and reachability, its reading; its controls one tap away.
  const rows = page.locator('.rad button.row');
  await expect(rows).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Faire clignoter' })).toHaveCount(0);
  for (const row of await rows.all()) await row.click();
  await expect(page.getByRole('button', { name: 'Faire clignoter' })).toHaveCount(2);
});

test('a room tile opens its sheet over the tableau; Esc closes it back to « / » and gives focus back to the tile', async ({ page }) => {
  await page.goto('/');
  const tile = page.getByRole('main').getByRole('link', { name: /^Salon,/ });
  await tile.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/rooms\/p-salon$/);
  const sheet = page.getByRole('dialog', { name: 'Salon' });
  await expect(sheet).toBeVisible();
  // The tableau stays behind it.
  await expect(page.getByRole('heading', { name: 'Maison', level: 1 })).toBeAttached();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(/\/$/);
  await expect(tile).toBeFocused();
});

test('a deep link to a room opens its sheet over Maison; × closes it; another tab focuses its title', async ({ page }) => {
  await page.goto('/rooms/p-salon');
  const sheet = page.getByRole('dialog', { name: 'Salon' });
  await expect(sheet).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Maison', level: 1 })).toBeAttached();
  await sheet.getByRole('button', { name: 'Fermer' }).click();
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Maison', level: 1 })).toBeVisible();
  await page.getByRole('navigation', { name: 'Navigation principale' }).filter({ visible: true }).getByRole('link', { name: 'Programme' }).click();
  await expect(page.getByRole('heading', { name: 'Programme', level: 1 })).toBeFocused();
});

test('the toast live regions are rendered (not display: none) before any toast', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Maison', level: 1 })).toBeVisible();
  const displays = await page
    .locator('.toasts [aria-live]')
    .evaluateAll((els) => els.map((e) => getComputedStyle(e).display));
  expect(displays).toHaveLength(2);
  expect(displays).not.toContain('none');
});

test('"/" opens no room: a tap on a tile opens its sheet with the modes; −/+ act on the tile directly', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('article.rt')).toHaveCount(3);
  await expect(page.locator('article.rt [aria-expanded]')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // A room that answers has its −/+ on the tile, named by the room and the level in force (Chambre 1: the
  // boost test leaves Salon restoring for a while, without a stepper).
  await expect(page.getByRole('main').getByRole('group', { name: /^Chambre 1 · (Confort|Éco|Manuel)$/ })).toBeVisible();
  await page.getByRole('main').getByRole('link', { name: /^Salon,/ }).click();
  await expect(page).toHaveURL(/\/rooms\/p-salon$/);
  await expect(page.getByRole('dialog', { name: 'Salon' }).getByRole('radiogroup', { name: 'Mode de la pièce' })).toBeVisible();
});

test('backend unreachable at load shows the shell and a banner', async ({ page }) => {
  await page.route('**/api/**', (route) => route.abort());
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Maison', level: 1 })).toBeVisible();
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
  await expect(page.getByRole('heading', { name: 'Maison', level: 1 })).toBeVisible();
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

test('the old Maison anchors land on their sub-page (#linky, #tariff, #sessions) or open the sheet (#away)', async ({ page }) => {
  for (const [id, path, title] of [
    ['linky', '/home/linky', 'Linky'],
    ['tariff', '/home/tariff', 'Tarif'],
    ['sessions', '/home/account#sessions', 'Compte']
  ]) {
    await page.goto(`/home#${id}`);
    await expect(page).toHaveURL(new RegExp(`${path.replace('#', '\\#')}$`));
    await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  }
  await page.goto('/home#away');
  await expect(page.getByRole('dialog', { name: 'Partir en absence' })).toBeVisible();
  await expect(page).toHaveURL(/\/home$/);
});

test('Tarif saves a tariff and Linky shows the simulated Linky', async ({ page }) => {
  await page.goto('/home/tariff');
  const tarif = page.locator('main');
  await openTariffEditor(page);
  await tarif.getByLabel('Prix heures creuses (€/kWh)').fill('0,2068');
  await tarif.getByRole('button', { name: 'Enregistrer le tarif' }).click();
  await expect(tarif.getByText('Tarif enregistré.')).toBeVisible();
  // The summary reads it; the history is one disclosure away (a table on desktop, a list on phone).
  await expect(tarif.getByText(/^0,2068\s€\/kWh$/)).toBeVisible();
  await tarif.getByRole('button', { name: /^Historique des prix/ }).click();
  await expect(tarif.locator('[aria-label="Historique des prix"]:visible')).toContainText('0,2068');
  await page.goto('/home/linky');
  const linky = page.locator('main');
  await expect(linky).toContainText('Simulateur');
  await expect(linky).toContainText(/Relié · données jusqu’au \d{1,2}\/\d{1,2}/);
});

test('Linky: the PDL is masked until « Afficher », the form one disclosure away', async ({ page }) => {
  await page.goto('/home/linky');
  const pdl = page.getByText(/^•••• •••• ••\d\d \d\d$/);
  await expect(pdl).toBeVisible();
  expect(await page.content()).not.toMatch(/\b\d{14}\b/);
  await page.getByRole('button', { name: 'Afficher le PDL' }).click();
  await expect(page.getByText(/^\d{14}$/)).toBeVisible();
  await page.getByRole('button', { name: 'Modifier la connexion' }).click();
  await expect(page.getByRole('button', { name: 'Enregistrer et tester' })).toBeVisible();
});

test('the manifest has a stable id; theme-color and the version follow the app', async ({ page, request }) => {
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest.id).toBe('/');
  expect(manifest.theme_color.toLowerCase()).toBe('#050506');
  const pkg = JSON.parse(await (await import('node:fs/promises')).readFile('package.json', 'utf8'));
  await page.goto('/home');
  await expect(page.getByText(`Kelvin ${pkg.version}`)).toBeVisible();
  // One dark theme (Tableau): no theme choice, one browser-chrome colour, the ground.
  await expect(page.getByRole('radiogroup', { name: 'Thème' })).toHaveCount(0);
  const colours = await page.locator('meta[name="theme-color"]').evaluateAll((ms) => ms.map((m) => (m as HTMLMetaElement).content));
  expect(colours).toEqual(['#050506']);
});

test('from a scrolled Maison, today’s programme link lands at the top of Programme (only room links keep the scroll)', async ({ page }) => {
  await page.goto('/');
  const link = page.getByRole('region', { name: 'Programme d’aujourd’hui' }).getByRole('link', { name: 'Programme' });
  await link.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 400));
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await link.click();
  await expect(page.getByRole('heading', { name: 'Programme', level: 1 })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});
