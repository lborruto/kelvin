import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { THEME_COLORS, applyThemeColor, theme } from './theme';

const css = readFileSync(resolve(process.cwd(), 'src/app.css'), 'utf8');
const html = readFileSync(resolve(process.cwd(), 'src/app.html'), 'utf8');

function bg(selector: string): string {
  const block = css.slice(css.indexOf(selector));
  return /--bg:\s*(#[0-9a-f]{6})/i.exec(block)![1].toLowerCase();
}

function metas(): HTMLMetaElement[] {
  return [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')];
}

describe('theme-color', () => {
  beforeEach(() => {
    document.head.innerHTML =
      '<meta name="theme-color" content="#0F1115" media="(prefers-color-scheme: dark)">' +
      '<meta name="theme-color" content="#F5F6F8" media="(prefers-color-scheme: light)">';
  });

  it('matches the --bg tokens and app.html', () => {
    expect(THEME_COLORS.dark).toBe(bg(':root {'));
    expect(THEME_COLORS.light).toBe(bg(":root[data-theme='light']"));
    expect(html.toLowerCase()).toContain(`content="${THEME_COLORS.dark}" media="(prefers-color-scheme: dark)"`);
    expect(html.toLowerCase()).toContain(`content="${THEME_COLORS.light}" media="(prefers-color-scheme: light)"`);
  });

  it('a manual theme colours both metas; system gives each its own scheme', () => {
    applyThemeColor('light');
    expect(metas().map((m) => m.content)).toEqual([THEME_COLORS.light, THEME_COLORS.light]);
    applyThemeColor('dark');
    expect(metas().map((m) => m.content)).toEqual([THEME_COLORS.dark, THEME_COLORS.dark]);
    applyThemeColor('system');
    expect(metas().map((m) => m.content)).toEqual([THEME_COLORS.dark, THEME_COLORS.light]);
  });

  it('theme.set applies it', () => {
    theme.set('light');
    expect(metas().map((m) => m.content)).toEqual([THEME_COLORS.light, THEME_COLORS.light]);
    theme.set('system');
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});
