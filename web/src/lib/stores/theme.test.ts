import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { THEME_COLOR } from './theme';

const read = (f: string) => readFileSync(resolve(process.cwd(), f), 'utf8');

describe('one dark theme', () => {
  it('the browser chrome is the ground, in app.css, app.html and the manifest', () => {
    expect(/--ground:\s*(#[0-9a-f]{6})/i.exec(read('src/app.css'))![1]).toBe(THEME_COLOR);
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
