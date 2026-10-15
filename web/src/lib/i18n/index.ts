import { detectLocale, persist, readStored } from './locale';
import type { Locale } from './rules';
import { applyLocale } from './state.svelte';

export { applyLocale, dictionary, locale, m } from './state.svelte';
export { INTL, LOCALES, type ApiParams, type Locale } from './rules';
export type { Messages } from './fr';
export { apiMessage, errorText, LOST, pendingError, pendingLabel, statusError, UNKNOWN } from './codes';
export { levelLabel, modeLabel } from './labels';
export { LOCALE_NAMES, LOCALE_SHORT } from './locale';

/** The user's explicit choice: remembered on this device, applied at once (no reload). */
export function setLocale(l: Locale): void {
  persist(l);
  applyLocale(l);
}

/** At boot (root layout): the stored choice, else the browser's languages, else French. */
export function initLocale(): void {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  applyLocale(detectLocale(readStored(), nav?.languages, nav?.language));
}
