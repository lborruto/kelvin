import { expect, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

// The simulator applies a setup write 2 s after it is sent; the pump confirms it on its next poll.
const WAIT = { timeout: 15_000 };

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

  await room('Chambre 1').getByRole('button', { name: 'Déplacer vers…' }).click();
  await dialog.getByRole('radio', { name: 'Bureau e2e' }).check();
  await dialog.getByRole('button', { name: 'Déplacer', exact: true }).click();
  await expect(room('Bureau e2e')).toContainText('1 radiateur', WAIT);
  await expect(room('Chambre 1')).toContainText('Pièce vide');

  await page.goto('/');
  await expect(page.getByRole(card, { name: /^Bureau e2e/ }).first()).toBeVisible();
  await expect(page.getByRole(card, { name: /^Chambre 1/ })).toHaveCount(0);

  // Put the radiator back: the other specs share this simulator.
  await page.goto('/home/devices');
  await room('Bureau e2e').getByRole('button', { name: 'Déplacer vers…' }).click();
  await dialog.getByRole('radio', { name: 'Chambre 1' }).check();
  await dialog.getByRole('button', { name: 'Déplacer', exact: true }).click();
  await expect(room('Bureau e2e')).toContainText('Pièce vide', WAIT);

  await room('Bureau e2e').getByRole('button', { name: 'Supprimer la pièce' }).click();
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

  await room.getByRole('button', { name: 'Supprimer la pièce' }).click();
  await dialog.getByRole('button', { name: 'Supprimer la pièce' }).click();
  await expect(heading).toHaveCount(0, WAIT);

  const deleted = page.locator('.toast', { hasText: 'Suppression de la pièce Annulation e2e' });
  await deleted.getByRole('button', { name: 'Annuler' }).click();
  await expect(heading).toHaveCount(1, WAIT); // recreated once, with the same name
  await expect(page.locator('.toast').getByRole('button', { name: 'Annuler' })).toHaveCount(0); // no undo of the undo
  await page.waitForTimeout(3000);
  await expect(heading).toHaveCount(1); // never a duplicate

  // Leave the simulator as the other specs expect it.
  await room.getByRole('button', { name: 'Supprimer la pièce' }).click();
  await dialog.getByRole('button', { name: 'Supprimer la pièce' }).click();
  await expect(heading).toHaveCount(0, WAIT);
});
