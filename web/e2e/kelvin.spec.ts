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
  // Phone: a card expands in place (a button); desktop: it opens the room (a link).
  for (const name of ['Chambre 1', 'Salon', 'Chambre 2']) {
    await expect(page.getByRole(isMobile ? 'button' : 'link', { name: new RegExp(`^${name}`) }).first()).toBeVisible();
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
  await page.getByRole('radio', { name: 'Chambre 2' }).click();
  await expect(page.getByRole('radio', { name: 'Chambre 2' })).toHaveAttribute('aria-checked', 'true');
  // Phone: only one day shows its slots; open Monday if it is not today.
  const monday = page.getByRole('button', { name: /^Lundi/, expanded: false });
  if (await monday.count()) await monday.click();
  const remove = page.getByRole('button', { name: 'Supprimer la plage 2 du Lundi' });
  await remove.click();
  await expect(page.getByText('Modifications')).toBeVisible();
  await page.getByRole('button', { name: 'Envoyer', exact: true }).click();
  await confirmed(page);
  await page.getByRole('button', { name: 'Ajouter une plage le Lundi' }).click();
  await page.getByRole('button', { name: 'Envoyer', exact: true }).click();
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
  await expect(page.locator('#period-label')).toHaveText(/^\p{Lu}\p{Ll}+ \d{4}$/u); // « Octobre 2026 »
  await expect(page.locator('.hero .big')).toContainText('€');
  await expect(page.locator('.hero .tag')).toHaveText('estimation');
  const chart = page.getByRole('img', { name: 'Consommation de la maison par jour' });
  await expect(chart).toBeVisible();
  const heights = await chart.locator('rect.part').evaluateAll((els) => els.map((e) => Number(e.getAttribute('height'))));
  expect(heights.filter((h) => h > 0).length).toBeGreaterThan(0);
  await expect(page.getByRole('img', { name: /^Consommation par demi-heure le / })).toBeVisible();
  const label = (await page.locator('#period-label').textContent())!;
  await page.getByRole('button', { name: 'Période précédente' }).click();
  await expect(page.locator('#period-label')).not.toHaveText(label);
  await page.getByRole('button', { name: 'Dernier jour' }).click();
  await expect(page.locator('#period-label')).toHaveText(label);
  await page.getByRole('radio', { name: 'Mois' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('img', { name: 'Consommation de la maison par mois' })).toBeVisible();
  await expect(page.locator('#period-label')).toHaveText(/^\d{4}$/);
});

// The bar inspector in a browser (spec §3.2.3): a card beside the bar on desktop, a sheet under the chart on a phone.
test('Énergie bar card: hover shows it inside the screen at both edges; a pinned card’s action opens that day’s Courbe', async ({ page, isMobile }) => {
  test.skip(isMobile, 'explicit desktop widths');
  for (const width of [1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/energie');
    const chart = page.getByRole('img', { name: 'Consommation de la maison par jour' });
    await expect(chart).toBeVisible();
    await expect(page.getByRole('img', { name: /^Consommation par demi-heure le / })).toBeVisible();
    const keys = page.locator('.plot.interactive button.key');
    const n = await keys.count();
    expect(n, 'a month of day bars').toBeGreaterThanOrEqual(28);
    const centre = async (i: number) => {
      const b = (await keys.nth(i).boundingBox())!;
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    };
    const card = page.locator('.inspector.card');
    // Both edges: the card stays on screen, beside its bar.
    for (const i of [0, n - 1]) {
      const c = await centre(i);
      await page.mouse.move(c.x, c.y);
      await expect(card).toBeVisible();
      const box = (await card.boundingBox())!;
      expect(box.x, `card left at bar ${i}, ${width} px`).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, `card right at bar ${i}, ${width} px`).toBeLessThanOrEqual(width);
    }
    // Pin the third day, then travel to the card's action across its neighbours: the card stays on that day.
    const c = await centre(2);
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.mouse.up();
    await expect(card).toHaveClass(/pinned/);
    const title = (await card.locator('.title').textContent())!;
    const action = card.getByRole('button', { name: /^Voir la courbe du / });
    const label = (await action.textContent())!;
    const a = (await action.boundingBox())!;
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2, { steps: 12 });
    await expect(card.locator('.title')).toHaveText(title);
    await page.mouse.down();
    await page.mouse.up();
    const day = label.replace(/^Voir la courbe du /, ''); // « 3/10 »
    const [d] = day.split('/');
    await expect(page.locator('#courbe-title')).toHaveText(new RegExp(`^Courbe du ${d} `));
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  }
});

test('Énergie bar sheet at 320 px: a tap docks the day under the chart, its action opens the Courbe, a second tap closes', async ({ page, isMobile }) => {
  test.skip(isMobile, 'explicit phone width on the desktop project');
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/energie');
  await expect(page.getByRole('img', { name: 'Consommation de la maison par jour' })).toBeVisible();
  await expect(page.getByRole('img', { name: /^Consommation par demi-heure le / })).toBeVisible();
  const keys = page.locator('.plot.interactive button.key');
  const tapBar = async () => {
    // Measured each time: opening the Courbe scrolls the page.
    await keys.nth(1).scrollIntoViewIfNeeded();
    const b = (await keys.nth(1).boundingBox())!;
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  };
  await tapBar();
  const sheet = page.locator('.inspector.sheet');
  await expect(sheet).toBeVisible();
  expect(await page.locator('.inspector.card').count()).toBe(0);
  const box = (await sheet.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(320);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  const action = sheet.getByRole('button', { name: /^Voir la courbe du / });
  const [d] = (await action.textContent())!.replace(/^Voir la courbe du /, '').split('/');
  await action.click();
  await expect(page.locator('#courbe-title')).toHaveText(new RegExp(`^Courbe du ${d} `));
  await expect(sheet).toBeVisible(); // the pin stays while its day's Courbe opens
  await tapBar();
  await expect(sheet).toBeHidden();
});

test('desktop shows the sidebar and the inspector with every radiator', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop layout only');
  await page.goto('/pieces/p-salon');
  await expect(page.getByRole('navigation', { name: 'Navigation principale' }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Salon', level: 2 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Faire clignoter' })).toHaveCount(2);
});

test('desktop: choosing a room card keeps keyboard focus on it and marks it current', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop layout only');
  await page.goto('/');
  const card = page.getByRole('link', { name: /^Salon/ });
  await card.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/pieces\/p-salon$/);
  await expect(page.getByRole('heading', { name: 'Salon', level: 2 })).toBeVisible();
  await expect(card).toHaveAttribute('aria-current', 'page');
  await expect(card).toBeFocused();
});

test('phone room page: the room is the h1, and moving to another tab focuses its title', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phone layout only');
  await page.goto('/pieces/p-salon');
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

test('/maison#linky and #tarif land on their panel once it has loaded', async ({ page }) => {
  for (const id of ['linky', 'tarif']) {
    await page.goto(`/maison#${id}`);
    await expect(page.locator(`#${id} h2`)).toBeVisible();
    await expect(page.locator(`#${id}`).getByRole('button').first()).toBeVisible();
    await expect(page.locator(`#${id} h2`)).toBeInViewport();
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

test('Énergie Par pièce: a full-width table on desktop in every view; focus follows a room toggle across the table/list switch', async ({ page, isMobile }) => {
  test.skip(isMobile, 'explicit desktop widths');
  const panel = page.locator('section.panel').filter({ has: page.getByRole('heading', { name: 'Par pièce et par radiateur' }) });
  for (const width of [1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/energie');
    for (const view of ['Jour', 'Semaine', 'Mois', 'Année']) {
      await page.getByRole('radio', { name: view }).click();
      await expect(panel.locator('.table table')).toBeVisible();
      await expect(panel.locator('.list')).toBeHidden();
    }
  }
  // A room toggle keeps the focus when the panel narrows to the list (and back).
  const toggle = panel.locator('.table button[aria-expanded]').first();
  const room = await toggle.getAttribute('data-room');
  await toggle.focus();
  await page.setViewportSize({ width: 400, height: 900 });
  await expect(panel.locator('.list')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.activeElement?.closest('.list') ? document.activeElement.getAttribute('data-room') : null)).toBe(room);
  await page.setViewportSize({ width: 1024, height: 900 });
  await expect.poll(() => page.evaluate(() => document.activeElement?.closest('.table') ? document.activeElement.getAttribute('data-room') : null)).toBe(room);
});
