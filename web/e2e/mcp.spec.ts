import { expect, test } from '@playwright/test';

// Plan 13: create a token in Maison › Compte, use it on /mcp, revoke it (French, the suite's locale).
test.describe.configure({ mode: 'serial' });

const INIT = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'e2e', version: '0' } }
};
const HEADERS = { Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-11-25' };

test('MCP token: shown once, works on /mcp, revoked at once', async ({ page, playwright, baseURL, isMobile }) => {
  test.skip(isMobile, 'one project is enough: the flow is not layout-dependent');
  await page.goto('/home/account#mcp');
  const panel = page.locator('#mcp');
  await expect(panel.getByRole('heading', { name: 'Accès MCP' })).toBeVisible();
  const name = `e2e ${Date.now()}`;
  await panel.getByLabel('Nom du jeton').fill(name);
  await panel.getByRole('button', { name: 'Créer un jeton' }).click();

  const dialog = page.getByRole('dialog', { name: 'Votre jeton MCP' });
  await expect(dialog).toBeVisible();
  const secret = (await dialog.locator('code').innerText()).trim();
  expect(secret).toMatch(/^kmcp_[A-Za-z0-9_-]{43}$/);
  await expect(dialog.getByText(/claude mcp add --transport http kelvin/)).toBeVisible();
  await dialog.getByRole('button', { name: 'J’ai copié le jeton' }).click();
  await expect(page.getByText(secret)).toHaveCount(0);

  // A client without the browser's Origin header, as Claude Code or mcp-remote call it.
  const client = await playwright.request.newContext({ baseURL });
  const auth = { ...HEADERS, Authorization: `Bearer ${secret}` };
  const ok = await client.post('/mcp', { data: INIT, headers: auth });
  expect(ok.status()).toBe(200);
  expect((await ok.json()).result.serverInfo.name).toBe('kelvin');
  const call = await client.post('/mcp', {
    data: { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'get_overview', arguments: {} } },
    headers: auth
  });
  expect((await call.json()).result.isError).toBe(false);

  await page.reload();
  const row = panel.getByRole('listitem').filter({ hasText: name });
  await expect(row.getByText(/dernier appel/)).toBeVisible();
  await panel.getByRole('button', { name: 'Derniers appels' }).click();
  await expect(panel.getByText('get_overview').first()).toBeVisible();

  await row.getByRole('button', { name: `Actions pour ${name}` }).click();
  await page.getByRole('menuitem', { name: /Révoquer/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Révoquer' }).click();
  await expect(row.getByText(/révoqué le /)).toBeVisible();
  const refused = await client.post('/mcp', { data: INIT, headers: auth });
  expect(refused.status()).toBe(401);
  await client.dispose();
});

test('the MCP panel fits a phone', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phone layout only');
  await page.goto('/home/account#mcp');
  await expect(page.locator('#mcp').getByRole('button', { name: 'Créer un jeton' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
