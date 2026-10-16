import { expect, test, type Page } from '@playwright/test';
import { pinSameDay } from './offline';

// Plan 8 flows on the simulator (French, the default suite's locale).
test.describe.configure({ mode: 'serial' });

async function confirmed(page: Page) {
  await expect(page.getByText('Envoi…').first()).toBeVisible();
  await expect(page.getByText('Confirmé').first()).toBeVisible();
}

test('night-light brightness: pending, then confirmed by the radiator', async ({ page }) => {
  await page.goto('/rooms/p-ch1');
  // Each radiator is a disclosure row in the room panel: open it.
  await page.locator('.rad button.row').first().click();
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
    // « Chambre 2 » is offline in the simulator: Salon takes the edits.
    await p.getByRole('radio', { name: 'Salon' }).click();
    await p.getByRole('button', { name: /^Lundi,/ }).click();
  }
  // This page edits Monday and does not send yet.
  await page.getByRole('button', { name: 'Ajouter une plage le Lundi' }).click();
  // The other page changes Monday differently and sends it (Monday holds two periods: this page's
  // add makes three, the most a day takes, so the other page removes one).
  await elsewhere.getByRole('button', { name: 'Supprimer la plage 1 du Lundi' }).click();
  await elsewhere.getByRole('button', { name: 'Envoyer', exact: true }).click();
  await expect(elsewhere.getByText('Confirmé').first()).toBeVisible();
  // This page learns it through the stream.
  await expect(page.getByText('Programme modifié ailleurs')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Envoyer', exact: true })).toHaveAttribute('aria-disabled', 'true');
  await page.getByRole('button', { name: 'Remplacer quand même' }).click();
  await expect(page.getByText('Confirmé').first()).toBeVisible();
  await expect(page.getByText('Programme modifié ailleurs')).toHaveCount(0);
  await other.close();
});

test('schedule: Chambre 1 shows its locked days read-only', async ({ page, isMobile }) => {
  await page.goto('/schedule');
  await page.getByRole('radio', { name: 'Chambre 1' }).click();
  // The agenda hatches them and says why: in the day's name, in its column (desktop) or the notes under it (phone).
  const sunday = page.locator('[data-day="sunday"]');
  await expect(sunday.getByRole('button')).toHaveAccessibleName(/^Dimanche, 20:00–24:00, .*Fin à minuit\s:\smodifiez ce jour/);
  await expect(page.getByRole('button', { name: /^Samedi, Plage non reconnue/ })).toBeVisible();
  if (isMobile) {
    await expect(page.locator('[data-lock="sunday"]')).toContainText(/Fin à minuit\s:\smodifiez ce jour/);
    await expect(page.locator('[data-lock="saturday"]')).toContainText('Plage non reconnue');
  } else {
    await expect(sunday.locator('.why')).toHaveText('fin à minuit');
    await expect(sunday.getByText('20:00–24:00')).toBeVisible();
    await expect(page.locator('[data-day="saturday"] .why')).toHaveText('non reconnu');
  }
  // Opened, the day is shown but never editable.
  await sunday.getByRole('button').click();
  await expect(page.getByRole('heading', { name: /^Dimanche/ })).toBeVisible();
  await expect(page.getByText(/^Fin à minuit\s:\smodifiez ce jour/)).toBeVisible();
  await expect(page.getByText('Ce jour reste tel que le radiateur l’a.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ajouter une plage le Dimanche' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Copier vers…' })).toHaveCount(0);
});

test('schedule: an offline room is marked in the picker and shown read-only', async ({ page }) => {
  await page.goto('/schedule');
  const ch2 = page.getByRole('radio', { name: 'Chambre 2 hors ligne' });
  await expect(ch2).toBeVisible();
  await ch2.click();
  await expect(page.getByRole('status').filter({ hasText: 'Chambre 2 est hors ligne' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Lundi,/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Ajouter une plage/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Envoyer', exact: true })).toHaveCount(0);
});

test('schedule: « Copier vers… » copies a day onto the weekdays of the draft, nothing is sent', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  await page.goto('/schedule?room=p-salon&day=monday');
  await expect(page.getByRole('heading', { name: /^Lundi/ })).toBeVisible();
  const trigger = page.getByRole('button', { name: 'Copier vers…' });
  await trigger.click();
  const sheet = page.getByRole('dialog', { name: 'Copier lundi vers…' });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: 'Jours de semaine' }).click();
  await page.keyboard.press('Escape'); // Esc closes, focus returns, nothing copied
  await expect(sheet).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(page.locator('.sendbar')).toHaveCount(0);
  await trigger.click();
  await sheet.getByRole('button', { name: 'Tous les jours' }).click();
  await sheet.getByRole('button', { name: /^Copier sur \d jours$/ }).click();
  await expect(sheet).toBeHidden();
  await expect(page.locator('.sendbar')).toBeVisible(); // the weekend differs from Monday: something to send
  await page.locator('.sendbar').getByRole('button', { name: 'Annuler' }).click();
});

async function signInElsewhere(browser: import('@playwright/test').Browser) {
  const ctx = await browser.newContext({ locale: 'fr-FR', storageState: { cookies: [], origins: [] } }); // not the project's session
  const p = await ctx.newPage();
  await p.goto('/');
  await p.getByLabel('Email').fill('demo@kelvin.local');
  await p.getByLabel('Mot de passe').fill('kelvin');
  await p.getByRole('button', { name: 'Se connecter' }).click();
  await expect(p.getByRole('heading', { name: 'Maison', level: 1 })).toBeVisible();
  return { ctx, p };
}

test('sessions: sign out another device; it is asked to log in again', async ({ page, browser, isMobile }) => {
  test.skip(isMobile, 'one project is enough');
  const { ctx, p } = await signInElsewhere(browser);
  await page.goto('/home#sessions');
  const panel = page.locator('#sessions');
  await expect(panel.getByText('cet appareil', { exact: true })).toBeVisible();
  await expect(panel.getByText(/^connecté le /).first()).toBeVisible();
  const buttons = panel.getByRole('button', { name: /^Déconnecter (?!les)/ });
  const before = await buttons.count();
  expect(before).toBeGreaterThan(0);
  await buttons.last().click(); // the most recent other session is listed first; the last is the oldest
  await expect(buttons).toHaveCount(before - 1);
  // Whichever session was revoked, sign out every other one to be sure ours is gone too.
  if (before - 1 > 0) {
    await panel.getByRole('button', { name: 'Déconnecter les autres appareils' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('button', { name: 'Annuler' })).toBeFocused();
    await dialog.getByRole('button', { name: 'Déconnecter' }).click();
    await expect(panel.getByRole('button', { name: /^Déconnecter (?!les)/ })).toHaveCount(0);
  }
  await p.reload();
  await expect(p).toHaveURL(/\/login/);
  await ctx.close();
});

test('an offline room: a calm notice in its panel, the alert in Home (neutral), which can be dismissed', async ({ page, isMobile }) => {
  test.skip(isMobile, 'dismissal is shared state: one project runs it');
  const sinceText = await pinSameDay(page);
  await page.goto('/rooms/p-ch2');
  await expect(page.getByText(sinceText).first()).toBeVisible(); // the status sentence
  const notice = page.getByRole('status').filter({ hasText: 'Radiateur hors tension ou hors de portée' });
  await expect(notice).toContainText('Les commandes reprendront quand il sera rallumé.');
  // Not repeated as an alert in the room, and never red.
  await expect(page.getByText(/Chambre 2\s:\sradiateur hors ligne/)).toHaveCount(0);
  await expect(page.locator('.inspector .bad')).toHaveCount(0);
  await expect(page.locator('.inspector header .temp')).toHaveCount(0); // no reading for an offline room
  await page.goto('/home#alerts');
  const list = page.locator('#alerts');
  const callout = list.getByText(/Chambre 2\s:\sradiateur hors ligne/);
  await expect(callout).toBeVisible();
  await list.getByRole('button', { name: /^Masquer\s:\sChambre 2/ }).click();
  await expect(callout).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#alerts').getByText(/Chambre 2\s:\sradiateur hors ligne/)).toHaveCount(0);
});
