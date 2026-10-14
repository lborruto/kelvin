// Renders the PNG icons from static/icon.svg (provenance: hand-authored SVG, see DESIGN.md).
import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';

const svg = await readFile(new URL('../static/icon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch({ channel: 'chromium' });
const page = await browser.newPage();

async function render(size, file, pad = 0) {
  const inner = size - pad * 2;
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:#0F1115;display:grid;place-items:center;width:${size}px;height:${size}px">` +
      svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `) +
      '</body></html>'
  );
  await writeFile(new URL(`../static/${file}`, import.meta.url), await page.screenshot());
}

await render(192, 'icon-192.png');
await render(512, 'icon-512.png');
await render(512, 'icon-maskable-512.png', 56);
await render(180, 'apple-touch-icon.png');
await browser.close();
