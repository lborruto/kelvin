export type Locale = 'fr' | 'en';
export const LOCALES: Locale[] = ['fr', 'en'];
/** English is en-GB: 24 h clock, day/month order, `13 October 2026` (spec §4). */
export const INTL: Record<Locale, string> = { fr: 'fr-FR', en: 'en-GB' };

export type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };
/** Params of a backend code (api-codes.json): plain JSON values. */
export type ApiParams = Record<string, string | number | boolean | null | undefined>;

/** Each dictionary uses its own language's rules, whatever the active locale. */
export function pluralFor(l: Locale): (n: number, forms: PluralForms) => string {
  const rules = new Intl.PluralRules(INTL[l]);
  return (n, forms) => forms[rules.select(n)] ?? forms.other;
}

export function intFor(l: Locale): (n: number) => string {
  const f = new Intl.NumberFormat(INTL[l], { maximumFractionDigits: 0 });
  return (n) => f.format(n);
}

export function listFor(l: Locale): (items: string[]) => string {
  const f = new Intl.ListFormat(INTL[l], { type: 'conjunction' });
  return (items) => f.format(items);
}
