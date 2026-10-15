import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { detectLocale, KEY, persist, readStored } from './locale';
import { initLocale, locale, setLocale } from './index';

const html = readFileSync(resolve(process.cwd(), 'src/app.html'), 'utf8');
const block = html.match(/\/\* locale:start \*\/([\s\S]*?)\/\* locale:end \*\//)?.[1] ?? '';
const kelvinLocale = new Function(`${block}; return kelvinLocale;`)() as typeof detectLocale;

const TABLE: [string | null, string[] | undefined, string | undefined, 'fr' | 'en'][] = [
  [null, ['fr-FR'], 'fr-FR', 'fr'],
  [null, ['en-US', 'fr-FR'], 'en-US', 'fr'], // an en-US phone that also lists French stays French
  [null, ['en-GB'], 'en-GB', 'en'],
  [null, ['de-DE'], 'de-DE', 'en'],
  [null, undefined, undefined, 'fr'], // nothing usable: French, the default
  [null, [], '', 'fr'],
  [null, ['fry'], 'fry', 'en'],
  ['en', ['fr-FR'], 'fr-FR', 'en'], // an explicit choice wins
  ['fr', ['en-US'], 'en-US', 'fr'],
  ['de', ['en-GB'], 'en-GB', 'en'] // a stored value that is not a locale is ignored
];

describe('detectLocale', () => {
  it('stored choice, then any French navigator language, then English, else French', () => {
    for (const [stored, langs, lang, want] of TABLE) expect(detectLocale(stored, langs, lang), JSON.stringify([stored, langs, lang])).toBe(want);
  });
  it('the app.html snippet agrees with detectLocale', () => {
    expect(block).toContain('function kelvinLocale');
    for (const [stored, langs, lang] of TABLE) expect(kelvinLocale(stored, langs, lang)).toBe(detectLocale(stored, langs, lang));
  });
});

describe('the app.html locale script', () => {
  const script = html.match(/<script>((?:(?!<\/script>)[\s\S])*?locale:start[\s\S]*?)<\/script>/)?.[1] ?? '';
  const run = (stored: string | null, languages: string[]) => {
    const ctx = {
      localStorage: { getItem: () => stored },
      navigator: { languages, language: languages[0] },
      document: { documentElement: { lang: 'fr' } }
    } as Record<string, unknown>;
    runInNewContext(script, ctx);
    return ctx;
  };
  it('sets <html lang> before the app and leaks no global', () => {
    expect(script).toContain('kelvinLocale');
    const ctx = run(null, ['en-GB']);
    expect((ctx.document as { documentElement: { lang: string } }).documentElement.lang).toBe('en');
    expect(Object.keys(ctx).sort()).toEqual(['document', 'localStorage', 'navigator']);
    expect((run('fr', ['en-GB']).document as { documentElement: { lang: string } }).documentElement.lang).toBe('fr');
  });
});

describe('storage', () => {
  it('a throwing storage keeps French and never throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('private mode');
      },
      setItem: () => {
        throw new Error('private mode');
      }
    };
    expect(readStored(broken)).toBeNull();
    expect(() => persist('en', broken)).not.toThrow();
    expect(detectLocale(readStored(broken), undefined, undefined)).toBe('fr');
  });
  it('setLocale persists and applies; initLocale reads it back', () => {
    setLocale('en');
    expect(localStorage.getItem(KEY)).toBe('en');
    expect([locale.current, document.documentElement.lang]).toEqual(['en', 'en']);
    // jsdom's navigator says en-US: only a stored 'fr' can bring French back.
    localStorage.setItem(KEY, 'fr');
    initLocale();
    expect(locale.current).toBe('fr');
  });
});
