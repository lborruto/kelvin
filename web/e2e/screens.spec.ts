import { test } from '@playwright/test';
import { addDays, parisDay } from './clock';

// SCREENS_LOCALE=en captures the English UI (Plan 7); French is the default.
const locale = (process.env.SCREENS_LOCALE as 'fr' | 'en' | undefined) ?? 'fr';
test.beforeEach(async ({ page }) => {
  await page.addInitScript((l) => localStorage.setItem('kelvin-locale', l), locale);
});

test.skip(!process.env.SCREENS, 'set SCREENS=1 to capture finish-review screenshots');
// Simulator only (playwright.config.ts starts KELVIN_FAKE=1). SCREENS_DIR=../docs/screenshots
// renders the README screenshots; the default stays inside the gitignored test-results/.
const outDir = process.env.SCREENS_DIR ?? 'test-results/screens';

const PATHS = ['/', '/rooms/p-salon', '/rooms/p-ch2', '/schedule', '/energy', '/home', '/home/devices', '/home/tariff', '/home/linky'];
PATHS.push('/home/sources', '/home/account', '/login', '/no-such-page');
for (const path of PATHS) {
  test(`screen ${path}`, async ({ browser, page: loggedIn }, info) => {
    // /login sends a logged-in visitor away: capture it from a fresh, logged-out context.
    let page = loggedIn;
    if (path === '/login') {
      page = await (
        await browser.newContext({
          ...info.project.use,
          locale: 'fr-FR',
          storageState: { cookies: [], origins: [] }
        })
      ).newPage();
      await page.addInitScript((l) => localStorage.setItem('kelvin-locale', l), locale);
    }
    await page.goto(path);
    await page.getByRole('main').waitFor();
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(1200);
    const name = `${locale}_${info.project.name}${path === '/' ? '_rooms' : path.replaceAll('/', '_')}.png`;
    await page.screenshot({ path: `${outDir}/${name}`, fullPage: true });
  });
}

// Énergie's other views (Tableau board): Jour, Semaine, Année, and the hero Fiche.
test('screens of the Énergie views', async ({ page }, info) => {
  const names = locale === 'en' ? ['Day', 'Week', 'Year', 'Month'] : ['Jour', 'Semaine', 'Année', 'Mois'];
  await page.goto('/energy');
  await page.getByRole('main').waitFor();
  await page.waitForLoadState('networkidle').catch(() => {});
  for (const [i, tag] of ['day', 'week', 'year'].entries()) {
    await page.getByRole('radio', { name: names[i], exact: true }).click();
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${outDir}/${locale}_${info.project.name}_energy_${tag}.png`, fullPage: true });
  }
  await page.getByRole('radio', { name: names[3], exact: true }).click();
  await page.waitForTimeout(1200);
  await page.locator('.hero .fig').first().click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${outDir}/${locale}_${info.project.name}_energy_fiche.png` });
});

// One capture under a Tempo tariff (Plan 9): the strip's colours and the Tempo rows. The tariff is
// restored afterwards so the other captures keep the HC/HP demo.
test('screens under a Tempo tariff', async ({ page, request }, info) => {
  const H = { 'X-Kelvin': '1' };
  const before = (await (await request.get('/api/settings')).json()).tariff as {
    kva: number;
    prices: { valid_from: string; option: string; subscription_eur_month: number; rates: Record<string, number> }[];
    hc_schedules: unknown[];
    tempo_hours: { hc_start: string; hc_end: string };
  };
  const doc = (prices: unknown[]) => ({
    kva: before.kva,
    prices,
    hc_schedules: before.hc_schedules,
    tempo_hours: { hc_start: before.tempo_hours.hc_start, hc_end: before.tempo_hours.hc_end }
  });
  const from = addDays(parisDay(Date.now()), -30);
  const tempo = {
    valid_from: from,
    option: 'tempo',
    subscription_eur_month: 15,
    rates: { blue_hc: 0.1296, blue_hp: 0.1609, white_hc: 0.1486, white_hp: 0.1894, red_hc: 0.1568, red_hp: 0.7562 }
  };
  const all = before.prices.map((p) => ({ valid_from: p.valid_from, option: p.option, subscription_eur_month: p.subscription_eur_month, rates: p.rates }));
  const bare = all.filter((p) => p.valid_from < from); // a row dated later would outrank the Tempo row
  try {
    await request.put('/api/settings', { headers: H, data: { tariff: doc([...bare, tempo]) } });
    for (const [path, tag] of [['/', '_rooms_tempo'], ['/energy', '_energy_tempo']] as const) {
      await page.goto(path);
      await page.getByRole('main').waitFor();
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${outDir}/${locale}_${info.project.name}${tag}.png`, fullPage: true });
    }
  } finally {
    await request.put('/api/settings', { headers: H, data: { tariff: doc(all) } });
  }
});
