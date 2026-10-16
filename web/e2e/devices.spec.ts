import { expect, test, type Locator, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

// The simulator applies a setup write 2 s after it is sent; the pump confirms it on its next poll.
const WAIT = { timeout: 15_000 };

/** Every room and radiator action goes through its « ⋯ » menu (UX batch 10): the room's « Actions pour <room> »,
 * a radiator's « Actions pour <name> (<model>) ». */
async function act(page: Page, scope: Locator, menu: RegExp, item: string) {
  await scope.getByRole('button', { name: menu }).first().click();
  await page.getByRole('menuitem', { name: item }).click();
}
const RADIATOR = /^Actions pour .+\(/;
const ROOM = (name: string) => new RegExp(`^Actions pour ${name}$`);

test('rooms: create → move a radiator → Pièces updates → move back → delete the empty room', async ({ page }) => {
  // Pièces: every card is a link to its room (kelvin.spec.ts).
  const card = 'link';
  await page.goto('/home/devices');
  await expect(page.getByRole('heading', { level: 1, name: 'Pièces et appareils' })).toBeVisible();
  const room = (name: string) => page.locator('section', { has: page.getByRole('heading', { name, exact: true }) });
  const dialog = page.getByRole('dialog');

  await page.getByRole('button', { name: 'Nouvelle pièce' }).click();
  await page.getByLabel('Nom de la nouvelle pièce').fill('Bureau e2e');
  await page.getByRole('button', { name: 'Créer' }).click();
  await expect(room('Bureau e2e')).toContainText('Pièce vide', WAIT);

  await act(page, room('Chambre 1'), RADIATOR, 'Déplacer vers…');
  await dialog.getByRole('radio', { name: 'Bureau e2e' }).check();
  await dialog.getByRole('button', { name: 'Déplacer', exact: true }).click();
  await expect(room('Bureau e2e')).toContainText('1 radiateur', WAIT);
  await expect(room('Chambre 1')).toContainText('Pièce vide');

  await page.goto('/');
  await expect(page.getByRole(card, { name: /^Bureau e2e/ }).first()).toBeVisible();
  await expect(page.getByRole(card, { name: /^Chambre 1/ })).toHaveCount(0);

  // Put the radiator back: the other specs share this simulator.
  await page.goto('/home/devices');
  await act(page, room('Bureau e2e'), RADIATOR, 'Déplacer vers…');
  await dialog.getByRole('radio', { name: 'Chambre 1' }).check();
  await dialog.getByRole('button', { name: 'Déplacer', exact: true }).click();
  await expect(room('Bureau e2e')).toContainText('Pièce vide', WAIT);

  await act(page, room('Bureau e2e'), ROOM('Bureau e2e'), 'Supprimer la pièce');
  await expect(dialog.getByRole('button', { name: 'Annuler' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Supprimer la pièce' }).click();
  await expect(page.getByRole('heading', { name: 'Bureau e2e', exact: true })).toHaveCount(0, WAIT);
});

test('undo: a deleted room comes back once, with its name, and the undo offers no undo', async ({ page }) => {
  await page.goto('/home/devices');
  await expect(page.getByRole('heading', { level: 1, name: 'Pièces et appareils' })).toBeVisible();
  const heading = page.getByRole('heading', { name: 'Annulation e2e', exact: true });
  const room = page.locator('section', { has: heading });
  const dialog = page.getByRole('dialog');

  await page.getByRole('button', { name: 'Nouvelle pièce' }).click();
  await page.getByLabel('Nom de la nouvelle pièce').fill('Annulation e2e');
  await page.getByRole('button', { name: 'Créer' }).click();
  await expect(room).toContainText('Pièce vide', WAIT);
  // Close the create's own « Annuler » toast: only the delete's undo is under test.
  for (const close of await page.locator('.toast').getByRole('button', { name: 'Fermer' }).all()) await close.click();

  await act(page, room, ROOM('Annulation e2e'), 'Supprimer la pièce');
  await dialog.getByRole('button', { name: 'Supprimer la pièce' }).click();
  await expect(heading).toHaveCount(0, WAIT);

  const deleted = page.locator('.toast', { hasText: 'Suppression de la pièce Annulation e2e' });
  await deleted.getByRole('button', { name: 'Annuler' }).click();
  await expect(heading).toHaveCount(1, WAIT); // recreated once, with the same name
  await expect(page.locator('.toast').getByRole('button', { name: 'Annuler' })).toHaveCount(0); // no undo of the undo
  await page.waitForTimeout(3000);
  await expect(heading).toHaveCount(1); // never a duplicate

  // Leave the simulator as the other specs expect it.
  await act(page, room, ROOM('Annulation e2e'), 'Supprimer la pièce');
  await dialog.getByRole('button', { name: 'Supprimer la pièce' }).click();
  await expect(heading).toHaveCount(0, WAIT);
});

// /auth/me failing while the setup loads must not leave the page on its skeleton forever.
test('/auth/me unreachable: an error with « Réessayer », and the retry brings the rooms', async ({ page }) => {
  await page.route('**/api/auth/me', (route) => route.abort());
  await page.goto('/home/devices');
  const alert = page.getByRole('alert').filter({ hasText: 'Impossible de charger les appareils.' });
  await expect(alert).toBeVisible();
  await expect(page.locator('main [aria-busy="true"] .skeleton')).toHaveCount(0);
  await page.unroute('**/api/auth/me');
  await alert.getByRole('button', { name: 'Réessayer' }).click();
  await expect(page.getByRole('heading', { name: 'Salon', exact: true })).toBeVisible(WAIT);
  await expect(alert).toHaveCount(0);
});

test('a full room cannot be deleted: its menu says why; plain names for the box and the bridge', async ({ page }) => {
  await page.goto('/home/devices');
  const salon = page.locator('section', { has: page.getByRole('heading', { name: 'Salon', exact: true }) });
  await salon.getByRole('button', { name: ROOM('Salon') }).click();
  const del = page.getByRole('menuitem', { name: /Supprimer la pièce/ });
  await expect(del).toHaveAttribute('aria-disabled', 'true');
  await expect(del).toContainText('Videz d’abord la pièce');
  await page.keyboard.press('Escape');
  await expect(salon.getByRole('button', { name: ROOM('Salon') })).toBeFocused();
  // Each radiator says its model, power and state; its devices are one menu item away.
  await expect(salon.getByText(/ · \d[\d\s]*\sW · (En ligne|Hors ligne)/).first()).toBeVisible();
  await expect(salon.getByText(/Deux radiateurs portent le même nom/)).toBeVisible(); // the simulator's two « Radiateur »
  await act(page, salon, RADIATOR, 'Voir les appareils (6)');
  await expect(salon.getByText('Sonde de température').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /^Box Cozytouch/ })).toBeVisible();
  await expect(page.getByText('IOStack')).toBeHidden();
});
