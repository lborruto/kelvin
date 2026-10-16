import { expect, test, type Locator, type Page } from '@playwright/test';

// The Tableau control scale (spec §1, DESIGN « Buttons »): pill buttons 40 px (.btn-sm 34, .btn-lg 52), round
// icon buttons 36 (.btn-icon-lg 40), fields 36, segments 32, steppers 44 (sm 38, lg 56); every hit area 44 px.

async function settled(page: Page) {
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  await page.waitForFunction(() => !document.querySelector('.skeleton'), null, { timeout: 15_000 });
  await page.waitForTimeout(400);
}

/** Painted heights of every visible control on the page, by a short description. */
async function heights(page: Page) {
  return page.evaluate(() => {
    const sel = [
      "input:not([type='checkbox'], [type='radio'], [type='range'], [type='hidden'])",
      'select',
      '.seg button',
      '.stepper',
      '.btn'
    ].join(',');
    const want = (el: Element) => {
      const c = el.classList;
      if (el.matches('.stepper')) return c.contains('lg') ? 56 : c.contains('sm') ? 38 : 44;
      // Segmented (the kit) is 32; ModeSwitch keeps its 36 px well until the room sheet batch.
      if (el.matches('.seg button')) return el.closest('[data-kit="segmented"]') ? 32 : 36;
      if (!c.contains('btn')) return 36;
      if (c.contains('btn-icon')) return c.contains('btn-icon-lg') ? 40 : 36;
      return c.contains('btn-lg') ? 52 : c.contains('btn-sm') ? 34 : 40;
    };
    return [...document.querySelectorAll<HTMLElement>(sel)]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && !el.closest('.visually-hidden, .tabs, [inert]');
      })
      .map((el) => ({
        what: `${el.tagName.toLowerCase()}.${[...el.classList].join('.')} « ${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)} »`,
        h: Math.round(el.getBoundingClientRect().height * 10) / 10,
        want: want(el)
      }));
  });
}

/** True when a point `gap` px above and below the control's painted box still lands on it. */
async function hitsAround(target: Locator, gap = 3) {
  return target.evaluate((el, g) => {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const at = (y: number) => {
      const hit = document.elementFromPoint(x, y);
      return !!hit && (hit === el || el.contains(hit));
    };
    return { above: at(r.top - g), below: at(r.bottom + g - 0.5) };
  }, gap);
}

test.describe('compact controls', () => {
  test.skip(({ isMobile }) => isMobile, 'explicit widths');

  for (const width of [390, 1440]) {
    for (const path of ['/', '/schedule?day=monday', '/home', '/energy']) {
      test(`${path} at ${width} px: every control is painted at its Tableau size`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        await settled(page);
        const all = await heights(page);
        expect(all.length, 'controls found').toBeGreaterThan(0);
        const off = all.filter((c) => Math.abs(c.h - c.want) > 0.6);
        expect(off, JSON.stringify(off)).toEqual([]);
      });
    }
  }

  test('hit areas reach 44 px: Stepper +, a Segmented option, a DayEditor remove button', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await settled(page);
    const plus = page.locator('.stepper button').nth(1);
    await expect(plus).toBeVisible();
    expect(await hitsAround(plus, 4)).toEqual({ above: true, below: true });

    await page.goto('/energy');
    await settled(page);
    const month = page.getByRole('radio', { name: 'Mois' });
    expect(await hitsAround(month)).toEqual({ above: true, below: true });

    await page.goto('/schedule?day=monday');
    await settled(page);
    const remove = page.locator('.slots .btn-icon').first();
    await expect(remove).toBeVisible();
    expect((await remove.boundingBox())!.height).toBeCloseTo(36, 1);
    expect(await hitsAround(remove)).toEqual({ above: true, below: true });
  });

  test('time fields are as wide as their value; the phone « Envoyer » is the large primary', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/schedule?day=monday');
    await settled(page);
    const time = page.locator('.slots input[type="time"]').first();
    const w = (await time.boundingBox())!.width;
    expect(w).toBeLessThanOrEqual(6.5 * 15 + 0.5);
    // One period per line from 320 px: the remove button sits on the times' row.
    await page.setViewportSize({ width: 320, height: 800 });
    const row = page.locator('.slots li').first();
    const [a, b] = [await row.locator('input').first().boundingBox(), await row.locator('.btn-icon').boundingBox()];
    expect(Math.abs(a!.y + a!.height / 2 - (b!.y + b!.height / 2))).toBeLessThan(2);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('button.add').first().evaluate((el: HTMLButtonElement) => el.click());
    const send = page.getByRole('button', { name: 'Envoyer' });
    await expect(send).toBeVisible();
    // The send bar's own phone override (44 px) until the Programme batch rebuilds it with the SendBar.
    expect((await send.boundingBox())!.height).toBeCloseTo(44, 0);
  });
});
