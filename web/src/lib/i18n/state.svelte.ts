import { en } from './en';
import { fr, type Messages } from './fr';
import { INTL, type Locale } from './rules';

const DICTS: Record<Locale, Messages> = { fr, en };
const state = $state<{ current: Locale }>({ current: 'fr' });

/** The active locale. Reading it in a template or a $derived re-runs that code on a switch. */
export const locale = {
  get current(): Locale {
    return state.current;
  },
  get intl(): string {
    return INTL[state.current];
  }
};

/** The active dictionary: `m.nav.rooms`, `m.rooms.count(3)`. Reactive through `state`; never copy
 * a message into a module-level or plain const (it would keep the language it was read in). */
export const m: Messages = new Proxy({} as Messages, {
  get: (_target, key) => DICTS[state.current][key as keyof Messages]
});

export function dictionary(l: Locale): Messages {
  return DICTS[l];
}

/** Switch the language now: the state every message reads, and <html lang>. Persisting the
 * choice is setLocale's job (index.ts). */
export function applyLocale(l: Locale): void {
  state.current = l;
  if (typeof document !== 'undefined') document.documentElement.lang = l;
}
