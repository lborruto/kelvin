import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (f: string) => readFileSync(resolve(process.cwd(), f), 'utf8');

/** Kelvin has one theme (Tableau, dark only). The browser chrome takes the ground colour (--ground in
 * app.css), and app.html's theme-color meta and the PWA manifest must say the same value. */

describe('one dark theme', () => {
  it('the browser chrome is the ground, in app.css, app.html and the manifest', () => {
    const THEME_COLOR = /--ground:\s*(#[0-9a-f]{6})/i.exec(read('src/app.css'))![1];
    expect(THEME_COLOR).toBe('#050506');
    expect(read('src/app.html')).toContain(`<meta name="theme-color" content="${THEME_COLOR}" />`);
    expect(read('vite.config.ts').toLowerCase()).toContain(`theme_color: '${THEME_COLOR}'`);
  });
  it('has no light theme and no prefers-color-scheme path', () => {
    for (const f of ['src/app.css', 'src/app.html']) {
      const s = read(f);
      expect(s, f).not.toMatch(/prefers-color-scheme|data-theme|kelvin-theme/);
    }
  });
});
