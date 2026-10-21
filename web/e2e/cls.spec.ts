import { expect, test } from '@playwright/test';
import { CLS_WIDTHS, clsWidths, FONT_MODES, measureCls } from './cls';

// The CLS matrix (direction-2 §10): each route × 3 font modes (6 widths with fonts blocked, 320/390/1440 with
// fonts normal or late: `clsWidths`) stays under 0.05. Later batches
// add their routes here (and run their own interactions through measureCls).
const ROUTES = ['/', '/schedule', '/energy', '/home'];
// Maison sub-pages (UX batches 8–10).
ROUTES.push('/home/tariff', '/home/linky', '/home/sources', '/home/weather', '/home/account', '/home/devices');
// UX batch 13: the phone room page and the 404 (/login has its own matrix in login.spec.ts).
ROUTES.push('/rooms/p-salon', '/no-such-page');
// Programme (Tableau): the day view (a phone width) beside the agenda, and an offline room's read-only agenda.
ROUTES.push('/schedule?room=p-ch1&day=tuesday', '/schedule?room=p-ch2');
// Tableau: the room sheet of an offline room (notice, ghost day) over the tableau.
ROUTES.push('/rooms/p-ch2');
// Plan 15 « Météo et coût » with the demo place: Maison's « Demain » (phone Bill + Demain 164 px, desktop Demain +
// Hier 134 px), the room sheet's « Froid » row (skeleton 136 px) and Énergie scrolled to the panel.
ROUTES.push('/energy#weather-cost');

test.describe('CLS matrix', () => {
  test.skip(({ isMobile }) => isMobile, 'explicit widths');
  test.use({ serviceWorkers: 'block' });

  for (const route of ROUTES) {
    for (const fonts of FONT_MODES) {
      test(`${route} · fonts ${fonts} · CLS < 0.05 from 320 to 1440 px`, async ({ page }) => {
        test.setTimeout(150_000);
        for (const width of clsWidths(fonts)) {
          await page.setViewportSize({ width, height: 900 });
          const cls = await measureCls(page, route, { fonts });
          expect(cls, `${route} at ${width} px, fonts ${fonts}`).toBeLessThan(0.05);
        }
      });
    }
  }
});

// « Détails techniques » on (direction-2 §1.3): the preference is applied before first paint, so the
// opened disclosures, the live power and the radiator rows' inline facts never shift the page.
test.describe('CLS with technical details on', () => {
  test.skip(({ isMobile }) => isMobile, 'explicit widths');
  test.use({ serviceWorkers: 'block' });
  for (const route of ['/', '/rooms/p-salon', '/energy', '/home/tariff', '/home/devices']) {
    test(`${route} · details on · CLS < 0.05 from 320 to 1440 px`, async ({ page }) => {
      test.setTimeout(150_000);
      await page.addInitScript(() => localStorage.setItem('kelvin-detail', 'on'));
      for (const width of CLS_WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        const cls = await measureCls(page, route, { fonts: 'blocked' });
        expect(cls, `${route} at ${width} px, details on`).toBeLessThan(0.05);
      }
    });
  }
});

// An alert the server raises just after Maison's first frame (CI, 2026-10-17: the simulator raised its EcoWatt alert
// one evaluation after the offline radiator's, 1 s apart; the page had drawn one row, the second pushed the rooms
// and « Énergie » 80 px down at 320 px: CLS 0.0517). Maison keeps the rows it drew; a new one is announced (toast,
// « Mettre à jour » in the widget) and drawn on the owner's tap, so nothing moves under their finger.
test.describe('CLS when an alert arrives after the first frame', () => {
  test.skip(({ isMobile }) => isMobile, 'explicit widths');
  test.use({ serviceWorkers: 'block' });
  const LATE = {
    id: 990_001, kind: 'tempo_red_tomorrow', severity: 'warn', params: { date: '2026-10-18' },
    first_seen: 0, last_seen: 0, resolved_at: null, dismissed: false
  };
  const LATE_MS = 1200;
  for (const width of [320, 390, 1024, 1440]) {
    test(`/ at ${width} px · a late alert moves nothing`, async ({ page }) => {
      test.setTimeout(60_000);
      await page.setViewportSize({ width, height: 900 });
      const cls = await measureCls(page, '/', {
        fonts: 'normal',
        windowMs: LATE_MS + 1800,
        // The first answer is the server's list; every later one (the page asks again as the summary lands)
        // answers 1.2 s late with one more alert, as when the server raises it meanwhile.
        routes: async (p) => {
          let first = true;
          await p.route('**/api/alerts?state=active', async (r) => {
            const res = await r.fetch();
            const live = (await res.json()) as object[];
            if (first) {
              first = false;
              return r.fulfill({ response: res, json: live });
            }
            await new Promise((ok) => setTimeout(ok, LATE_MS));
            await r.fulfill({ response: res, json: [...live, LATE] }).catch(() => {});
          });
        }
      });
      expect(cls, `/ at ${width} px, an alert after the first frame`).toBeLessThan(0.005);
      // The late path ran: the new alert is announced, not drawn, until the owner asks for it.
      const late = page.getByText(/^Jour Tempo Rouge demain/);
      await expect(page.getByText('1 nouvelle alerte')).toBeVisible();
      await expect(late).toHaveCount(0);
      await page.getByRole('button', { name: 'Afficher', exact: true }).click();
      await expect(late).toBeVisible();
    });
  }
});

// « Dehors » (Plan 14) arriving after the first frame: the snapshot had no weather (a place saved meanwhile, from
// another device), then the SSE `weather` event brings the chip with its reading. The chip is last in the row, so
// its arrival moves no other chip; the row is one line, so it never changes the page's height. (Right after Climat,
// it pushed the month, Réseau and Absence sideways.)
test.describe('CLS when the weather reading arrives after the first frame', () => {
  test.skip(({ isMobile }) => isMobile, 'explicit widths');
  test.use({ serviceWorkers: 'block' });
  const LATE_MS = 1200;
  for (const width of [320, 390, 1024, 1440]) {
    test(`/ at ${width} px · a late weather reading moves nothing`, async ({ page }) => {
      test.setTimeout(60_000);
      await page.setViewportSize({ width, height: 900 });
      const cls = await measureCls(page, '/', {
        fonts: 'normal',
        windowMs: LATE_MS + 1800,
        // The stream: no weather in the snapshot, the `weather` event with a reading 1.2 s later.
        routes: (p) =>
          p.addInitScript((late) => {
            const s = Date.now() / 1000;
            const reading = {
              now: { temperature_c: 4.2, apparent_c: 1.8, humidity_pct: 86, at: s, model: 'arome_hd' },
              today: { min_c: 1.9, min_at: s - 3600, min_ahead: false, max_c: 9.8, max_at: s + 3600, max_ahead: true, hours: 48 },
              fetched_at: s, mode: 'meteofrance', fetch: { state: 'ok', next: s + 3600, error_since: null }
            };
            const Real = window.EventSource;
            class Late extends Real {
              addEventListener(type: string, fn: EventListenerOrEventListenerObject, opts?: boolean | AddEventListenerOptions) {
                const call = (e: Event) => (typeof fn === 'function' ? fn.call(this, e) : fn.handleEvent(e));
                if (type === 'snapshot')
                  return super.addEventListener(type, (e) => {
                    const d = JSON.parse((e as MessageEvent).data);
                    call(new MessageEvent('snapshot', { data: JSON.stringify({ ...d, weather: null }) }));
                  }, opts);
                if (type === 'weather') setTimeout(() => call(new MessageEvent('weather', { data: JSON.stringify(reading) })), late);
                return super.addEventListener(type, fn, opts);
              }
            }
            window.EventSource = Late;
          }, LATE_MS)
      });
      await expect(page.getByRole('button', { name: /^Dehors 4,2\s?°C, détails$/ }).first()).toBeAttached();
      // ≈ 0 here; right after Climat it measured 0.0017–0.0041 (320 → 1440 px).
      expect(cls, `/ at ${width} px, the weather reading after the first frame`).toBeLessThan(0.001);
    });
  }
});

// « Jusqu’à mon retour » (no end date) running: Maison's « Absence » chip, « En ce moment » row and the sidebar or
// header button say « jusqu’à votre retour » from the first frame, and the Absence sheet opened from the chip shows
// it without moving once open. (A cold load of /home#away is the next describe.)
test.describe('CLS with an open-ended absence running', () => {
  test.skip(({ isMobile }) => isMobile, 'explicit widths');
  test.use({ serviceWorkers: 'block' });
  test('/ and its Absence sheet · open-ended absence · CLS < 0.05 at 320, 390 and 1440 px', async ({ page }) => {
    test.setTimeout(120_000);
    const started = await page.request.post('/api/house/away', { headers: { 'X-Kelvin': '1' }, data: { until: null, temperature: 12 } });
    expect(started.status()).toBe(202);
    const running = async () =>
      ((await (await page.request.get('/api/house')).json()).overrides as { id: string; open_ended?: boolean }[]).find((o) => o.open_ended);
    await expect.poll(async () => (await running()) ?? null, { timeout: 20_000 }).not.toBeNull();
    try {
      for (const width of [320, 390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const cls = await measureCls(page, '/', { fonts: 'blocked' });
        expect(cls, `/ at ${width} px, open-ended absence`).toBeLessThan(0.05);
        const chip = page.getByRole('group', { name: 'Résumés' }).getByRole('button', { name: /jusqu’à votre retour/ });
        await expect(chip).toBeVisible();
        // The sheet, opened by a tap: nothing in it moves once it is open (shifts after the tap's 500 ms).
        await chip.click();
        const sheet = page.getByRole('dialog', { name: 'Absence en cours' });
        await expect(sheet.getByText(/^Absence jusqu’à votre retour · 12,0\s°C$/)).toBeVisible();
        const before = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
        await page.waitForTimeout(1500);
        const after = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
        expect(after - before, `the open sheet at ${width} px`).toBeLessThan(0.05);
        await sheet.getByRole('button', { name: 'Fermer' }).click();
      }
    } finally {
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      const o = await running();
      if (o) await page.request.delete(`/api/overrides/${o.id}`, { headers: { 'X-Kelvin': '1' } });
      await expect.poll(async () => ((await (await page.request.get('/api/house')).json()).overrides as unknown[]).length, { timeout: 20_000 }).toBe(0);
    }
  });
});

// A cold load of /home#away (redirects to `/` and opens the Absence sheet over Maison) while an absence runs, dated or
// open-ended: the sheet waits for the house snapshot, then draws « Absence en cours » once, never the « Partir » form
// first (CLS 0.247 at 320 px before the fix).
test.describe('CLS on a direct load of /home#away with an absence running', () => {
  test.skip(({ isMobile }) => isMobile, 'explicit widths');
  test.use({ serviceWorkers: 'block' });
  const H = { 'X-Kelvin': '1' };
  const parisLocal = (ms: number) => {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
        .formatToParts(ms).map((x) => [x.type, x.value])
    );
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  };
  for (const kind of ['dated', 'open-ended'] as const) {
    for (const fonts of ['normal', 'late'] as const) {
      test(`/home#away · ${kind} absence · fonts ${fonts} · CLS < 0.05 at 320, 390 and 1440 px`, async ({ page }) => {
        test.setTimeout(150_000);
        const awayOverrides = async () =>
          ((await (await page.request.get('/api/house')).json()).overrides as { id: string; kind: string }[]).filter((o) => o.kind === 'away');
        const clear = async () => {
          for (const o of await awayOverrides()) await page.request.delete(`/api/overrides/${o.id}`, { headers: H });
          await expect.poll(async () => (await awayOverrides()).length, { timeout: 20_000 }).toBe(0);
        };
        await clear();
        try {
          const until = kind === 'dated' ? parisLocal(Date.now() + 2 * 86_400_000) : null;
          const started = await page.request.post('/api/house/away', { headers: H, data: { until, temperature: 12 } });
          expect(started.status()).toBe(202);
          await expect.poll(async () => (await awayOverrides()).length, { timeout: 20_000 }).toBe(1);
          for (const width of [320, 390, 1440]) {
            await page.setViewportSize({ width, height: 900 });
            const cls = await measureCls(page, '/home#away', { fonts });
            const sheet = page.getByRole('dialog', { name: 'Absence en cours' });
            await expect(sheet).toBeVisible();
            await expect(sheet.getByRole('button', { name: 'Terminer maintenant' })).toBeVisible();
            await expect(sheet.getByRole('button', { name: 'Partir' })).toHaveCount(0);
            expect(cls, `/home#away at ${width} px, ${kind} absence, fonts ${fonts}`).toBeLessThan(0.05);
          }
        } finally {
          await page.unrouteAll({ behavior: 'ignoreErrors' });
          await clear();
        }
      });
    }
  }
});

// No absence: /home#away draws the « Partir » form once, with three chips in order that fill their rows (a lone chip on
// a second row stretches, never an orphan), and nothing moves.
test.describe('Absence sheet chips and CLS with no absence', () => {
  test.skip(({ isMobile }) => isMobile, 'explicit widths');
  test.use({ serviceWorkers: 'block' });
  test('/home#away · three chips in order · CLS < 0.05 at 320, 390 and 1440 px', async ({ page }) => {
    test.setTimeout(100_000);
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const cls = await measureCls(page, '/home#away', { fonts: 'normal' });
      const sheet = page.getByRole('dialog', { name: 'Partir en absence' });
      await expect(sheet).toBeVisible();
      const chips = sheet.locator('.chips button');
      await expect(chips).toHaveText(['Demain 18:00', 'Jusqu’à mon retour', 'Date précise…']);
      const boxes = await chips.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()));
      const rows = new Set(boxes.map((b) => Math.round(b.top))).size;
      expect(rows, `chip rows at ${width} px`).toBeLessThanOrEqual(width === 1440 ? 1 : 2);
      const left = Math.min(...boxes.map((b) => b.left));
      const right = Math.max(...boxes.map((b) => b.right));
      for (const b of boxes) expect(b.width, `no chip is cramped at ${width} px`).toBeGreaterThan(90);
      expect(right - left, 'chips span the row').toBeGreaterThan(Math.min(width - 80, 300));
      expect(cls, `/home#away at ${width} px, no absence`).toBeLessThan(0.05);
    }
  });
});
