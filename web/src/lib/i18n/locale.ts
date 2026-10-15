import type { Locale } from './rules';

/** localStorage key of the explicit choice (same prefix as kelvin-theme). */
export const KEY = 'kelvin-locale';
/** Each language named in itself, so a reader of the other one can still find theirs. Never translated. */
export const LOCALE_NAMES: Record<Locale, string> = { fr: 'Français', en: 'English' };
export const LOCALE_SHORT: Record<Locale, string> = { fr: 'FR', en: 'EN' };

/** Spec §4: a stored choice wins; else French if any browser language is French; else English
 * if the browser names a language; else French. Mirrored in app.html (locale.test.ts checks). */
export function detectLocale(
  stored: string | null,
  languages: readonly string[] | undefined,
  language: string | undefined
): Locale {
  if (stored === 'fr' || stored === 'en') return stored;
  const all = [...(languages ?? []), ...(language ? [language] : [])];
  if (all.some((l) => /^fr\b/i.test(l))) return 'fr';
  return language || languages?.length ? 'en' : 'fr';
}

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readStored(s: Pick<Storage, 'getItem'> | null = storage()): string | null {
  try {
    return s?.getItem(KEY) ?? null;
  } catch {
    return null; // private mode
  }
}

export function persist(l: Locale, s: Pick<Storage, 'setItem'> | null = storage()): void {
  try {
    s?.setItem(KEY, l);
  } catch {
    /* private mode: the choice simply does not persist */
  }
}
