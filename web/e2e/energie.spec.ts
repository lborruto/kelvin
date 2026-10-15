import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';

// Énergie end to end (spec §10.3): navigator, inspector by keyboard, scrubber, CSV content, phone widths.
// The simulator runs on the wall clock: every check holds at any hour and on any day of the month. A test that
// needs every bar to hold data opens the previous month, which is always complete.

const ENERGY_HEADER =
  'periode;debut;fin;maison_kwh;hc_kwh;hp_kwh;split_estime;radiateurs_kwh;radiateurs_interp;reste_kwh;energie_eur;abonnement_eur;total_eur;prix;jours_manquants;radiateurs_jusqu_au;radiateurs_couverture';
const CURVE_HEADER = 'debut;fin;minutes;wh;w_moyen;part_hc;couleur_tempo;prix;eur;radiateurs_wh';
const ISO_LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00[+-]\d{2}:\d{2}$/;
const SCRUB = 'Parcourir la courbe, demi-heure par demi-heure';

/** The page is in its loaded state: a title, no skeleton left, entrance motion done. */
async function settled(page: Page) {
  await expect(page.getByRole('heading', { level: 1, name: 'Énergie' })).toBeVisible();
  await page.waitForFunction(() => !document.querySelector('.skeleton') && !document.querySelector('[aria-busy="true"]'), null, {
    timeout: 15_000
  });
  // Let the entrance motion finish (bars grow in 360 ms).
  await page.waitForTimeout(500);
}
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
/** A figure as the page shows it: « 1 412,6 kWh » → « 1412.6 » (its own decimals, no grouping). */
function shown(s: string): string {
  return s.replace(/[^\d,−-]/g, '').replace('−', '-').replace(',', '.');
}
/** A CSV cell (decimal comma) rounded as the page rounds (Intl: a decimal tie rounds up), never by binary rounding. */
function rounded(cell: string, digits: number): string {
  const v = Number(cell.replace(',', '.'));
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false }).format(v);
}
const decimals = (s: string) => (s.includes('.') ? s.split('.')[1].length : 0);
/** « 2026-10-14 » → « 14 octobre 2026 », as the page's long dates. */
const longDate = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));
/** The previous month: complete in the simulator, every bar has data and every day is over. */
async function previousMonth(page: Page) {
  const label = page.locator('#period-label');
  const month = (await label.textContent())!;
  await page.getByRole('button', { name: 'Période précédente' }).click();
  await expect(label).not.toHaveText(month);
  await settled(page);
}
const houseBars = (page: Page) => page.getByRole('group', { name: /^Barres du graphique\s:\s/ });
/** An inspector row's shown value (its first text, without « est. » or a reason). */
const rowValue = (ins: Locator, label: string) =>
  ins.locator('.row', { has: ins.page().locator('dt', { hasText: new RegExp(`^${label}$`) }) }).locator('dd').evaluate((d) => d.firstChild?.textContent ?? '');
/** A downloaded CSV's rows, after its BOM; the file ends with CRLF. */
async function csvRows(page: Page, button: Locator): Promise<{ name: string; text: string; rows: string[] }> {
  const [dl] = await Promise.all([page.waitForEvent('download'), button.click()]);
  const text = readFileSync((await dl.path())!, 'utf8');
  expect(text.charCodeAt(0), 'UTF-8 BOM').toBe(0xfeff);
  expect(text.endsWith('\r\n')).toBe(true);
  expect(text.slice(1).replaceAll('\r\n', '')).not.toMatch(/[\r\n]/); // CRLF only
  return { name: dl.suggestedFilename(), text, rows: text.slice(1, -2).split('\r\n') };
}

test.describe('Énergie', () => {
  test('shows the bill estimate, HC/HP bars and the day curve from the simulator', async ({ page }) => {
    await page.goto('/energie');
    await expect(page.getByRole('heading', { name: 'Énergie', level: 1 })).toBeVisible();
    await expect(page.locator('#period-label')).toHaveText(/^\p{Lu}\p{Ll}+ \d{4}$/u); // « Octobre 2026 »
    await expect(page.locator('.hero .big')).toContainText('€');
    await expect(page.locator('.hero .tag')).toHaveText('estimation');
    const chart = page.getByRole('img', { name: 'Consommation de la maison par jour' });
    await expect(chart).toBeVisible();
    const heights = await chart.locator('rect.part').evaluateAll((els) => els.map((e) => Number(e.getAttribute('height'))));
    expect(heights.filter((h) => h > 0).length).toBeGreaterThan(0);
    await expect(page.getByRole('img', { name: /^Consommation par demi-heure le / })).toBeVisible();
    await page.getByRole('radio', { name: 'Mois' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('img', { name: 'Consommation de la maison par mois' })).toBeVisible();
    await expect(page.locator('#period-label')).toHaveText(/^\d{4}$/);
  });

  test('the navigator: views, ‹ and ›, the arrow keys and « Dernier jour »', async ({ page }) => {
    await page.goto('/energie');
    await settled(page);
    const label = page.locator('#period-label');
    await expect(label).toHaveText(/^\p{Lu}\p{Ll}+ \d{4}$/u);
    const month = (await label.textContent())!;
    const latest = page.getByRole('button', { name: 'Dernier jour' });
    await page.getByRole('button', { name: 'Période précédente' }).click();
    await expect(label).not.toHaveText(month);
    await expect(latest).toBeVisible();
    await latest.click();
    await expect(label).toHaveText(month);
    // The arrow keys step from any button of the row.
    await page.getByRole('button', { name: 'Période précédente' }).press('ArrowLeft');
    await expect(label).not.toHaveText(month);
    await page.getByRole('button', { name: 'Période précédente' }).press('ArrowRight');
    await expect(label).toHaveText(month);
    await expect(latest).toHaveCount(0);
    // The last period: › stays focusable, marked unavailable.
    const next = page.getByRole('button', { name: 'Période suivante' });
    await expect(next).toHaveAttribute('aria-disabled', 'true');
    await expect(next).not.toHaveAttribute('disabled'); // aria-disabled, never disabled
    await page.getByRole('radio', { name: 'Semaine' }).click();
    await expect(label).toHaveText(/^Semaine \d{1,2} · /);
    await page.getByRole('radio', { name: 'Jour', exact: true }).click();
    await expect(label).toHaveText(/^\p{Lu}\p{Ll}+ \d{1,2} \p{Ll}+ \d{4}$/u); // « Mardi 14 octobre 2026 »
    await expect(page.getByRole('heading', { name: 'Puissance' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Température et chauffe' })).toBeVisible();
    // Every period change is said once in the live region.
    await expect(page.locator('div.visually-hidden[role="status"][aria-live="polite"]')).toContainText(await label.textContent() as string);
  });

  test('the inspector by keyboard: arrows select and name the bar, Esc clears, Enter opens the Courbe', async ({ page }) => {
    await page.goto('/energie');
    await settled(page);
    await previousMonth(page);
    const keys = houseBars(page).getByRole('button');
    const n = await keys.count();
    expect(n, 'a month of day bars').toBeGreaterThanOrEqual(28);
    // The roving tab stop is the last bar.
    await page.locator('#period-label').click();
    await expect(keys.nth(n - 1)).toHaveAttribute('tabindex', '0');
    await keys.nth(n - 1).focus();
    await page.keyboard.press('ArrowLeft');
    const bar = keys.nth(n - 2);
    await expect(bar).toBeFocused();
    await expect(bar).toHaveAttribute('aria-pressed', 'true');
    // The focused bar's name carries its values (one channel: what a screen reader says on the move).
    await expect(bar).toHaveAttribute('aria-label', /^\d{1,2} \p{Ll}+, \d+,\d\d kilowattheures, \d+,\d\d euros$/u);
    const inspector = page.locator('.inspector').filter({ visible: true }).last();
    await expect(inspector).toBeVisible();
    await expect(inspector.locator('dt', { hasText: /^Maison$/ })).toHaveCount(1);
    await expect(inspector).toContainText(/\d,\d\d\skWh/);
    await expect(bar).toHaveAttribute('aria-controls', (await inspector.getAttribute('id'))!);
    const title = (await inspector.locator('.title').textContent())!; // « Mardi 29 septembre 2026 »
    expect((await bar.getAttribute('aria-label'))!.startsWith(title.replace(/^\p{L}+ /u, '').replace(/ \d{4}$/, '').toLowerCase())).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.locator('.inspector.card, .inspector.sheet').filter({ hasText: title })).toHaveCount(0);
    await expect(bar).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowLeft');
    await expect(bar).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#courbe-title')).toHaveText(`Courbe du ${title.replace(/^\p{L}+ /u, '')}`, { ignoreCase: true });
    await expect(page.locator('div.visually-hidden[role="status"][aria-live="polite"]')).toContainText(/^Courbe du /);
  });

  test('a click pins a bar and says it in the live region; the card’s « est. » link opens Qualité des données', async ({ page, isMobile }) => {
    test.skip(isMobile, 'pointer hover');
    await page.goto('/energie');
    await settled(page);
    await previousMonth(page);
    const keys = houseBars(page).getByRole('button');
    const b = (await keys.nth(3).boundingBox())!;
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
    const card = page.locator('.inspector.card.pinned');
    await expect(card).toBeVisible();
    await expect(page.locator('div.visually-hidden[role="status"][aria-live="polite"]')).toContainText(
      (await keys.nth(3).getAttribute('aria-label'))!
    );
    const quality = page.locator('details#qualite');
    await expect(quality).not.toHaveAttribute('open');
    // HC/HP of a day without a complete curve are estimates: some bar of the month carries « est. ». Else open it at #qualite.
    const link = card.getByRole('link', { name: 'Qualité des données' });
    if (await link.count()) {
      await link.click();
      await expect(quality).toHaveAttribute('open', '');
    }
    // A page reached at #qualite opens it too.
    await page.goto('/energie#qualite');
    await settled(page);
    await expect(quality).toHaveAttribute('open', '');
    await expect(quality.getByText(/^Linky depuis le /)).toBeVisible();
    await expect(quality.locator('.strip .row')).toHaveCount(3);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });

  test('the scrubber: arrows move by 30 minutes, PageUp by 3 hours, the readout and the crosshair follow', async ({ page }) => {
    await page.goto('/energie');
    await settled(page);
    const slider = page.locator('#courbe').getByRole('slider', { name: SCRUB });
    const when = page.locator('#courbe .readout .when dd');
    await expect(slider).toHaveAttribute('aria-valuetext', /./);
    await expect(page.locator('#courbe line.cross')).toHaveCount(0);
    await slider.focus();
    await page.keyboard.press('ArrowRight');
    await expect(when).toHaveText('00:00–00:30');
    await expect(slider).toHaveAttribute('aria-valuenow', '0');
    await expect(slider).toHaveAttribute('aria-valuetext', /^00:00–00:30, /);
    await expect(page.locator('#courbe .readout .field .v.cur .val').first()).toContainText(/k?W$/);
    await page.keyboard.press('PageUp');
    await expect(slider).toHaveAttribute('aria-valuenow', '6');
    const n = Number(await slider.getAttribute('aria-valuemax')) + 1;
    // On a 48-interval day, six half-hours on is 03:00; a DST day names its repeated or skipped hour instead.
    if (n === 48) await expect(when).toHaveText('03:00–03:30');
    // A DST day's label holds parentheses (« 02:00–02:30 (heure d’hiver) »): compared as text, never as a pattern.
    const label = (await when.textContent())!.trim();
    expect((await slider.getAttribute('aria-valuetext'))!.startsWith(`${label}, `)).toBe(true);
    await expect(page.locator('#courbe line.cross')).toHaveCount(1);
    await page.keyboard.press('End');
    await expect(slider).toHaveAttribute('aria-valuenow', String(n - 1));
    await page.keyboard.press('Escape');
    await expect(page.locator('#courbe line.cross')).toHaveCount(0);
  });

  test('phone: a tap on the curve shows that half-hour', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'touch only');
    await page.goto('/energie');
    await settled(page);
    const slider = page.locator('#courbe').getByRole('slider', { name: SCRUB });
    await slider.scrollIntoViewIfNeeded();
    const box = (await slider.boundingBox())!;
    await slider.tap({ position: { x: 2, y: box.height / 2 } });
    await expect(page.locator('#courbe .readout .when dd')).toHaveText('00:00–00:30');
    await slider.tap({ position: { x: box.width - 2, y: box.height / 2 } });
    await expect(slider).toHaveAttribute('aria-valuenow', await slider.getAttribute('aria-valuemax') as string);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });

  test('CSV: the period file is the hero’s period, the curve file is the Courbe’s day', async ({ page }) => {
    await page.goto('/energie');
    await settled(page);
    const period = await csvRows(page, page.getByRole('button', { name: 'Exporter la période (CSV)' }));
    expect(period.name).toMatch(/^energie_\d{4}-\d{2}-01_\d{4}-\d{2}-01_day\.csv$/);
    expect(period.text).not.toMatch(/\d{14}/); // no PDL
    expect(period.text).not.toContain('@'); // no email
    expect(period.rows[0]).toBe(ENERGY_HEADER);
    for (const l of period.rows.slice(1)) {
      const c = l.split(';');
      expect(c).toHaveLength(17);
      expect(c[1]).toMatch(ISO_LOCAL);
      expect(c[2]).toMatch(ISO_LOCAL);
      for (const v of [...c.slice(3, 6), ...c.slice(7, 8), ...c.slice(9, 13), c[16]]) expect(v).toMatch(/^(-?\d+,\d+)?$/); // decimal comma, no grouping
      expect(c[15]).toMatch(c[7] === '' ? /^$/ : /^\d{4}-\d{2}-\d{2}$/); // radiateurs_jusqu_au
    }
    const days = period.rows.slice(1, -1);
    expect(days.length).toBeGreaterThanOrEqual(28);
    const total = period.rows.at(-1)!.split(';');
    expect(total[0]).toBe('total');
    // The current month runs into today: its radiator sum counts up to yesterday and says so (R1), while `fin` is the
    // month's end.
    const todayIso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
    const yesterday = new Date(`${todayIso}T12:00:00Z`);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    if (total[7] !== '') expect(total[15]).toBe(yesterday.toISOString().slice(0, 10));
    // The file's total is the hero's figures, at the hero's precision: kWh, and € (the big figure and its breakdown).
    const kwh = shown((await page.locator('.hero .sub .figs').textContent())!.split(' · ')[0]);
    expect(rounded(total[3], decimals(kwh))).toBe(kwh);
    const big = shown((await page.locator('.hero .big').textContent())!);
    expect(rounded(total[12], decimals(big))).toBe(big);
    const breakdown = (await page.locator('.hero .breakdown').textContent())!.match(/\d[\d\s\u202f]*,\d\d/g)!.map(shown);
    expect([rounded(total[10], 2), rounded(total[11], 2)]).toEqual(breakdown);
    // A day not yet published reads empty, never 0.
    for (const l of days) if (l.split(';')[3] === '') expect(l.split(';')[12]).toBe('');

    const curveButton = page.getByRole('button', { name: /^Exporter la courbe du / });
    const day = (await page.locator('#courbe-title').textContent())!.replace(/^Courbe du /, '');
    const curve = await csvRows(page, curveButton);
    expect(curve.name).toMatch(/^courbe_\d{4}-\d{2}-\d{2}\.csv$/);
    expect(curve.rows[0]).toBe(CURVE_HEADER);
    const n = curve.rows.length - 1;
    expect([46, 48, 50]).toContain(n);
    await expect(page.locator('#courbe').getByRole('slider', { name: SCRUB })).toHaveAttribute('aria-valuemax', String(n - 1));
    for (const r of curve.rows.slice(1)) {
      const c = r.split(';');
      expect(c).toHaveLength(10);
      expect(c[0]).toMatch(ISO_LOCAL);
      expect(c[1]).toMatch(ISO_LOCAL);
      expect(c[6]).toBe(''); // couleur_tempo: until the Tempo option
    }
    expect(curve.rows[1].startsWith(`${curve.name.slice(7, 17)}T00:00:00+0`)).toBe(true);
    // The file is the Courbe's day.
    expect(day.toLowerCase()).toBe(longDate(curve.name.slice(7, 17)));
  });

  test('CSV: a day exports the € and kWh its bar shows, the same in the month and in Jour', async ({ page }) => {
    await page.goto('/energie');
    await settled(page);
    await previousMonth(page);
    const keys = houseBars(page).getByRole('button');
    await page.locator('#period-label').click();
    await keys.last().focus();
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight'); // the 3rd
    const inspector = page.locator('.inspector').filter({ visible: true }).last();
    await expect(inspector.locator('.title')).toHaveText(/^\p{L}+ 3 /u);
    const cost = shown(await rowValue(inspector, 'Coût estimé'));
    const kwh = shown(await rowValue(inspector, 'Maison'));
    const month = await csvRows(page, page.getByRole('button', { name: 'Exporter la période (CSV)' }));
    const key = month.name.slice(8, 15) + '-03';
    const row = month.rows.find((r) => r.startsWith(`${key};`))!;
    expect(rounded(row.split(';')[12], 2)).toBe(cost);
    expect(rounded(row.split(';')[3], 2)).toBe(kwh);
    // Enter on the bar opens that day's Courbe; Jour then shows that day: its file holds the same row.
    await keys.nth(2).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#courbe-title')).toHaveText(/^Courbe du 3 /);
    await page.getByRole('radio', { name: 'Jour', exact: true }).click();
    await settled(page);
    const one = await csvRows(page, page.getByRole('button', { name: 'Exporter la période (CSV)' }));
    expect(one.name).toBe(`energie_${key}_${one.name.slice(19, 29)}_day.csv`);
    expect(one.rows.find((r) => r.startsWith(`${key};`))).toBe(row);
    expect(one.rows.at(-1)!.split(';').slice(3)).toEqual(row.split(';').slice(3));
  });

  test('phone widths: the sheet opens under its chart without sideways scroll', async ({ page, isMobile }) => {
    test.skip(isMobile, 'runs once, at explicit widths');
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/energie');
      await settled(page);
      const plot = page.locator('.plot.interactive').first();
      await plot.scrollIntoViewIfNeeded();
      const box = (await plot.boundingBox())!;
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      const sheet = page.locator('.inspector.sheet');
      await expect(sheet).toBeVisible();
      await expect(page.locator('.inspector.card')).toHaveCount(0);
      const s = (await sheet.boundingBox())!;
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x + s.width).toBeLessThanOrEqual(width);
      expect(await overflow(page), `sheet at ${width} px`).toBeLessThanOrEqual(0);
      await page.getByRole('radio', { name: 'Semaine' }).click();
      await settled(page);
      expect(await overflow(page), `Semaine at ${width} px`).toBeLessThanOrEqual(0);
    }
  });

  test('bar sheet at 320 px: a tap docks the day under the chart, its action opens the Courbe, a second tap closes', async ({ page, isMobile }) => {
    test.skip(isMobile, 'explicit phone width on the desktop project');
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto('/energie');
    await settled(page);
    await previousMonth(page);
    const keys = page.locator('.plot.interactive button.key');
    const tapBar = async () => {
      // Measured each time: opening the Courbe scrolls the page.
      await keys.nth(1).scrollIntoViewIfNeeded();
      const b = (await keys.nth(1).boundingBox())!;
      await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
    };
    await tapBar();
    const sheet = page.locator('.inspector.sheet');
    await expect(sheet).toBeVisible();
    expect(await page.locator('.inspector.card').count()).toBe(0);
    const box = (await sheet.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    const action = sheet.getByRole('button', { name: /^Voir la courbe du / });
    const [d] = (await action.textContent())!.replace(/^Voir la courbe du /, '').split('/');
    await action.click();
    await expect(page.locator('#courbe-title')).toHaveText(new RegExp(`^Courbe du ${d} `));
    await expect(sheet).toBeVisible(); // the pin stays while its day's Courbe opens
    await tapBar();
    await expect(sheet).toBeHidden();
  });

  test('bar card: hover shows it inside the screen at both edges, flipped at the right; a pinned card’s action opens that day’s Courbe', async ({ page, isMobile }) => {
    test.skip(isMobile, 'explicit desktop widths');
    for (const width of [1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/energie');
      await settled(page);
      await previousMonth(page);
      const chart = page.getByRole('img', { name: 'Consommation de la maison par jour' });
      await expect(chart).toBeVisible();
      const keys = page.locator('.plot.interactive button.key');
      const n = await keys.count();
      expect(n, 'a month of day bars').toBeGreaterThanOrEqual(28);
      const centre = async (i: number) => {
        const b = (await keys.nth(i).boundingBox())!;
        return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
      };
      const plot = (await page.locator('.plot.interactive').first().boundingBox())!;
      const card = page.locator('.inspector.card');
      // Both edges: the card stays inside the chart, beside its bar (after it on the left, flipped before it on the right).
      for (const i of [0, n - 1]) {
        const c = await centre(i);
        await page.mouse.move(c.x, c.y);
        await expect(card).toBeVisible();
        const box = (await card.boundingBox())!;
        expect(box.x, `card left at bar ${i}, ${width} px`).toBeGreaterThanOrEqual(plot.x - 1);
        expect(box.x + box.width, `card right at bar ${i}, ${width} px`).toBeLessThanOrEqual(plot.x + plot.width + 1);
        if (i === 0) expect(box.x, 'after the first bar').toBeGreaterThan(c.x);
        else expect(box.x + box.width, 'flipped before the last bar').toBeLessThan(c.x);
      }
      // Off the chart, an unpinned card goes.
      await page.mouse.move(plot.x + plot.width / 2, plot.y - 40);
      await expect(card).toHaveCount(0);
      // Pin the third day, then travel to the card's action across its neighbours: the card stays on that day.
      const c = await centre(2);
      await page.mouse.move(c.x, c.y);
      await page.mouse.down();
      await page.mouse.up();
      await expect(card).toHaveClass(/pinned/);
      const title = (await card.locator('.title').textContent())!;
      const action = card.getByRole('button', { name: /^Voir la courbe du / });
      const label = (await action.textContent())!;
      const a = (await action.boundingBox())!;
      await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2, { steps: 12 });
      await expect(card.locator('.title')).toHaveText(title);
      await page.mouse.down();
      await page.mouse.up();
      const [d] = label.replace(/^Voir la courbe du /, '').split('/'); // « 3/10 »
      await expect(page.locator('#courbe-title')).toHaveText(new RegExp(`^Courbe du ${d} `));
      expect(await overflow(page)).toBeLessThanOrEqual(0);
    }
  });

  test('Par pièce: a full-width table on desktop in every view; focus follows a room toggle across the table/list switch', async ({ page, isMobile }) => {
    test.skip(isMobile, 'explicit desktop widths');
    const panel = page.locator('section.panel').filter({ has: page.getByRole('heading', { name: 'Par pièce et par radiateur' }) });
    for (const width of [1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/energie');
      for (const view of ['Jour', 'Semaine', 'Mois', 'Année']) {
        await page.getByRole('radio', { name: view, exact: true }).click();
        await expect(panel.locator('.table table')).toBeVisible();
        await expect(panel.locator('.list')).toBeHidden();
      }
    }
    // A room toggle keeps the focus when the panel narrows to the list (and back).
    const toggle = panel.locator('.table button[aria-expanded]').first();
    const room = await toggle.getAttribute('data-room');
    await toggle.focus();
    await page.setViewportSize({ width: 400, height: 900 });
    await expect(panel.locator('.list')).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => (document.activeElement?.closest('.list') ? document.activeElement.getAttribute('data-room') : null)))
      .toBe(room);
    await page.setViewportSize({ width: 1024, height: 900 });
    await expect
      .poll(() => page.evaluate(() => (document.activeElement?.closest('.table') ? document.activeElement.getAttribute('data-room') : null)))
      .toBe(room);
  });
});

test.describe('Énergie layout', () => {
  test.skip(({ isMobile }) => isMobile, 'runs once, at explicit widths');

  test('ends with its last panel: no empty tail', async ({ page }) => {
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/energie');
      await settled(page);
      const tail = await page.evaluate(() => {
        const panels = [...document.querySelectorAll('main .panel')];
        const bottom = Math.max(...panels.map((p) => p.getBoundingClientRect().bottom + scrollY));
        return document.scrollingElement!.scrollHeight - bottom;
      });
      // main's bottom padding (88 px + safe area on a phone, 24 px on desktop) and nothing more.
      expect(tail, `tail at ${width} px`).toBeLessThanOrEqual(width < 1024 ? 100 : 30);
    }
  });

  test('the Courbe readout keeps its height idle and while scrubbing every half-hour (R2)', async ({ page }) => {
    for (const width of [320, 390, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/energie');
      await settled(page);
      const readout = page.locator('#courbe .readout');
      // The day the page opens on has radiator data in the simulator: the radiator fields (and their reasons) are measured too.
      await expect(readout.locator('dt', { hasText: /^Radiateurs$/ })).toHaveCount(1);
      await expect(readout.locator('dt', { hasText: /^Reste$/ })).toHaveCount(1);
      const slider = page.locator('#courbe').getByRole('slider', { name: SCRUB });
      const idle = (await readout.boundingBox())!.height;
      const heights = new Set<number>();
      // Nothing is cut, at every half-hour: each field holds its texts (the shown one and the stacked hidden ones).
      const clipped = () =>
        readout.evaluate((el) =>
          [...el.querySelectorAll('dd, dd > .v')].filter((d) => d.scrollWidth > d.clientWidth + 0.5).map((d) => d.textContent)
        );
      await slider.focus();
      await page.keyboard.press('Home');
      const n = Number(await slider.getAttribute('aria-valuemax')) + 1;
      for (let i = 0; i < n; i++) {
        heights.add((await readout.boundingBox())!.height);
        expect(await clipped(), `clipped at ${width} px, half-hour ${i}`).toEqual([]);
        await page.keyboard.press('ArrowRight');
      }
      expect([...heights], `readout at ${width} px`).toEqual([idle]);
    }
  });

  test('Température et chauffe keeps its readout height while scrubbing, on the half-hour it shares with the Courbe', async ({ page }) => {
    for (const width of [320, 390, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/energie');
      await settled(page);
      await page.getByRole('radio', { name: 'Jour', exact: true }).click();
      const panel = page.locator('section.panel', { has: page.getByRole('heading', { name: 'Température et chauffe' }) });
      await expect(panel).toHaveAttribute('aria-busy', 'false');
      const body = panel.locator('.body');
      const readout = panel.locator('.readout');
      const slider = panel.getByRole('slider');
      const idle = (await readout.boundingBox())!.height;
      const tall = (await body.boundingBox())!.height;
      // The reserved height is the chart's own: the skeleton before it held the same place.
      expect(await body.evaluate((el) => parseFloat(getComputedStyle(el).minHeight)), `reserved at ${width} px`).toBeGreaterThanOrEqual(tall - 16);
      const heights = new Set<number>();
      await slider.focus();
      await page.keyboard.press('Home');
      const n = Number(await slider.getAttribute('aria-valuemax')) + 1;
      for (let i = 0; i < n; i += 3) {
        heights.add((await readout.boundingBox())!.height);
        for (let k = 0; k < 3; k++) await page.keyboard.press('ArrowRight');
      }
      expect([...heights], `room readout at ${width} px`).toEqual([idle]);
      // The Courbe shows the same half-hour.
      const when = (await panel.locator('.readout .when dd').textContent())!.trim();
      await expect(page.locator('#courbe .readout .when dd')).toHaveText(when);
    }
  });
});
