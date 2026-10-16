import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { en } from './i18n/en';
import { fr } from './i18n/fr';

// app.html is static (it paints before the app and its dictionaries load): its few words mirror the
// dictionaries, and this test keeps them equal.
const html = readFileSync(resolve(process.cwd(), 'src/app.html'), 'utf8');
const block = html.slice(html.indexOf('<!-- shell-offline:start -->'), html.indexOf('<!-- shell-offline:end -->'));
const text = (tag: string, lang: string) => block.match(new RegExp(`<${tag}[^>]*lang="${lang}"[^>]*>([^<]*)</${tag}>`))?.[1];

describe('app.html offline first load', () => {
  it('says Kelvin is unreachable in both languages, as the dictionaries do', () => {
    expect(text('p', 'fr')).toBe(fr.page.unreachable);
    expect(text('p', 'en')).toBe(en.page.unreachable);
    expect(text('button', 'fr')).toBe(fr.common.retry);
    expect(text('button', 'en')).toBe(en.common.retry);
  });
  it('shows it only when the app has not started after 8 s', () => {
    expect(html).toContain("if (s) s.className = 'late';");
    expect(html).toMatch(/#kv-shell \.off \{ display: none;/);
  });
  it('applies « détails techniques » before first paint', () => {
    expect(html).toContain("if (localStorage.getItem('kelvin-detail') === 'on') document.documentElement.dataset.detail = 'on';");
  });
});
