import { expect, test, type Page } from '@playwright/test';

// Layout guards, run once (desktop project; widths are set per check).
const WIDTHS = [320, 360, 390, 768, 1024, 1280, 1440];
const ROUTES = ['/', '/rooms/p-salon', '/schedule', '/energy', '/home', '/home/devices'];

/** The page is in its loaded state: a title, no skeleton left. */
async function settled(page: Page) {
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  await page.waitForFunction(() => !document.querySelector('.skeleton'), null, { timeout: 15_000 });
  // Let the entrance motion finish (bars grow in 360 ms).
  await page.waitForTimeout(500);
}

const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.describe('layout', () => {
  test.skip(({ isMobile }) => isMobile, 'runs once, at explicit widths');

  for (const path of ROUTES) {
    test(`${path} never scrolls sideways from 320 to 1440 px`, async ({ page }) => {
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        await settled(page);
        expect(await overflow(page), `${path} at ${width} px`).toBeLessThanOrEqual(0);
      }
    });
  }

  test('/schedule with three periods on a day never scrolls sideways from 320 to 1440 px', async ({ page }) => {
    page.on('dialog', (d) => d.accept());
    await page.setViewportSize({ width: 320, height: 900 });
    // Monday in the day editor (beside the week on desktop, its own view on a phone) gets its third
    // period: its row in the week is then at its longest.
    await page.goto('/schedule?day=monday');
    await settled(page);
    // Clicked in the DOM: once the first period is added, the sticky send bar may cover the button.
    const add = page.locator('button.add').first();
    for (let i = 0; i < 3; i++) await add.evaluate((b: HTMLButtonElement) => b.click());
    await expect(add).toHaveAttribute('aria-disabled', 'true');
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(100);
      expect(await overflow(page), `/schedule (3 periods) at ${width} px`).toBeLessThanOrEqual(0);
    }
  });

  test('/login never scrolls sideways from 320 to 1440 px', async ({ browser }) => {
    const page = await (await browser.newContext({ storageState: { cookies: [], origins: [] }, locale: 'fr-FR' })).newPage();
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/login');
      await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();
      // Plan 12: the server picker (or, once the home is claimed, its locked line) is part of the layout.
      await expect(page.getByRole('combobox', { name: 'Serveur' }).or(page.getByText(/^Serveur\s*:/))).toBeVisible();
      expect(await overflow(page), `/login at ${width} px`).toBeLessThanOrEqual(0);
    }
  });

  test('/schedule with the copy sheet open, and an offline room, never scrolls sideways', async ({ page }) => {
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/schedule?day=monday');
      await settled(page);
      await page.getByRole('button', { name: 'Copier vers…' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      expect(await overflow(page), `/schedule copy sheet at ${width} px`).toBeLessThanOrEqual(0);
      await page.keyboard.press('Escape');
      await page.goto('/schedule?room=p-ch2');
      await settled(page);
      await expect(page.getByText('Chambre 2 est hors ligne')).toBeVisible();
      expect(await overflow(page), `/schedule offline room at ${width} px`).toBeLessThanOrEqual(0);
    }
  });

  // CI has only the fallback fonts: the page must not shift when Onest never arrives either.
  for (const fonts of ['web fonts', 'fallback fonts only'])
    test(`/schedule loads without layout shift (CLS < 0.05), ${fonts}`, async ({ page }) => {
      await page.addInitScript(() => {
        const w = window as unknown as { __cls: number };
        w.__cls = 0;
        new PerformanceObserver((list) => {
          for (const e of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) {
            if (!e.hadRecentInput) w.__cls += e.value;
          }
        }).observe({ type: 'layout-shift', buffered: true });
      });
      if (fonts !== 'web fonts') await page.route('**/*.woff2', (route) => route.abort());
      for (const width of [390, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await page.route('**/api/**', async (route) => {
          await new Promise((r) => setTimeout(r, 150));
          await route.continue();
        });
        await page.goto('/schedule');
        await settled(page);
        await page.waitForTimeout(800);
        const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
        expect(cls, `/schedule at ${width} px (${fonts})`).toBeLessThan(0.05);
        await page.unroute('**/api/**');
      }
    });

  for (const path of ['/home', '/energy', '/home/devices']) {
    test(`${path} loads without layout shift (CLS < 0.05)`, async ({ page }) => {
      // Registered once: every navigation starts a fresh count.
      await page.addInitScript(() => {
        const w = window as unknown as { __cls: number };
        w.__cls = 0;
        new PerformanceObserver((list) => {
          for (const e of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) {
            if (!e.hadRecentInput) w.__cls += e.value;
          }
        }).observe({ type: 'layout-shift', buffered: true });
      });
      for (const width of [390, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        // A cold load: the data arrives after the first paint, as on a real visit.
        await page.route('**/api/**', async (route) => {
          await new Promise((r) => setTimeout(r, 150));
          await route.continue();
        });
        await page.goto(path);
        await settled(page);
        await page.waitForTimeout(800);
        const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
        expect(cls, `${path} at ${width} px`).toBeLessThan(0.05);
        await page.unrouteAll({ behavior: 'ignoreErrors' });
      }
    });
  }
});

/** Counts the layout shifts of every navigation of this page (a fresh count per load). */
async function countShifts(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __cls: number };
    w.__cls = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) {
        if (!e.hadRecentInput) w.__cls += e.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
}
const shifts = (page: Page) => page.evaluate(() => (window as unknown as { __cls: number }).__cls);

// Alerts arrive after the first paint: the room they take must be reserved from it (Plan 8).
// The simulator holds one real alert (« Chambre 2 » unreachable); it cannot raise another, so the
// list and the stream's count carry two more (a price change and a consent), as a real house would.
test.describe('layout with alerts', () => {
  test.skip(({ isMobile }) => isMobile, 'runs once, at explicit widths');
  const EXTRA = [
    { id: 9001, kind: 'price_change', severity: 'info', params: { date: '2027-02-01' }, first_seen: 1, last_seen: 1, resolved_at: null, dismissed: false },
    { id: 9002, kind: 'consent_expiring', severity: 'warn', params: { date: '2026-11-02', days: 18 }, first_seen: 1, last_seen: 1, resolved_at: null, dismissed: false }
  ];

  test.beforeEach(async ({ page }) => {
    await countShifts(page);
    await page.addInitScript((extra: number) => {
      // The count of the SSE snapshot and `alerts` events includes the two more alerts.
      const Native = window.EventSource;
      class Counted extends Native {
        addEventListener(type: string, listener: EventListenerOrEventListenerObject, opts?: boolean | AddEventListenerOptions) {
          if (type !== 'snapshot' && type !== 'alerts') return super.addEventListener(type, listener, opts);
          const call = (ev: Event) => (typeof listener === 'function' ? listener(ev) : listener.handleEvent(ev));
          super.addEventListener(
            type,
            (ev: Event) => {
              const d = JSON.parse((ev as MessageEvent).data);
              if (type === 'alerts') d.active += extra;
              else if (d.alerts) d.alerts.active += extra;
              call(new MessageEvent(type, { data: JSON.stringify(d) }));
            },
            opts
          );
        }
      }
      window.EventSource = Counted;
    }, EXTRA.length);
    // A cold load: the data arrives after the first paint, as on a real visit.
    await page.route('**/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      // The duty answers well after the cards are drawn (it reads the recorder).
      await new Promise((r) => setTimeout(r, path === '/api/rooms/duty' ? 700 : 150));
      if (path !== '/api/alerts') return route.continue();
      const res = await route.fetch();
      await route.fulfill({ response: res, json: [...(await res.json()), ...EXTRA] });
    });
  });

  for (const path of ['/energy', '/home']) {
    for (const width of [320, 390, 1440]) {
      test(`${path} with alerts at ${width} px has no layout shift (CLS < 0.05)`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        await settled(page);
        await page.waitForTimeout(800);
        // The alerts are really there (the real one, and the two more).
        const where = path === '/home' ? page.locator('#alerts') : page.locator('main');
        await expect(where.getByText(/prix changent|consentement Enedis/).first()).toBeVisible();
        expect(await shifts(page), `${path} at ${width} px`).toBeLessThan(0.05);
      });
    }
  }

  test('/ cards keep their height when the duty line arrives, at 320 px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    // Late evening: no next change to announce, so the duty is all the foot says (the worst case).
    const late = new Date();
    late.setHours(23, 40, 0, 0);
    await page.clock.install({ time: late });
    // The duty answer is held until the cards are drawn, then released.
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    await page.route('**/api/rooms/duty', async (route) => {
      await gate;
      await route.continue();
    });
    await page.goto('/');
    await page.clock.resume();
    const cards = page.locator('article.card');
    await expect(cards.first()).toBeVisible();
    await page.waitForTimeout(800);
    const heights = () => cards.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
    const before = await heights();
    await expect(page.getByText(/chauffe \d+\s?% sur 24/)).toHaveCount(0);
    release();
    await expect(page.getByText(/chauffe \d+\s?% sur 24/).first()).toBeVisible();
    await page.waitForTimeout(800);
    expect(await heights(), 'card heights before and after the duty').toEqual(before);
    expect(await shifts(page), '/ at 320 px').toBeLessThan(0.05);
  });
});

// The device screen with every disclosure open (details, long Cozytouch state names), in both
// languages and both themes: the longest it gets.
test.describe('layout of /home/devices fully open', () => {
  test.skip(({ isMobile }) => isMobile, 'runs once, at explicit widths');
  for (const lang of ['fr', 'en'])
    for (const theme of ['light', 'dark'])
      test(`${lang}, ${theme}: never scrolls sideways from 320 to 1440 px`, async ({ page }) => {
        await page.addInitScript(
          ([l, t]) => {
            localStorage.setItem('kelvin-locale', l);
            localStorage.setItem('kelvin-theme', t);
          },
          [lang, theme]
        );
        await page.goto('/home/devices');
        await settled(page);
        await page.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = true)));
        for (const width of WIDTHS) {
          await page.setViewportSize({ width, height: 900 });
          await page.waitForTimeout(100);
          expect(await overflow(page), `/home/devices open (${lang}, ${theme}) at ${width} px`).toBeLessThanOrEqual(0);
        }
      });
});

// The same guards with the English copy (Plan 7): English labels are often longer or shorter.
test.describe('layout in English', () => {
  test.skip(({ isMobile }) => isMobile, 'runs once, at explicit widths');
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('kelvin-locale', 'en'));
  });

  for (const path of ROUTES) {
    test(`layout in English never scrolls sideways: ${path}`, async ({ page }) => {
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        await settled(page);
        expect(await overflow(page), `${path} at ${width} px`).toBeLessThanOrEqual(0);
      }
    });
  }

  test('layout in English never scrolls sideways: /schedule with three periods on a day', async ({ page }) => {
    page.on('dialog', (d) => d.accept());
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto('/schedule?day=monday');
    await settled(page);
    const add = page.locator('button.add').first();
    for (let i = 0; i < 3; i++) await add.evaluate((b: HTMLButtonElement) => b.click());
    await expect(add).toHaveAttribute('aria-disabled', 'true');
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(100);
      expect(await overflow(page), `/schedule (3 periods) at ${width} px`).toBeLessThanOrEqual(0);
    }
  });

  test('layout in English never scrolls sideways: /login', async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] }, locale: 'fr-FR' });
    await context.addInitScript(() => localStorage.setItem('kelvin-locale', 'en'));
    const page = await context.newPage();
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/login');
      await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
      await expect(page.getByRole('combobox', { name: 'Server' }).or(page.getByText(/^Server: /))).toBeVisible();
      expect(await overflow(page), `/login at ${width} px`).toBeLessThanOrEqual(0);
    }
    await context.close();
  });
});
