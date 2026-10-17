import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { settled } from './cls';

// The room sheet's « Aujourd’hui » chart reads any moment: hover (desktop), tap (phone), ←/→ (keyboard).
const SLIDER = /^Salon, température sur 24\sh\s: lire moment par moment$/;

async function openChart(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/rooms/p-salon');
  await settled(page);
  // On a phone the chart sits behind « Programme, températures, radiateurs ».
  const more = page.getByRole('button', { name: 'Programme, températures, radiateurs' });
  if (await more.isVisible()) await more.click();
  const slider = page.getByRole('slider', { name: SLIDER });
  await expect(slider).toBeVisible();
  // The history has arrived: the temperature line is drawn.
  await expect(page.locator('path.temp').first()).toHaveAttribute('d', /^M/);
  await slider.scrollIntoViewIfNeeded();
  return slider;
}

async function seriousAxe(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
  return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id);
}

test.describe('room chart inspector', () => {
  test.use({ serviceWorkers: 'block' });

  test('desktop: hovering shows a card with the temperature and the setpoint, beside the guide', async ({ page, isMobile }) => {
    test.skip(isMobile, 'hover is the desktop gesture');
    const slider = await openChart(page);
    const box = (await slider.boundingBox())!;
    // 06:00 on the day: before now, so a reading is there.
    const x = box.x + box.width * 0.25;
    await page.mouse.move(x, box.y + box.height / 2);
    const card = page.locator('.inspector.card');
    await expect(card).toBeVisible();
    await expect(card).toContainText(/^06:00–06:15/);
    await expect(card).toContainText(/Température\s*\d+,\d\s°C/);
    await expect(card).toContainText(/Consigne\s*\d+,\d\s°C/);
    await expect(card).toContainText('mesuré');
    // Never over the point read: the card's box leaves the cursor's x clear.
    const c = (await card.boundingBox())!;
    expect(x < c.x || x > c.x + c.width || c.y > box.y + box.height - 12).toBe(true);
    // Inside the sheet.
    const sheet = (await page.locator('dialog.room-sheet').boundingBox())!;
    expect(c.x).toBeGreaterThanOrEqual(sheet.x);
    expect(c.x + c.width).toBeLessThanOrEqual(sheet.x + sheet.width);
    expect(await seriousAxe(page)).toEqual([]);
    await page.mouse.move(5, 5);
    await expect(card).toHaveCount(0);
    // The scale fits the data: never down to 0 °C.
    const ticks = (await page.locator('.ytick').allTextContents()).map((t) => parseInt(t, 10));
    expect(Math.min(...ticks)).toBeGreaterThan(5);
  });

  test('7 j: a bucket reads its date, mean, minimum and maximum', async ({ page, isMobile }) => {
    test.skip(isMobile, 'one project is enough for the bucket rows');
    await openChart(page);
    await page.getByRole('radio', { name: '7\u00a0j' }).click();
    const slider = page.getByRole('slider', { name: /sur 7\sj\s: lire/ });
    await expect(slider).toBeVisible();
    const box = (await slider.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2);
    const card = page.locator('.inspector.card');
    await expect(card).toContainText(/^\d+ \S+, \d\d:00–\d\d:00/);
    for (const label of ['Température moyenne', 'Minimum', 'Maximum']) await expect(card).toContainText(label);
  });

  test('phone: a tap docks the inspector under the chart; a second tap closes it; the sheet stays open', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'the tap is the phone gesture');
    const slider = await openChart(page);
    const box = (await slider.boundingBox())!;
    const at = { x: box.x + box.width * 0.25, y: box.y + box.height / 2 };
    await page.touchscreen.tap(at.x, at.y);
    const sheet = page.locator('.inspector.sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText(/Température\s*\d+,\d\s°C/);
    await expect(sheet).toContainText(/Consigne\s*\d+,\d\s°C/);
    expect(await seriousAxe(page)).toEqual([]);
    await page.touchscreen.tap(at.x, at.y);
    await expect(sheet).toHaveCount(0);
    await expect(page.locator('dialog.room-sheet')).toBeVisible();
  });

  test('keyboard: focus, ←/→, Home/End, Esc clears without closing the sheet', async ({ page }) => {
    const slider = await openChart(page);
    await slider.focus();
    await page.keyboard.press('ArrowRight');
    const now = Number(await slider.getAttribute('aria-valuenow'));
    expect(now).toBeGreaterThan(0);
    await expect(slider).toHaveAttribute('aria-valuetext', /^\d\d:\d\d–\d\d:\d\d\s: Température/);
    await page.keyboard.press('ArrowLeft');
    await expect(slider).toHaveAttribute('aria-valuenow', String(now - 1));
    await page.keyboard.press('Home');
    await expect(slider).toHaveAttribute('aria-valuenow', '0');
    await page.keyboard.press('End');
    await expect(slider).toHaveAttribute('aria-valuetext', /^23:45–00:00/);
    await expect(page.locator('.inspector')).toContainText('Consigne prévue');
    await page.keyboard.press('Escape');
    await expect(page.locator('.inspector')).toHaveCount(0);
    await expect(page.locator('dialog.room-sheet')).toBeVisible();
  });
});
