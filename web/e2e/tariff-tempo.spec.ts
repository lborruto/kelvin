import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

const H = { 'X-Kelvin': '1' };
const strip = (page: Page) => page.getByRole('region', { name: 'Signaux du réseau électrique' });
const daysAgo = (n: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date(Date.now() - n * 86_400_000));

interface TariffView {
  kva: number;
  prices: { valid_from: string; option: string; subscription_eur_month: number; rates: Record<string, number> }[];
  hc_schedules: unknown[];
  tempo_hours: { hc_start: string; hc_end: string };
}
const asDoc = (t: TariffView, prices: TariffView['prices']) => ({
  kva: t.kva,
  prices: prices.map((p) => ({ valid_from: p.valid_from, option: p.option, subscription_eur_month: p.subscription_eur_month, rates: p.rates })),
  hc_schedules: t.hc_schedules,
  tempo_hours: { hc_start: t.tempo_hours.hc_start, hc_end: t.tempo_hours.hc_end }
});

let original: unknown = null;

test.beforeAll(async ({ request }) => {
  original = (await (await request.get('/api/settings')).json()).tariff;
});

test.afterAll(async ({ request }) => {
  if (original) {
    const t = original as { kva: number; prices: { valid_from: string; option: string; subscription_eur_month: number; rates: Record<string, number> }[]; hc_schedules: unknown[]; tempo_hours: { hc_start: string; hc_end: string } };
    await request.put('/api/settings', {
      headers: H,
      data: {
        tariff: {
          kva: t.kva,
          prices: t.prices.map((p) => ({ valid_from: p.valid_from, option: p.option, subscription_eur_month: p.subscription_eur_month, rates: p.rates })),
          hc_schedules: t.hc_schedules,
          tempo_hours: { hc_start: t.tempo_hours.hc_start, hc_end: t.tempo_hours.hc_end }
        }
      }
    });
  }
});

/** Maison › Tarif shows the tariff in force; « Nouveau prix… » opens the editor (no tariff yet: the editor is the page). */
async function openTariffEditor(page: Page) {
  const fresh = page.getByRole('button', { name: 'Nouveau prix…' });
  await expect(fresh.or(page.getByRole('button', { name: 'Enregistrer le tarif' }))).toBeVisible();
  if (await fresh.isVisible()) await fresh.click();
}

test('an HC/HP home sees EcoWatt and no Tempo colour', async ({ page }) => {
  await page.goto('/');
  await expect(strip(page)).toContainText('EcoWatt orange demain');
  await expect(strip(page)).not.toContainText(/Bleu|Blanc|Rouge|Tempo/);
  await expect(strip(page)).toContainText('RTE via MyElectricalData');
  await page.goto('/energy');
  await expect(strip(page)).toContainText('EcoWatt orange demain');
  await page.goto('/home');
  await expect(page.getByText(/EcoWatt orange le .*système électrique tendu/)).toBeVisible();
  await page.goto('/home/sources');
  await expect(page.getByText(/^(RTE EcoWatt|EcoWatt \(RTE\))$/).first()).toBeVisible();
  await expect(page.getByText(/^Tempo( \(RTE\))?$/)).toHaveCount(0);
});

test('switching to Tempo: six prices prefilled with their source, then the day colours everywhere', async ({ page, request }) => {
  // Another spec may have saved an HC/HP row dated today, which would outrank a Tempo row of 30 days ago:
  // start from the rows older than that.
  const t = (await (await request.get('/api/settings')).json()).tariff as TariffView;
  await request.put('/api/settings', {
    headers: H,
    data: { tariff: asDoc(t, t.prices.filter((p) => p.valid_from < daysAgo(30))) }
  });
  await page.goto('/home/tariff');
  const form = page.locator('main');
  await openTariffEditor(page);
  await form.getByRole('radio', { name: 'Tempo' }).click();
  await form.getByRole('button', { name: 'Préremplir avec les prix Tempo publiés' }).click();
  await expect(form.getByText(/relevés via MyElectricalData le/)).toBeVisible();
  await expect(form.getByLabel('Rouge HP (€/kWh)')).not.toHaveValue('');
  await form.getByLabel('Applicable à partir du', { exact: true }).fill(daysAgo(30));
  await form.getByRole('button', { name: 'Enregistrer le tarif' }).click();
  await expect(form.getByText('Tarif enregistré.')).toBeVisible();
  // The history is a table from 600 px and a list below: whichever is shown names the Tempo row.
  await expect(form.locator('td, dd').filter({ hasText: /^Tempo$/ }).locator('visible=true').first()).toBeVisible();

  await page.goto('/');
  await expect(strip(page)).toContainText(/Aujourd’hui : (Bleu|Blanc|Rouge)/);
  await expect(strip(page)).toContainText(/Demain : (Bleu|Blanc|Rouge|couleur pas encore publiée \(vers 11:00\))/);
  await expect(strip(page).locator('.dot').first()).toBeVisible();
  await page.goto('/energy');
  await expect(page.getByText(/Jours rouges : \d+/)).toBeVisible();
  await expect(page.getByRole('table', { name: 'Énergie par couleur Tempo' })).toBeVisible();
});

test('seasonal off-peak hours: a month left out is named and nothing is sent', async ({ page }) => {
  await page.goto('/home/tariff');
  const form = page.locator('main');
  await openTariffEditor(page);
  await form.getByRole('radio', { name: 'HC/HP' }).click();
  await form.getByLabel('Prix heures creuses (€/kWh)').fill('0,2068'); // the Tempo row in force has no HC/HP prices
  await form.getByLabel('Prix heures pleines (€/kWh)').fill('0,27');
  await form.getByLabel('Heures creuses différentes selon la saison').check();
  const seasons = form.getByRole('group', { name: 'Mois' });
  await expect(seasons).toHaveCount(2);
  let puts = 0;
  page.on('request', (r) => {
    if (r.method() === 'PUT' && r.url().endsWith('/api/settings')) puts++;
  });
  await seasons.nth(1).getByText(/avr/).click();
  await form.getByRole('button', { name: 'Enregistrer le tarif' }).click();
  await expect(form.getByRole('alert')).toHaveText('Chaque mois doit avoir ses heures creuses : avril.');
  expect(puts).toBe(0);
});

test('phone and desktop widths never scroll sideways with the Tempo form open', async ({ page }) => {
  for (const width of [320, 390, 1024]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/home/tariff');
    await openTariffEditor(page);
    await page.locator('main').getByRole('radio', { name: 'Tempo' }).click();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `width ${width}`).toBeLessThanOrEqual(0);
    await page.goto('/');
    const overflowRooms = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflowRooms, `rooms at ${width}`).toBeLessThanOrEqual(0);
  }
});

test('in English', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('kelvin-locale', 'en'));
  await page.goto('/');
  const s = page.getByRole('region', { name: 'Power grid signals' });
  await expect(s).toContainText(/Today: (Blue|White|Red)/);
  await expect(s).toContainText('EcoWatt orange tomorrow');
});
