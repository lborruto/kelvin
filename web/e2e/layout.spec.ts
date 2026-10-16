import { expect, test, type Page } from '@playwright/test';

// Layout guards, run once (desktop project; widths are set per check).
const WIDTHS = [320, 360, 390, 768, 1024, 1280, 1440];
const ROUTES = ['/', '/rooms/p-salon', '/schedule', '/energy', '/home', '/home/devices'];
// Maison sub-pages (UX batches 8–10).
ROUTES.push('/home/tariff', '/home/linky', '/home/sources', '/home/account');

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

  // CI has only the fallback fonts: the page must not shift when Geist never arrives either.
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

  for (const path of ['/', '/energy', '/home']) {
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
});

// Maison: tiles, the offline room and the header keep their place while the data and the fonts arrive, in
// both languages, whether the web font loads, loads late (wider than the fallback for a moment) or never
// loads (CI). Everything below the header arrives in one frame (house, alerts, the energy answers).
test.describe('Maison without layout shift', () => {
  test.skip(({ isMobile }) => isMobile, 'runs once, at explicit widths');
  for (const lang of ['fr', 'en'])
    for (const fonts of ['web fonts', 'late web fonts', 'fallback fonts only'])
      test(`/ at 320, 390 and 1440 px (${lang}, ${fonts}): CLS < 0.05`, async ({ page }) => {
        await countShifts(page);
        await page.addInitScript((l) => localStorage.setItem('kelvin-locale', l), lang);
        if (fonts === 'fallback fonts only') await page.route('**/*.woff2', (route) => route.abort());
        if (fonts === 'late web fonts')
          await page.route('**/*.woff2', async (route) => {
            await new Promise((r) => setTimeout(r, 400));
            await route.continue();
          });
        for (const width of [320, 390, 1440]) {
          await page.setViewportSize({ width, height: 900 });
          await page.route('**/api/**', async (route) => {
            await new Promise((r) => setTimeout(r, 150));
            await route.continue();
          });
          await page.goto('/');
          await settled(page);
          await page.waitForTimeout(900);
          await expect(page.locator('article.rt.offline')).toHaveCount(1);
          expect(await shifts(page), `/ at ${width} px (${lang}, ${fonts})`).toBeLessThan(0.05);
          expect(await overflow(page), `/ at ${width} px (${lang})`).toBeLessThanOrEqual(0);
          await page.unroute('**/api/**');
        }
      });

  test('desktop room sheet: scrolled to its end, the large setpoint stays in view; nothing shifts', async ({ page }) => {
    await countShifts(page);
    await page.setViewportSize({ width: 1280, height: 700 });
    await page.goto('/rooms/p-salon');
    await settled(page);
    const sheet = page.getByRole('dialog', { name: 'Salon' });
    const figure = sheet.locator('.primary output');
    await expect(figure).toBeInViewport();
    await sheet.locator('.content').evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await expect(sheet.getByRole('heading', { name: /^Radiateurs · / })).toBeInViewport();
    await expect(figure).toBeInViewport();
    expect(await shifts(page), '/rooms/p-salon scrolled').toBeLessThan(0.05);
  });

  test('/ room tiles have one height per width whatever their state', async ({ page }) => {
    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await settled(page);
      const heights = await page.locator('article.rt:not(.offline)').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
      expect(new Set(heights).size, `online tiles at ${width} px: ${heights}`).toBe(1);
    }
  });
});

// Maison's grid signals (the Réseau chip, Maintenant, Demain) arrive with the stream's snapshot and the
// tariff: the tableau is drawn once they are in, so nothing moves when they land — under the HC/HP demo
// (an EcoWatt signal) and under Tempo (the day's colour as well), fonts loaded, blocked or late, fr and en.
// The phone header's actions stay on one row whatever the font (HouseActions `menu`: fixed 44 px icon buttons).
test.describe('layout of / with the grid signals', () => {
  test.skip(({ isMobile }) => isMobile, 'runs once, at explicit widths');
  test.describe.configure({ mode: 'serial' });
  const H = { 'X-Kelvin': '1' };
  const TEMPO = { blue_hc: 0.1296, blue_hp: 0.1609, white_hc: 0.1486, white_hp: 0.1894, red_hc: 0.1568, red_hp: 0.7562 };
  const daysAgo = (n: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date(Date.now() - n * 86_400_000));
  type Row = { valid_from: string; option: string; subscription_eur_month: number; rates: Record<string, number> };
  type View = { kva: number; prices: Row[]; hc_schedules: unknown[]; tempo_hours: { hc_start: string; hc_end: string } };
  const doc = (t: View, prices: Row[]) => ({
    kva: t.kva,
    prices: prices.map((p) => ({ valid_from: p.valid_from, option: p.option, subscription_eur_month: p.subscription_eur_month, rates: p.rates })),
    hc_schedules: t.hc_schedules,
    tempo_hours: { hc_start: t.tempo_hours.hc_start, hc_end: t.tempo_hours.hc_end }
  });
  let original: View | null = null;

  test.beforeAll(async ({ request }) => {
    original = (await (await request.get('/api/settings')).json()).tariff as View;
  });
  test.afterAll(async ({ request }) => {
    if (original) await request.put('/api/settings', { headers: H, data: { tariff: doc(original, original.prices) } });
  });

  for (const tariff of ['hchp', 'tempo'] as const) {
    test(`/ under ${tariff} loads without layout shift at 320, 390 and 1440 px (CLS < 0.05)`, async ({ page, request }) => {
      // 18 cold loads, each waiting for the house, the alerts and Maison's energy answers (the month report).
      test.setTimeout(240_000);
      if (tariff === 'tempo' && original) {
        const older = original.prices.filter((p) => p.valid_from < daysAgo(30));
        const row = { valid_from: daysAgo(30), option: 'tempo', subscription_eur_month: 15, rates: TEMPO };
        const r = await request.put('/api/settings', { headers: H, data: { tariff: doc(original, [...older, row]) } });
        expect(r.ok(), await r.text()).toBe(true);
        await expect.poll(async () => (await (await request.get('/api/grid')).json()).tempo?.today?.colour ?? null).not.toBeNull();
      }
      await countShifts(page);
      for (const lang of ['fr', 'en'])
        for (const fonts of ['loaded', 'blocked', 'late'])
          for (const width of [320, 390, 1440]) {
            await page.unrouteAll({ behavior: 'ignoreErrors' });
            await page.addInitScript((l) => localStorage.setItem('kelvin-locale', l), lang);
            await page.setViewportSize({ width, height: 900 });
            if (fonts === 'blocked') await page.route(/\.woff2?(\?.*)?$/, (route) => route.abort());
            // The web font lands after the first paint (a slow network): text swaps from the fallback.
            if (fonts === 'late')
              await page.route(/\.woff2?(\?.*)?$/, async (route) => {
                await new Promise((r) => setTimeout(r, 400));
                await route.continue();
              });
            // A cold load: the data arrives after the first paint, as on a real visit.
            await page.route('**/api/**', async (route) => {
              await new Promise((r) => setTimeout(r, 150));
              await route.continue();
            });
            await page.goto('/');
            await settled(page);
            await expect(page.locator('.chips')).toBeVisible();
            if (tariff === 'tempo') await expect(page.locator('main .dot').first()).toBeAttached(); // the TempoDot of « Maintenant »
            await page.waitForTimeout(800);
            expect.soft(await shifts(page), `/ (${tariff}, ${lang}, fonts ${fonts}) at ${width} px`).toBeLessThan(0.05);
          }
      await page.unrouteAll({ behavior: 'ignoreErrors' });
    });
  }
});

// /home/devices depends on two answers: the setup and /auth/me (the server decides the setup
// actions). It renders once with both, whichever lands last and whenever the web font arrives
// (CI 2026-10-15: the actions arrived after the rooms, 0.064 at 1280 px).
test('/home/devices renders once: late /auth/me and late font (CLS < 0.05)', async ({ page, isMobile }) => {
  test.skip(isMobile, 'runs once, at explicit widths');
  await countShifts(page);
  for (const fonts of ['loaded', 'late'])
    for (const width of [390, 1280]) {
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await page.setViewportSize({ width, height: 900 });
      if (fonts === 'late')
        await page.route(/\.woff2?(\?.*)?$/, async (route) => {
          await new Promise((r) => setTimeout(r, 400));
          await route.continue();
        });
      await page.route('**/api/**', async (route) => {
        const late = route.request().url().includes('/api/auth/me');
        await new Promise((r) => setTimeout(r, late ? 400 : 150));
        await route.continue();
      });
      await page.goto('/home/devices');
      await settled(page);
      await page.waitForTimeout(800);
      expect.soft(await shifts(page), `/home/devices (fonts ${fonts}) at ${width} px`).toBeLessThan(0.05);
    }
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

// The device screen with every disclosure open (details, long Cozytouch state names), in both
// languages: the longest it gets.
test.describe('layout of /home/devices fully open', () => {
  test.skip(({ isMobile }) => isMobile, 'runs once, at explicit widths');
  for (const lang of ['fr', 'en'])
      test(`${lang}: never scrolls sideways from 320 to 1440 px`, async ({ page }) => {
        await page.addInitScript((l) => localStorage.setItem('kelvin-locale', l), lang);
        await page.goto('/home/devices');
        await settled(page);
        await page.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = true)));
        for (const width of WIDTHS) {
          await page.setViewportSize({ width, height: 900 });
          await page.waitForTimeout(100);
          expect(await overflow(page), `/home/devices open (${lang}) at ${width} px`).toBeLessThanOrEqual(0);
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

// Énergie (UX batches 6–7): the CLS matrix over its four views (a cold load in Mois, then each view switch) at every
// width and font mode, and no sideways scroll with its sheets, menus and disclosures open.
test.describe('Énergie layout matrix', () => {
  test.skip(({ isMobile }) => isMobile, 'explicit widths');
  test.use({ serviceWorkers: 'block' });
  const VIEWS = ['Jour', 'Semaine', 'Année'];

  for (const fonts of ['normal', 'blocked', 'late'] as const) {
    test(`/energy · Jour, Semaine, Mois, Année · fonts ${fonts} · CLS < 0.05 from 320 to 1440 px`, async ({ page }) => {
      test.setTimeout(240_000);
      const { measureCls, CLS_WIDTHS } = await import('./cls');
      for (const width of CLS_WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        const cls = await measureCls(page, '/energy', { fonts });
        expect(cls, `/energy Mois at ${width} px, fonts ${fonts}`).toBeLessThan(0.05);
        // Each view after the first: the data arrives 150 ms late, as on a real visit (shifts within 500 ms of the
        // click are input-driven by definition, but the panels must not keep moving after).
        await page.route('**/api/**', async (r) => {
          await new Promise((ok) => setTimeout(ok, 150));
          await r.continue().catch(() => {});
        });
        for (const view of VIEWS) {
          await page.evaluate(() => ((window as unknown as { __cls: number }).__cls = 0));
          await page.getByRole('radio', { name: view, exact: true }).click();
          await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), null, { timeout: 15_000 });
          await page.waitForTimeout(1200);
          const v = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
          expect(v, `/energy ${view} at ${width} px, fonts ${fonts}`).toBeLessThan(0.05);
        }
        await page.unrouteAll({ behavior: 'ignoreErrors' });
      }
    });
  }
  test('/energy never scrolls sideways, fr and en, in every view and with its Fiche, menu and disclosures open', async ({ browser }) => {
    test.setTimeout(240_000);
    for (const locale of ['fr-FR', 'en-GB']) {
      const ctx = await browser.newContext({ storageState: 'e2e/.auth/state.json', locale });
      const page = await ctx.newPage();
      const en = locale === 'en-GB';
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto('/energy');
        await settled(page);
        for (const view of en ? ['Day', 'Week', 'Month', 'Year'] : ['Jour', 'Semaine', 'Mois', 'Année']) {
          await page.getByRole('radio', { name: view, exact: true }).click();
          await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), null, { timeout: 15_000 });
          expect(await overflow(page), `/energy ${view} at ${width} px (${locale})`).toBeLessThanOrEqual(0);
        }
        // The full rooms section (« Tout voir › »), then every disclosure open (the rooms, Analyse « Détails », Qualité).
        await page.locator('.w-where a').click();
        await page.evaluate(() => document.querySelectorAll<HTMLButtonElement>('main button[aria-expanded="false"][aria-controls]').forEach((b) => b.click()));
        await page.waitForTimeout(400);
        expect(await overflow(page), `/energy disclosures open at ${width} px (${locale})`).toBeLessThanOrEqual(0);
        await page.locator('.hero .fig').first().click();
        await page.waitForTimeout(300);
        expect(await overflow(page), `/energy hero Fiche at ${width} px (${locale})`).toBeLessThanOrEqual(0);
        await page.keyboard.press('Escape');
        await page.locator('.export button[aria-haspopup="menu"]').filter({ visible: true }).first().click();
        await page.waitForTimeout(300);
        expect(await overflow(page), `/energy export menu at ${width} px (${locale})`).toBeLessThanOrEqual(0);
        await page.keyboard.press('Escape');
      }
      await ctx.close();
    }
  });
});

// The Absence sheet (UX batch 8) open over Pièces and Maison, fr and en: never sideways.
test.describe('layout with the Absence sheet open', () => {
  test.skip(({ isMobile }) => isMobile, 'runs once, at explicit widths');
  for (const lang of ['fr', 'en'])
      test(`${lang}: never scrolls sideways from 320 to 1440 px`, async ({ page }) => {
        await page.addInitScript((l) => localStorage.setItem('kelvin-locale', l), lang);
        for (const width of WIDTHS) {
          await page.setViewportSize({ width, height: 900 });
          await page.goto('/home#away');
          await expect(page.getByRole('dialog')).toBeVisible();
          // The precise date field is the widest content.
          await page.getByRole('dialog').getByRole('button', { name: /^(Date précise…|Pick a date…)$/ }).click();
          await page.waitForTimeout(250);
          expect(await overflow(page), `/home with the sheet (${lang}) at ${width} px`).toBeLessThanOrEqual(0);
        }
      });
});

// Pièces et appareils (UX batch 10): a « ⋯ » menu open (a sheet on a phone, a popover on desktop) never widens the page.
test.describe('layout of /home/devices with a menu open', () => {
  test.skip(({ isMobile }) => isMobile, 'runs once, at explicit widths');
  for (const lang of ['fr', 'en'])
    test(`${lang}: never scrolls sideways from 320 to 1440 px`, async ({ page }) => {
      await page.addInitScript((l) => localStorage.setItem('kelvin-locale', l), lang);
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto('/home/devices');
        await settled(page);
        await page.getByRole('button', { name: /^(Actions pour|Actions for) .+\(/ }).first().click();
        await expect(page.getByRole('menuitem').first()).toBeVisible();
        expect(await overflow(page), `/home/devices menu (${lang}) at ${width} px`).toBeLessThanOrEqual(0);
      }
    });
});
