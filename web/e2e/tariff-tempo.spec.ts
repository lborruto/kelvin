import { expect, test, type Page } from '@playwright/test';
import { addDays, parisAt, parisDay } from './clock';

test.describe.configure({ mode: 'serial' });

const H = { 'X-Kelvin': '1' };
// Maison says the grid signals in its Réseau chip, « Demain » and the « Maintenant » card (Tempo only when Tempo is in force).
const chips = (page: Page) => page.getByRole('group', { name: 'Résumés' });
const daysAgo = (n: number) => addDays(parisDay(Date.now()), -n);

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

/** Réglages › Tarif shows the tariff in force; « Nouveau prix… » opens the editor (no tariff yet: the editor is the page). */
async function openTariffEditor(page: Page) {
  const fresh = page.getByRole('button', { name: 'Nouveau prix…' });
  await expect(fresh.or(page.getByRole('button', { name: 'Enregistrer le tarif' }))).toBeVisible();
  if (await fresh.isVisible()) await fresh.click();
}

test('an HC/HP home sees EcoWatt and no Tempo colour', async ({ page }) => {
  // The simulator's orange day is « tomorrow » when the backend fetched it: a suite crossing midnight reads it
  // « aujourd’hui » (rightly). The browser reads the day before it, at noon.
  const grid = (await (await page.request.get('/api/grid')).json()) as { ecowatt: { days: { date: string; level: number }[] } };
  const orange = grid.ecowatt.days.find((d) => d.level === 2)!.date;
  await page.clock.setFixedTime(parisAt(addDays(orange, -1), 12));
  await page.goto('/');
  await expect(chips(page)).toContainText('EcoWatt orange demain');
  await expect(page.getByRole('region', { name: 'Demain' })).toContainText('EcoWatt orange');
  await expect(page.getByRole('main')).not.toContainText(/Tempo|Bleu|Blanc|Rouge/);
  await page.goto('/energy');
  // Énergie says the grid signals as chips on its context row (GridChips), RTE's time in their Fiche.
  await expect(page.getByRole('list', { name: 'Signaux du réseau électrique' })).toContainText('EcoWatt orange demain');
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
  const now = page.getByRole('region', { name: 'Maintenant' });
  // Before 06:00 the Tempo day in force is yesterday's, whose colour is not known: said, never guessed.
  await expect(now).toContainText(/Jour Tempo (Bleu|Blanc|Rouge)|couleur du jour Tempo pas encore connue/);
  await expect(page.getByRole('region', { name: 'Demain' })).toContainText(/Tempo (Bleu|Blanc|Rouge|—)/);
  await expect(page.getByRole('region', { name: 'Demain' }).locator('.dot').first()).toBeVisible();
  await page.goto('/energy');
  // Tempo in force: the six colours take the split's place on the board (« Jours Tempo »), dots under the day bars.
  const tempo = page.getByRole('region', { name: 'Jours Tempo' });
  await expect(tempo.getByText(/Jours rouges\s:\s\d+/)).toBeVisible();
  await expect(tempo.getByRole('table', { name: 'Énergie par couleur Tempo' })).toBeVisible();
  await expect(page.locator('.bars-w .dots .dot').first()).toBeVisible();
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
    // Measure Maison once it has drawn (not mid-load), so the check means something.
    await expect(page.getByRole('heading', { name: 'Maison', level: 1 })).toBeVisible();
    const overflowRooms = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflowRooms, `rooms at ${width}`).toBeLessThanOrEqual(0);
  }
  // Leave Maison before teardown: its live stream and the loads it starts were still open when the context
  // closed, and on CI that teardown overran the test timeout (« Target page, context or browser has been closed »).
  await page.goto('about:blank');
});

test('in English', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('kelvin-locale', 'en'));
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Now' })).toContainText(/Tempo (Blue|White|Red) day|today’s Tempo colour isn’t known yet/);
  await expect(page.getByRole('group', { name: 'Summary' })).toContainText('EcoWatt orange tomorrow');
});
