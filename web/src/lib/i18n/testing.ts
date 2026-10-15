import { afterEach, beforeEach, describe } from 'vitest';
import { LOCALES, type Locale } from './rules';
import { applyLocale } from './state.svelte';

/** Run the tests `fn` declares once per locale, that locale active; French comes back after each. */
export function forEachLocale(fn: (l: Locale) => void): void {
  describe.each(LOCALES)('%s', (l) => {
    beforeEach(() => applyLocale(l));
    afterEach(() => applyLocale('fr'));
    fn(l);
  });
}
