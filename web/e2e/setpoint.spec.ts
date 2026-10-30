import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Request } from '@playwright/test';
import { pinYesterdayAt } from './clock';

// Setpoints (owner, 2026-10-29): −/+ in Programme always sets Confort (during Éco it applies at the next comfort
// slot); nothing is sent while the owner keeps tapping, one command 1,5 s after the last tap; Sauter's Éco stops at
// Confort − 2 °C. The simulator's Salon is in Programme; 23:30 is an Éco period every day of its week.
test.describe.configure({ mode: 'serial' });

const num = (t: string | null) => Number((t ?? '').replace(/[^\d,]/g, '').replace(',', '.'));

/** Every setpoint request the page sends for Salon, with its body. */
function sends(page: Page) {
  const out: { kind: string; value: number }[] = [];
  page.on('request', (r: Request) => {
    if (r.method() === 'POST' && r.url().endsWith('/api/rooms/p-salon/setpoint')) out.push(r.postDataJSON());
  });
  return out;
}

/** The commands the simulator settled lately (the snapshot's `recent`, the command log's tail) for Salon's setpoints. */
async function logged(page: Page, kind: string) {
  const snap = await (await page.request.get('/api/house')).json();
  return [...snap.pending, ...snap.recent]
    .filter((p: { label_code: string; label_params: { name?: string; kind?: string } }) => p.label_code === 'setpoint' && p.label_params.name === 'Salon' && p.label_params.kind === kind)
    .map((p: { label_params: { value: number } }) => p.label_params.value);
}

async function put(page: Page, kind: 'comfort' | 'eco', value: number) {
  const r = await page.request.post('/api/rooms/p-salon/setpoint', { headers: { 'X-Kelvin': '1' }, data: { kind, value } });
  expect(r.status()).toBe(202);
}

async function serious(page: Page) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity));
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id);
}

test('Programme during Éco: the −/+ reads Confort, says when it applies, and offers « Chauffer maintenant… »', async ({ page }) => {
  await pinYesterdayAt(page, 23, 30);
  await page.goto('/?sheet=p-salon');
  const sheet = page.getByRole('dialog', { name: 'Salon' });
  const primary = sheet.getByRole('group', { name: 'Consigne Confort' });
  await expect(primary).toBeVisible({ timeout: 20_000 });
  const value = (await primary.getByRole('status').textContent())!;
  await expect(sheet.getByText(`Confort · ${value.replace('°', '').trim()} °C`)).toBeVisible();
  await expect(sheet.getByText(/^Pris en compte à la prochaine plage Confort \((06:15|08:30)\)/)).toBeVisible();
  await expect(sheet.locator('.st')).toContainText('Programme · Éco jusqu’à');
  await expect(sheet.getByRole('group', { name: 'Consigne Éco' })).toHaveCount(0);
  expect(await serious(page)).toEqual([]);
  await sheet.getByRole('button', { name: 'Chauffer maintenant…' }).click();
  await expect(sheet.getByRole('button', { name: 'Lancer' })).toBeVisible();
});

test('five quick taps on + send one command, 1,5 s after the last, with the final value', async ({ page, isMobile }) => {
  test.skip(isMobile, 'shared simulator state: one project runs it');
  await pinYesterdayAt(page, 23, 30);
  await page.goto('/?sheet=p-salon');
  const sheet = page.getByRole('dialog', { name: 'Salon' });
  const primary = sheet.getByRole('group', { name: 'Consigne Confort' });
  await expect(primary).toBeVisible({ timeout: 20_000 });
  const before = num(await primary.getByRole('status').textContent());
  const sent = sends(page);
  const plus = primary.getByRole('button', { name: 'Augmenter Consigne Confort' });
  for (let i = 0; i < 5; i++) await plus.click();
  // Shown at once, dashed (not sent yet), and nothing on the wire while the taps go on.
  await expect(primary.getByRole('status')).toContainText(String(before + 2.5).replace('.', ','));
  await expect(primary).toHaveClass(/pending/);
  expect(sent).toEqual([]);
  await expect.poll(() => sent.length).toBe(1);
  await page.waitForTimeout(500);
  expect(sent).toEqual([{ kind: 'comfort', value: before + 2.5 }]);
  await expect.poll(() => logged(page, 'comfort'), { timeout: 20_000 }).toContain(before + 2.5);
  expect((await logged(page, 'comfort')).filter((v: number) => v > before && v < before + 2.5)).toEqual([]);
  await put(page, 'comfort', before);
  await expect(primary.getByRole('status')).toContainText(String(before.toFixed(1)).replace('.', ','), { timeout: 20_000 });
});

test('Éco stops at Confort − 2 °C (Sauter) and says so; « Modifier Confort » goes to Confort', async ({ page, isMobile }) => {
  test.skip(isMobile, 'shared simulator state: one project runs it');
  await page.goto('/?sheet=p-salon');
  const sheet = page.getByRole('dialog', { name: 'Salon' });
  const eco = sheet.getByRole('group', { name: 'Éco', exact: true });
  await expect(eco).toBeVisible({ timeout: 20_000 });
  const comfort = num(await sheet.getByRole('group', { name: 'Confort', exact: true }).getByRole('status').textContent());
  const sent = sends(page);
  const up = eco.getByRole('button', { name: 'Augmenter Éco' });
  while ((await up.getAttribute('aria-disabled')) !== 'true') await up.click();
  await expect(eco.getByRole('status')).toContainText(String((comfort - 2).toFixed(1)).replace('.', ','));
  await expect(sheet.getByText('Éco ne peut pas dépasser Confort − 2,0 °C')).toBeVisible();
  await sheet.getByRole('button', { name: 'Modifier Confort' }).click();
  await expect(sheet.getByRole('group', { name: 'Confort', exact: true }).getByRole('button', { name: 'Augmenter Confort' })).toBeFocused();
  await expect.poll(() => sent.length).toBe(1);
  expect(sent).toEqual([{ kind: 'eco', value: 2 }]);
  await expect.poll(() => logged(page, 'eco'), { timeout: 20_000 }).toContain(2);
  await put(page, 'eco', 3);
  await expect(eco.getByRole('status')).toContainText(String((comfort - 3).toFixed(1)).replace('.', ','), { timeout: 20_000 });
});

test('Programme › « Modifier les températures » opens a compact sheet: raise Confort, Éco at its limit, one command each', async ({ page, isMobile }) => {
  test.skip(isMobile, 'shared simulator state: one project runs it');
  await page.goto('/schedule?room=p-salon');
  const edit = page.getByRole('button', { name: 'Modifier les températures' });
  await edit.click();
  await expect(page).toHaveURL(/\/schedule\?room=p-salon$/); // no trip to the room
  const sheet = page.getByRole('dialog', { name: 'Températures · Salon' });
  await expect(sheet).toBeVisible();
  expect(await serious(page)).toEqual([]);
  const comfortG = sheet.getByRole('group', { name: 'Confort', exact: true });
  const ecoG = sheet.getByRole('group', { name: 'Éco', exact: true });
  const comfort = num(await comfortG.getByRole('status').textContent());
  const delta = comfort - num(await ecoG.getByRole('status').textContent());
  await expect(sheet.getByText(`${delta.toFixed(1).replace('.', ',')} °C sous le confort`)).toBeVisible();
  const sent = sends(page);
  await comfortG.getByRole('button', { name: 'Augmenter Confort' }).click();
  // Éco keeps its lowering: it moves with Confort.
  await expect(ecoG.getByRole('status')).toContainText(String((comfort - delta).toFixed(1)).replace('.', ','));
  await expect.poll(() => sent.length).toBe(1);
  expect(sent).toEqual([{ kind: 'comfort', value: comfort + 0.5 }]);
  await expect(ecoG.getByRole('status')).toContainText(String((comfort + 0.5 - delta).toFixed(1)).replace('.', ','), { timeout: 20_000 });
  // Éco up to its limit, then closing the sheet at once sends the waiting value (flush), once.
  const up = ecoG.getByRole('button', { name: 'Augmenter Éco' });
  while ((await up.getAttribute('aria-disabled')) !== 'true') await up.click();
  await expect(ecoG.getByRole('status')).toContainText(String((comfort + 0.5 - 2).toFixed(1)).replace('.', ','));
  await expect(sheet.getByText('Éco ne peut pas dépasser Confort − 2,0 °C')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect.poll(() => sent.length).toBe(2);
  expect(sent[1]).toEqual({ kind: 'eco', value: 2 });
  await expect(edit).toBeFocused();
  await put(page, 'eco', delta);
  await put(page, 'comfort', comfort);
});

test('the slider says the target it moves to, and the large figure follows it live', async ({ page, isMobile }, info) => {
  await pinYesterdayAt(page, 23, 30);
  await page.goto('/?sheet=p-salon');
  const sheet = page.getByRole('dialog', { name: 'Salon' });
  const slider = sheet.getByRole('slider', { name: 'Consigne Confort' });
  await expect(slider).toBeVisible({ timeout: 20_000 });
  const primary = sheet.getByRole('group', { name: 'Consigne Confort' });
  const before = num(await primary.getByRole('status').textContent());
  await expect(slider.locator('.ml')).toHaveText(/^Actuel \d+,\d°$/);
  const box = (await slider.boundingBox())!;
  const sent = sends(page);
  const at = (f: number, x = 0.5) => ({ clientX: box.x + box.width * x, clientY: box.y + box.height * f, pointerId: 7, button: 0, isPrimary: true });
  if (isMobile) {
    // A finger on the right half: the bubble goes to the left so the finger never hides it.
    await slider.dispatchEvent('pointerdown', { ...at(0.5, 0.75), pointerType: 'touch' });
    await slider.dispatchEvent('pointermove', { ...at(0.3, 0.75), pointerType: 'touch' });
  } else {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.3, { steps: 5 });
  }
  const bubble = slider.locator('.bubble');
  await expect(bubble).toBeVisible();
  if (isMobile) await expect(bubble).toHaveClass(/left/);
  const target = num(await bubble.textContent());
  expect(target * 2).toBe(Math.round(target * 2)); // snapped to 0,5
  await expect(slider).toHaveAttribute('aria-valuetext', new RegExp(`^${String(target.toFixed(1)).replace('.', ',')}\\s°C$`));
  await expect(primary.getByRole('status')).toContainText(String(target.toFixed(1)).replace('.', ','));
  if (process.env.KELVIN_E2E_SHOTS) await sheet.screenshot({ path: `${process.env.KELVIN_E2E_SHOTS}/slider-drag-${info.project.name}.png` });
  if (isMobile) await slider.dispatchEvent('pointerup', { ...at(0.3, 0.75), pointerType: 'touch' });
  else await page.mouse.up();
  expect(sent).toEqual([]);
  await expect.poll(() => sent.length).toBe(1);
  expect(sent).toEqual([{ kind: 'comfort', value: target }]);
  await expect(primary.getByRole('status')).toContainText(String(target.toFixed(1)).replace('.', ','));
  await put(page, 'comfort', before);
});
